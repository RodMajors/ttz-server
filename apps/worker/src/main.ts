import { parseEnv } from "@ttz/config";
import { PrismaClient } from "@ttz/database";
import { WarcraftLogsClient } from "@ttz/warcraft-logs";
import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { syncGuildRaidProgress } from "./raid-progress-sync";

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
const env = parseEnv(process.env);

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
    const followUpJobIds: string[] = [];
    const plans = await syncGuildRaidProgress(
      prisma,
      wcl,
      env,
      job.data.planId ? BigInt(job.data.planId as string) : undefined,
      (progress) => job.updateProgress(progress),
    );
    if (job.data.planId) {
      const result = plans.find((plan) => plan.planId === job.data.planId);
      if (result?.hasMorePages) {
        followUpJobIds.push(
          await queueProgress("continue-guild-raid-progress", { planId: String(job.data.planId) }, 1000),
        );
      }
    } else {
      for (const plan of plans.filter((entry) => entry.hasMorePages)) {
        followUpJobIds.push(await queueProgress("continue-guild-raid-progress", { planId: plan.planId }, 1000));
      }
    }
    return { plans, followUpJobIds };
  },
  { connection, concurrency: 1, autorun: false },
);

void startProgressWorker().catch((error: unknown) => {
  process.stderr.write(`Unable to start raid progress worker: ${String(error)}\n`);
  process.exitCode = 1;
  void shutdown();
});

async function startProgressWorker() {
  await progressQueue.setGlobalConcurrency(1);
  await progressQueue.add(
    "sync-guild-raid-progress",
    {},
    {
      jobId: "sync-guild-raid-progress-repeat",
      repeat: { every: 30 * 60_000, immediately: true },
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: 20,
      removeOnFail: 100,
    },
  );
  await progressWorker.run();
}

async function queueProgress(jobName: string, data: { planId?: string }, delay = 0) {
  const jobId = `${jobName}-${data.planId ?? "all"}-${Date.now()}`;
  const job = await progressQueue.add(jobName, data, {
    jobId,
    delay,
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: 20,
    removeOnFail: 100,
  });
  return String(job.id);
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
