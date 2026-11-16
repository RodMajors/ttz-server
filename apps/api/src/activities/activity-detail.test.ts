import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../database/prisma.service";
import { ActivitiesService } from "./activities.service";

describe("activity detail DTO", () => {
  it("hides another creator's draft from ordinary members", async () => {
    const activity = fixture(0);
    activity.status = 0;
    const service = new ActivitiesService({
      activity: { findFirst: vi.fn().mockResolvedValue(activity) },
    } as unknown as PrismaService);

    await expect(service.get(1n, member())).rejects.toMatchObject({ response: { code: "ACTIVITY_NOT_FOUND" } });
  });

  it.each([
    { signupStatus: 0, canChange: true },
    { signupStatus: 1, canChange: false },
  ])("reports member change policy for signup status $signupStatus", async ({ signupStatus, canChange }) => {
    const activity = fixture(signupStatus);
    const service = new ActivitiesService({
      activity: { findFirst: vi.fn().mockResolvedValue(activity) },
    } as unknown as PrismaService);

    const result = await service.get(1n, member());

    expect(result.canChangeMySignup).toBe(canChange);
    expect(result.mySignup?.status).toBe(signupStatus === 1 ? "CONFIRMED" : "PENDING");
    expect(result.mySignup?.officerNote).toBeUndefined();
    expect(result.mySignup?.decisionReason).toBeUndefined();
    expect(result.mySignup?.character).toMatchObject({ id: "10", userId: "7", isMain: true });
  });
});

function fixture(signupStatus: number) {
  const beginAt = new Date(Date.now() + 7_200_000);
  const character = {
    id: 10n,
    userId: 7n,
    name: "Main",
    serverName: "伊森利恩",
    serverSlug: "yishenlien",
    serverRegion: "cn",
    classId: 1,
    faction: 1,
    wclId: 1n,
    wclCanonicalId: 1n,
    wclVerificationStatus: 2,
    wclEvidence: "claimed",
    isMain: 1,
    isRetired: 0,
    itemLevel: 700,
    itemLevelUpdatedAt: null,
    wclVerifiedAt: new Date(),
    wclVerifiedBy: null,
    wclVerificationNote: null,
    raceId: null,
    remark: null,
    created_at: new Date(),
    updated_at: new Date(),
    characterClass: { name: "战士", en_name: "WARRIOR", specs: [{ id: 1, name: "武器", role: 3 }] },
    race: null,
    verifiedByUser: null,
  };
  return {
    id: 1n,
    name: "M 团本开荒",
    status: 1,
    creator: 9n,
    description: null,
    passphrase: null,
    beginAt,
    endAt: new Date(beginAt.getTime() + 7_200_000),
    teamUpAt: null,
    signupDeadline: new Date(Date.now() + 3_600_000),
    maxPlayers: 20,
    tankSlots: 2,
    healerSlots: 4,
    meleeSlots: 7,
    rangedSlots: 7,
    attendanceEnabled: 1,
    rosterLockedAt: null,
    version: 1,
    typeDefinition: { code: "raid_progress" },
    creatorUser: { id: 9n, name: "Leader", guildNickname: null },
    signups: [
      {
        id: 12n,
        userId: 7n,
        preferredRole: 1,
        preferredSpecId: 250,
        groupNo: null,
        orderIndex: 0,
        status: signupStatus,
        note: null,
        officerNote: "private",
        decisionReason: "private",
        signedUpAt: new Date(),
        user: { id: 7n, name: "Member", guildNickname: null },
        character,
        choices: [],
      },
    ],
  };
}

function member() {
  return {
    id: 7n,
    name: "Member",
    wxNickname: "Member",
    guildNickname: "Member",
    privilege: 0 as const,
    isApproved: true,
    profileComplete: true,
    status: 1,
  };
}
