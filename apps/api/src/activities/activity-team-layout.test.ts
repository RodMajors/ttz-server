import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../database/prisma.service";
import { ActivitiesService } from "./activities.service";

const manager = {
  id: 7n,
  name: "Leader",
  wxNickname: null,
  guildNickname: null,
  privilege: 0,
  isApproved: true,
  profileComplete: true,
  status: 1,
} as const;

function seats() {
  return Array.from({ length: 8 }, (_, groupIndex) =>
    Array.from({ length: 5 }, (_, positionIndex) => ({
      groupNo: groupIndex + 1,
      positionNo: positionIndex + 1,
    })),
  ).flat();
}

describe("activity team layout", () => {
  it("saves one revision-checked shared 8×5 team layout", async () => {
    const activityUpdate = vi.fn().mockResolvedValue({ count: 1 });
    const layoutUpdate = vi.fn().mockResolvedValue({ count: 1 });
    const clearSeats = vi.fn().mockResolvedValue({ count: 40 });
    const updateSeat = vi.fn().mockResolvedValue({});
    const transaction = {
      activity: { updateMany: activityUpdate },
      activityTeamLayout: { updateMany: layoutUpdate },
      activityTeamSeat: { updateMany: clearSeats, update: updateSeat },
    };
    const prisma = {
      activity: {
        findFirst: vi.fn().mockResolvedValue({
          id: 10n,
          creator: 7n,
          version: 4,
          status: 1,
          rosterLockedAt: null,
          isDeleted: 0,
        }),
      },
      activityTeamLayout: {
        findUnique: vi.fn().mockResolvedValue({
          id: 20n,
          revision: 3,
          groupCount: 8,
          seatsPerGroup: 5,
          status: "EDITING",
          seats: seats(),
        }),
      },
      activitySignup: { findMany: vi.fn().mockResolvedValue([{ id: 30n }]) },
      $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback(transaction)),
    } as unknown as PrismaService;

    await expect(
      new ActivitiesService(prisma).saveTeamLayout(
        10n,
        { revision: 3, assignments: [{ groupNo: 2, positionNo: 4, signupId: "30" }] },
        manager,
      ),
    ).resolves.toEqual({ layoutId: "20", revision: 4, updated: true });

    expect(activityUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: 10n, version: 4 }) }),
    );
    expect(layoutUpdate).toHaveBeenCalledWith({
      where: { id: 20n, revision: 3, status: "EDITING" },
      data: { revision: { increment: 1 }, needsReview: false },
    });
    expect(clearSeats).toHaveBeenCalledWith({
      where: { layoutId: 20n },
      data: expect.objectContaining({ signupId: null, userIdSnapshot: null }),
    });
    expect(updateSeat).toHaveBeenCalledWith({
      where: { layoutId_groupNo_positionNo: { layoutId: 20n, groupNo: 2, positionNo: 4 } },
      data: expect.objectContaining({ signupId: 30n, assignedBy: 7n }),
    });
  });

  it("requires migrated team-layout conflicts to be confirmed before roster locking", async () => {
    const lockSnapshots = vi.fn();
    const prisma = {
      activity: {
        findFirst: vi.fn().mockResolvedValue({
          id: 10n,
          creator: 7n,
          status: 1,
          rosterLockedAt: null,
          version: 4,
          isDeleted: 0,
        }),
      },
      $transaction: vi.fn(async (callback: (tx: unknown) => unknown) =>
        callback({
          activity: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
          activityStrategySnapshot: {
            findMany: vi.fn().mockResolvedValue([]),
            updateMany: lockSnapshots,
          },
          activityTeamLayout: {
            findUnique: vi.fn().mockResolvedValue({ id: 20n, status: "EDITING", needsReview: true, seats: [] }),
          },
        }),
      ),
    } as unknown as PrismaService;

    await expect(new ActivitiesService(prisma).lockRoster(10n, manager)).rejects.toMatchObject({
      response: { code: "ACTIVITY_TEAM_LAYOUT_REVIEW_REQUIRED" },
    });
    expect(lockSnapshots).not.toHaveBeenCalled();
  });

  it("rejects roster assignments that do not belong to the activity", async () => {
    const transaction = vi.fn();
    const prisma = {
      activity: {
        findFirst: vi.fn().mockResolvedValue({
          id: 10n,
          creator: 7n,
          version: 1,
          status: 1,
          rosterLockedAt: null,
          isDeleted: 0,
        }),
      },
      activityTeamLayout: {
        findUnique: vi.fn().mockResolvedValue({
          id: 20n,
          revision: 1,
          groupCount: 8,
          seatsPerGroup: 5,
          status: "EDITING",
          seats: seats(),
        }),
      },
      activitySignup: { findMany: vi.fn().mockResolvedValue([]) },
      $transaction: transaction,
    } as unknown as PrismaService;

    await expect(
      new ActivitiesService(prisma).saveTeamLayout(
        10n,
        { revision: 1, assignments: [{ groupNo: 1, positionNo: 1, signupId: "99" }] },
        manager,
      ),
    ).rejects.toMatchObject({ response: { code: "STRATEGY_SIGNUP_INVALID" } });
    expect(transaction).not.toHaveBeenCalled();
  });
});
