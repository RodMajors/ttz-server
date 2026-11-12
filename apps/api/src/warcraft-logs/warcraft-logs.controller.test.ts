import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../database/prisma.service";
import { WarcraftLogsController } from "./warcraft-logs.controller";
import type { WclQueueService } from "./wcl-queue.service";

describe("WCL attendance confirmation", () => {
  it("lists reports only for the activity owner", async () => {
    const prisma = {
      activity: { findFirst: vi.fn().mockResolvedValue({ id: 2n, creator: 3n, isDeleted: 0 }) },
      wclReport: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 9n,
            reportCode: "AbCdEf123",
            status: 2,
            importedAt: new Date("2026-11-13T00:00:00.000Z"),
            errorMessage: null,
            createdAt: new Date("2026-11-12T00:00:00.000Z"),
          },
        ]),
      },
    };
    const controller = new WarcraftLogsController(prisma as unknown as PrismaService, {} as WclQueueService);

    await expect(controller.list(member(), "2")).resolves.toEqual([
      {
        id: "9",
        reportCode: "AbCdEf123",
        status: 2,
        importedAt: "2026-11-13T00:00:00.000Z",
        errorMessage: null,
        createdAt: "2026-11-12T00:00:00.000Z",
      },
    ]);
  });

  it("serializes actor mappings and attendance suggestions", async () => {
    const prisma = {
      wclReport: {
        findUnique: vi.fn().mockResolvedValue({
          id: 1n,
          activityId: 2n,
          reportCode: "AbCdEf123",
          region: "CN",
          serverId: 569,
          status: 2,
          importedAt: new Date("2026-11-13T00:00:00.000Z"),
          errorMessage: null,
          createdAt: new Date("2026-11-12T00:00:00.000Z"),
          summaryJson: { fightCount: 10 },
          activity: { creator: 3n },
          actors: [
            {
              actorId: 7n,
              actorName: "Actor",
              realmName: "伊森利恩",
              characterId: 5n,
              matchStatus: 1,
              character: { id: 5n, name: "Actor", realm: "伊森利恩", userId: 6n },
            },
          ],
          suggestions: [
            {
              userId: 6n,
              characterId: 5n,
              status: 1,
              appliedAt: null,
              user: { id: 6n, name: "Member", guildNickname: null },
            },
          ],
        }),
      },
    };
    const controller = new WarcraftLogsController(prisma as unknown as PrismaService, {} as WclQueueService);

    const result = await controller.get(member(), "1");

    expect(result.summary).toEqual({ fightCount: 10 });
    expect(result.actors[0]).toEqual({
      actorId: "7",
      actorName: "Actor",
      realmName: "伊森利恩",
      characterId: "5",
      matchStatus: 1,
      character: { id: "5", name: "Actor", realm: "伊森利恩" },
    });
    expect(result.suggestions[0]).toEqual({
      userId: "6",
      memberName: "Member",
      characterId: "5",
      status: "PRESENT",
      appliedAt: null,
    });
  });

  it("creates a suggestion when a leader manually matches an actor", async () => {
    const create = vi.fn().mockResolvedValue({});
    const transaction = {
      wclReportActor: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      wclAttendanceSuggestion: { findUnique: vi.fn().mockResolvedValue(null), create },
    };
    const prisma = {
      wclReport: { findUnique: vi.fn().mockResolvedValue({ id: 1n, activityId: 2n, activity: { creator: 3n } }) },
      wclReportActor: { findMany: vi.fn().mockResolvedValue([{ actorId: 7n, actorName: "Actor", realmName: null }]) },
      character: { findFirst: vi.fn().mockResolvedValue({ id: 5n, userId: 6n }) },
      $transaction: vi.fn(async (fn: (tx: typeof transaction) => unknown) => fn(transaction)),
    };
    const controller = new WarcraftLogsController(prisma as unknown as PrismaService, {} as WclQueueService);
    await controller.mapActors(member(), "1", {
      mappings: [{ actorId: "7", characterId: "5", ignored: false }],
    });
    expect(create).toHaveBeenCalledWith({ data: { reportId: 1n, userId: 6n, characterId: 5n, status: 1 } });
  });

  it.each([false, true])("protects manually confirmed records: %s", async (manuallyConfirmed) => {
    const updateAttendance = vi.fn().mockResolvedValue({ count: manuallyConfirmed ? 0 : 1 });
    const update = vi.fn().mockResolvedValue({});
    const transaction = {
      wclAttendanceSuggestion: { findUnique: vi.fn().mockResolvedValue({ id: 4n, characterId: 5n }), update },
      attendanceRecord: { updateMany: updateAttendance },
    };
    const prisma = {
      wclReport: { findUnique: vi.fn().mockResolvedValue({ id: 1n, activityId: 2n, activity: { creator: 3n } }) },
      $transaction: vi.fn(async (fn: (tx: typeof transaction) => unknown) => fn(transaction)),
    };
    const controller = new WarcraftLogsController(prisma as unknown as PrismaService, {} as WclQueueService);
    const request = controller.applySuggestions(member(), "1", { statuses: [{ userId: "6", status: "PRESENT" }] });
    if (manuallyConfirmed) {
      await expect(request).rejects.toMatchObject({ response: { code: "MANUAL_ATTENDANCE_PROTECTED" } });
      expect(update).not.toHaveBeenCalled();
    } else {
      await expect(request).resolves.toEqual({ applied: 1 });
      expect(updateAttendance).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { activityId: 2n, userId: 6n, manuallyConfirmed: false },
        }),
      );
      expect(update).toHaveBeenCalledOnce();
    }
  });
});

function member() {
  return {
    id: 3n,
    name: "Leader",
    wxNickname: "Leader",
    guildNickname: "Leader",
    privilege: 0 as const,
    isApproved: true,
    profileComplete: true,
    status: 1,
  };
}
