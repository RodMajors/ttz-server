import { createParamDecorator, type ExecutionContext, SetMetadata } from "@nestjs/common";
import type { AuthRequest, AuthUser } from "./auth.types";

export const IS_PUBLIC_KEY = "ttz:is-public";
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const MIN_PRIVILEGE_KEY = "ttz:min-privilege";
export const MinPrivilege = (level: 1 | 2) => SetMetadata(MIN_PRIVILEGE_KEY, level);

export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext): AuthUser => {
  const user = context.switchToHttp().getRequest<AuthRequest>().user;
  if (!user) throw new Error("Authenticated user is missing from the request");
  return user;
});
