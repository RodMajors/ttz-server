import { type CanActivate, type ExecutionContext, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ALLOW_UNAPPROVED_KEY, IS_PUBLIC_KEY } from "./auth.decorators";
import type { AuthRequest } from "./auth.types";

@Injectable()
export class ApprovedMemberGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext) {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()]))
      return true;
    if (this.reflector.getAllAndOverride<boolean>(ALLOW_UNAPPROVED_KEY, [context.getHandler(), context.getClass()]))
      return true;
    const request = context.switchToHttp().getRequest<AuthRequest>();
    if (request.user?.status !== 1 || !request.user.isApproved) {
      throw new UnauthorizedException({ code: "MEMBER_NOT_APPROVED", message: "成员尚未通过审核或账号已停用" });
    }
    return true;
  }
}
