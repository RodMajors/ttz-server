import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../database/prisma.service";
import { ActivitiesService } from "./activities.service";

describe("signup decision serialization", () => {
  it("locks the activity version before updating a signup without enforcing display guidance", async () => {
    const calls: string[] = [];
    const transaction = {
      activity: {
        update: vi.fn().mockImplementation(async () => {
          calls.push("lock");
          return { status: 1, rosterLockedAt: null };
        }),
      },
      activitySignup: {
        findFirst: vi.fn().mockImplementation(async () => {
          calls.push("find");
          return { id: 8n, status: 0 };
        }),
        update: vi.fn().mockImplementation(async () => {
          calls.push("update");
          return { id: 8n };
        }),
      },
    };
    const prisma = {
      activity: { findFirst: vi.fn().mockResolvedValue({ id: 1n, creator: 3n, status: 1 }) },
      $transaction: vi.fn(async (callback: (tx: typeof transaction) => unknown) => callback(transaction)),
    };
    const service = new ActivitiesService(prisma as unknown as PrismaService);

    await service.decide(1n, 8n, { status: "CONFIRMED", orderIndex: 0 }, leader());

    expect(calls).toEqual(["lock", "find", "update"]);
    expect(transaction.activity.update).toHaveBeenCalledWith({
      where: { id: 1n },
      data: { version: { increment: 1 } },
      select: { status: true, rosterLockedAt: true, endAt: true },
    });
  });

  it("clears team and tactical assignments when a confirmed signup is returned to pending", async () => {
    const transaction = {
      activity: {
        update: vi.fn().mockResolvedValue({ status: 1, rosterLockedAt: null }),
      },
      activitySignup: {
        findFirst: vi.fn().mockResolvedValue({ id: 8n, status: 1 }),
        update: vi.fn().mockResolvedValue({ id: 8n }),
      },
      activityTeamLayout: {
        findUnique: vi.fn().mockResolvedValue({ id: 5n }),
        update: vi.fn().mockResolvedValue({}),
      },
      activityTeamSeat: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      activityStrategySnapshot: {
        findMany: vi.fn().mockResolvedValue([{ id: 6n }]),
        update: vi.fn().mockResolvedValue({}),
      },
      activityStrategySnapshotSlot: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      activityStrategySnapshotTask: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    };
    const prisma = {
      activity: { findFirst: vi.fn().mockResolvedValue({ id: 1n, creator: 3n, status: 1 }) },
      $transaction: vi.fn(async (callback: (tx: typeof transaction) => unknown) => callback(transaction)),
    };
    const service = new ActivitiesService(prisma as unknown as PrismaService);

    await service.decide(1n, 8n, { status: "PENDING", orderIndex: 0 }, leader());

    expect(transaction.activitySignup.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 0, groupNo: null }) }),
    );
    expect(transaction.activityTeamSeat.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { layoutId: 5n, signupId: 8n } }),
    );
    expect(transaction.activityTeamLayout.update).toHaveBeenCalledWith({
      where: { id: 5n },
      data: { revision: { increment: 1 } },
    });
    expect(transaction.activityStrategySnapshotSlot.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { snapshotId: 6n, signupId: 8n } }),
    );
    expect(transaction.activityStrategySnapshotTask.updateMany).toHaveBeenCalledTimes(3);
    expect(transaction.activityStrategySnapshot.update).toHaveBeenCalledWith({
      where: { id: 6n },
      data: { revision: { increment: 1 } },
    });
  });
});

function leader() {
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
