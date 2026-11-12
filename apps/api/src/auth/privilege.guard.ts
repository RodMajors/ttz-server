import { type CanActivate, type ExecutionContext, ForbiddenException, Inject, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { MIN_PRIVILEGE_KEY } from "./auth.decorators";
import type { AuthRequest } from "./auth.types";

@Injectable()
export class PrivilegeGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}
  canActivate(context: ExecutionContext) {
    const required = this.reflector.getAllAndOverride<1 | 2>(MIN_PRIVILEGE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true;
    const user = context.switchToHttp().getRequest<AuthRequest>().user;
    if (!user || user.privilege < required) {
      throw new ForbiddenException({ code: "INSUFFICIENT_PRIVILEGE", message: "当前账号无权执行此操作" });
    }
    return true;
  }
}
