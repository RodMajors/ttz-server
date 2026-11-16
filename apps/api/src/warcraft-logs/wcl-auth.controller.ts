import { Controller, Get, Inject, Post, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import { CurrentUser, Public } from "../auth/auth.decorators";
import type { AuthUser } from "../auth/auth.types";
import { WclBindingService } from "./wcl-binding.service";

@Controller("auth/wcl")
export class WclAuthController {
  constructor(@Inject(WclBindingService) private readonly binding: WclBindingService) {}

  @Post("authorize")
  authorize(@CurrentUser() user: AuthUser) {
    return this.binding.authorization(user.id);
  }

  @Get("status")
  status(@CurrentUser() user: AuthUser) {
    return this.binding.status(user.id);
  }

  @Get("verify")
  verify(@CurrentUser() user: AuthUser) {
    return this.binding.verifyLinkedAccount(user.id);
  }

  @Public()
  @Get("callback")
  async callback(
    @Query("code") code: string,
    @Query("state") state: string,
    @Query("error") error: string | undefined,
    @Res() response: Response,
  ) {
    const returnUrl = new URL("/dashboard/profile", process.env.WEB_ORIGIN ?? "http://localhost:3000");
    if (error || !code || !state) {
      returnUrl.searchParams.set("wcl", "cancelled");
      return response.redirect(returnUrl.href);
    }
    try {
      const result = await this.binding.callback(code, state);
      returnUrl.searchParams.set("wcl", "success");
      returnUrl.searchParams.set("synced", String(result.synced));
      returnUrl.searchParams.set("conflicts", String(result.conflicts));
    } catch {
      returnUrl.searchParams.set("wcl", "failed");
    }
    return response.redirect(returnUrl.href);
  }
}
