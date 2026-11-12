import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../database/prisma.service";
import { ActivitiesService } from "./activities.service";

describe("signup concurrent confirmation", () => {
  it("does not cancel a signup confirmed after it was read", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    const prisma = {
      activity: {
        findFirst: vi.fn().mockResolvedValue({
          status: 1,
          isDeleted: 0,
          rosterLockedAt: null,
          signupDeadline: new Date(Date.now() + 60000),
        }),
      },
      activitySignup: { findUnique: vi.fn().mockResolvedValue({ id: 8n, status: 0 }), updateMany },
    };
    const service = new ActivitiesService(prisma as unknown as PrismaService);
    await expect(
      service.cancelSignup(1n, { id: 2n, name: "Member", privilege: 0, isApproved: true, status: 1 }),
    ).rejects.toMatchObject({ response: { code: "SIGNUP_CHANGE_LOCKED" } });
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { not: 1 },
          activity: expect.objectContaining({ rosterLockedAt: null }),
        }),
      }),
    );
  });
});
