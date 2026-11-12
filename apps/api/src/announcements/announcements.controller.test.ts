import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../database/prisma.service";
import { AnnouncementsController } from "./announcements.controller";

describe("AnnouncementsController current-group delivery", () => {
  it("filters ordinary members by active dates and current identity groups", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const controller = new AnnouncementsController({ announcement: { findMany } } as unknown as PrismaService);

    await controller.list(member());

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 1,
          publishAt: { lte: expect.any(Date) },
          AND: expect.arrayContaining([
            expect.objectContaining({
              OR: expect.arrayContaining([
                { audienceType: 0 },
                { audienceType: 1, groups: { some: { group: { members: { some: { userId: 7n } } } } } },
              ]),
            }),
          ]),
        }),
      }),
    );
  });

  it("serializes administrator announcements with group targets", async () => {
    const row = {
      id: 3n,
      title: "开荒安排",
      content: "今晚集合",
      status: 1,
      audienceType: 1,
      isPinned: 1,
      publishAt: new Date("2026-11-13T12:00:00.000Z"),
      expireAt: null,
      createdAt: new Date("2026-11-13T10:00:00.000Z"),
      updatedAt: new Date("2026-11-13T11:00:00.000Z"),
      groups: [{ groupId: 5n }],
    };
    const controller = new AnnouncementsController({
      announcement: { findMany: vi.fn().mockResolvedValue([row]) },
    } as unknown as PrismaService);

    const result = await controller.list({ ...member(), privilege: 1 });

    expect(result[0]).toMatchObject({
      id: "3",
      status: "ACTIVE",
      audienceType: "GROUPS",
      groupIds: ["5"],
      canManage: true,
    });
  });
});

function member() {
  return {
    id: 7n,
    name: "Member",
    wxNickname: "Member",
    guildNickname: "Member",
    privilege: 0 as const,
    isApproved: true,
    approvalStatus: "APPROVED" as const,
    rejectReason: null,
    profileComplete: true,
    status: 1,
  };
}
