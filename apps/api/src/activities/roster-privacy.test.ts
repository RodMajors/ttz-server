import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../database/prisma.service";
import { ActivitiesService } from "./activities.service";

describe("roster privacy", () => {
  it.each([0, 1] as const)("restricts officer notes for privilege %s", async (privilege) => {
    const prisma = {
      activity: { findFirst: vi.fn().mockResolvedValue({ id: 1n, creator: 2n, version: 1, rosterLockedAt: null }) },
      activitySignup: {
        findMany: vi.fn().mockResolvedValue([{ id: 3n, officerNote: "private", decisionReason: "private reason" }]),
      },
    };
    const service = new ActivitiesService(prisma as unknown as PrismaService);
    const result = await service.roster(1n, member(privilege));
    expect(result.entries[0]?.officerNote).toBe(privilege ? "private" : undefined);
    expect(result.entries[0]?.decisionReason).toBe(privilege ? "private reason" : undefined);
  });
});

function member(privilege: 0 | 1 | 2) {
  return {
    id: 4n,
    name: "Member",
    wxNickname: "Member",
    guildNickname: "Member",
    privilege,
    isApproved: true,
    profileComplete: true,
    status: 1,
  };
}
