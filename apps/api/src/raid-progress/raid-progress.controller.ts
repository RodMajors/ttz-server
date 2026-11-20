import { Body, Controller, Get, Inject, Param, Post, Put } from "@nestjs/common";
import {
  bossStrategyCreateSchema,
  bossStrategyVersionSaveSchema,
  idSchema,
  raidBossManualOverrideSchema,
  raidPlanCreateSchema,
  wclGuildProgressSettingSchema,
} from "@ttz/contracts";
import { CurrentUser, MinPrivilege } from "../auth/auth.decorators";
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

  @Get("catalog")
  catalog() {
    return this.service.listCatalog();
  }

  @Get("plans")
  plans() {
    return this.service.listPlans();
  }

  @Post("plans")
  @MinPrivilege(1)
  createPlan(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(raidPlanCreateSchema)) body: Parameters<RaidProgressService["createPlan"]>[0],
  ) {
    return this.service.createPlan(body, user.id);
  }

  @Post("sync")
  @MinPrivilege(1)
  sync() {
    return this.queue.enqueue();
  }

  @Post("plans/:id/sync")
  @MinPrivilege(1)
  syncPlan(@Param("id", new ZodValidationPipe(idSchema)) id: string) {
    return this.queue.continue(BigInt(id));
  }

  @Get("settings/guild")
  @MinPrivilege(1)
  guildSetting() {
    return this.service.getGuildSetting();
  }

  @Put("settings/guild")
  @MinPrivilege(1)
  saveGuildSetting(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(wclGuildProgressSettingSchema)) body: Parameters<
      RaidProgressService["saveGuildSetting"]
    >[0],
  ) {
    return this.service.saveGuildSetting(body, user.id);
  }

  @Put("bosses/:id/manual-override")
  @MinPrivilege(1)
  overrideBoss(
    @Param("id", new ZodValidationPipe(idSchema)) id: string,
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(raidBossManualOverrideSchema)) body: Parameters<RaidProgressService["overrideBoss"]>[2],
  ) {
    return this.service.overrideBoss(BigInt(id), user.id, body);
  }

  @Get("plans/:id/strategies")
  strategies(@Param("id", new ZodValidationPipe(idSchema)) id: string) {
    return this.service.getPublishedStrategies(BigInt(id));
  }

  @Get("activities/:id/snapshots")
  snapshots(@Param("id", new ZodValidationPipe(idSchema)) id: string, @CurrentUser() user: AuthUser) {
    return this.service.listSnapshots(BigInt(id), user);
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
