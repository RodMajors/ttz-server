import { activityListQuerySchema } from "@ttz/contracts";
import { describe, expect, it, vi } from "vitest";
import type { AuthUser } from "../auth/auth.types";
import type { PrismaService } from "../database/prisma.service";
import { ActivitiesService } from "./activities.service";

describe("activity list filters", () => {
  it("includes the whole Shanghai-local day and applies activity/Boss search filters", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const count = vi.fn().mockResolvedValue(0);
    const prisma = {
      activity: { findMany, count },
      $transaction: vi.fn(async (operations: Promise<unknown>[]) => Promise.all(operations)),
    } as unknown as PrismaService;
    const query = activityListQuerySchema.parse({
      page: 2,
      pageSize: 10,
      status: "PUBLISHED",
      search: "开荒",
      startDate: "2026-11-24",
      endDate: "2026-11-24",
      raidId: "3",
      bossId: "8",
    });

    await new ActivitiesService(prisma).list(member(), query);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 10,
        take: 10,
        where: expect.objectContaining({
          status: 1,
          name: { contains: "开荒" },
          beginAt: {
            gte: new Date("2026-11-23T16:00:00.000Z"),
            lt: new Date("2026-11-24T16:00:00.000Z"),
          },
          activity_raid_ext: { is: { raid_id: 3n } },
          raidTargets: { some: { bossId: 8n } },
        }),
      }),
    );
    expect(count).toHaveBeenCalled();
  });
});

function member(): AuthUser {
  return {
    id: 7n,
    name: "团员",
    wxNickname: null,
    guildNickname: null,
    privilege: 0,
    isApproved: true,
    profileComplete: true,
    status: 1,
  };
}
