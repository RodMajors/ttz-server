import { type CanActivate, type ExecutionContext, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PrismaService } from "../database/prisma.service";
import { IS_PUBLIC_KEY } from "./auth.decorators";
import type { AuthRequest } from "./auth.types";

@Injectable()
export class ApprovedMemberGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext) {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()]))
      return true;
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const header = request.headers["x-ttz-user-id"];
    if (process.env.NODE_ENV === "production" || typeof header !== "string" || !/^\d+$/.test(header)) {
      throw new UnauthorizedException({ code: "AUTH_REQUIRED", message: "请使用微信小程序完成登录" });
    }
    const user = await this.prisma.user.findUnique({ where: { id: BigInt(header) } });
    if (user?.status !== 1 || user.isApproved !== 1) {
      throw new UnauthorizedException({ code: "MEMBER_NOT_APPROVED", message: "成员尚未通过审核或账号已停用" });
    }
    request.user = {
      id: user.id,
      name: user.name ?? user.guildNickname ?? user.wxNickname ?? "TTZ 成员",
      privilege: user.privilege as 0 | 1 | 2,
      isApproved: true,
    };
    return true;
  }
}
