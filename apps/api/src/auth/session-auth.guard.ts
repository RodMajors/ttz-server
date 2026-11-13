import { type CanActivate, type ExecutionContext, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PrismaService } from "../database/prisma.service";
import { IS_PUBLIC_KEY } from "./auth.decorators";
import { hash } from "./auth.service";
import type { AuthRequest } from "./auth.types";

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext) {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()]))
      return true;
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const bearer = getBearer(request.headers.authorization);
    const cookie = parseCookies(request.headers.cookie)[cookieName()];
    const credential = bearer ?? cookie;
    if (!credential) throw required();
    const session = await this.prisma.authSession.findUnique({
      where: { accessTokenHash: hash(credential) },
      include: { user: true },
    });
    if (!session || session.revokedAt || session.accessExpiresAt <= new Date() || session.user.status !== 1)
      throw required();
    request.user = toAuthUser(session.user);
    request.authSessionId = session.id;
    request.authSource = bearer ? "bearer" : "cookie";
    return true;
  }
}

function getBearer(value?: string | string[]) {
  if (typeof value !== "string") return undefined;
  const match = /^Bearer ([A-Za-z0-9_-]{32,256})$/.exec(value);
  return match?.[1];
}

function parseCookies(value?: string | string[]) {
  if (typeof value !== "string") return {} as Record<string, string>;
  return Object.fromEntries(
    value.split(";").flatMap((part) => {
      const separator = part.indexOf("=");
      return separator > 0
        ? [[part.slice(0, separator).trim(), decodeURIComponent(part.slice(separator + 1).trim())]]
        : [];
    }),
  );
}

function cookieName() {
  return process.env.SESSION_COOKIE_NAME ?? "ttz_session";
}

function toAuthUser(user: {
  id: bigint;
  name: string | null;
  guildNickname: string | null;
  wxNickname: string | null;
  privilege: number;
  isApproved: number;
  rejectReason?: string | null;
  status: number;
}) {
  return {
    id: user.id,
    name: user.name ?? user.guildNickname ?? user.wxNickname ?? "TTZ 成员",
    wxNickname: user.wxNickname,
    guildNickname: user.guildNickname,
    privilege: user.privilege as 0 | 1 | 2,
    isApproved: user.isApproved === 1,
    approvalStatus: (["PENDING", "APPROVED", "REJECTED"] as const)[user.isApproved] ?? "PENDING",
    rejectReason: user.rejectReason ?? null,
    profileComplete: Boolean(user.wxNickname && user.guildNickname),
    status: user.status,
  };
}

function required() {
  return new UnauthorizedException({ code: "AUTH_REQUIRED", message: "请使用微信小程序完成登录" });
}
