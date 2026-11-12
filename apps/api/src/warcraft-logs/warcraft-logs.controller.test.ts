import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../database/prisma.service";
import { WarcraftLogsController } from "./warcraft-logs.controller";
import type { WclQueueService } from "./wcl-queue.service";

describe("WCL attendance confirmation", () => {
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
    await controller.mapActors({ id: 3n, name: "Leader", privilege: 0, isApproved: true, status: 1 }, "1", {
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
    const request = controller.applySuggestions(
      { id: 3n, name: "Leader", privilege: 0, isApproved: true, status: 1 },
      "1",
      { statuses: [{ userId: "6", status: "PRESENT" }] },
    );
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
