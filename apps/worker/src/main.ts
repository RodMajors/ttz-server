import { createHash } from "node:crypto";
import { PrismaClient } from "@ttz/database";
import { WarcraftLogsClient } from "@ttz/warcraft-logs";
import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";

const redisUrl = process.env.REDIS_URL;
if (process.env.REDIS_ENABLED !== "true") {
  process.stdout.write("TTZ worker is disabled; set REDIS_ENABLED=true to start background jobs.\n");
  process.exit(0);
}
if (!redisUrl) throw new Error("REDIS_URL is required for the enabled worker");

const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
const prisma = new PrismaClient();
const wcl = new WarcraftLogsClient(process.env.WCL_CLIENT_ID ?? "", process.env.WCL_CLIENT_SECRET ?? "");
const progressQueue = new Queue("ttz-raid-progress", { connection });

async function syncGuildRaidProgress(planId?: bigint) {
  const setting = await prisma.wclGuildProgressSetting.findUnique({ where: { id: 1 } });
  const guildId = setting?.guildId ?? Number(process.env.WCL_GUILD_ID ?? 820881);
  const zoneId = setting?.zoneId ?? Number(process.env.WCL_RAID_ZONE_ID ?? 53);
  const season = setting?.season ?? process.env.WCL_SEASON ?? "current";
  const zones = await wcl.getRaidZoneInfo("cn");
  const zone = zones.find((entry) => entry.id === zoneId);
  if (!zone) throw new Error("Configured WCL raid zone was not found");
  const existingRaid = await prisma.raids.findFirst({
    where: { OR: [{ wclZoneId: zoneId }, { wcl_id: zoneId }] },
  });
  const raid = existingRaid
    ? await prisma.raids.update({
        where: { id: existingRaid.id },
        data: { wclZoneId: zoneId, name: zone.name, is_active: 1 },
      })
    : await prisma.raids.create({
        data: { wclZoneId: zoneId, wcl_id: zoneId, name: zone.name, is_active: 1 },
      });
  for (const [index, encounter] of zone.encounters.entries()) {
    await prisma.bosses.upsert({
      where: { raid_id_wcl_id: { raid_id: raid.id, wcl_id: encounter.id } },
      create: {
        raid_id: raid.id,
        wcl_id: encounter.id,
        name: encounter.name,
        short_name: encounter.name,
        order_index: index + 1,
        is_final: index === zone.encounters.length - 1 ? 1 : 0,
      },
      update: {
        name: encounter.name,
        short_name: encounter.name,
        order_index: index + 1,
        is_final: index === zone.encounters.length - 1 ? 1 : 0,
      },
    });
  }
  const plans = await prisma.raidProgressPlan.findMany({
    where: { id: planId, status: "ACTIVE", season, raidId: raid.id },
    select: { id: true, difficulty: true, lastSyncedAt: true, syncCursorAt: true, syncCursorPage: true },
  });
  const results = [];
  for (const plan of plans) {
    const run = await prisma.raidProgressSyncRun.create({ data: { progressPlanId: plan.id, zoneId } });
    let page = plan.syncCursorAt ? plan.syncCursorPage : 1;
    let hasMore = true;
    let pagesRead = 0;
    let reportsRead = 0;
    let fightsRead = 0;
    const syncAt = new Date();
    const from =
      plan.syncCursorAt ??
      (plan.lastSyncedAt
        ? new Date(plan.lastSyncedAt.getTime() - 48 * 60 * 60_000)
        : new Date(Date.now() - 180 * 24 * 60 * 60_000));
    const grouped = new Map<
      string,
      {
        progressId: bigint;
        encounterId: number;
        difficulty: number;
        startedAt: number;
        durationMs: number;
        kill: boolean;
        bossPercent: number | null;
        sources: Array<{ reportCode: string; fightId: number }>;
      }
    >();
    try {
      while (hasMore && pagesRead < 20) {
        const result = await wcl.getGuildReportPage({ guildId, zoneId, page, region: "cn", startTime: from.valueOf() });
        pagesRead += 1;
        reportsRead += result.reports.length;
        for (const report of result.reports) {
          for (const fight of report.fights) {
            if (fight.difficulty !== (plan.difficulty === 3 ? 5 : 4)) continue;
            const boss = await prisma.bosses.findUnique({
              where: { raid_id_wcl_id: { raid_id: raid.id, wcl_id: fight.encounterId } },
            });
            if (!boss) continue;
            fightsRead += 1;
            const startedAt = report.startTime + fight.startTime;
            const durationMs = Math.max(0, fight.endTime - fight.startTime);
            const key = attemptIdentity(
              plan.id,
              fight.encounterId,
              fight.difficulty,
              startedAt,
              durationMs,
              fight.kill,
            );
            const previous = grouped.get(key);
            if (previous) {
              if (
                fight.bossPercent != null &&
                (previous.bossPercent == null || fight.bossPercent < previous.bossPercent)
              )
                previous.bossPercent = fight.bossPercent;
              if (!previous.sources.some((source) => source.reportCode === report.code && source.fightId === fight.id))
                previous.sources.push({ reportCode: report.code, fightId: fight.id });
            } else {
              const progress = await prisma.raidBossProgress.upsert({
                where: { progressPlanId_bossId: { progressPlanId: plan.id, bossId: boss.id } },
                create: { progressPlanId: plan.id, bossId: boss.id },
                update: {},
              });
              grouped.set(key, {
                progressId: progress.id,
                encounterId: fight.encounterId,
                difficulty: fight.difficulty,
                startedAt,
                durationMs,
                kill: fight.kill,
                bossPercent: fight.bossPercent,
                sources: [{ reportCode: report.code, fightId: fight.id }],
              });
            }
          }
        }
        hasMore = result.hasMorePages;
        page += 1;
      }
      for (const attempt of grouped.values()) {
        const dedupKey = createHash("sha256")
          .update(
            attemptIdentity(
              plan.id,
              attempt.encounterId,
              attempt.difficulty,
              attempt.startedAt,
              attempt.durationMs,
              attempt.kill,
            ),
          )
          .digest("hex");
        const saved = await prisma.raidBossAttempt.upsert({
          where: { dedupKey },
          create: {
            progressPlanId: plan.id,
            progressId: attempt.progressId,
            encounterId: attempt.encounterId,
            difficulty: attempt.difficulty,
            startedAt: new Date(attempt.startedAt),
            durationMs: attempt.durationMs,
            kill: attempt.kill,
            bossPercent: attempt.bossPercent,
            dedupKey,
          },
          update: { bossPercent: attempt.bossPercent },
        });
        await prisma.wclReportFightEvidence.createMany({
          data: attempt.sources.map((source) => ({
            attemptId: saved.id,
            reportCode: source.reportCode,
            fightId: source.fightId,
          })),
          skipDuplicates: true,
        });
      }
      const progressRows = await prisma.raidBossProgress.findMany({ where: { progressPlanId: plan.id } });
      for (const progress of progressRows) {
        const attempts = await prisma.raidBossAttempt.findMany({
          where: { progressId: progress.id },
          orderBy: { startedAt: "asc" },
        });
        const kills = attempts.filter((attempt) => attempt.kill);
        const lastKill = kills.at(-1);
        const wipes = attempts.filter((attempt) => !attempt.kill && attempt.bossPercent != null);
        await prisma.raidBossProgress.update({
          where: { id: progress.id },
          data: {
            wclStatus: kills.length ? "DEFEATED" : attempts.length ? "PROGRESSING" : "NOT_STARTED",
            wclBestPercent: kills.length
              ? 0
              : wipes.reduce<number | null>((best, attempt) => {
                  const percent = attempt.bossPercent;
                  if (percent == null) return best;
                  return best == null ? percent : Math.min(best, percent);
                }, null),
            wclFirstKillAt: kills[0] ? new Date(kills[0].startedAt.getTime() + kills[0].durationMs) : null,
            wclLastKillAt: lastKill ? new Date(lastKill.startedAt.getTime() + lastKill.durationMs) : null,
            wclUpdatedAt: syncAt,
          },
        });
      }
      await prisma.raidProgressPlan.update({
        where: { id: plan.id },
        data: {
          syncCursorAt: hasMore ? from : null,
          syncCursorPage: hasMore ? page : 1,
          ...(!hasMore ? { lastSyncedAt: syncAt } : {}),
        },
      });
      await prisma.raidProgressSyncRun.update({
        where: { id: run.id },
        data: {
          status: "SUCCEEDED",
          reportsRead,
          fightsRead,
          finishedAt: syncAt,
          summary: { attemptCount: grouped.size, pagesRead, hasMorePages: hasMore, nextPage: page },
        },
      });
      results.push({
        planId: plan.id.toString(),
        reportsRead,
        fightsRead,
        attempts: grouped.size,
        hasMorePages: hasMore,
      });
    } catch (error) {
      await prisma.raidProgressSyncRun.update({
        where: { id: run.id },
        data: {
          status: "FAILED",
          reportsRead,
          fightsRead,
          finishedAt: new Date(),
          errorMessage: error instanceof Error ? error.message.slice(0, 1000) : "WCL raid progress sync failed",
        },
      });
      throw error;
    }
  }
  return results;
}

const worker = new Worker(
  "ttz-wcl-import",
  async (job) => {
    const reportId = BigInt(job.data.reportId as string);
    const report = await prisma.wclReport.findUnique({ where: { id: reportId } });
    if (!report) throw new Error("WCL report record was not found");
    await prisma.wclReport.update({ where: { id: reportId }, data: { status: 1, errorMessage: null } });
    try {
      const imported = await wcl.getReport(report.reportCode);
      const candidateCharacters = await prisma.character.findMany({
        where: { isRetired: 0, user: { isApproved: 1, status: 1 } },
        select: { id: true, userId: true, name: true, serverName: true, wclId: true },
      });
      const previousActors = await prisma.wclReportActor.findMany({
        where: { reportId, matchedBy: { not: null } },
        select: { actorId: true, characterId: true, matchStatus: true },
      });
      const actors = imported.actors.map((actor) => {
        const previous = previousActors.find((entry) => entry.actorId === BigInt(actor.id));
        const gameId = actor.gameID;
        const matched = previous
          ? candidateCharacters.find((character) => character.id === previous.characterId)
          : gameId != null
            ? candidateCharacters.find((character) => character.wclId === BigInt(gameId))
            : candidateCharacters.find(
                (character) =>
                  normalize(character.name) === normalize(actor.name) &&
                  normalize(character.serverName) === normalize(actor.server ?? ""),
              );
        return {
          reportId,
          actorId: BigInt(actor.id),
          actorName: actor.name.slice(0, 64),
          realmName: actor.server?.slice(0, 64) ?? null,
          characterId: matched?.id ?? null,
          matchStatus: previous?.matchStatus ?? (matched ? 1 : 0),
          matchedAt: matched ? new Date() : null,
        };
      });
      const reportStartAt = new Date(imported.startTime);
      const reportEndAt = new Date(imported.endTime);
      await prisma.$transaction(async (transaction) => {
        for (const actor of actors) {
          await transaction.wclReportActor.createMany({ data: [actor], skipDuplicates: true });
          await transaction.wclReportActor.updateMany({
            where: { reportId, actorId: actor.actorId, matchedBy: null },
            data: {
              actorName: actor.actorName,
              realmName: actor.realmName,
              characterId: actor.characterId,
              matchStatus: actor.matchStatus,
              matchedAt: actor.matchedAt,
            },
          });
        }
        const savedActors = await transaction.wclReportActor.findMany({
          where: {
            reportId,
            actorId: { in: actors.map((actor) => actor.actorId) },
            matchStatus: 1,
            characterId: { not: null },
          },
          include: { character: { select: { id: true, userId: true } } },
        });
        const savedSuggestions = new Map(
          savedActors.flatMap((actor) =>
            actor.character ? [[actor.character.userId.toString(), actor.character.id] as const] : [],
          ),
        );
        if (savedSuggestions.size) {
          for (const [userId, characterId] of savedSuggestions) {
            const suggestion = { reportId, userId: BigInt(userId), characterId, status: 1 };
            await transaction.wclAttendanceSuggestion.createMany({ data: [suggestion], skipDuplicates: true });
            await transaction.wclAttendanceSuggestion.updateMany({
              where: { reportId, userId: suggestion.userId, appliedAt: null },
              data: { characterId: suggestion.characterId, status: suggestion.status },
            });
          }
        }
        await transaction.wclReport.update({
          where: { id: reportId },
          data: {
            status: 2,
            reportStartAt,
            reportEndAt,
            importedAt: new Date(),
            errorMessage: null,
            summaryJson: {
              title: imported.title,
              fightCount: imported.fights.length,
              killCount: imported.fights.filter((fight) => fight.kill).length,
              actorCount: imported.actors.length,
              matchedActorCount: actors.filter((actor) => actor.matchStatus === 1).length,
            },
          },
        });
      });
    } catch (error) {
      await prisma.wclReport.update({
        where: { id: reportId },
        data: {
          status: 3,
          errorMessage: error instanceof Error ? error.message.slice(0, 1000) : "WCL 导入失败",
        },
      });
      throw error;
    }
  },
  { connection, concurrency: 1 },
);

const progressWorker = new Worker(
  "ttz-raid-progress",
  async (job) => {
    const plans = await syncGuildRaidProgress(job.data.planId ? BigInt(job.data.planId as string) : undefined);
    if (job.data.planId) {
      const result = plans.find((plan) => plan.planId === job.data.planId);
      if (result?.hasMorePages)
        await queueProgress("continue-guild-raid-progress", { planId: String(job.data.planId) }, 1000);
    } else {
      for (const plan of plans.filter((entry) => entry.hasMorePages)) {
        await queueProgress("continue-guild-raid-progress", { planId: plan.planId }, 1000);
      }
    }
    return plans;
  },
  { connection, concurrency: 1 },
);

void progressQueue.add(
  "sync-guild-raid-progress",
  {},
  {
    jobId: "sync-guild-raid-progress-repeat",
    repeat: { every: 30 * 60_000 },
    removeOnComplete: 20,
    removeOnFail: 100,
  },
);

async function queueProgress(jobName: string, data: { planId?: string }, delay = 0) {
  const jobId = `${jobName}-${data.planId ?? "all"}-${Date.now()}`;
  await progressQueue.add(jobName, data, { jobId, delay, removeOnComplete: 20, removeOnFail: 100 });
}

progressWorker.on("failed", (job, error) => {
  process.stderr.write(`raid-progress-sync-failed job=${String(job?.id)} error=${error.message}\n`);
});

worker.on("failed", (job, error) => {
  process.stderr.write(`${JSON.stringify({ event: "wcl-import-failed", jobId: job?.id, message: error.message })}\n`);
});

async function shutdown() {
  await worker.close();
  await progressWorker.close();
  await progressQueue.close();
  await connection.quit();
  await prisma.$disconnect();
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());

function normalize(value: string) {
  return value.normalize("NFKC").replace(/[\s-]/g, "").toLowerCase();
}

function attemptIdentity(
  planId: bigint,
  encounterId: number,
  difficulty: number,
  startedAt: number,
  durationMs: number,
  kill: boolean,
) {
  return [
    planId,
    encounterId,
    difficulty,
    Math.round(startedAt / 15_000),
    Math.round(durationMs / 5_000),
    kill ? 1 : 0,
  ].join(":");
}
