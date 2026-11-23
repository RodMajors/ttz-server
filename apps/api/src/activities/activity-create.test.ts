import { describe, expect, it, vi } from "vitest";
import type { AuthUser } from "../auth/auth.types";
import type { PrismaService } from "../database/prisma.service";
import { ActivitiesService } from "./activities.service";

describe("activity creation guidance and inviter", () => {
  it("creates an unlimited activity and binds a valid inviter character", async () => {
    const create = vi.fn().mockResolvedValue({ id: 20n });
    const prisma = {
      activityType: { findUnique: vi.fn().mockResolvedValue({ id: 1n }) },
      character: { findFirst: vi.fn().mockResolvedValue({ id: 30n }) },
      $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback({ activity: { create } })),
    } as unknown as PrismaService;

    await new ActivitiesService(prisma).create(
      {
        name: "无限人数活动",
        type: "casual",
        description: "",
        beginAt: "2026-12-01T12:00:00.000Z",
        signupDeadline: "2026-12-01T10:00:00.000Z",
        durationMinutes: 120,
        maxPlayers: null,
        tankSlots: null,
        healerSlots: null,
        meleeSlots: null,
        rangedSlots: null,
        inviterId: "30",
      },
      admin(),
    );

    expect(create.mock.calls[0]?.[0].data).toMatchObject({
      passphrase: "123",
      inviter: 30n,
      maxPlayers: null,
      tankSlots: null,
      healerSlots: null,
      meleeSlots: null,
      rangedSlots: null,
    });
  });

  it("rejects an unavailable inviter character", async () => {
    const prisma = {
      activityType: { findUnique: vi.fn().mockResolvedValue({ id: 1n }) },
      character: { findFirst: vi.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;

    await expect(
      new ActivitiesService(prisma).create(
        {
          name: "活动",
          type: "casual",
          description: "",
          beginAt: "2026-12-01T12:00:00.000Z",
          signupDeadline: "2026-12-01T10:00:00.000Z",
          durationMinutes: 120,
          maxPlayers: null,
          inviterId: "99",
        },
        admin(),
      ),
    ).rejects.toMatchObject({ response: { code: "ACTIVITY_INVITER_INVALID" } });
  });
});

function admin(): AuthUser {
  return {
    id: 7n,
    name: "Admin",
    wxNickname: null,
    guildNickname: null,
    privilege: 1,
    isApproved: true,
    profileComplete: true,
    status: 1,
  };
}
