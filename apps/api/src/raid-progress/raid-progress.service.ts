import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@ttz/database";
import { PrismaService } from "../database/prisma.service";

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
type StrategyBlockInput = {
  type: string;
  title: string;
  orderIndex: number;
  config?: Record<string, unknown> | null;
  markdown?: string | null;
};
type StrategySlotInput = {
  slotKey: string;
  label: string;
  roleConstraint?: number | null;
  isRequired: boolean;
  orderIndex: number;
};

const raidProgressPlanInclude = {
  raid: { select: { name: true, wclZoneId: true } },
  bosses: {
    orderBy: { boss: { order_index: "asc" as const } },
    include: { boss: true, defaultStrategy: { select: { id: true, name: true } } },
  },
} satisfies Prisma.RaidProgressPlanInclude;
type RaidProgressPlanWithBosses = Prisma.RaidProgressPlanGetPayload<{ include: typeof raidProgressPlanInclude }>;

const strategyVersionInclude = {
  strategy: { select: { id: true, name: true, boss: { select: { id: true, name: true } } } },
  blocks: { orderBy: { orderIndex: "asc" as const } },
  slots: { orderBy: { orderIndex: "asc" as const } },
} satisfies Prisma.BossStrategyVersionInclude;
type StrategyVersionWithContent = Prisma.BossStrategyVersionGetPayload<{ include: typeof strategyVersionInclude }>;

@Injectable()
export class RaidProgressService {
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
      orderBy: [{ status: "asc" }, { startedAt: "desc" }],
      include: raidProgressPlanInclude,
    });
    return plans.map(serializePlan);
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
        versions: { create: { versionNo: 1, createdBy: userId } },
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
        data: { strategyId, versionNo: (source?.versionNo ?? 0) + 1, createdBy: userId },
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

  async saveDraftVersion(
    versionId: bigint,
    input: { changeSummary?: string | null; blocks: StrategyBlockInput[]; slots: StrategySlotInput[] },
  ) {
    const version = await this.prisma.bossStrategyVersion.findUnique({ where: { id: versionId } });
    if (!version) throw new NotFoundException({ code: "STRATEGY_VERSION_NOT_FOUND", message: "战术版本不存在" });
    if (version.status !== "DRAFT")
      throw new ConflictException({ code: "STRATEGY_VERSION_IMMUTABLE", message: "已发布版本不可修改" });
    await this.prisma.$transaction(async (tx) => {
      await tx.bossStrategyVersion.update({
        where: { id: versionId },
        data: { changeSummary: input.changeSummary ?? null },
      });
      await tx.bossStrategyBlock.deleteMany({ where: { versionId } });
      await tx.bossStrategySlot.deleteMany({ where: { versionId } });
      for (const block of input.blocks) {
        await tx.bossStrategyBlock.create({
          data: {
            versionId,
            type: block.type,
            title: block.title,
            orderIndex: block.orderIndex,
            config: block.config as Prisma.InputJsonValue | undefined,
            markdown: block.markdown ?? null,
          },
        });
      }
      if (input.slots.length)
        await tx.bossStrategySlot.createMany({
          data: input.slots.map((slot) => ({
            versionId,
            slotKey: slot.slotKey,
            label: slot.label,
            roleConstraint: slot.roleConstraint ?? null,
            isRequired: slot.isRequired,
            orderIndex: slot.orderIndex,
          })),
        });
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
    const row = await this.prisma.$transaction(async (tx) => {
      const published = await tx.bossStrategyVersion.update({
        where: { id: versionId },
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
          include: { blocks: { orderBy: { orderIndex: "asc" } }, slots: { orderBy: { orderIndex: "asc" } } },
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
            lockedAt: target.strategySnapshot.lockedAt?.toISOString() ?? null,
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
              signupId: slot.signupId?.toString() ?? null,
              userName: slot.userNameSnapshot,
              characterName: slot.characterName,
              realmName: slot.realmName,
              className: slot.className,
              specName: slot.specName,
            })),
          }
        : null,
    }));
  }
}

async function copyVersion(tx: Prisma.TransactionClient, sourceId: bigint, targetId: bigint) {
  const [blocks, slots] = await Promise.all([
    tx.bossStrategyBlock.findMany({ where: { versionId: sourceId } }),
    tx.bossStrategySlot.findMany({ where: { versionId: sourceId } }),
  ]);
  if (blocks.length)
    await tx.bossStrategyBlock.createMany({
      data: blocks.map((block) => ({
        versionId: targetId,
        type: block.type,
        title: block.title,
        orderIndex: block.orderIndex,
        schemaVersion: block.schemaVersion,
        config: block.config ?? undefined,
        markdown: block.markdown,
      })),
    });
  if (slots.length)
    await tx.bossStrategySlot.createMany({
      data: slots.map((slot) => ({
        versionId: targetId,
        slotKey: slot.slotKey,
        label: slot.label,
        roleConstraint: slot.roleConstraint,
        isRequired: slot.isRequired,
        orderIndex: slot.orderIndex,
      })),
    });
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

function serializePlan(plan: RaidProgressPlanWithBosses) {
  return {
    id: String(plan.id),
    raidId: String(plan.raidId),
    raidName: plan.raid.name,
    zoneId: plan.raid.wclZoneId,
    difficulty: plan.difficulty === 3 ? "MYTHIC" : "HEROIC",
    season: plan.season,
    name: plan.name,
    status: plan.status,
    startedAt: plan.startedAt.toISOString(),
    completedAt: plan.completedAt?.toISOString() ?? null,
    lastSyncedAt: plan.lastSyncedAt?.toISOString() ?? null,
    bosses: plan.bosses.map((entry) => ({
      progressId: String(entry.id),
      id: String(entry.bossId),
      wclId: entry.boss.wcl_id,
      name: entry.boss.name,
      orderIndex: entry.boss.order_index,
      status: entry.manualStatus ?? entry.wclStatus,
      bestPercent: entry.manualStatus ? entry.manualBestPercent : entry.wclBestPercent,
      firstKillAt: (entry.manualStatus ? entry.manualFirstKillAt : entry.wclFirstKillAt)?.toISOString() ?? null,
      lastKillAt: (entry.manualStatus ? entry.manualLastKillAt : entry.wclLastKillAt)?.toISOString() ?? null,
      manuallyOverridden: entry.manualStatus !== null,
      defaultStrategy: entry.defaultStrategy
        ? { id: String(entry.defaultStrategy.id), name: entry.defaultStrategy.name }
        : null,
    })),
  };
}
function serializeVersion(version: StrategyVersionWithContent) {
  return {
    id: String(version.id),
    strategyId: String(version.strategyId),
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
  };
}
