import {
  BadGatewayException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  ActivityStrategyAssignmentsInput,
  PositioningCanvas,
  StrategyActivitySaveInput,
  StrategyPresetSaveInput,
} from "@ttz/contracts";
import type { Prisma } from "@ttz/database";
import { WarcraftLogsClient, type WclFightMetricGraph, type WclFightMetricPoint } from "@ttz/warcraft-logs";
import { assetUrl } from "../common/asset-url";
import { PrismaService } from "../database/prisma.service";
import { serializeTacticalPeople, toBookingIds, validateActivityTactics } from "./activity-tactics";
import { validateRequirementCatalog } from "./strategy-requirements";

type GuildSettingInput = {
  guildId: number;
  guildName: string;
  serverId: number;
  serverName: string;
  serverSlug: string;
  serverRegion: string;
  zoneId: number;
  season: string;
};
type ManualOverrideInput = {
  status: "NOT_STARTED" | "PROGRESSING" | "DEFEATED" | null;
  bestPercent: number | null;
  firstKillAt: string | null;
  lastKillAt: string | null;
  reason: string | null;
};
const raidProgressPlanInclude = {
  raid: { select: { name: true, wclZoneId: true, icon: true, background: true } },
  bosses: {
    where: { boss: { excludeFromProgress: false } },
    orderBy: { boss: { order_index: "asc" as const } },
    include: {
      boss: true,
      defaultStrategy: { select: { id: true, name: true } },
      attempts: {
        orderBy: [{ startedAt: "asc" as const }, { id: "asc" as const }],
        select: { kill: true, bossPercent: true, phaseData: true },
      },
    },
  },
} satisfies Prisma.RaidProgressPlanInclude;
type RaidProgressPlanWithBosses = Prisma.RaidProgressPlanGetPayload<{ include: typeof raidProgressPlanInclude }>;

const strategyVersionInclude = {
  strategy: { select: { id: true, name: true, boss: { select: { id: true, name: true } } } },
  blocks: { orderBy: { orderIndex: "asc" as const } },
  slots: { orderBy: { orderIndex: "asc" as const } },
  tasks: {
    include: { taskType: true, encounterSpell: true, playerSpell: true },
    orderBy: [{ kind: "asc" as const }, { orderIndex: "asc" as const }],
  },
} satisfies Prisma.BossStrategyVersionInclude;
type StrategyVersionWithContent = Prisma.BossStrategyVersionGetPayload<{ include: typeof strategyVersionInclude }>;

const metricGraphCacheTtlMs = 30 * 60_000;
const metricGraphCacheMaxEntries = 32;

type BestPullMetrics = {
  pull: number;
  selection: "FIRST_KILL" | "LOWEST_HEALTH";
  kill: boolean;
  bossPercent: number | null;
  fightPercent: number | null;
  durationMs: number;
  reportCode: string;
  fightId: number;
  phaseData: Prisma.JsonValue | null;
  points: WclFightMetricPoint[];
};

@Injectable()
export class RaidProgressService {
  private readonly wcl = new WarcraftLogsClient(process.env.WCL_CLIENT_ID ?? "", process.env.WCL_CLIENT_SECRET ?? "");
  private readonly metricGraphCache = new Map<string, { expiresAt: number; points: WclFightMetricPoint[] }>();
  private readonly metricGraphRequests = new Map<string, Promise<WclFightMetricGraph>>();

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async getGuildSetting() {
    const row = await this.prisma.wclGuildProgressSetting.findUnique({ where: { id: 1 } });
    return row ? serializeGuildSetting(row) : defaultGuildSetting();
  }

  async saveGuildSetting(input: GuildSettingInput, userId: bigint) {
    const row = await this.prisma.wclGuildProgressSetting.upsert({
      where: { id: 1 },
      create: { id: 1, ...input, updatedBy: userId },
      update: { ...input, updatedBy: userId },
    });
    return serializeGuildSetting(row);
  }

  async listCatalog() {
    const raids = await this.prisma.raids.findMany({
      where: { is_active: 1 },
      orderBy: [{ sort: "asc" }, { id: "asc" }],
      include: { bosses: { orderBy: { order_index: "asc" } } },
    });
    return raids.map((raid) => ({
      id: raid.id.toString(),
      name: raid.name,
      wclZoneId: raid.wclZoneId,
      bosses: raid.bosses.map((boss) => ({ id: boss.id.toString(), wclId: boss.wcl_id, name: boss.name })),
    }));
  }

  async listPlans() {
    const plans = await this.prisma.raidProgressPlan.findMany({
      where: { status: { in: ["ACTIVE", "COMPLETED"] } },
      orderBy: { id: "desc" },
      include: raidProgressPlanInclude,
    });
    return plans.map(serializePlan);
  }

  async getEpicTimeline() {
    const plan = await this.prisma.raidProgressPlan.findFirst({
      where: { status: "ACTIVE", difficulty: 3 },
      orderBy: { id: "desc" },
      include: raidProgressPlanInclude,
    });
    return plan ? serializePlan(plan) : null;
  }

  async getBossAttempts(planId: bigint, bossId: bigint) {
    const progress = await this.prisma.raidBossProgress.findUnique({
      where: { progressPlanId_bossId: { progressPlanId: planId, bossId } },
      include: { boss: { select: { excludeFromProgress: true } } },
    });
    if (!progress || progress.boss.excludeFromProgress)
      throw new NotFoundException({ code: "RAID_BOSS_PROGRESS_NOT_FOUND", message: "Boss 进度不存在" });
    const attempts = await this.prisma.raidBossAttempt.findMany({
      where: { progressId: progress.id },
      orderBy: [{ startedAt: "asc" }, { id: "asc" }],
      take: 2000,
      select: {
        startedAt: true,
        durationMs: true,
        kill: true,
        bossPercent: true,
        fightPercent: true,
        phaseData: true,
        sources: {
          select: { reportCode: true, fightId: true },
          orderBy: { createdAt: "asc" },
          take: 1,
        },
      },
    });
    const firstKillIndex = attempts.findIndex((attempt) => attempt.kill || attempt.bossPercent === 0);
    const progressionAttempts = firstKillIndex < 0 ? attempts : attempts.slice(0, firstKillIndex + 1);
    return progressionAttempts.map((attempt, index) => ({
      pull: index + 1,
      startedAt: attempt.startedAt.toISOString(),
      durationMs: attempt.durationMs,
      kill: attempt.kill,
      bossPercent: attempt.bossPercent,
      fightPercent: attempt.fightPercent,
      phaseData: attempt.phaseData,
      reportCode: attempt.sources[0]?.reportCode ?? null,
      fightId: attempt.sources[0] ? Number(attempt.sources[0].fightId) : null,
    }));
  }

  async getBestAttemptMetrics(planId: bigint, bossId: bigint): Promise<BestPullMetrics | null> {
    const progress = await this.prisma.raidBossProgress.findUnique({
      where: { progressPlanId_bossId: { progressPlanId: planId, bossId } },
      include: { boss: { select: { excludeFromProgress: true } } },
    });
    if (!progress || progress.boss.excludeFromProgress)
      throw new NotFoundException({ code: "RAID_BOSS_PROGRESS_NOT_FOUND", message: "Boss 进度不存在" });
    const attempts = await this.prisma.raidBossAttempt.findMany({
      where: { progressId: progress.id },
      orderBy: [{ startedAt: "asc" }, { id: "asc" }],
      take: 2000,
      select: {
        startedAt: true,
        durationMs: true,
        kill: true,
        bossPercent: true,
        fightPercent: true,
        phaseData: true,
        sources: {
          select: { reportCode: true, fightId: true },
          orderBy: { createdAt: "asc" },
          take: 1,
        },
      },
    });
    const firstKillIndex = attempts.findIndex((attempt) => attempt.kill);
    const selection = firstKillIndex >= 0 ? "FIRST_KILL" : "LOWEST_HEALTH";
    let bestIndex = firstKillIndex;
    if (bestIndex < 0) {
      bestIndex = attempts.reduce((best, attempt, index) => {
        if (attempt.bossPercent === null) return best;
        if (best < 0) return index;
        const bestPercent = attempts[best]?.bossPercent;
        return bestPercent === null || bestPercent === undefined || attempt.bossPercent < bestPercent ? index : best;
      }, -1);
    }
    if (bestIndex < 0) return null;
    const best = attempts[bestIndex];
    const source = best?.sources[0];
    if (!best || !source) return null;
    const cacheKey = `${source.reportCode}:${source.fightId}`;
    let points = this.getCachedMetricGraph(cacheKey);
    if (!points) {
      const pending = this.metricGraphRequests.get(cacheKey);
      const request =
        pending ??
        this.wcl.getFightMetricGraph(
          source.reportCode,
          Number(source.fightId),
          process.env.WCL_REGION === "global" ? "global" : "cn",
        );
      if (!pending) this.metricGraphRequests.set(cacheKey, request);
      try {
        points = (await request).points;
        this.cacheMetricGraph(cacheKey, points);
      } catch {
        throw new BadGatewayException({
          code: "WCL_FIGHT_GRAPH_UNAVAILABLE",
          message: "暂时无法读取这场 WCL 战斗的输出曲线，请稍后重试",
        });
      } finally {
        if (!pending) this.metricGraphRequests.delete(cacheKey);
      }
    }
    return {
      pull: bestIndex + 1,
      selection,
      kill: best.kill,
      bossPercent: best.bossPercent,
      fightPercent: best.fightPercent,
      durationMs: best.durationMs,
      reportCode: source.reportCode,
      fightId: Number(source.fightId),
      phaseData: best.phaseData,
      points,
    };
  }

  private getCachedMetricGraph(key: string) {
    const entry = this.metricGraphCache.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.metricGraphCache.delete(key);
      return null;
    }
    this.metricGraphCache.delete(key);
    this.metricGraphCache.set(key, entry);
    return entry.points;
  }

  private cacheMetricGraph(key: string, points: WclFightMetricPoint[]) {
    this.metricGraphCache.delete(key);
    this.metricGraphCache.set(key, { expiresAt: Date.now() + metricGraphCacheTtlMs, points });
    if (this.metricGraphCache.size > metricGraphCacheMaxEntries) {
      const oldestKey = this.metricGraphCache.keys().next().value;
      if (oldestKey) this.metricGraphCache.delete(oldestKey);
    }
  }

  async createPlan(
    input: { raidId: string; difficulty: "HEROIC" | "MYTHIC"; season: string; name: string },
    userId: bigint,
  ) {
    const raidId = BigInt(input.raidId);
    const raid = await this.prisma.raids.findUnique({ where: { id: raidId }, include: { bosses: true } });
    if (!raid) throw new NotFoundException({ code: "RAID_NOT_FOUND", message: "团本资料不存在" });
    if (!raid.wclZoneId)
      throw new ConflictException({ code: "RAID_WCL_ZONE_MISSING", message: "请先同步 WCL 团本目录" });
    if (!raid.bosses.length)
      throw new ConflictException({ code: "RAID_BOSSES_NOT_READY", message: "团本 Boss 尚未同步" });
    const existing = await this.prisma.raidProgressPlan.findFirst({
      where: {
        raidId,
        difficulty: input.difficulty === "MYTHIC" ? 3 : 2,
        season: input.season,
        status: { in: ["ACTIVE", "COMPLETED"] },
      },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException({ code: "RAID_PROGRESS_PLAN_EXISTS", message: "同一团本、难度和赛季已有进度计划" });
    }
    const plan = await this.prisma.$transaction(async (tx) => {
      const created = await tx.raidProgressPlan.create({
        data: {
          raidId,
          difficulty: input.difficulty === "MYTHIC" ? 3 : 2,
          season: input.season,
          name: input.name,
          createdBy: userId,
        },
      });
      await tx.raidBossProgress.createMany({
        data: raid.bosses.map((boss) => ({ progressPlanId: created.id, bossId: boss.id })),
      });
      return created;
    });
    return { id: plan.id.toString(), name: plan.name };
  }

  async overrideBoss(progressId: bigint, userId: bigint, input: ManualOverrideInput) {
    const current = await this.prisma.raidBossProgress.findUnique({ where: { id: progressId } });
    if (!current) throw new NotFoundException({ code: "RAID_BOSS_PROGRESS_NOT_FOUND", message: "Boss 进度不存在" });
    const data =
      input.status === null
        ? {
            manualStatus: null,
            manualBestPercent: null,
            manualFirstKillAt: null,
            manualLastKillAt: null,
            manualReason: null,
            manualUpdatedBy: null,
            manualUpdatedAt: null,
          }
        : {
            manualStatus: input.status,
            manualBestPercent: input.status === "DEFEATED" ? 0 : input.bestPercent,
            manualFirstKillAt: input.firstKillAt ? new Date(input.firstKillAt) : null,
            manualLastKillAt: input.lastKillAt ? new Date(input.lastKillAt) : null,
            manualReason: input.reason,
            manualUpdatedBy: userId,
            manualUpdatedAt: new Date(),
          };
    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.raidBossProgress.update({ where: { id: progressId }, data });
      await tx.raidBossProgressOverrideLog.create({
        data: {
          progressId,
          beforeValue: manualValue(current),
          afterValue: input.status === null ? { cleared: true } : input,
          reason: input.reason,
          updatedBy: userId,
        },
      });
      return updated;
    });
    return { id: row.id.toString(), manuallyOverridden: row.manualStatus !== null };
  }

  async getStrategyTaskCatalog() {
    const [taskTypes, spells] = await Promise.all([
      this.prisma.strategyTaskType.findMany({
        where: { isActive: true },
        orderBy: [{ isBuiltIn: "desc" }, { label: "asc" }],
      }),
      this.prisma.gameSpell.findMany({ where: { isActive: true }, orderBy: [{ sourceType: "asc" }, { name: "asc" }] }),
    ]);
    return {
      taskTypes: taskTypes.map(({ id, code, label, isBuiltIn }) => ({ id, code, label, isBuiltIn })),
      spells: spells.map(({ id, spellId, name, sourceType, classId, specId, icon, dataSource, isActive }) => ({
        id,
        spellId,
        name,
        sourceType,
        classId,
        specId,
        icon,
        dataSource,
        isActive,
      })),
    };
  }

  async createStrategyTaskType(input: { code: string; label: string }) {
    const row = await this.prisma.strategyTaskType.create({ data: { ...input, isBuiltIn: false } });
    return { id: row.id, code: row.code, label: row.label };
  }

  async createGameSpell(input: {
    spellId?: number | null;
    name: string;
    sourceType: "ENCOUNTER" | "PLAYER";
    classId?: number | null;
    specId?: number | null;
    icon?: string | null;
    dataSource?: string | null;
  }) {
    if (input.sourceType === "ENCOUNTER" && (input.classId != null || input.specId != null))
      throw new ConflictException({ code: "GAME_SPELL_CONSTRAINT_INVALID", message: "机制技能不能指定职业或专精" });
    if (input.sourceType === "PLAYER" && input.specId != null && input.classId == null)
      throw new ConflictException({ code: "GAME_SPELL_CONSTRAINT_INVALID", message: "专精技能必须同时选择职业" });
    if (input.sourceType === "PLAYER" && input.classId != null) {
      const characterClass = await this.prisma.classes.findUnique({
        where: { id: input.classId },
        select: { id: true },
      });
      if (!characterClass)
        throw new NotFoundException({ code: "GAME_SPELL_CLASS_NOT_FOUND", message: "技能职业不存在" });
      if (input.specId != null) {
        const spec = await this.prisma.specs.findFirst({
          where: { id: input.specId, class: input.classId },
          select: { id: true },
        });
        if (!spec) throw new ConflictException({ code: "GAME_SPELL_SPEC_INVALID", message: "所选专精不属于技能职业" });
      }
    }
    const row = await this.prisma.gameSpell.create({ data: { ...input, isActive: true } });
    return { id: row.id, name: row.name, sourceType: row.sourceType };
  }

  async updateGameSpell(
    id: number,
    input: {
      spellId?: number | null;
      name: string;
      sourceType: "ENCOUNTER" | "PLAYER";
      classId?: number | null;
      specId?: number | null;
      icon?: string | null;
      dataSource?: string | null;
    },
  ) {
    const existing = await this.prisma.gameSpell.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException({ code: "GAME_SPELL_NOT_FOUND", message: "技能不存在" });
    if (input.sourceType === "ENCOUNTER" && (input.classId != null || input.specId != null))
      throw new ConflictException({ code: "GAME_SPELL_CONSTRAINT_INVALID", message: "机制技能不能指定职业或专精" });
    if (input.sourceType === "PLAYER" && input.specId != null && input.classId == null)
      throw new ConflictException({ code: "GAME_SPELL_CONSTRAINT_INVALID", message: "专精技能必须同时选择职业" });
    if (input.sourceType === "PLAYER" && input.classId != null) {
      const characterClass = await this.prisma.classes.findUnique({
        where: { id: input.classId },
        select: { id: true },
      });
      if (!characterClass)
        throw new NotFoundException({ code: "GAME_SPELL_CLASS_NOT_FOUND", message: "技能职业不存在" });
      if (input.specId != null) {
        const spec = await this.prisma.specs.findFirst({
          where: { id: input.specId, class: input.classId },
          select: { id: true },
        });
        if (!spec) throw new ConflictException({ code: "GAME_SPELL_SPEC_INVALID", message: "所选专精不属于技能职业" });
      }
    }
    const row = await this.prisma.gameSpell.update({
      where: { id },
      data: {
        spellId: input.spellId ?? null,
        name: input.name,
        sourceType: input.sourceType,
        classId: input.classId ?? null,
        specId: input.specId ?? null,
        icon: input.icon ?? null,
        dataSource: input.dataSource ?? null,
      },
    });
    return { id: row.id, name: row.name, sourceType: row.sourceType };
  }

  async setGameSpellActive(id: number, isActive: boolean) {
    const result = await this.prisma.gameSpell.updateMany({ where: { id }, data: { isActive } });
    if (!result.count) throw new NotFoundException({ code: "GAME_SPELL_NOT_FOUND", message: "技能不存在" });
    return { id, isActive };
  }

  async listStrategiesForManagement() {
    const strategies = await this.prisma.bossStrategy.findMany({
      include: {
        plan: { select: { id: true, name: true, difficulty: true, status: true } },
        boss: { select: { name: true } },
        versions: {
          orderBy: { versionNo: "desc" },
          include: {
            creator: { select: { name: true, guildNickname: true } },
            publisher: { select: { name: true, guildNickname: true } },
          },
        },
      },
      orderBy: [{ progressPlanId: "desc" }, { bossId: "asc" }, { name: "asc" }],
    });
    const progress = strategies.length
      ? await this.prisma.raidBossProgress.findMany({
          where: { progressPlanId: { in: [...new Set(strategies.map((strategy) => strategy.progressPlanId))] } },
          select: { progressPlanId: true, bossId: true, defaultStrategyId: true },
        })
      : [];
    const defaults = new Set(
      progress.flatMap((row) => (row.defaultStrategyId ? [row.defaultStrategyId.toString()] : [])),
    );
    return strategies.map((strategy) => ({
      id: strategy.id.toString(),
      progressPlanId: strategy.progressPlanId.toString(),
      planName: strategy.plan.name,
      difficulty: strategy.plan.difficulty === 3 ? ("MYTHIC" as const) : ("HEROIC" as const),
      planStatus: strategy.plan.status,
      bossId: strategy.bossId.toString(),
      bossName: strategy.boss.name,
      name: strategy.name,
      description: strategy.description,
      status: strategy.status === "ARCHIVED" ? ("ARCHIVED" as const) : ("ACTIVE" as const),
      isDefault: defaults.has(strategy.id.toString()),
      versions: strategy.versions.map((version) => ({
        id: version.id.toString(),
        versionNo: version.versionNo,
        status:
          version.status === "PUBLISHED"
            ? ("PUBLISHED" as const)
            : version.status === "ARCHIVED"
              ? ("ARCHIVED" as const)
              : ("DRAFT" as const),
        changeSummary: version.changeSummary,
        createdAt: version.createdAt.toISOString(),
        publishedAt: version.publishedAt?.toISOString() ?? null,
        createdByName: version.creator.guildNickname ?? version.creator.name ?? "管理员",
        publishedByName: version.publisher?.guildNickname ?? version.publisher?.name ?? null,
      })),
    }));
  }

  async setDefaultStrategy(strategyId: bigint) {
    const strategy = await this.prisma.bossStrategy.findFirst({
      where: { id: strategyId, status: "ACTIVE", versions: { some: { status: "PUBLISHED" } } },
      select: { id: true, progressPlanId: true, bossId: true },
    });
    if (!strategy)
      throw new ConflictException({
        code: "STRATEGY_NOT_PUBLISHABLE",
        message: "只有包含已发布版本的启用方案可以设为默认",
      });
    const progress = await this.prisma.raidBossProgress.update({
      where: { progressPlanId_bossId: { progressPlanId: strategy.progressPlanId, bossId: strategy.bossId } },
      data: { defaultStrategyId: strategy.id },
    });
    return {
      strategyId: strategy.id.toString(),
      bossId: strategy.bossId.toString(),
      defaultStrategyId: progress.defaultStrategyId?.toString() ?? null,
    };
  }

  async updateStrategy(strategyId: bigint, input: { name: string; description: string | null }) {
    const strategy = await this.prisma.bossStrategy.findUnique({ where: { id: strategyId } });
    if (!strategy) throw new NotFoundException({ code: "STRATEGY_NOT_FOUND", message: "战术方案不存在" });
    const row = await this.prisma.bossStrategy.update({
      where: { id: strategyId },
      data: { name: input.name, description: input.description },
    });
    return { id: row.id.toString(), name: row.name, description: row.description };
  }

  async setStrategyArchived(strategyId: bigint, archived: boolean) {
    const strategy = await this.prisma.bossStrategy.findUnique({
      where: { id: strategyId },
      select: { id: true, progressPlanId: true, bossId: true },
    });
    if (!strategy) throw new NotFoundException({ code: "STRATEGY_NOT_FOUND", message: "战术方案不存在" });
    return this.prisma.$transaction(async (tx) => {
      if (archived) {
        await tx.raidBossProgress.updateMany({
          where: { progressPlanId: strategy.progressPlanId, bossId: strategy.bossId, defaultStrategyId: strategyId },
          data: { defaultStrategyId: null },
        });
      }
      const row = await tx.bossStrategy.update({
        where: { id: strategyId },
        data: { status: archived ? "ARCHIVED" : "ACTIVE" },
      });
      return { id: row.id.toString(), status: row.status };
    });
  }

  async createStrategy(
    input: { progressPlanId: string; bossId: string; name: string; description?: string | null },
    userId: bigint,
  ) {
    const progressPlanId = BigInt(input.progressPlanId),
      bossId = BigInt(input.bossId);
    const progress = await this.prisma.raidBossProgress.findUnique({
      where: { progressPlanId_bossId: { progressPlanId, bossId } },
    });
    if (!progress)
      throw new NotFoundException({ code: "RAID_BOSS_PROGRESS_NOT_FOUND", message: "该计划中没有此 Boss" });
    const row = await this.prisma.bossStrategy.create({
      data: {
        progressPlanId,
        bossId,
        name: input.name,
        description: input.description ?? null,
        createdBy: userId,
        versions: { create: { versionNo: 1, createdBy: userId, contentMode: "REQUIREMENTS" } },
      },
      include: { versions: true },
    });
    return { id: row.id.toString(), name: row.name, draftVersionId: row.versions[0]?.id.toString() ?? null };
  }

  async createVersion(strategyId: bigint, userId: bigint) {
    const strategy = await this.prisma.bossStrategy.findUnique({
      where: { id: strategyId },
      include: { versions: { orderBy: { versionNo: "desc" } } },
    });
    if (!strategy) throw new NotFoundException({ code: "STRATEGY_NOT_FOUND", message: "战术方案不存在" });
    if (strategy.versions.some((version) => version.status === "DRAFT"))
      throw new ConflictException({ code: "STRATEGY_DRAFT_EXISTS", message: "已有草稿版本" });
    const source = strategy.versions[0];
    return this.prisma.$transaction(async (tx) => {
      const version = await tx.bossStrategyVersion.create({
        data: { strategyId, versionNo: (source?.versionNo ?? 0) + 1, createdBy: userId, contentMode: "REQUIREMENTS" },
      });
      if (source) await copyVersion(tx, source.id, version.id);
      return { id: version.id.toString(), versionNo: version.versionNo };
    });
  }

  async getStrategyVersion(versionId: bigint, canViewDraft = false) {
    const version = await this.prisma.bossStrategyVersion.findUnique({
      where: { id: versionId },
      include: strategyVersionInclude,
    });
    if (!version) throw new NotFoundException({ code: "STRATEGY_VERSION_NOT_FOUND", message: "战术版本不存在" });
    if (version.status !== "PUBLISHED" && !canViewDraft) {
      throw new NotFoundException({ code: "STRATEGY_VERSION_NOT_FOUND", message: "战术版本不存在" });
    }
    return serializeVersion(version);
  }

  async savePreset(versionId: bigint, input: StrategyPresetSaveInput) {
    await this.prisma.$transaction(async (tx) => {
      const changed = await tx.bossStrategyVersion.updateMany({
        where: { id: versionId, status: "DRAFT", strategy: { status: "ACTIVE" } },
        data: { changeSummary: input.changeSummary ?? null, contentMode: "REQUIREMENTS" },
      });
      if (!changed.count)
        throw new ConflictException({ code: "STRATEGY_VERSION_IMMUTABLE", message: "只能编辑启用方案的草稿" });
      const blocks = input.items.filter(
        (item): item is Extract<StrategyPresetSaveInput["items"][number], { type: "POSITIONING" | "NOTES" }> =>
          item.type === "POSITIONING" || item.type === "NOTES",
      );
      const tasks = input.items
        .filter(
          (item): item is Extract<StrategyPresetSaveInput["items"][number], { type: "SEQUENCE" | "TIMELINE" }> =>
            item.type === "SEQUENCE" || item.type === "TIMELINE",
        )
        .map((item) => ({
          taskTypeId: item.taskTypeId,
          kind: item.type,
          orderIndex: item.orderIndex,
          label: item.title,
          encounterSpellId: item.encounterSpellId,
          playerSpellId: item.playerSpellId,
          notes: item.markdown,
        }));
      await validateRequirementCatalog(tx, tasks);
      await tx.bossStrategyBlock.deleteMany({ where: { versionId } });
      await tx.bossStrategySlot.deleteMany({ where: { versionId } });
      await tx.bossStrategyTask.deleteMany({ where: { versionId } });
      if (blocks.length)
        await tx.bossStrategyBlock.createMany({
          data: blocks.map((block) => ({
            versionId,
            type: block.type,
            title: block.title,
            orderIndex: block.orderIndex,
            markdown: block.markdown ?? null,
          })),
        });
      if (tasks.length)
        await tx.bossStrategyTask.createMany({ data: tasks.map((task) => requirementData(versionId, task)) });
    });
    return this.getStrategyVersion(versionId, true);
  }

  async publishVersion(versionId: bigint, userId: bigint, makeDefault: boolean) {
    const version = await this.prisma.bossStrategyVersion.findUnique({
      where: { id: versionId },
      include: { strategy: true },
    });
    if (!version) throw new NotFoundException({ code: "STRATEGY_VERSION_NOT_FOUND", message: "战术版本不存在" });
    if (version.status !== "DRAFT")
      throw new ConflictException({ code: "STRATEGY_VERSION_IMMUTABLE", message: "该版本已发布" });
    if (version.contentMode === "LEGACY")
      throw new ConflictException({
        code: "STRATEGY_PRESET_UPGRADE_REQUIRED",
        message: "请先保存草稿，将其转换为新版预设后再发布",
      });
    const row = await this.prisma.$transaction(async (tx) => {
      const published = await tx.bossStrategyVersion.update({
        where: { id: versionId, status: "DRAFT", contentMode: "REQUIREMENTS", strategy: { status: "ACTIVE" } },
        data: { status: "PUBLISHED", publishedBy: userId, publishedAt: new Date() },
      });
      if (makeDefault)
        await tx.raidBossProgress.update({
          where: {
            progressPlanId_bossId: { progressPlanId: version.strategy.progressPlanId, bossId: version.strategy.bossId },
          },
          data: { defaultStrategyId: version.strategyId },
        });
      return published;
    });
    return { id: row.id.toString(), versionNo: row.versionNo, status: row.status };
  }

  async getPublishedStrategies(progressPlanId: bigint) {
    const [strategies, plan] = await Promise.all([
      this.prisma.bossStrategy.findMany({
        where: { progressPlanId, status: "ACTIVE", versions: { some: { status: "PUBLISHED" } } },
        include: {
          boss: { select: { name: true } },
          versions: { where: { status: "PUBLISHED" }, orderBy: { versionNo: "desc" } },
        },
        orderBy: [{ boss: { order_index: "asc" } }, { name: "asc" }],
      }),
      this.prisma.raidProgressPlan.findUnique({
        where: { id: progressPlanId },
        include: { bosses: { select: { bossId: true, defaultStrategyId: true } } },
      }),
    ]);
    const defaults = new Map(
      (plan?.bosses ?? []).map((entry) => [entry.bossId.toString(), entry.defaultStrategyId?.toString()]),
    );
    return strategies.map((strategy) => ({
      id: strategy.id.toString(),
      bossId: strategy.bossId.toString(),
      bossName: strategy.boss.name,
      name: strategy.name,
      description: strategy.description,
      isDefault: defaults.get(strategy.bossId.toString()) === strategy.id.toString(),
      versions: strategy.versions.map((version) => ({
        id: version.id.toString(),
        versionNo: version.versionNo,
        publishedAt: version.publishedAt?.toISOString() ?? null,
      })),
    }));
  }

  async saveSnapshotPositioning(
    activityId: bigint,
    snapshotId: bigint,
    input: { revision: number; canvas: PositioningCanvas },
    editor: { id: bigint; privilege: number },
  ) {
    const activity = await this.prisma.activity.findFirst({ where: { id: activityId, isDeleted: 0 } });
    if (!activity) throw new NotFoundException({ code: "ACTIVITY_NOT_FOUND", message: "活动不存在" });
    if (activity.creator !== editor.id && editor.privilege < 1)
      throw new ForbiddenException({ code: "ACTIVITY_NOT_OWNED", message: "只能编辑自己负责活动的战术快照" });
    if (activity.status >= 2 || activity.rosterLockedAt)
      throw new ConflictException({ code: "ACTIVITY_ROSTER_LOCKED", message: "活动名单或站位快照已锁定" });
    const [snapshot, teamLayout] = await Promise.all([
      this.prisma.activityStrategySnapshot.findFirst({
        where: { id: snapshotId, target: { activityId } },
        select: { id: true, status: true, revision: true, slots: { select: { slotKey: true } } },
      }),
      this.prisma.activityTeamLayout.findUnique({
        where: { activityId },
        select: { seats: { select: { groupNo: true, positionNo: true } } },
      }),
    ]);
    if (!snapshot) throw new NotFoundException({ code: "STRATEGY_SNAPSHOT_NOT_FOUND", message: "战术快照不存在" });
    if (snapshot.status !== "EDITING")
      throw new ConflictException({ code: "STRATEGY_SNAPSHOT_LOCKED", message: "战术快照已锁定" });
    const availableSlotKeys = new Set([
      ...snapshot.slots.map((slot) => slot.slotKey),
      ...(teamLayout?.seats ?? []).map((seat) => `__team_g${seat.groupNo}_p${seat.positionNo}`),
    ]);
    if (input.canvas.shapes.some((shape) => shape.type === "slot" && !availableSlotKeys.has(shape.slotKey)))
      throw new ConflictException({ code: "POSITIONING_SLOT_INVALID", message: "站位图中包含当前快照不存在的槽位" });
    return this.prisma.$transaction(async (tx) => {
      const activityUpdated = await tx.activity.updateMany({
        where: { id: activityId, version: activity.version, rosterLockedAt: null, status: { lt: 2 } },
        data: { version: { increment: 1 } },
      });
      if (!activityUpdated.count)
        throw new ConflictException({ code: "VERSION_CONFLICT", message: "活动名单已变化，请刷新后重试" });
      const snapshotUpdated = await tx.activityStrategySnapshot.updateMany({
        where: { id: snapshotId, revision: input.revision, status: "EDITING" },
        data: { revision: { increment: 1 } },
      });
      if (!snapshotUpdated.count)
        throw new ConflictException({ code: "VERSION_CONFLICT", message: "站位画板已被其他人修改，请刷新后重试" });
      const block = await tx.activityStrategySnapshotBlock.findFirst({
        where: { snapshotId, type: "POSITIONING" },
        orderBy: { orderIndex: "asc" },
        select: { id: true },
      });
      const config = input.canvas as unknown as Prisma.InputJsonValue;
      if (block) {
        await tx.activityStrategySnapshotBlock.update({ where: { id: block.id }, data: { config, schemaVersion: 1 } });
      } else {
        await tx.activityStrategySnapshotBlock.create({
          data: { snapshotId, type: "POSITIONING", title: "站位画板", orderIndex: 0, schemaVersion: 1, config },
        });
      }
      return { snapshotId: snapshotId.toString(), revision: input.revision + 1, updated: true };
    });
  }

  async saveActivityTactics(
    activityId: bigint,
    snapshotId: bigint,
    input: StrategyActivitySaveInput,
    editor: { id: bigint; privilege: number },
  ) {
    const activity = await this.prisma.activity.findFirst({ where: { id: activityId, isDeleted: 0 } });
    if (!activity) throw new NotFoundException({ code: "ACTIVITY_NOT_FOUND", message: "活动不存在" });
    if (activity.creator !== editor.id && editor.privilege < 1)
      throw new ForbiddenException({ code: "ACTIVITY_NOT_OWNED", message: "只能管理自己负责活动的战术" });
    if (activity.status >= 2 || activity.rosterLockedAt)
      throw new ConflictException({ code: "ACTIVITY_ROSTER_LOCKED", message: "名单已锁定或活动已结束" });
    return this.prisma.$transaction(async (tx) => {
      const activityChanged = await tx.activity.updateMany({
        where: { id: activityId, isDeleted: 0, version: activity.version, rosterLockedAt: null, status: { lt: 2 } },
        data: { version: { increment: 1 } },
      });
      if (!activityChanged.count)
        throw new ConflictException({ code: "VERSION_CONFLICT", message: "活动已变化，请刷新后重试" });
      const changed = await tx.activityStrategySnapshot.updateMany({
        where: {
          id: snapshotId,
          target: { activityId },
          revision: input.revision,
          status: "EDITING",
          assignmentMode: "DIRECT",
        },
        data: { revision: { increment: 1 } },
      });
      if (!changed.count)
        throw new ConflictException({
          code: "VERSION_CONFLICT",
          message: "战术快照已变化、已锁定或属于旧版，请刷新后重试",
        });
      const { typeById, spellById } = await validateRequirementCatalog(tx, input.tasks);
      const bindings = input.tasks.map((task) => ({
        ...task,
        ...toBookingIds(task),
        playerSpell: task.playerSpellId == null ? null : spellById.get(task.playerSpellId),
      }));
      await validateActivityTactics(tx, activityId, bindings, false);
      const [currentTasks, currentNotes] = await Promise.all([
        tx.activityStrategySnapshotTask.findMany({ where: { snapshotId }, select: { id: true } }),
        tx.activityStrategySnapshotBlock.findMany({ where: { snapshotId, type: "NOTES" }, select: { id: true } }),
      ]);
      const validateIds = (items: { id?: string }[], existing: { id: bigint }[]) => {
        const ids = items.flatMap((item) => (item.id == null ? [] : [BigInt(item.id)]));
        const allowed = new Set(existing.map((item) => item.id));
        if (new Set(ids).size !== ids.length || ids.some((id) => !allowed.has(id)))
          throw new ConflictException({
            code: "STRATEGY_ITEM_INVALID",
            message: "任务或笔记不属于本场快照，或存在重复引用",
          });
        return ids;
      };
      const taskIds = validateIds(input.tasks, currentTasks);
      const noteIds = validateIds(input.notes, currentNotes);
      await tx.activityStrategySnapshotTask.deleteMany({
        where: { snapshotId, ...(taskIds.length ? { id: { notIn: taskIds } } : {}) },
      });
      await tx.activityStrategySnapshotBlock.deleteMany({
        where: { snapshotId, type: "NOTES", ...(noteIds.length ? { id: { notIn: noteIds } } : {}) },
      });
      const order = { SEQUENCE: 0, TIMELINE: 0 };
      for (const task of bindings) {
        const {
          kind,
          label,
          taskTypeId,
          notes,
          executorSignupId,
          fallbackSignupId,
          targetSignupId,
          encounterSpellId,
          playerSpellId,
        } = task;
        const data = {
          kind,
          label,
          taskTypeId,
          notes: notes ?? null,
          orderIndex: order[kind]++,
          executorSignupId,
          fallbackSignupId,
          targetSignupId,
          encounterSpellId: encounterSpellId ?? null,
          playerSpellId: playerSpellId ?? null,
          taskTypeLabelSnapshot: typeById.get(taskTypeId)?.label ?? label,
          encounterSpellNameSnapshot: encounterSpellId == null ? null : (spellById.get(encounterSpellId)?.name ?? null),
          playerSpellNameSnapshot: playerSpellId == null ? null : (spellById.get(playerSpellId)?.name ?? null),
          offsetMs: kind === "TIMELINE" ? (task.offsetMs ?? null) : null,
          windowMs: kind === "TIMELINE" ? (task.windowMs ?? null) : null,
        };
        if (task.id) await tx.activityStrategySnapshotTask.update({ where: { id: BigInt(task.id) }, data });
        else await tx.activityStrategySnapshotTask.create({ data: { snapshotId, ...data } });
      }
      for (const [orderIndex, note] of input.notes.entries()) {
        const { title, markdown } = note;
        const data = { type: "NOTES", title, markdown, orderIndex };
        if (note.id) await tx.activityStrategySnapshotBlock.update({ where: { id: BigInt(note.id) }, data });
        else await tx.activityStrategySnapshotBlock.create({ data: { snapshotId, ...data } });
      }
      return { snapshotId: String(snapshotId), revision: input.revision + 1 };
    });
  }

  async saveSnapshotAssignments(
    activityId: bigint,
    snapshotId: bigint,
    input: ActivityStrategyAssignmentsInput,
    editor: { id: bigint; privilege: number },
  ) {
    const activity = await this.prisma.activity.findFirst({ where: { id: activityId, isDeleted: 0 } });
    if (!activity) throw new NotFoundException({ code: "ACTIVITY_NOT_FOUND", message: "活动不存在" });
    if (activity.creator !== editor.id && editor.privilege < 1)
      throw new ForbiddenException({ code: "ACTIVITY_NOT_OWNED", message: "只能管理自己负责活动的战术快照" });
    if (activity.status >= 2 || activity.rosterLockedAt)
      throw new ConflictException({ code: "ACTIVITY_ROSTER_LOCKED", message: "活动名单已锁定或活动已结束" });

    const snapshot = await this.prisma.activityStrategySnapshot.findFirst({
      where: { id: snapshotId, target: { activityId } },
      include: { slots: { select: { slotKey: true, groupNo: true, positionNo: true } } },
    });
    if (!snapshot) throw new NotFoundException({ code: "STRATEGY_SNAPSHOT_NOT_FOUND", message: "战术快照不存在" });
    if (snapshot.status !== "EDITING")
      throw new ConflictException({ code: "STRATEGY_SNAPSHOT_LOCKED", message: "战术快照已锁定" });

    const grid = snapshot.slots.filter((slot) => slot.groupNo !== null && slot.positionNo !== null);
    if (grid.length !== 40)
      throw new ConflictException({
        code: "STRATEGY_SNAPSHOT_GRID_INVALID",
        message: "团队框架未初始化，请联系管理员",
      });
    const gridKeys = new Set(grid.map((slot) => `${slot.groupNo}:${slot.positionNo}`));
    if (input.teamAssignments.some((entry) => !gridKeys.has(`${entry.groupNo}:${entry.positionNo}`)))
      throw new ConflictException({ code: "STRATEGY_TEAM_POSITION_INVALID", message: "团队位置无效，请刷新后重试" });
    const tacticalSlotKeys = new Set(
      snapshot.slots.filter((slot) => slot.groupNo === null && slot.positionNo === null).map((slot) => slot.slotKey),
    );
    if (input.slotBindings.some((entry) => !tacticalSlotKeys.has(entry.slotKey)))
      throw new ConflictException({ code: "STRATEGY_SLOT_INVALID", message: "战术槽位无效，请刷新后重试" });

    const signupIds = [
      ...new Set([
        ...input.teamAssignments.map((entry) => BigInt(entry.signupId)),
        ...input.slotBindings.map((entry) => BigInt(entry.signupId)),
      ]),
    ];
    const validSignups = signupIds.length
      ? await this.prisma.activitySignup.findMany({
          where: { id: { in: signupIds }, activityId, status: { in: [1, 2] } },
          select: { id: true },
        })
      : [];
    if (validSignups.length !== signupIds.length)
      throw new ConflictException({ code: "STRATEGY_SIGNUP_INVALID", message: "仅可分配已确认或替补的本场报名" });

    return this.prisma.$transaction(async (tx) => {
      const activityUpdated = await tx.activity.updateMany({
        where: { id: activityId, version: activity.version, rosterLockedAt: null, status: { lt: 2 } },
        data: { version: { increment: 1 } },
      });
      if (!activityUpdated.count)
        throw new ConflictException({ code: "VERSION_CONFLICT", message: "活动名单已变化，请刷新后重试" });
      const snapshotUpdated = await tx.activityStrategySnapshot.updateMany({
        where: { id: snapshotId, revision: input.revision, status: "EDITING" },
        data: { revision: { increment: 1 } },
      });
      if (!snapshotUpdated.count)
        throw new ConflictException({ code: "VERSION_CONFLICT", message: "战术快照已被其他人修改，请刷新后重试" });
      const assignedAt = new Date();
      const clearBindings = { signupId: null, assignedBy: null, assignedAt: null };
      await tx.activityStrategySnapshotSlot.updateMany({
        where: { snapshotId, groupNo: { not: null } },
        data: {
          ...clearBindings,
          userIdSnapshot: null,
          userNameSnapshot: null,
          characterIdSnapshot: null,
          characterName: null,
          realmName: null,
          classIdSnapshot: null,
          className: null,
          specIdSnapshot: null,
          specName: null,
        },
      });
      await tx.activityStrategySnapshotSlot.updateMany({
        where: { snapshotId, groupNo: null },
        data: clearBindings,
      });
      for (const entry of input.teamAssignments) {
        await tx.activityStrategySnapshotSlot.update({
          where: {
            snapshotId_groupNo_positionNo: { snapshotId, groupNo: entry.groupNo, positionNo: entry.positionNo },
          },
          data: { signupId: BigInt(entry.signupId), assignedBy: editor.id, assignedAt },
        });
      }
      for (const entry of input.slotBindings) {
        await tx.activityStrategySnapshotSlot.update({
          where: { snapshotId_slotKey: { snapshotId, slotKey: entry.slotKey } },
          data: { signupId: BigInt(entry.signupId), assignedBy: editor.id, assignedAt },
        });
      }
      return { snapshotId: snapshotId.toString(), revision: input.revision + 1, updated: true };
    });
  }

  async listSnapshots(activityId: bigint, viewer: { id: bigint; privilege: number }) {
    const activity = await this.prisma.activity.findFirst({ where: { id: activityId, isDeleted: 0 } });
    if (!activity || (activity.status === 0 && activity.creator !== viewer.id && viewer.privilege < 1))
      throw new NotFoundException({ code: "ACTIVITY_NOT_FOUND", message: "活动不存在" });
    const targets = await this.prisma.activityRaidTarget.findMany({
      where: { activityId },
      orderBy: { orderIndex: "asc" },
      include: {
        boss: { select: { name: true } },
        strategyVersion: { include: { strategy: { select: { name: true } } } },
        strategySnapshot: {
          include: {
            blocks: { orderBy: { orderIndex: "asc" } },
            slots: { orderBy: [{ groupNo: "asc" }, { positionNo: "asc" }, { orderIndex: "asc" }] },
            tasks: {
              include: { taskType: true, encounterSpell: true, playerSpell: true },
              orderBy: [{ kind: "asc" }, { orderIndex: "asc" }],
            },
          },
        },
      },
    });
    return targets.map((target) => ({
      targetId: target.id.toString(),
      bossId: target.bossId.toString(),
      bossName: target.boss.name,
      orderIndex: target.orderIndex,
      strategyName: target.strategyVersion?.strategy.name ?? "空白战术",
      sourceVersionId: target.strategyVersionId?.toString() ?? null,
      snapshot: target.strategySnapshot
        ? {
            id: target.strategySnapshot.id.toString(),
            status: target.strategySnapshot.status,
            revision: target.strategySnapshot.revision,
            assignmentMode: target.strategySnapshot.assignmentMode,
            lockedAt: target.strategySnapshot.lockedAt?.toISOString() ?? null,
            tasks: target.strategySnapshot.tasks.map((task) =>
              serializeSnapshotTask(task, target.strategySnapshot?.status === "LOCKED"),
            ),
            blocks: target.strategySnapshot.blocks.map((block) => ({
              id: block.id.toString(),
              type: block.type,
              title: block.title,
              orderIndex: block.orderIndex,
              config: jsonRecord(block.config),
              markdown: block.markdown,
            })),
            slots: target.strategySnapshot.slots.map((slot) => ({
              slotKey: slot.slotKey,
              label: slot.label,
              groupNo: slot.groupNo,
              positionNo: slot.positionNo,
              signupId: slot.signupId?.toString() ?? null,
              userName: slot.userNameSnapshot,
              characterName: slot.characterName,
              realmName: slot.realmName,
              classId: slot.classIdSnapshot,
              className: slot.className,
              specName: slot.specName,
            })),
          }
        : null,
    }));
  }
}

async function copyVersion(tx: Prisma.TransactionClient, sourceId: bigint, targetId: bigint) {
  const [blocks, tasks] = await Promise.all([
    tx.bossStrategyBlock.findMany({ where: { versionId: sourceId } }),
    tx.bossStrategyTask.findMany({ where: { versionId: sourceId } }),
  ]);
  if (blocks.length)
    await tx.bossStrategyBlock.createMany({
      data: blocks.map(({ type, title, orderIndex, markdown }) => ({
        versionId: targetId,
        type,
        title,
        orderIndex,
        markdown,
      })),
    });
  if (tasks.length)
    await tx.bossStrategyTask.createMany({ data: tasks.map((task) => requirementData(targetId, task)) });
}

function requirementData(
  versionId: bigint,
  task: {
    kind: string;
    orderIndex: number;
    label: string;
    notes?: string | null;
    taskTypeId: number;
    encounterSpellId?: number | null;
    playerSpellId?: number | null;
  },
) {
  const { kind, orderIndex, label, notes, taskTypeId, encounterSpellId, playerSpellId } = task;
  return { versionId, kind, orderIndex, label, notes, taskTypeId, encounterSpellId, playerSpellId };
}

function defaultGuildSetting() {
  return {
    guildId: Number(process.env.WCL_GUILD_ID ?? 820881),
    guildName: process.env.WCL_GUILD_NAME ?? "TheTwilightZone",
    serverId: 569,
    serverName: "伊森利恩",
    serverSlug: process.env.WCL_GUILD_SERVER_SLUG ?? "isillien",
    serverRegion: (process.env.WCL_GUILD_SERVER_REGION ?? "CN").toUpperCase(),
    zoneId: Number(process.env.WCL_RAID_ZONE_ID ?? 53),
    season: process.env.WCL_SEASON ?? "current",
    source: "ENVIRONMENT" as const,
    updatedAt: null,
  };
}
function serializeGuildSetting(row: GuildSettingInput & { updatedAt: Date }) {
  return { ...row, source: "DATABASE" as const, updatedAt: row.updatedAt.toISOString() };
}
function manualValue(row: {
  manualStatus: string | null;
  manualBestPercent: number | null;
  manualFirstKillAt: Date | null;
  manualLastKillAt: Date | null;
  manualReason: string | null;
}) {
  return {
    status: row.manualStatus,
    bestPercent: row.manualBestPercent,
    firstKillAt: row.manualFirstKillAt?.toISOString() ?? null,
    lastKillAt: row.manualLastKillAt?.toISOString() ?? null,
    reason: row.manualReason,
  };
}
function jsonRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function progressionAttemptCount(attempts: Array<{ kill: boolean; bossPercent: number | null }>) {
  const firstKillIndex = attempts.findIndex((attempt) => attempt.kill || attempt.bossPercent === 0);
  return firstKillIndex < 0 ? attempts.length : firstKillIndex + 1;
}

type PullPhase = {
  phaseId: number | null;
  phaseNumber: number | null;
  phaseName: string | null;
  isIntermission: boolean | null;
};

function phaseReachedInAttempt(phaseData: Prisma.JsonValue | null): PullPhase {
  const data = jsonRecord(phaseData);
  const phases = Array.isArray(data?.phases)
    ? data.phases.map((value) => jsonRecord(value)).filter((value): value is Record<string, unknown> => value !== null)
    : [];
  const transitions = Array.isArray(data?.transitions)
    ? data.transitions
        .map((value) => jsonRecord(value))
        .filter((value): value is Record<string, unknown> => value !== null)
    : [];
  const phaseId = transitions.reduce<number>((furthest, transition) => {
    const id = transition.phaseId;
    return typeof id === "number" ? Math.max(furthest, id) : furthest;
  }, 0);
  const phase = phases.find((value) => value.id === phaseId);
  if (phaseId <= 0) return { phaseId: null, phaseNumber: null, phaseName: null, isIntermission: null };
  const completedStages = phases.filter(
    (value) => value.isIntermission === false && typeof value.id === "number" && value.id <= phaseId,
  ).length;
  return {
    phaseId,
    phaseNumber: completedStages || phaseId,
    phaseName: typeof phase?.name === "string" ? phase.name : null,
    isIntermission: typeof phase?.isIntermission === "boolean" ? phase.isIntermission : null,
  };
}

export function progressionPullPhases(
  attempts: Array<{ kill: boolean; bossPercent: number | null; phaseData: Prisma.JsonValue | null }>,
) {
  const firstKillIndex = attempts.findIndex((attempt) => attempt.kill || attempt.bossPercent === 0);
  const progressionAttempts = firstKillIndex < 0 ? attempts : attempts.slice(0, firstKillIndex + 1);
  let furthest: PullPhase = { phaseId: null, phaseNumber: null, phaseName: null, isIntermission: null };
  return progressionAttempts.map((attempt) => {
    const reached = phaseReachedInAttempt(attempt.phaseData);
    if (reached.phaseId !== null && (furthest.phaseId === null || reached.phaseId > furthest.phaseId)) {
      furthest = reached;
    } else if (
      reached.phaseId === furthest.phaseId &&
      reached.phaseId !== null &&
      furthest.phaseName === null &&
      reached.phaseName !== null
    ) {
      furthest = reached;
    }
    return furthest;
  });
}

export function bestPhaseProgress(
  attempts: Array<{ kill: boolean; bossPercent: number | null; phaseData: Prisma.JsonValue | null }>,
) {
  const phases = attempts.map((attempt) => phaseReachedInAttempt(attempt.phaseData));
  const firstKillIndex = attempts.findIndex((attempt) => attempt.kill);
  if (firstKillIndex >= 0) {
    return {
      bestPercent: 0,
      bestPhaseNumber: phases[firstKillIndex]?.phaseNumber ?? null,
      bestPhaseIsIntermission: phases[firstKillIndex]?.isIntermission ?? null,
    };
  }
  const candidates = attempts
    .map((attempt, index) => ({ attempt, phase: phases[index] }))
    .filter((item) => item.attempt.bossPercent !== null);
  if (!candidates.length) return { bestPercent: null, bestPhaseNumber: null, bestPhaseIsIntermission: null };
  const furthestPhaseNumber = Math.max(0, ...candidates.map((item) => item.phase?.phaseNumber ?? 0));
  let phaseCandidates = candidates.filter((item) => (item.phase?.phaseNumber ?? 0) === furthestPhaseNumber);
  if (furthestPhaseNumber > 0) {
    const mainPhaseCandidates = phaseCandidates.filter((item) => item.phase?.isIntermission === false);
    if (mainPhaseCandidates.length) phaseCandidates = mainPhaseCandidates;
  }
  const best = phaseCandidates.reduce((current, item) =>
    current.attempt.bossPercent !== null &&
    item.attempt.bossPercent !== null &&
    item.attempt.bossPercent < current.attempt.bossPercent
      ? item
      : current,
  );
  return {
    bestPercent: best.attempt.bossPercent,
    bestPhaseNumber: best.phase?.phaseNumber ?? null,
    bestPhaseIsIntermission: best.phase?.isIntermission ?? null,
  };
}

function serializePlan(plan: RaidProgressPlanWithBosses) {
  return {
    id: String(plan.id),
    raidId: String(plan.raidId),
    raidName: plan.raid.name,
    raidIcon: assetUrl(plan.raid.icon),
    raidBackground: assetUrl(plan.raid.background),
    zoneId: plan.raid.wclZoneId,
    difficulty: plan.difficulty === 3 ? "MYTHIC" : "HEROIC",
    season: plan.season,
    name: plan.name,
    status: plan.status,
    startedAt: plan.startedAt.toISOString(),
    completedAt: plan.completedAt?.toISOString() ?? null,
    lastSyncedAt: plan.lastSyncedAt?.toISOString() ?? null,
    bosses: plan.bosses.map((entry) => {
      const bestProgress = bestPhaseProgress(entry.attempts);
      return {
        progressId: String(entry.id),
        id: String(entry.bossId),
        wclId: entry.boss.wcl_id,
        name: entry.boss.name,
        icon: assetUrl(entry.boss.icon),
        orderIndex: entry.boss.order_index,
        attemptCount: progressionAttemptCount(entry.attempts),
        pullPhases: progressionPullPhases(entry.attempts),
        status: entry.wclStatus,
        bestPercent: entry.wclStatus === "DEFEATED" ? 0 : bestProgress.bestPercent,
        bestPhaseNumber: bestProgress.bestPhaseNumber,
        bestPhaseIsIntermission: bestProgress.bestPhaseIsIntermission,
        firstKillAt: entry.wclFirstKillAt?.toISOString() ?? null,
        lastKillAt: entry.wclLastKillAt?.toISOString() ?? null,
        manuallyOverridden: false,
        defaultStrategy: entry.defaultStrategy
          ? { id: String(entry.defaultStrategy.id), name: entry.defaultStrategy.name }
          : null,
      };
    }),
  };
}
function serializeStrategyTask(task: StrategyVersionWithContent["tasks"][number]) {
  return {
    id: task.id.toString(),
    taskTypeId: task.taskTypeId,
    taskTypeCode: task.taskType.code,
    taskTypeLabel: task.taskType.label,
    kind: task.kind,
    orderIndex: task.orderIndex,
    label: task.label,
    encounterSpellId: task.encounterSpellId,
    encounterSpellName: task.encounterSpell?.name ?? null,
    playerSpellId: task.playerSpellId,
    playerSpellName: task.playerSpell?.name ?? null,
    executorSlotKey: task.executorSlotKey,
    targetSlotKey: task.targetSlotKey,
    fallbackSlotKey: task.fallbackSlotKey,
    notes: task.notes,
    repeatRule: task.repeatRule,
    offsetMs: task.offsetMs,
    windowMs: task.windowMs,
    phaseLabel: task.phaseLabel,
    occurrence: task.occurrence,
    reminderMs: task.reminderMs,
  };
}

function serializeSnapshotTask(
  task: {
    id: bigint;
    taskTypeId: number;
    taskType: { code: string; label: string };
    taskTypeLabelSnapshot: string;
    encounterSpellNameSnapshot: string | null;
    playerSpellNameSnapshot: string | null;
    kind: string;
    orderIndex: number;
    label: string;
    encounterSpellId: number | null;
    encounterSpell: { name: string } | null;
    playerSpellId: number | null;
    playerSpell: { name: string } | null;
    executorSlotKey: string | null;
    executorSignupId: bigint | null;
    fallbackSignupId: bigint | null;
    targetSignupId: bigint | null;
    peopleSnapshot: Prisma.JsonValue;
    targetSlotKey: string | null;
    fallbackSlotKey: string | null;
    notes: string | null;
    repeatRule: string | null;
    offsetMs: number | null;
    windowMs: number | null;
    phaseLabel: string | null;
    occurrence: number | null;
    reminderMs: number | null;
  },
  locked: boolean,
) {
  return {
    id: task.id.toString(),
    ...serializeTacticalPeople(task, locked),
    taskTypeId: task.taskTypeId,
    taskTypeCode: task.taskType.code,
    taskTypeLabel: task.taskTypeLabelSnapshot,
    kind: task.kind,
    orderIndex: task.orderIndex,
    label: task.label,
    encounterSpellId: task.encounterSpellId,
    encounterSpellName: task.encounterSpellNameSnapshot,
    playerSpellId: task.playerSpellId,
    playerSpellName: task.playerSpellNameSnapshot,
    executorSlotKey: task.executorSlotKey,
    targetSlotKey: task.targetSlotKey,
    fallbackSlotKey: task.fallbackSlotKey,
    notes: task.notes,
    repeatRule: task.repeatRule,
    offsetMs: task.offsetMs,
    windowMs: task.windowMs,
    phaseLabel: task.phaseLabel,
    occurrence: task.occurrence,
    reminderMs: task.reminderMs,
  };
}

function serializeVersion(version: StrategyVersionWithContent) {
  return {
    id: String(version.id),
    strategyId: String(version.strategyId),
    contentMode: version.contentMode,
    strategyName: version.strategy.name,
    bossId: String(version.strategy.boss.id),
    bossName: version.strategy.boss.name,
    versionNo: version.versionNo,
    status: version.status,
    changeSummary: version.changeSummary,
    createdAt: version.createdAt.toISOString(),
    publishedAt: version.publishedAt?.toISOString() ?? null,
    blocks: version.blocks.map((block) => ({
      id: String(block.id),
      type: block.type,
      title: block.title,
      orderIndex: block.orderIndex,
      config: jsonRecord(block.config),
      markdown: block.markdown,
    })),
    slots: version.slots.map((slot) => ({
      id: String(slot.id),
      slotKey: slot.slotKey,
      label: slot.label,
      roleConstraint: slot.roleConstraint,
      isRequired: slot.isRequired,
      orderIndex: slot.orderIndex,
    })),
    tasks: version.tasks.map((task) => serializeStrategyTask(task)),
    items: serializePresetItems(version),
  };
}

function serializePresetItems(version: StrategyVersionWithContent) {
  const textTypes = new Set(["POSITIONING", "NOTES"]);
  return [
    ...version.blocks.map((block) => ({
      type: (textTypes.has(block.type) ? block.type : "NOTES") as "POSITIONING" | "NOTES",
      title: block.title,
      orderIndex: block.orderIndex,
      markdown: block.markdown,
    })),
    ...version.tasks.map((task) => ({
      type: task.kind as "SEQUENCE" | "TIMELINE",
      title: task.label,
      orderIndex: task.orderIndex,
      markdown: task.notes,
      taskTypeId: task.taskTypeId,
      encounterSpellId: task.encounterSpellId,
      playerSpellId: task.playerSpellId,
    })),
  ].sort((left, right) => left.orderIndex - right.orderIndex);
}
