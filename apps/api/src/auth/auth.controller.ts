import { Body, Controller, Get, Headers, Inject, Param, Patch, Post, Req, Res } from "@nestjs/common";
import {
  type MemberProfileInput,
  memberProfileSchema,
  qrSessionProofSchema,
  refreshTokenSchema,
  type WechatCodeLoginInput,
  wechatCodeLoginSchema,
} from "@ttz/contracts";
import type { Response } from "express";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { AllowUnapproved, CurrentUser, Public } from "./auth.decorators";
import { AuthService } from "./auth.service";
import type { AuthRequest, AuthUser } from "./auth.types";

@Controller("auth")
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Public()
  @Post("wechat/code-login")
  codeLogin(@Body(new ZodValidationPipe(wechatCodeLoginSchema)) body: WechatCodeLoginInput) {
    return this.auth.loginWithWechat(body);
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
