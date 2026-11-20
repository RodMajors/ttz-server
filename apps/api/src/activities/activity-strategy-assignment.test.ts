import { ForbiddenException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../database/prisma.service";
import { RaidProgressService } from "../raid-progress/raid-progress.service";
import { ActivitiesService } from "./activities.service";

const admin = { id: 7n, privilege: 1 };
const snapshotSlots = [
  ...Array.from({ length: 8 }, (_, group) =>
    Array.from({ length: 5 }, (_, position) => ({
      slotKey: `__team_g${group + 1}_p${position + 1}`,
      groupNo: group + 1,
      positionNo: position + 1,
    })),
  ).flat(),
  { slotKey: "interrupt-1", groupNo: null, positionNo: null },
];

describe("activity snapshot team assignments", () => {
  it("persists a revision-checked team and tactical binding independently", async () => {
    const slotUpdate = vi.fn().mockResolvedValue({});
    const slotUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const snapshotUpdate = vi.fn().mockResolvedValue({ count: 1 });
    const activityUpdate = vi.fn().mockResolvedValue({ count: 1 });
    const transaction = {
      activity: { updateMany: activityUpdate },
      activityStrategySnapshot: { updateMany: snapshotUpdate },
      activityStrategySnapshotSlot: { updateMany: slotUpdateMany, update: slotUpdate },
    };
    const prisma = {
      activity: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ id: 10n, creator: 7n, version: 4, status: 1, rosterLockedAt: null, isDeleted: 0 }),
      },
      activityStrategySnapshot: {
        findFirst: vi.fn().mockResolvedValue({ id: 20n, status: "EDITING", revision: 2, slots: snapshotSlots }),
      },
      activitySignup: { findMany: vi.fn().mockResolvedValue([{ id: 30n }]) },
      $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback(transaction)),
    } as unknown as PrismaService;

    await expect(
      new RaidProgressService(prisma).saveSnapshotAssignments(
        10n,
        20n,
        {
          revision: 2,
          teamAssignments: [{ groupNo: 1, positionNo: 2, signupId: "30" }],
          slotBindings: [{ slotKey: "interrupt-1", signupId: "30" }],
        },
        admin,
      ),
    ).resolves.toEqual({ snapshotId: "20", revision: 3, updated: true });

    expect(activityUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ version: 4 }) }),
    );
    expect(snapshotUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 20n, revision: 2, status: "EDITING" } }),
    );
    expect(slotUpdate).toHaveBeenCalledTimes(2);
    expect(slotUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { snapshotId_slotKey: { snapshotId: 20n, slotKey: "interrupt-1" } },
        data: expect.objectContaining({ signupId: 30n, assignedBy: 7n }),
      }),
    );
  });

  it("rejects signups from another activity before writing", async () => {
    const transaction = vi.fn();
    const prisma = {
      activity: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ id: 10n, creator: 7n, version: 4, status: 1, rosterLockedAt: null, isDeleted: 0 }),
      },
      activityStrategySnapshot: {
        findFirst: vi.fn().mockResolvedValue({ id: 20n, status: "EDITING", revision: 1, slots: snapshotSlots }),
      },
      activitySignup: { findMany: vi.fn().mockResolvedValue([]) },
      $transaction: transaction,
    } as unknown as PrismaService;

    await expect(
      new RaidProgressService(prisma).saveSnapshotAssignments(
        10n,
        20n,
        {
          revision: 1,
          teamAssignments: [{ groupNo: 1, positionNo: 1, signupId: "99" }],
          slotBindings: [],
        },
        admin,
      ),
    ).rejects.toMatchObject({ response: { code: "STRATEGY_SIGNUP_INVALID" } });
    expect(transaction).not.toHaveBeenCalled();
  });

  it("only allows activity managers to edit the snapshot", async () => {
    const prisma = {
      activity: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ id: 10n, creator: 8n, version: 1, status: 1, rosterLockedAt: null, isDeleted: 0 }),
      },
    } as unknown as PrismaService;
    await expect(
      new RaidProgressService(prisma).saveSnapshotAssignments(
        10n,
        20n,
        {
          revision: 1,
          teamAssignments: [],
          slotBindings: [],
        },
        { id: 7n, privilege: 0 },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe("activity roster snapshot locking", () => {
  it("freezes display fields and locks every Boss snapshot in one transaction", async () => {
    const assignedSlot = {
      id: 101n,
      signup: {
        id: 30n,
        userId: 31n,
        status: 1,
        preferredSpecId: 250,
        user: { name: "Member", guildNickname: "Guild Member" },
        character: {
          id: 32n,
          name: "Tank",
          serverName: "伊森利恩",
          classId: 1,
          characterClass: { name: "战士", en_name: "WARRIOR" },
        },
        specs: { name: "防护" },
      },
    };
    const slotUpdate = vi.fn().mockResolvedValue({});
    const snapshotLock = vi.fn().mockResolvedValue({ count: 1 });
    const activityLock = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      activity: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ id: 10n, creator: 7n, status: 1, rosterLockedAt: null, version: 4, isDeleted: 0 }),
      },
      $transaction: vi.fn(async (callback: (tx: unknown) => unknown) =>
        callback({
          activity: { updateMany: activityLock },
          activityStrategySnapshot: {
            findMany: vi.fn().mockResolvedValue([{ slots: [assignedSlot] }]),
            updateMany: snapshotLock,
          },
          activityStrategySnapshotSlot: { update: slotUpdate },
        }),
      ),
    } as unknown as PrismaService;

    await expect(
      new ActivitiesService(prisma).lockRoster(10n, {
        id: 7n,
        privilege: 0,
        name: "Leader",
        wxNickname: null,
        guildNickname: null,
        isApproved: true,
        profileComplete: true,
        status: 1,
      }),
    ).resolves.toMatchObject({ rosterLockedAt: expect.any(String) });

    expect(slotUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 101n },
        data: expect.objectContaining({
          userIdSnapshot: 31n,
          userNameSnapshot: "Guild Member",
          characterName: "Tank",
          realmName: "伊森利恩",
          classIdSnapshot: 1,
          className: "战士",
          specName: "防护",
        }),
      }),
    );
    expect(snapshotLock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { target: { activityId: 10n }, status: "EDITING" },
        data: expect.objectContaining({ status: "LOCKED", lockedBy: 7n, revision: { increment: 1 } }),
      }),
    );
    expect(activityLock).toHaveBeenCalledTimes(1);
  });
  it("refuses to lock a roster when a required task executor or backup slot is unassigned", async () => {
    const lockSnapshots = vi.fn();
    const prisma = {
      activity: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ id: 10n, creator: 7n, status: 1, rosterLockedAt: null, version: 2, isDeleted: 0 }),
      },
      $transaction: vi.fn(async (callback: (tx: unknown) => unknown) =>
        callback({
          activity: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
          activityStrategySnapshot: {
            findMany: vi.fn().mockResolvedValue([
              {
                slots: [],
                tasks: [
                  {
                    label: "外部减伤",
                    executorSlotKey: "healer-1",
                    fallbackSlotKey: null,
                    targetSlotKey: null,
                    playerSpell: null,
                  },
                ],
              },
            ]),
            updateMany: lockSnapshots,
          },
          activityStrategySnapshotSlot: { update: vi.fn(), updateMany: vi.fn() },
        }),
      ),
    } as unknown as PrismaService;

    await expect(
      new ActivitiesService(prisma).lockRoster(10n, {
        id: 7n,
        privilege: 0,
        name: "Leader",
        wxNickname: null,
        guildNickname: null,
        isApproved: true,
        profileComplete: true,
        status: 1,
      }),
    ).rejects.toMatchObject({ response: { code: "STRATEGY_TASK_EXECUTOR_UNBOUND" } });
    expect(lockSnapshots).not.toHaveBeenCalled();
  });
  it("stores a validated positioning canvas under the activity snapshot revision", async () => {
    const activityUpdate = vi.fn().mockResolvedValue({ count: 1 });
    const snapshotUpdate = vi.fn().mockResolvedValue({ count: 1 });
    const blockCreate = vi.fn().mockResolvedValue({ id: 80n });
    const prisma = {
      activity: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ id: 10n, creator: 7n, status: 1, rosterLockedAt: null, version: 3, isDeleted: 0 }),
      },
      activityStrategySnapshot: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ id: 20n, status: "EDITING", revision: 4, slots: [{ slotKey: "main-tank" }] }),
      },
      $transaction: vi.fn(async (callback: (tx: unknown) => unknown) =>
        callback({
          activity: { updateMany: activityUpdate },
          activityStrategySnapshot: { updateMany: snapshotUpdate },
          activityStrategySnapshotBlock: { findFirst: vi.fn().mockResolvedValue(null), create: blockCreate },
        }),
      ),
    } as unknown as PrismaService;
    const canvas = {
      schemaVersion: 1 as const,
      width: 1000,
      height: 700,
      background: "CIRCLE_ARENA" as const,
      imageUrl: null,
      shapes: [{ id: "tank", type: "slot" as const, x: 400, y: 300, slotKey: "main-tank", color: "blue" as const }],
    };

    await expect(
      new RaidProgressService(prisma).saveSnapshotPositioning(10n, 20n, { revision: 4, canvas }, admin),
    ).resolves.toEqual({
      snapshotId: "20",
      revision: 5,
      updated: true,
    });
    expect(snapshotUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 20n, revision: 4, status: "EDITING" } }),
    );
    expect(blockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ snapshotId: 20n, type: "POSITIONING", config: canvas }),
      }),
    );
    expect(activityUpdate).toHaveBeenCalledTimes(1);
  });
});
