import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../database/prisma.service";
import { WarcraftLogsController } from "./warcraft-logs.controller";
import type { WclQueueService } from "./wcl-queue.service";

describe("WCL attendance confirmation", () => {
  it.each([false, true])("protects manually confirmed records: %s", async (manuallyConfirmed) => {
    const upsert = vi.fn().mockResolvedValue({});
    const update = vi.fn().mockResolvedValue({});
    const transaction = {
      wclAttendanceSuggestion: { findUnique: vi.fn().mockResolvedValue({ id: 4n, characterId: 5n }), update },
      attendanceRecord: { findUnique: vi.fn().mockResolvedValue({ manuallyConfirmed }), upsert },
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
      expect(upsert).not.toHaveBeenCalled();
    } else {
      await expect(request).resolves.toEqual({ applied: 1 });
      expect(upsert).toHaveBeenCalledOnce();
      expect(update).toHaveBeenCalledOnce();
    }
  });
});
