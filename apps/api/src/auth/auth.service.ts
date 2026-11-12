import { createHash, randomBytes } from "node:crypto";
import { ConflictException, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import type { MemberProfileInput, WechatCodeLoginInput } from "@ttz/contracts";
import { PrismaService } from "../database/prisma.service";
import type { AuthUser } from "./auth.types";

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

@Injectable()
export class AuthService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async loginWithWechat(input: WechatCodeLoginInput) {
    const identity = await this.exchangeWechatCode(input.code);
    const user = await this.prisma.user.upsert({
      where: { openid: identity.openid },
      create: {
        openid: identity.openid,
        unionid: identity.unionid,
        wxNickname: input.wxNickname,
        guildNickname: input.guildNickname,
      },
      update: {
        unionid: identity.unionid,
        ...(input.wxNickname ? { wxNickname: input.wxNickname } : {}),
        ...(input.guildNickname ? { guildNickname: input.guildNickname } : {}),
      },
    });
    if (user.status !== 1) {
      throw new UnauthorizedException({ code: "ACCOUNT_DISABLED", message: "账号已停用" });
    }
    return { ...(await this.issueSession(user.id, 1, true)), user: this.toAuthUser(user) };
  }

  async refresh(refreshToken: string) {
    const session = await this.prisma.authSession.findUnique({
      where: { refreshTokenHash: hash(refreshToken) },
      include: { user: true },
    });
    if (
      !session ||
      session.revokedAt ||
      !session.refreshExpiresAt ||
      session.refreshExpiresAt <= new Date() ||
      session.user.status !== 1
    ) {
      throw new UnauthorizedException({ code: "REFRESH_TOKEN_INVALID", message: "登录已失效，请重新登录" });
    }
    const accessToken = token();
    const nextRefreshToken = token();
    const accessExpiresAt = addSeconds(ACCESS_TOKEN_TTL_SECONDS);
    const refreshExpiresAt = addSeconds(sessionTtl());
    const rotated = await this.prisma.authSession.updateMany({
      where: {
        id: session.id,
        refreshTokenHash: hash(refreshToken),
        revokedAt: null,
        refreshExpiresAt: { gt: new Date() },
        user: { status: 1 },
      },
      data: {
        accessTokenHash: hash(accessToken),
        refreshTokenHash: hash(nextRefreshToken),
        accessExpiresAt,
        refreshExpiresAt,
      },
    });
    if (!rotated.count) {
      throw new UnauthorizedException({ code: "REFRESH_TOKEN_INVALID", message: "登录已失效，请重新登录" });
    }
    return {
      accessToken,
      refreshToken: nextRefreshToken,
      accessExpiresAt: accessExpiresAt.toISOString(),
      refreshExpiresAt: refreshExpiresAt.toISOString(),
      user: this.toAuthUser(session.user),
    };
  }

  async revoke(sessionId?: bigint) {
    if (sessionId) {
      await this.prisma.authSession.updateMany({ where: { id: sessionId }, data: { revokedAt: new Date() } });
    }
    return { loggedOut: true };
  }

  async updateProfile(user: AuthUser, input: MemberProfileInput) {
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { name: input.name, wxNickname: input.wxNickname, guildNickname: input.guildNickname },
    });
    return this.toAuthUser(updated);
  }

  async createQrSession() {
    const loginNo = randomBytes(18).toString("base64url");
    const nonce = token();
    const browserSecret = token();
    const expireAt = addSeconds(qrTtl());
    await this.prisma.loginSession.create({
      data: {
        loginNo,
        nonceHash: hash(nonce),
        browserSecretHash: hash(browserSecret),
        expireAt,
      },
    });
    return {
      loginNo,
      nonce,
      browserSecret,
      expiresAt: expireAt.toISOString(),
      miniappPath: "/pages/login-confirm/index",
    };
  }

  async scanQr(loginNo: string, nonce: string, user: AuthUser) {
    const result = await this.prisma.loginSession.updateMany({
      where: { loginNo, nonceHash: hash(nonce), status: 0, expireAt: { gt: new Date() } },
      data: { status: 1, userId: user.id, scannedAt: new Date() },
    });
    if (!result.count) throw invalidQrSession();
    return { status: "SCANNED" as const };
  }

  async confirmQr(loginNo: string, user: AuthUser) {
    const result = await this.prisma.loginSession.updateMany({
      where: { loginNo, userId: user.id, status: 1, expireAt: { gt: new Date() } },
      data: { status: 2, confirmedAt: new Date() },
    });
    if (!result.count) throw invalidQrSession();
    return { status: "CONFIRMED" as const };
  }

  async cancelQr(loginNo: string, user: AuthUser) {
    const result = await this.prisma.loginSession.updateMany({
      where: { loginNo, userId: user.id, status: { in: [1, 2] }, consumedAt: null },
      data: { status: 4, cancelledAt: new Date() },
    });
    if (!result.count) throw invalidQrSession();
    return { status: "CANCELLED" as const };
  }

  async pollQr(loginNo: string, browserSecret: string) {
    if (typeof browserSecret !== "string" || !/^[A-Za-z0-9_-]{32,256}$/.test(browserSecret)) {
      throw invalidQrSession();
    }
    const login = await this.prisma.loginSession.findFirst({
      where: { loginNo, browserSecretHash: hash(browserSecret) },
    });
    if (!login) throw invalidQrSession();
    if (login.expireAt <= new Date() && login.status < 3) {
      await this.prisma.loginSession.updateMany({
        where: { id: login.id, status: { in: [0, 1] } },
        data: { status: 3 },
      });
      return { status: "EXPIRED" as const };
    }
    if (login.status === 0) return { status: "PENDING" as const };
    if (login.status === 1) return { status: "SCANNED" as const };
    if (login.status === 3) return { status: "EXPIRED" as const };
    if (login.status === 4) return { status: "CANCELLED" as const };
    if (!login.userId || login.consumedAt) throw invalidQrSession();
    const userId = login.userId;
    const accessToken = token();
    const accessExpiresAt = addSeconds(sessionTtl());
    const session = await this.prisma.$transaction(async (transaction) => {
      const consumed = await transaction.loginSession.updateMany({
        where: { id: login.id, status: 2, consumedAt: null, expireAt: { gt: new Date() }, user: { status: 1 } },
        data: { consumedAt: new Date() },
      });
      if (!consumed.count) throw invalidQrSession();
      return transaction.authSession.create({
        data: { userId, accessTokenHash: hash(accessToken), kind: 0, accessExpiresAt },
      });
    });
    return {
      status: "CONFIRMED" as const,
      session: { sessionId: session.id.toString(), accessToken, accessExpiresAt: accessExpiresAt.toISOString() },
    };
  }

  private async issueSession(userId: bigint, kind: number, withRefresh: boolean) {
    const accessToken = token();
    const refreshToken = withRefresh ? token() : undefined;
    const accessExpiresAt = addSeconds(kind === 0 ? sessionTtl() : ACCESS_TOKEN_TTL_SECONDS);
    const refreshExpiresAt = refreshToken ? addSeconds(sessionTtl()) : null;
    const session = await this.prisma.authSession.create({
      data: {
        userId,
        accessTokenHash: hash(accessToken),
        refreshTokenHash: refreshToken ? hash(refreshToken) : null,
        kind,
        accessExpiresAt,
        refreshExpiresAt,
      },
    });
    return {
      sessionId: session.id.toString(),
      accessToken,
      refreshToken,
      accessExpiresAt: accessExpiresAt.toISOString(),
      refreshExpiresAt: refreshExpiresAt?.toISOString(),
    };
  }

  private async exchangeWechatCode(code: string) {
    const appId = process.env.WECHAT_APP_ID;
    const secret = process.env.WECHAT_APP_SECRET;
    if (!appId || !secret) {
      throw new ConflictException({ code: "WECHAT_NOT_CONFIGURED", message: "微信小程序登录尚未配置" });
    }
    const url = new URL("https://api.weixin.qq.com/sns/jscode2session");
    url.searchParams.set("appid", appId);
    url.searchParams.set("secret", secret);
    url.searchParams.set("js_code", code);
    url.searchParams.set("grant_type", "authorization_code");
    const response = await fetch(url);
    const payload = (await response.json()) as { openid?: string; unionid?: string; errcode?: number; errmsg?: string };
    if (!response.ok || !payload.openid || payload.errcode) {
      throw new UnauthorizedException({ code: "WECHAT_LOGIN_FAILED", message: "微信登录凭证无效" });
    }
    return { openid: payload.openid, unionid: payload.unionid };
  }

  private toAuthUser(user: {
    id: bigint;
    name: string | null;
    guildNickname: string | null;
    wxNickname: string | null;
    privilege: number;
    isApproved: number;
    status: number;
  }) {
    return {
      id: user.id.toString(),
      name: user.name ?? user.guildNickname ?? user.wxNickname ?? "TTZ 成员",
      wxNickname: user.wxNickname,
      guildNickname: user.guildNickname,
      privilege: user.privilege as 0 | 1 | 2,
      isApproved: user.isApproved === 1,
      profileComplete: Boolean(user.wxNickname && user.guildNickname),
      status: user.status,
    };
  }
}

function token() {
  return randomBytes(32).toString("base64url");
}

export function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function addSeconds(seconds: number) {
  return new Date(Date.now() + seconds * 1000);
}

function sessionTtl() {
  return Number(process.env.SESSION_TTL_SECONDS ?? 604_800);
}

function qrTtl() {
  return Number(process.env.QR_SESSION_TTL_SECONDS ?? 300);
}

function invalidQrSession() {
  return new ConflictException({ code: "QR_SESSION_INVALID", message: "二维码登录会话无效、已过期或已使用" });
}
