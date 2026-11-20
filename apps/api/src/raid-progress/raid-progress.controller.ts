import { Body, Controller, Get, Inject, Param, Patch, Post, Put } from "@nestjs/common";
import {
  activityStrategyAssignmentsSchema,
  bossStrategyCreateSchema,
  bossStrategyUpdateSchema,
  bossStrategyVersionSaveSchema,
  idSchema,
} from "@ttz/contracts";
import { CurrentUser, MinPrivilege, Public } from "../auth/auth.decorators";
import type { AuthUser } from "../auth/auth.types";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { RaidProgressQueue } from "./raid-progress.queue";
import { RaidProgressService } from "./raid-progress.service";

@Controller("raid-progress")
export class RaidProgressController {
  constructor(
    @Inject(RaidProgressService) private readonly service: RaidProgressService,
    @Inject(RaidProgressQueue) private readonly queue: RaidProgressQueue,
  ) {}

  @Get("epic-timeline")
  @Public()
  epicTimeline() {
    return this.service.getEpicTimeline();
  }

  @Get("plans")
  plans() {
    return this.service.listPlans();
  }

  @Post("sync")
  @MinPrivilege(1)
  sync() {
    return this.queue.enqueue();
  }

  @Get("plans/:planId/bosses/:bossId/best-attempt-metrics")
  bestAttemptMetrics(
    @Param("planId", new ZodValidationPipe(idSchema)) planId: string,
    @Param("bossId", new ZodValidationPipe(idSchema)) bossId: string,
  ) {
    return this.service.getBestAttemptMetrics(BigInt(planId), BigInt(bossId));
  }

  @Get("plans/:planId/bosses/:bossId/attempts")
  attempts(
    @Param("planId", new ZodValidationPipe(idSchema)) planId: string,
    @Param("bossId", new ZodValidationPipe(idSchema)) bossId: string,
  ) {
    return this.service.getBossAttempts(BigInt(planId), BigInt(bossId));
  }

  @Get("strategies/manage")
  @MinPrivilege(1)
  manageStrategies() {
    return this.service.listStrategiesForManagement();
  }

  @Get("plans/:id/strategies")
  strategies(@Param("id", new ZodValidationPipe(idSchema)) id: string) {
    return this.service.getPublishedStrategies(BigInt(id));
  }

  @Get("activities/:id/snapshots")
  snapshots(@Param("id", new ZodValidationPipe(idSchema)) id: string, @CurrentUser() user: AuthUser) {
    return this.service.listSnapshots(BigInt(id), user);
  }

  @Put("activities/:activityId/snapshots/:snapshotId/assignments")
  saveSnapshotAssignments(
    @Param("activityId", new ZodValidationPipe(idSchema)) activityId: string,
    @Param("snapshotId", new ZodValidationPipe(idSchema)) snapshotId: string,
    @Body(new ZodValidationPipe(activityStrategyAssignmentsSchema)) body: Parameters<
      RaidProgressService["saveSnapshotAssignments"]
    >[2],
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.saveSnapshotAssignments(BigInt(activityId), BigInt(snapshotId), body, user);
  }

  @Get("strategy-versions/:id")
  strategyVersion(@Param("id", new ZodValidationPipe(idSchema)) id: string, @CurrentUser() user: AuthUser) {
    return this.service.getStrategyVersion(BigInt(id), user.privilege >= 1);
  }

  @Post("strategies")
  @MinPrivilege(1)
  createStrategy(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(bossStrategyCreateSchema)) body: Parameters<RaidProgressService["createStrategy"]>[0],
  ) {
    return this.service.createStrategy(body, user.id);
  }

  @Patch("strategies/:id")
  @MinPrivilege(1)
  updateStrategy(
    @Param("id", new ZodValidationPipe(idSchema)) id: string,
    @Body(new ZodValidationPipe(bossStrategyUpdateSchema)) body: Parameters<RaidProgressService["updateStrategy"]>[1],
  ) {
    return this.service.updateStrategy(BigInt(id), body);
  }

  @Post("strategies/:id/default")
  @MinPrivilege(1)
  setDefaultStrategy(@Param("id", new ZodValidationPipe(idSchema)) id: string) {
    return this.service.setDefaultStrategy(BigInt(id));
  }

  @Post("strategies/:id/archive")
  @MinPrivilege(1)
  archiveStrategy(@Param("id", new ZodValidationPipe(idSchema)) id: string) {
    return this.service.setStrategyArchived(BigInt(id), true);
  }

  @Post("strategies/:id/restore")
  @MinPrivilege(1)
  restoreStrategy(@Param("id", new ZodValidationPipe(idSchema)) id: string) {
    return this.service.setStrategyArchived(BigInt(id), false);
  }

  @Post("strategies/:id/versions")
  @MinPrivilege(1)
  createVersion(@Param("id", new ZodValidationPipe(idSchema)) id: string, @CurrentUser() user: AuthUser) {
    return this.service.createVersion(BigInt(id), user.id);
  }

  @Put("strategy-versions/:id")
  @MinPrivilege(1)
  saveVersion(
    @Param("id", new ZodValidationPipe(idSchema)) id: string,
    @Body(new ZodValidationPipe(bossStrategyVersionSaveSchema)) body: Parameters<
      RaidProgressService["saveDraftVersion"]
    >[1],
  ) {
    return this.service.saveDraftVersion(BigInt(id), body);
  }

  @Post("strategy-versions/:id/publish")
  @MinPrivilege(1)
  publishVersion(
    @Param("id", new ZodValidationPipe(idSchema)) id: string,
    @CurrentUser() user: AuthUser,
    @Body() body: { makeDefault?: boolean },
  ) {
    return this.service.publishVersion(BigInt(id), user.id, body.makeDefault ?? false);
  }
}
