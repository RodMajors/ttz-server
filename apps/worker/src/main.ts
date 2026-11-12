import { PrismaClient } from "@ttz/database";
import { WarcraftLogsClient } from "@ttz/warcraft-logs";
import { Worker } from "bullmq";
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
        select: { id: true, userId: true, name: true, realm: true, wclId: true },
      });
      const matchedUsers = new Map<string, bigint>();
      const actors = imported.actors.map((actor) => {
        const gameId = actor.gameID;
        const matched =
          gameId != null
            ? candidateCharacters.find((character) => character.wclId === BigInt(gameId))
            : candidateCharacters.find(
                (character) =>
                  normalize(character.name) === normalize(actor.name) &&
                  normalize(character.realm) === normalize(actor.server ?? ""),
              );
        if (matched) matchedUsers.set(matched.userId.toString(), matched.id);
        return {
          reportId,
          actorId: BigInt(actor.id),
          actorName: actor.name.slice(0, 64),
          realmName: actor.server?.slice(0, 64) ?? null,
          characterId: matched?.id ?? null,
          matchStatus: matched ? 1 : 0,
          matchedAt: matched ? new Date() : null,
        };
      });
      const attendanceSuggestions = [...matchedUsers.entries()].map(([userId, characterId]) => ({
        reportId,
        userId: BigInt(userId),
        characterId,
        status: 1,
      }));
      const reportStartAt = new Date(imported.startTime);
      const reportEndAt = new Date(imported.endTime);
      await prisma.$transaction(async (transaction) => {
        for (const actor of actors) {
          await transaction.wclReportActor.upsert({
            where: { reportId_actorId: { reportId, actorId: actor.actorId } },
            create: actor,
            update: {
              actorName: actor.actorName,
              realmName: actor.realmName,
              ...(actor.matchStatus === 1
                ? { characterId: actor.characterId, matchStatus: actor.matchStatus, matchedAt: actor.matchedAt }
                : {}),
            },
          });
        }
        if (attendanceSuggestions.length) {
          for (const suggestion of attendanceSuggestions) {
            await transaction.wclAttendanceSuggestion.upsert({
              where: { reportId_userId: { reportId, userId: suggestion.userId } },
              create: suggestion,
              update: { characterId: suggestion.characterId, status: suggestion.status },
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

worker.on("failed", (job, error) => {
  process.stderr.write(`${JSON.stringify({ event: "wcl-import-failed", jobId: job?.id, message: error.message })}\n`);
});

async function shutdown() {
  await worker.close();
  await connection.quit();
  await prisma.$disconnect();
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());

function normalize(value: string) {
  return value.normalize("NFKC").replace(/[\s-]/g, "").toLowerCase();
}
