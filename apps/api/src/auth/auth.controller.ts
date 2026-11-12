import { Controller, Get } from "@nestjs/common";
import { CurrentUser } from "./auth.decorators";
import type { AuthUser } from "./auth.types";

@Controller("auth")
export class AuthController {
  @Get("me")
  me(@CurrentUser() user: AuthUser) {
    return { ...user, id: user.id.toString() };
  }
}
