import { describe, expect, it, vi } from "vitest";
import type { AuthUser } from "../auth/auth.types";
import type { PrismaService } from "../database/prisma.service";
import { ActivitiesService } from "./activities.service";

describe("activity bulk confirmation", () => {
  it("confirms only PENDING signups and leaves bench/rejected statuses untouched", async () => {
    const updateActivity = vi.fn().mockResolvedValue({ count: 1 });
    const updateSignups = vi.fn().mockResolvedValue({ count: 2 });
    const prisma = {
      activity: {
        findFirst: vi.fn().mockResolvedValue({
          id: 11n,
          creator: 7n,
          status: 1,
          version: 4,
          rosterLockedAt: null,
        }),
      },
      $transaction: vi.fn(async (callback) =>
        callback({
          activity: { updateMany: updateActivity },
          activitySignup: { updateMany: updateSignups },
        }),
      ),
    } as unknown as PrismaService;

    await expect(new ActivitiesService(prisma).confirmPendingSignups(11n, admin())).resolves.toEqual({
      confirmedCount: 2,
    });
    expect(updateActivity).toHaveBeenCalledWith({
      where: { id: 11n, version: 4, rosterLockedAt: null, status: { lt: 2 } },
      data: { version: { increment: 1 } },
    });
    expect(updateSignups).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { activityId: 11n, status: 0 },
        data: expect.objectContaining({ status: 1, handledBy: 7n }),
      }),
    );
  });
});

function admin(): AuthUser {
  return {
    id: 7n,
    name: "管理员",
    wxNickname: null,
    guildNickname: null,
    privilege: 1,
    isApproved: true,
    profileComplete: true,
    status: 1,
  };
}
