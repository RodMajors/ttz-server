import { characterSearchResultsSchema } from "@ttz/contracts";
import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../database/prisma.service";
import type { CharactersService } from "./characters.service";
import { MembersController } from "./members.controller";

describe("MembersController current-state settings", () => {
  it("returns a public profile only for approved active members and omits private character identifiers", async () => {
    const character = {
      id: 12n,
      userId: 3n,
      name: "Main",
      serverName: "伊森利恩",
      serverSlug: "yishenlien",
      serverRegion: "cn",
      classId: 1,
      raceId: null,
      race: null,
      raceName: null,
      gender: null,
      faction: 1,
      guildName: null,
      guildServerName: null,
      guildServerSlug: null,
      activeSpecName: "防护",
      level: 80,
      activeTitle: null,
      serverTypeName: null,
      itemLevel: 700,
      averageItemLevel: 700,
      lastLoginAt: null,
      achievementPoints: null,
      isMain: 1,
      isRetired: 0,
      wclId: 100n,
      wclCanonicalId: 100n,
      wclVerificationStatus: 2,
      wclEvidence: "private proof",
      characterClass: {
        name: "战士",
        en_name: "WARRIOR",
        icon: null,
        color: "#c79c6e",
        specs: [],
      },
      verifiedByUser: null,
      itemLevelUpdatedAt: null,
      wclVerifiedAt: null,
      wclVerifiedBy: null,
      wclVerificationNote: null,
      remark: null,
      created_at: new Date(),
      updated_at: new Date(),
    };
    const findFirst = vi.fn().mockResolvedValue({
      id: 3n,
      name: "Member",
      guildNickname: "团员",
      wxNickname: "微信名",
      avatar: "https://cos.example/avatar.png",
      characters: [character],
    });
    const controller = createController({ user: { findFirst } });

    const profile = await controller.publicProfile("3");

    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 3n, isApproved: 1, status: 1 } }));
    expect(profile).toMatchObject({
      id: "3",
      name: "Member",
      guildNickname: "团员",
      wxNickname: "微信名",
      mainCharacter: { id: "12", name: "Main" },
    });
    expect(profile.characters[0]).not.toHaveProperty("verificationEvidence");
    expect(profile.characters[0]).not.toHaveProperty("wclId");
  });

  it("searches active guild characters by name or member name for activity inviters", async () => {
    const character = {
      id: 12n,
      userId: 3n,
      name: "Main",
      serverName: "伊森利恩",
      serverSlug: "yishenlien",
      serverRegion: "cn",
      classId: 1,
      raceId: null,
      race: null,
      raceName: null,
      gender: null,
      faction: 1,
      guildName: null,
      guildServerName: null,
      guildServerSlug: null,
      activeSpecName: "防护",
      level: 80,
      activeTitle: null,
      serverTypeName: null,
      itemLevel: 700,
      averageItemLevel: 700,
      lastLoginAt: null,
      achievementPoints: null,
      isMain: 1,
      isRetired: 0,
      wclId: 100n,
      wclCanonicalId: 100n,
      wclVerificationStatus: 2,
      wclEvidence: "verified",
      characterClass: {
        name: "战士",
        en_name: "WARRIOR",
        icon: null,
        color: "#c79c6e",
        specs: [{ id: 1, name: "防护", icon: null, role: 1 }],
      },
      verifiedByUser: null,
      user: { name: "Member", guildNickname: "团员" },
      itemLevelUpdatedAt: null,
      wclVerifiedAt: null,
      wclVerifiedBy: null,
      wclVerificationNote: null,
      remark: null,
      created_at: new Date(),
      updated_at: new Date(),
    };
    const findMany = vi.fn().mockResolvedValue([character]);
    const controller = createController({ character: { findMany } });

    const results = await controller.searchCharacters({ search: "团员" });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isRetired: 0,
          user: { isApproved: 1, status: 1 },
          OR: expect.arrayContaining([
            { name: { contains: "团员" } },
            { user: { guildNickname: { contains: "团员" } } },
          ]),
        }),
        take: 30,
      }),
    );
    expect(results).toMatchObject([{ memberName: "团员", character: { id: "12", name: "Main" } }]);
    expect(characterSearchResultsSchema.parse(results)).toHaveLength(1);
  });

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
