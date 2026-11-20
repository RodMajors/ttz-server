import { createHash } from "node:crypto";
import type { AppEnv } from "@ttz/config";
import { Prisma, type PrismaClient } from "@ttz/database";
import type { WarcraftLogsClient, WclGuildReportsPage, WclRaidZoneInfo } from "@ttz/warcraft-logs";

const modes = [
  { difficulty: 2, wcl: 4, label: "英雄" },
  { difficulty: 3, wcl: 5, label: "史诗" },
] as const;
const tolerance = 5000;
type Fight = WclGuildReportsPage["reports"][number]["fights"][number] & {
  code: string;
  startedAt: number;
  durationMs: number;
  friendlyPlayers: string[];
};
type Candidate = {
  id: bigint;
  startedAt: Date;
  durationMs: number;
  bossPercent: number | null;
  fightPercent: number | null;
  phaseData: Prisma.JsonValue | null;
  players: Prisma.JsonValue;
  evidence: { reportCode: string }[];
};
type StoredAttempt = Prisma.RaidBossAttemptGetPayload<{ include: { sources: { select: { reportCode: true } } } }>;

export function findMatchingAttempt<T extends Candidate>(fight: Fight, candidates: T[]): T | undefined {
  const fightPlayers = new Set(fight.friendlyPlayers);
  const rosterSimilarity = (players: string[]) => {
    const candidatePlayers = new Set(players);
    const overlap = [...fightPlayers].filter((player) => candidatePlayers.has(player)).length;
    return overlap / Math.max(1, new Set([...fightPlayers, ...candidatePlayers]).size);
  };
  const matches = candidates.filter((candidate) => {
    if (candidate.evidence.some((source) => source.reportCode === fight.code)) return false;
    const startGap = Math.abs(candidate.startedAt.valueOf() - fight.startedAt);
    const endGap = Math.abs(candidate.startedAt.valueOf() + candidate.durationMs - fight.startedAt - fight.durationMs);
    const roster = Array.isArray(candidate.players)
      ? candidate.players.filter((value): value is string => typeof value === "string")
      : [];
    if (startGap <= tolerance && endGap <= tolerance)
      return !roster.length || !fightPlayers.size || rosterSimilarity(roster) >= 0.5;
    return (
      startGap <= 30_000 &&
      endGap <= 30_000 &&
      roster.length > 0 &&
      fightPlayers.size > 0 &&
      rosterSimilarity(roster) >= 0.7
    );
  });
  return matches.length === 1 ? matches[0] : undefined;
}

export async function syncGuildRaidProgress(
  prisma: PrismaClient,
  wcl: Pick<WarcraftLogsClient, "getRaidZoneInfo" | "getGuildReportPage">,
  env: AppEnv,
  planId?: bigint,
) {
  const zones = await wcl.getRaidZoneInfo(env.WCL_REGION);
  const results = [];
  for (const zoneId of env.WCL_RAID_ZONE_IDS ?? [env.WCL_RAID_ZONE_ID]) {
    const zone = zones.find((item) => item.id === zoneId);
    if (!zone?.encounters.length) throw new Error("WCL zone " + zoneId + " has no raid encounters");
    const plans =
      planId === undefined
        ? await ensurePlans(prisma, zone, env.WCL_SEASON)
        : await prisma.raidProgressPlan.findMany({
            where: { id: planId, raid: { wclZoneId: zoneId } },
          });
    const pages = new Map<string, WclGuildReportsPage>();
    const getPage = async (startTime: number, endTime: number, page: number) => {
      const key = [startTime, endTime, page].join(":");
      if (pages.has(key)) return pages.get(key)!;
      const result = await wcl.getGuildReportPage({
        guildId: env.WCL_GUILD_ID,
        zoneId,
        region: env.WCL_REGION,
        page,
        startTime,
        endTime,
      });
      pages.set(key, result);
      return result;
    };
    for (const plan of plans) {
      if (plan.status !== "ACTIVE" && plan.status !== "COMPLETED") continue;
      results.push(await syncPlan(prisma, plan, zoneId, getPage, env.WCL_SEASON_START_AT));
    }
    if (planId !== undefined && plans.length) break;
  }
  return results;
}

async function ensurePlans(prisma: PrismaClient, zone: WclRaidZoneInfo, season: string) {
  return prisma.$transaction(
    async (tx) => {
      const oldRaid = await tx.raids.findFirst({
        where: { OR: [{ wclZoneId: zone.id }, { wcl_id: zone.id }] },
        orderBy: [{ wclZoneId: "desc" }, { id: "asc" }],
      });
      const raid = oldRaid
        ? await tx.raids.update({
            where: { id: oldRaid.id },
            data: { wclZoneId: zone.id, name: zone.name, is_active: 1 },
          })
        : await tx.raids.create({ data: { wclZoneId: zone.id, wcl_id: zone.id, name: zone.name, is_active: 1 } });
      const bosses = [];
      for (const [i, encounter] of zone.encounters.entries()) {
        const fields = { name: encounter.name, order_index: i + 1, is_final: i === zone.encounters.length - 1 ? 1 : 0 };
        bosses.push(
          await tx.bosses.upsert({
            where: { raid_id_wcl_id: { raid_id: raid.id, wcl_id: encounter.id } },
            create: { raid_id: raid.id, wcl_id: encounter.id, short_name: encounter.name, ...fields },
            update: fields,
          }),
        );
      }
      const plans = [];
      for (const mode of modes) {
        const identity = { raidId: raid.id, difficulty: mode.difficulty };
        const plan = await tx.raidProgressPlan.upsert({
          where: { raidId_difficulty: identity },
          create: { ...identity, season, name: mode.label + "-" + raid.name },
          update: { season, status: "ACTIVE", completedAt: null },
        });
        await tx.raidBossProgress.createMany({
          data: bosses
            .filter((boss) => !boss.excludeFromProgress)
            .map((boss) => ({ progressPlanId: plan.id, bossId: boss.id })),
          skipDuplicates: true,
        });
        plans.push(plan);
      }
      return plans;
    },
    { timeout: 15_000 },
  );
}

async function syncPlan(
  prisma: PrismaClient,
  plan: Prisma.RaidProgressPlanGetPayload<Record<string, never>>,
  zoneId: number,
  getPage: (start: number, end: number, page: number) => Promise<WclGuildReportsPage>,
  seasonStart?: string,
) {
  const mode = modes.find((item) => item.difficulty === plan.difficulty);
  if (!mode) throw new Error("Unsupported raid difficulty " + plan.difficulty);
  const run = await prisma.raidProgressSyncRun.create({ data: { progressPlanId: plan.id, zoneId } });
  // A cursor without its original upper bound cannot safely resume on a changed report set.
  const hasCursor = plan.syncCursorAt !== null && plan.syncCursorEndAt !== null;
  const lowerBound = seasonStart ? Date.parse(seasonStart) : 0;
  const now = Math.floor(Date.now() / 1000) * 1000;
  const start = hasCursor
    ? plan.syncCursorAt!.valueOf()
    : Math.max(lowerBound, plan.lastSyncedAt ? plan.lastSyncedAt.valueOf() - 48 * 60 * 60_000 : now - 180 * 86_400_000);
  const end = hasCursor ? plan.syncCursorEndAt!.valueOf() : now;
  let page = hasCursor ? plan.syncCursorPage : 1;
  let more = start < end;
  let pagesRead = 0;
  let reportsRead = 0;
  let fightsRead = 0;
  try {
    const progress = await prisma.raidBossProgress.findMany({
      where: { progressPlanId: plan.id, boss: { excludeFromProgress: false } },
      include: { boss: { select: { wcl_id: true } } },
    });
    const progressIds = new Map(progress.map((item) => [item.boss.wcl_id, item.id]));
    while (more && pagesRead < 20) {
      const result = await getPage(start, end, page);
      const fights = result.reports
        .flatMap((report) =>
          report.fights.map(
            (fight): Fight => ({
              ...fight,
              code: report.code,
              startedAt: report.startTime + fight.startTime,
              durationMs: fight.endTime - fight.startTime,
              friendlyPlayers: fight.friendlyPlayers,
            }),
          ),
        )
        .filter(
          (fight) =>
            fight.difficulty === mode.wcl &&
            progressIds.has(fight.encounterId) &&
            fight.startedAt >= lowerBound &&
            fight.startedAt <= end &&
            fight.durationMs > 0,
        );
      const touched = new Set<bigint>();
      await prisma.$transaction(
        async (tx) => {
          for (const fight of fights) {
            const progressId = progressIds.get(fight.encounterId)!;
            await saveFight(tx, plan.id, progressId, fight);
            touched.add(progressId);
          }
          for (const id of touched) await updateSummary(tx, id);
          await tx.raidProgressPlan.update({
            where: { id: plan.id },
            data: result.hasMorePages
              ? { syncCursorAt: new Date(start), syncCursorEndAt: new Date(end), syncCursorPage: page + 1 }
              : { syncCursorAt: null, syncCursorEndAt: null, syncCursorPage: 1, lastSyncedAt: new Date(end) },
          });
        },
        { timeout: 60_000 },
      );
      page += 1;
      pagesRead += 1;
      reportsRead += result.reports.length;
      fightsRead += fights.length;
      more = result.hasMorePages;
    }
    await prisma.raidProgressSyncRun.update({
      where: { id: run.id },
      data: {
        status: "SUCCEEDED",
        reportsRead,
        fightsRead,
        finishedAt: new Date(),
        summary: { pagesRead, hasMorePages: more, nextPage: page },
      },
    });
    return { planId: String(plan.id), reportsRead, fightsRead, hasMorePages: more };
  } catch (error) {
    await prisma.raidProgressSyncRun.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        reportsRead,
        fightsRead,
        finishedAt: new Date(),
        errorMessage: error instanceof Error ? error.message.slice(0, 1000) : "WCL raid sync failed",
      },
    });
    throw error;
  }
}

async function saveFight(tx: Prisma.TransactionClient, planId: bigint, progressId: bigint, fight: Fight) {
  const source = { reportCode: fight.code, fightId: fight.id };
  const existing = await tx.wclReportFightEvidence.findFirst({
    where: { ...source, attempt: { progressPlanId: planId } },
    include: { attempt: true },
  });
  const percent = fight.kill
    ? 0
    : fight.bossPercent !== null && fight.bossPercent >= 0 && fight.bossPercent <= 100
      ? fight.bossPercent
      : null;
  const candidates = existing
    ? []
    : await tx.raidBossAttempt.findMany({
        where: {
          progressId,
          encounterId: fight.encounterId,
          difficulty: fight.difficulty,
          kill: fight.kill,
          startedAt: { gte: new Date(fight.startedAt - 30_000), lte: new Date(fight.startedAt + 30_000) },
        },
        include: { sources: { select: { reportCode: true } } },
      });
  const compatibleCandidates: (StoredAttempt & Candidate)[] = candidates.map((candidate) => ({
    ...candidate,
    evidence: candidate.sources,
  }));
  const attempt = existing?.attempt ?? findMatchingAttempt(fight, compatibleCandidates);
  if (attempt) {
    const previousPlayers = Array.isArray(attempt.players)
      ? attempt.players.filter((value): value is string => typeof value === "string")
      : [];
    const players = [...new Set([...previousPlayers, ...fight.friendlyPlayers])];
    const update: Prisma.RaidBossAttemptUpdateInput = { players };
    if (percent !== null && (attempt.bossPercent === null || percent < attempt.bossPercent))
      update.bossPercent = percent;
    const fightPercent = isPercentage(fight.fightPercent) ? fight.fightPercent : null;
    if (fightPercent !== null && (attempt.fightPercent === null || fightPercent > attempt.fightPercent))
      update.fightPercent = fightPercent;
    if (fight.phaseData && shouldReplacePhaseData(attempt.phaseData, fight.phaseData))
      update.phaseData = toInputPhaseData(fight.phaseData);
    await tx.raidBossAttempt.update({ where: { id: attempt.id }, data: update });
    if (!existing) await tx.wclReportFightEvidence.create({ data: { ...source, attemptId: attempt.id } });
    return;
  }
  await tx.raidBossAttempt.create({
    data: {
      progressPlanId: planId,
      progressId,
      encounterId: fight.encounterId,
      difficulty: fight.difficulty,
      startedAt: new Date(fight.startedAt),
      durationMs: fight.durationMs,
      kill: fight.kill,
      bossPercent: percent,
      fightPercent: isPercentage(fight.fightPercent) ? fight.fightPercent : null,
      phaseData: fight.phaseData ? toInputPhaseData(fight.phaseData) : Prisma.DbNull,
      players: fight.friendlyPlayers,
      dedupKey: createHash("sha256").update([planId, source.reportCode, source.fightId].join(":")).digest("hex"),
      sources: { create: source },
    },
  });
}

function toInputPhaseData(phaseData: NonNullable<Fight["phaseData"]>): Prisma.InputJsonValue {
  return {
    phases: phaseData.phases.map((phase) => ({
      id: phase.id,
      name: phase.name,
      isIntermission: phase.isIntermission,
    })),
    transitions: phaseData.transitions.map((transition) => ({
      phaseId: transition.phaseId,
      offsetMs: transition.offsetMs,
    })),
  };
}

function isPercentage(value: number | null): value is number {
  return value !== null && Number.isFinite(value) && value >= 0 && value <= 100;
}

function shouldReplacePhaseData(current: Prisma.JsonValue | null, incoming: Fight["phaseData"]): boolean {
  if (!incoming) return false;
  if (!current || typeof current !== "object" || Array.isArray(current)) return true;
  const currentTransitions = Array.isArray(current.transitions) ? current.transitions : [];
  const currentMaxPhase = phaseScore(currentTransitions);
  const incomingMaxPhase = phaseScore(incoming.transitions);
  if (incomingMaxPhase !== currentMaxPhase) return incomingMaxPhase > currentMaxPhase;
  return incoming.transitions.length > currentTransitions.length;
}

function phaseScore(transitions: unknown[]): number {
  let max = 0;
  for (const transition of transitions) {
    if (!transition || typeof transition !== "object" || Array.isArray(transition)) continue;
    const phaseId = (transition as { phaseId?: unknown }).phaseId;
    if (typeof phaseId === "number") max = Math.max(max, phaseId);
  }
  return max;
}

async function updateSummary(tx: Prisma.TransactionClient, progressId: bigint) {
  const where = { progressId };
  const aggregate = await tx.raidBossAttempt.aggregate({ where, _min: { bossPercent: true }, _count: true });
  const first = await tx.raidBossAttempt.findFirst({
    where: { ...where, kill: true },
    orderBy: [{ startedAt: "asc" }, { id: "asc" }],
  });
  const last =
    first &&
    (await tx.raidBossAttempt.findFirst({
      where: { ...where, kill: true },
      orderBy: [{ startedAt: "desc" }, { id: "desc" }],
    }));
  await tx.raidBossProgress.update({
    where: { id: progressId },
    data: {
      wclStatus: first ? "DEFEATED" : aggregate._count ? "PROGRESSING" : "NOT_STARTED",
      wclBestPercent: first ? 0 : aggregate._min.bossPercent,
      wclFirstKillAt: first ? new Date(first.startedAt.valueOf() + first.durationMs) : null,
      wclLastKillAt: last ? new Date(last.startedAt.valueOf() + last.durationMs) : null,
      wclUpdatedAt: new Date(),
    },
  });
}
