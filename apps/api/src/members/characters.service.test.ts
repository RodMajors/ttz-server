import { characterSummarySchema } from "@ttz/contracts";
import { describe, expect, it } from "vitest";
import { serializeCharacter } from "./characters.service";

describe("serializeCharacter", () => {
  it("serializes the complete character summary contract", () => {
    const result = serializeCharacter({
      id: 1n,
      userId: 2n,
      name: "Veliotha",
      serverName: "安苏",
      serverSlug: "anzu",
      serverRegion: "cn",
      classId: 9,
      raceId: null,
      race: null,
      raceName: "暗夜精灵",
      gender: "女性",
      faction: 0,
      guildName: "TheTwilightZone",
      guildServerName: "伊森利恩",
      guildServerSlug: "isillien",
      activeSpecName: "痛苦",
      level: 90,
      activeTitle: "食蛇者",
      serverTypeName: "至暗之夜",
      isMain: 1,
      isRetired: 0,
      wclId: 112574253n,
      wclCanonicalId: 112574253n,
      wclVerificationStatus: 2,
      wclEvidence: "claimed",
      itemLevel: 334,
      averageItemLevel: 335,
      itemLevelUpdatedAt: new Date("2026-11-17T00:00:00.000Z"),
      lastLoginAt: new Date("2026-11-16T00:00:00.000Z"),
      achievementPoints: 2900,
      characterClass: {
        name: "术士",
        en_name: "Warlock",
        specs: [{ id: 25, name: "痛苦", role: 4 }],
      },
    });

    expect(characterSummarySchema.parse(result)).toEqual(result);
    expect(result.guildServerSlug).toBe("isillien");
  });
});
