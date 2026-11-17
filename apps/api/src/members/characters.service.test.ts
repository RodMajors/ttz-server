import { characterSummarySchema } from "@ttz/contracts";
import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../database/prisma.service";
import type { WclBindingService } from "../warcraft-logs/wcl-binding.service";
import { CharactersService, serializeCharacter } from "./characters.service";

describe("CharactersService", () => {
  it("refreshes the complete role profile from WCL instead of accepting a manual item level", async () => {
    const character = { id: 1n, userId: 2n, name: "Veliotha", serverSlug: "anzu", serverRegion: "cn" };
    const update = vi.fn().mockResolvedValue({});
    const findUniqueOrThrow = vi.fn().mockResolvedValue({ id: 1n });
    const prisma = {
      character: { findUnique: vi.fn().mockResolvedValue(character), update, findUniqueOrThrow },
    };
    const wcl = {
      searchCharacter: vi.fn().mockResolvedValue({
        realm: "安苏",
        classId: 9,
        faction: 1,
        raceName: "暗夜精灵",
        gender: "女性",
        guildName: "TheTwilightZone",
        guildServerName: "伊森利恩",
        guildServerSlug: "isillien",
        activeSpecName: "痛苦",
        level: 90,
        activeTitle: "食蛇者",
        serverTypeName: "至暗之夜",
        itemLevel: 334,
        averageItemLevel: 335,
        lastLoginAt: "2026-11-16T00:00:00.000Z",
        achievementPoints: 2900,
        gameData: { global: { equipped_item_level: 334 } },
        wclId: "112574253",
        wclCanonicalId: "112574253",
      }),
    };
    const service = new CharactersService(prisma as unknown as PrismaService, wcl as unknown as WclBindingService);

    await service.syncFromWcl(2n, 1n);

    expect(wcl.searchCharacter).toHaveBeenCalledWith("Veliotha", "anzu", "cn");
    expect(update).toHaveBeenCalledWith({
      where: { id: 1n },
      data: expect.objectContaining({ faction: 1, itemLevel: 334, activeSpecName: "痛苦" }),
    });
    expect(findUniqueOrThrow).toHaveBeenCalledWith({ where: { id: 1n }, include: expect.any(Object) });
  });

  it("rejects retiring an already retired role", async () => {
    const prisma = {
      character: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        findFirst: vi.fn().mockResolvedValue({ id: 1n, userId: 2n, isRetired: 1 }),
      },
    };
    const service = new CharactersService(prisma as unknown as PrismaService, {} as WclBindingService);

    await expect(service.retire(2n, 1n)).rejects.toMatchObject({
      response: { code: "CHARACTER_ALREADY_RETIRED", message: "该角色已经退役" },
    });
  });

  it("reactivates a retired role without making it the main role", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = { character: { updateMany } };
    const service = new CharactersService(prisma as unknown as PrismaService, {} as WclBindingService);

    await expect(service.activate(2n, 1n)).resolves.toEqual({ activated: true });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 1n, userId: 2n, isRetired: 1 },
      data: { isRetired: 0 },
    });
  });

  it("rejects activating a role that is already active", async () => {
    const prisma = {
      character: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        findFirst: vi.fn().mockResolvedValue({ id: 1n, userId: 2n, isRetired: 0 }),
      },
    };
    const service = new CharactersService(prisma as unknown as PrismaService, {} as WclBindingService);

    await expect(service.activate(2n, 1n)).rejects.toMatchObject({
      response: { code: "CHARACTER_ALREADY_ACTIVE", message: "该角色已经处于激活状态" },
    });
  });
});

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
      faction: 1,
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
