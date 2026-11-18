import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  type MemberProfileInput,
  memberProfileSchema,
  qrSessionProofSchema,
  refreshTokenSchema,
  type WechatCodeLoginInput,
  type WechatProfileInput,
  wechatCodeLoginSchema,
  wechatProfileSchema,
} from "@ttz/contracts";
import type { Request, Response } from "express";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { AllowUnapproved, CurrentUser, Public } from "./auth.decorators";
import { AuthService } from "./auth.service";
import type { AuthRequest, AuthUser } from "./auth.types";
import { type AvatarFile, AvatarStorageService } from "./avatar-storage.service";

@Controller("auth")
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(AvatarStorageService) private readonly avatarStorage: AvatarStorageService,
  ) {}

  @Public()
  @Post("wechat/code-login")
  codeLogin(@Body(new ZodValidationPipe(wechatCodeLoginSchema)) body: WechatCodeLoginInput) {
    return this.auth.loginWithWechat(body);
  }

  @Public()
  @Post("local-dev-login")
  async localDevLogin(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    if (!isLoopbackRequest(request)) throw new NotFoundException();
    const result = await this.auth.loginWithLocalDevAccount(0);
    setSessionCookie(response, result.accessToken);
    return result.user;
  }

  @Public()
  @Post("local-dev-token")
  async localDevToken(@Req() request: Request) {
    if (!isLoopbackRequest(request)) throw new NotFoundException();
    return this.auth.loginWithLocalDevAccount(1);
  }

  @Public()
  @Post("token/refresh")
  refresh(@Body(new ZodValidationPipe(refreshTokenSchema)) body: { refreshToken: string }) {
    return this.auth.refresh(body.refreshToken);
  }

  @AllowUnapproved()
  @Post("logout")
  async logout(@Req() request: AuthRequest, @Res({ passthrough: true }) response: Response) {
    clearSessionCookie(response);
    return this.auth.revoke(request.authSessionId);
  }

  @AllowUnapproved()
  @Get("me")
  me(@CurrentUser() user: AuthUser) {
    return { ...user, id: user.id.toString() };
  }

  @AllowUnapproved()
  @Patch("profile")
  profile(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(memberProfileSchema)) body: MemberProfileInput) {
    return this.auth.updateProfile(user, body);
  }

  @AllowUnapproved()
  @Put("profile")
  profileFromMiniapp(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(memberProfileSchema)) body: MemberProfileInput,
  ) {
    return this.auth.updateProfile(user, body);
  }

  @AllowUnapproved()
  @Put("wechat-profile")
  updateWechatProfile(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(wechatProfileSchema)) body: WechatProfileInput,
  ) {
    return this.auth.updateWechatProfile(user.id, body);
  }

  @AllowUnapproved()
  @Post("avatar")
  @UseInterceptors(FileInterceptor("avatar", { limits: { fileSize: 2 * 1024 * 1024 } }))
  async uploadAvatar(@CurrentUser() user: AuthUser, @UploadedFile() file?: AvatarFile) {
    if (!file) throw new BadRequestException("请选择头像图片");
    const uploaded = await this.avatarStorage.upload(user.id, file);
    try {
      return await this.auth.updateAvatar(user.id, uploaded.url);
    } catch (error) {
      await this.avatarStorage.remove(uploaded.key).catch(() => undefined);
      throw error;
    }
  }

  @Public()
  @Post("qr-sessions")
  createQrSession() {
    return this.auth.createQrSession();
  }

  @Public()
  @Get("qr-sessions/:loginNo")
  async pollQrSession(
    @Param("loginNo") loginNo: string,
    @Headers("x-ttz-browser-secret") browserSecret: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.auth.pollQr(loginNo, browserSecret);
    if (result.status !== "CONFIRMED") return result;
    setSessionCookie(response, result.session.accessToken);
    return { status: result.status };
  }

  @AllowUnapproved()
  @Post("qr-sessions/:loginNo/scan")
  scanQr(
    @Param("loginNo") loginNo: string,
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(qrSessionProofSchema)) body: { nonce: string },
  ) {
    return this.auth.scanQr(loginNo, body.nonce, user);
  }

  @AllowUnapproved()
  @Post("qr-sessions/:loginNo/confirm")
  confirmQr(@Param("loginNo") loginNo: string, @CurrentUser() user: AuthUser) {
    return this.auth.confirmQr(loginNo, user);
  }

  @AllowUnapproved()
  @Post("qr-sessions/:loginNo/cancel")
  cancelQr(@Param("loginNo") loginNo: string, @CurrentUser() user: AuthUser) {
    return this.auth.cancelQr(loginNo, user);
  }
}

function setSessionCookie(response: Response, token: string) {
  response.cookie(cookieName(), token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: Number(process.env.SESSION_TTL_SECONDS ?? 604_800) * 1000,
  });
}

function clearSessionCookie(response: Response) {
  response.clearCookie(cookieName(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
  });
}

function cookieName() {
  return process.env.SESSION_COOKIE_NAME ?? "ttz_session";
}

function isLoopbackRequest(request: Request) {
  const address = request.socket.remoteAddress?.toLowerCase().replace(/^::ffff:/, "");
  const loopbackAddress = address === "::1" || Boolean(address?.startsWith("127."));
  const hostHeader = request.headers.host;
  if (!hostHeader) return false;
  let host = "";
  try {
    host = new URL(`http://${hostHeader}`).hostname.toLowerCase().replace(/^\[|\]$/g, "");
  } catch {
    return false;
  }
  return loopbackAddress && (host === "localhost" || host === "::1" || host.startsWith("127."));
}
