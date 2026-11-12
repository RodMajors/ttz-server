import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../database/prisma.service";
import type { CharactersService } from "./characters.service";
import { MembersController } from "./members.controller";

describe("MembersController current-state settings", () => {
  it("returns enabled notification defaults before a preference row exists", async () => {
    const prisma = { notificationPreference: { findUnique: vi.fn().mockResolvedValue(null) } };
    const controller = createController(prisma);

    await expect(controller.notificationPreferences(member())).resolves.toEqual({
      activityPublished: true,
      signupResult: true,
      beforeTeamUp: true,
      activityCancelled: true,
    });
  });

  it("persists notification flags as database booleans", async () => {
    const upsert = vi.fn().mockResolvedValue({});
    const controller = createController({ notificationPreference: { upsert } });
    const body = { activityPublished: false, signupResult: true, beforeTeamUp: false, activityCancelled: true };

    await expect(controller.updateNotificationPreferences(member(), body)).resolves.toEqual(body);
    expect(upsert).toHaveBeenCalledWith({
      where: { userId: 3n },
      create: { userId: 3n, activityPublished: 0, signupResult: 1, beforeTeamUp: 0, activityCancelled: 1 },
      update: { activityPublished: 0, signupResult: 1, beforeTeamUp: 0, activityCancelled: 1 },
    });
  });

  it("records the administrator assigning a current identity-group label", async () => {
    const upsert = vi.fn().mockResolvedValue({ id: 8n });
    const controller = createController({ guildGroupMember: { upsert } });

    await controller.addToGroup(member(), "4", { userId: "7" });

    expect(upsert).toHaveBeenCalledWith({
      where: { groupId_userId: { groupId: 4n, userId: 7n } },
      create: { groupId: 4n, userId: 7n, addedBy: 3n },
      update: {},
    });
  });
});

function createController(prisma: Record<string, unknown>) {
  return new MembersController(prisma as unknown as PrismaService, {} as CharactersService);
}

function member() {
  return {
    id: 3n,
    name: "Admin",
    wxNickname: "Admin",
    guildNickname: "Admin",
    privilege: 1 as const,
    isApproved: true,
    profileComplete: true,
    status: 1,
  };
}
