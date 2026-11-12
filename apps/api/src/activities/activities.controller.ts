import { Body, Controller, Delete, Get, Inject, Param, Post, Query } from "@nestjs/common";
import {
  type CreateActivityInput,
  createActivitySchema,
  idSchema,
  pageQuerySchema,
  type SignupInput,
  signupDecisionSchema,
  signupSchema,
} from "@ttz/contracts";
import { CurrentUser } from "../auth/auth.decorators";
import type { AuthUser } from "../auth/auth.types";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { ActivitiesService } from "./activities.service";

@Controller("activities")
export class ActivitiesController {
  constructor(@Inject(ActivitiesService) private readonly activities: ActivitiesService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(pageQuerySchema)) query: { page: number; pageSize: number },
  ) {
    return this.activities.list(user, query.page, query.pageSize);
  }

  @Get(":id")
  get(@CurrentUser() user: AuthUser, @Param("id", new ZodValidationPipe(idSchema)) id: string) {
    return this.activities.get(BigInt(id), user);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(createActivitySchema)) body: CreateActivityInput) {
    return this.activities.create(body, user);
  }

  @Post(":id/publish")
  publish(@CurrentUser() user: AuthUser, @Param("id", new ZodValidationPipe(idSchema)) id: string) {
    return this.activities.transition(BigInt(id), "publish", user);
  }

  @Post(":id/cancel")
  cancel(@CurrentUser() user: AuthUser, @Param("id", new ZodValidationPipe(idSchema)) id: string) {
    return this.activities.transition(BigInt(id), "cancel", user);
  }

  @Post(":id/finish")
  finish(@CurrentUser() user: AuthUser, @Param("id", new ZodValidationPipe(idSchema)) id: string) {
    return this.activities.transition(BigInt(id), "finish", user);
  }

  @Post(":id/signups")
  signup(
    @CurrentUser() user: AuthUser,
    @Param("id", new ZodValidationPipe(idSchema)) id: string,
    @Body(new ZodValidationPipe(signupSchema)) body: SignupInput,
  ) {
    return this.activities.signup(BigInt(id), body, user);
  }

  @Delete(":id/signups/me")
  cancelSignup(@CurrentUser() user: AuthUser, @Param("id", new ZodValidationPipe(idSchema)) id: string) {
    return this.activities.cancelSignup(BigInt(id), user);
  }

  @Post(":id/signups/:signupId/decision")
  decide(
    @CurrentUser() user: AuthUser,
    @Param("id", new ZodValidationPipe(idSchema)) id: string,
    @Param("signupId", new ZodValidationPipe(idSchema)) signupId: string,
    @Body(new ZodValidationPipe(signupDecisionSchema)) body: {
      status: "PENDING" | "CONFIRMED" | "BENCH" | "REJECTED";
      officerNote?: string | null;
      reason?: string | null;
      groupNo?: number | null;
      orderIndex: number;
    },
  ) {
    return this.activities.decide(BigInt(id), BigInt(signupId), body, user);
  }

  @Post(":id/roster/lock")
  lockRoster(@CurrentUser() user: AuthUser, @Param("id", new ZodValidationPipe(idSchema)) id: string) {
    return this.activities.lockRoster(BigInt(id), user);
  }
}
