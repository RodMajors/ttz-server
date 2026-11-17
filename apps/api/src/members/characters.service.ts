import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { CharacterSummary, CreateCharacterInput } from "@ttz/contracts";
import { PrismaService } from "../database/prisma.service";
import { WclBindingService } from "../warcraft-logs/wcl-binding.service";

@Injectable()
export class CharactersService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(WclBindingService) private readonly wcl: WclBindingService,
  ) {}

  list(userId: bigint) {
    return this.prisma.character.findMany({
      where: { userId },
      include: characterInclude,
      orderBy: [{ isMain: "desc" }, { name: "asc" }],
    });
  }

  async create(userId: bigint, input: CreateCharacterInput) {
    const candidate = await this.wcl.searchCharacter(input.name, input.serverSlug, input.serverRegion);
    const duplicate = await this.prisma.character.findFirst({
      where: {
        OR: [
          { serverRegion: candidate.serverRegion, wclCanonicalId: BigInt(candidate.wclCanonicalId) },
          { serverRegion: candidate.serverRegion, serverSlug: candidate.serverSlug, name: candidate.name },
        ],
      },
    });
    if (duplicate) {
      throw new ConflictException({ code: "CHARACTER_ALREADY_EXISTS", message: "该角色已绑定 TTZ 成员" });
    }
    return this.prisma.$transaction(async (transaction) => {
      const hasCharacters = (await transaction.character.count({ where: { userId } })) > 0;
      if (input.isMain) await transaction.character.updateMany({ where: { userId }, data: { isMain: 0 } });
      const created = await transaction.character.create({
        data: {
          userId,
          name: candidate.name,
          serverName: candidate.realm,
          serverSlug: candidate.serverSlug,
          serverRegion: candidate.serverRegion,
          classId: candidate.classId,
          faction: candidate.faction,
          raceName: candidate.raceName,
          gender: candidate.gender,
          guildName: candidate.guildName,
          guildServerName: candidate.guildServerName,
          guildServerSlug: candidate.guildServerSlug,
          activeSpecName: candidate.activeSpecName,
          level: candidate.level,
          activeTitle: candidate.activeTitle,
          serverTypeName: candidate.serverTypeName,
          itemLevel: candidate.itemLevel,
          averageItemLevel: candidate.averageItemLevel,
          itemLevelUpdatedAt: candidate.itemLevel == null ? null : new Date(),
          lastLoginAt: candidate.lastLoginAt ? new Date(candidate.lastLoginAt) : null,
          achievementPoints: candidate.achievementPoints,
          gameData: candidate.gameData,
          wclId: BigInt(candidate.wclId),
          wclCanonicalId: BigInt(candidate.wclCanonicalId),
          wclVerificationStatus: 1,
          wclEvidence: null,
          isMain: input.isMain || !hasCharacters ? 1 : 0,
        },
      });
      return transaction.character.findUniqueOrThrow({ where: { id: created.id }, include: characterInclude });
    });
  }

  async syncFromWcl(userId: bigint, characterId: bigint) {
    const character = await this.requireOwned(userId, characterId);
    const candidate = await this.wcl.searchCharacter(character.name, character.serverSlug, character.serverRegion);
    await this.prisma.character.update({
      where: { id: character.id },
      data: {
        serverName: candidate.realm,
        classId: candidate.classId,
        faction: candidate.faction,
        raceName: candidate.raceName,
        gender: candidate.gender,
        guildName: candidate.guildName,
        guildServerName: candidate.guildServerName,
        guildServerSlug: candidate.guildServerSlug,
        activeSpecName: candidate.activeSpecName,
        level: candidate.level,
        activeTitle: candidate.activeTitle,
        serverTypeName: candidate.serverTypeName,
        itemLevel: candidate.itemLevel,
        averageItemLevel: candidate.averageItemLevel,
        itemLevelUpdatedAt: candidate.itemLevel == null ? null : new Date(),
        lastLoginAt: candidate.lastLoginAt ? new Date(candidate.lastLoginAt) : null,
        achievementPoints: candidate.achievementPoints,
        gameData: candidate.gameData,
        wclId: BigInt(candidate.wclId),
        wclCanonicalId: BigInt(candidate.wclCanonicalId),
      },
    });
    return this.prisma.character.findUniqueOrThrow({ where: { id: characterId }, include: characterInclude });
  }

  async setMain(userId: bigint, characterId: bigint) {
    await this.requireOwned(userId, characterId);
    await this.prisma.$transaction([
      this.prisma.character.updateMany({ where: { userId }, data: { isMain: 0 } }),
      this.prisma.character.update({ where: { id: characterId }, data: { isMain: 1, isRetired: 0 } }),
    ]);
    return { updated: true };
  }

  async retire(userId: bigint, characterId: bigint) {
    const result = await this.prisma.character.updateMany({
      where: { id: characterId, userId, isRetired: 0 },
      data: { isRetired: 1, isMain: 0 },
    });
    if (!result.count) {
      const character = await this.prisma.character.findFirst({ where: { id: characterId, userId } });
      if (!character) throw new NotFoundException({ code: "CHARACTER_NOT_FOUND", message: "角色不存在" });
      throw new ConflictException({ code: "CHARACTER_ALREADY_RETIRED", message: "该角色已经退役" });
    }
    return { retired: true };
  }

  async activate(userId: bigint, characterId: bigint) {
    const result = await this.prisma.character.updateMany({
      where: { id: characterId, userId, isRetired: 1 },
      data: { isRetired: 0 },
    });
    if (!result.count) {
      const character = await this.prisma.character.findFirst({ where: { id: characterId, userId } });
      if (!character) throw new NotFoundException({ code: "CHARACTER_NOT_FOUND", message: "角色不存在" });
      throw new ConflictException({ code: "CHARACTER_ALREADY_ACTIVE", message: "该角色已经处于激活状态" });
    }
    return { activated: true };
  }

  async requestVerification(userId: bigint, characterId: bigint) {
    const result = await this.prisma.character.updateMany({
      where: { id: characterId, userId, wclVerificationStatus: { in: [0, 3] } },
      data: { wclVerificationStatus: 1, wclVerifiedAt: null, wclVerifiedBy: null, wclVerificationNote: null },
    });
    if (!result.count) {
      throw new ConflictException({ code: "CHARACTER_NOT_RESUBMITTABLE", message: "角色当前不能重新提交审核" });
    }
    return { requested: true };
  }

  pendingVerification() {
    return this.prisma.character.findMany({
      where: { wclVerificationStatus: 1 },
      include: { ...characterInclude, user: { select: { id: true, name: true, guildNickname: true } } },
      orderBy: { created_at: "asc" },
    });
  }

  async decideVerification(characterId: bigint, approved: boolean, note: string | null | undefined, adminId: bigint) {
    const character = await this.prisma.character.findUnique({ where: { id: characterId } });
    if (!character) throw new NotFoundException({ code: "CHARACTER_NOT_FOUND", message: "角色不存在" });
    if (character.wclVerificationStatus !== 1) {
      throw new ConflictException({ code: "CHARACTER_NOT_PENDING", message: "角色当前不在待审核状态" });
    }
    return this.prisma.character.update({
      where: { id: characterId },
      data: {
        wclVerificationStatus: approved ? 2 : 3,
        wclVerifiedAt: new Date(),
        wclVerifiedBy: adminId,
        wclEvidence: approved ? "admin-review" : null,
        wclVerificationNote: note ?? null,
      },
      include: characterInclude,
    });
  }

  private async requireOwned(userId: bigint, characterId: bigint) {
    const character = await this.prisma.character.findUnique({ where: { id: characterId } });
    if (!character) throw new NotFoundException({ code: "CHARACTER_NOT_FOUND", message: "角色不存在" });
    if (character.userId !== userId) {
      throw new ForbiddenException({ code: "CHARACTER_NOT_OWNED", message: "不能管理其他成员的角色" });
    }
    return character;
  }
}

export const characterInclude = {
  characterClass: { include: { specs: true } },
  race: true,
  verifiedByUser: { select: { id: true, name: true, guildNickname: true } },
} as const;

const verificationStatuses = ["UNVERIFIED", "PENDING", "VERIFIED", "REJECTED"] as const;
const roleCodeToRole = [null, "TANK", "HEALER", "MELEE", "RANGED"] as const;

export function serializeCharacter(character: {
  id: bigint;
  userId: bigint;
  name: string;
  serverName: string;
  serverSlug: string;
  serverRegion: string;
  classId: number;
  raceId: number | null;
  race: { name: string } | null;
  raceName: string | null;
  gender: string | null;
  faction: number | null;
  guildName: string | null;
  guildServerName: string | null;
  guildServerSlug: string | null;
  activeSpecName: string | null;
  level: number | null;
  activeTitle: string | null;
  serverTypeName: string | null;
  isMain: number;
  isRetired: number;
  wclId: bigint;
  wclCanonicalId: bigint;
  wclVerificationStatus: number;
  wclEvidence: string | null;
  itemLevel: number | null;
  averageItemLevel: number | null;
  itemLevelUpdatedAt: Date | null;
  lastLoginAt: Date | null;
  achievementPoints: number | null;
  characterClass: {
    name: string | null;
    en_name: string | null;
    specs: Array<{ id: number; name: string | null; role: number | null }>;
  };
}): CharacterSummary {
  return {
    id: character.id.toString(),
    userId: character.userId.toString(),
    name: character.name,
    realm: character.serverName,
    serverSlug: character.serverSlug,
    serverRegion: character.serverRegion,
    classId: character.classId,
    className: character.characterClass.name ?? character.characterClass.en_name ?? `职业 ${character.classId}`,
    raceId: character.raceId,
    raceName: character.raceName ?? character.race?.name ?? null,
    gender: character.gender,
    faction: character.faction,
    guildName: character.guildName,
    guildServerName: character.guildServerName,
    guildServerSlug: character.guildServerSlug,
    activeSpecName: character.activeSpecName,
    level: character.level,
    activeTitle: character.activeTitle,
    serverTypeName: character.serverTypeName,
    isMain: character.isMain === 1,
    isRetired: character.isRetired === 1,
    itemLevel: character.itemLevel,
    averageItemLevel: character.averageItemLevel,
    lastLoginAt: character.lastLoginAt?.toISOString() ?? null,
    achievementPoints: character.achievementPoints,
    verificationStatus: verificationStatuses[character.wclVerificationStatus] ?? "UNVERIFIED",
    verificationEvidence: character.wclEvidence,
    wclId: character.wclId.toString(),
    wclCanonicalId: character.wclCanonicalId.toString(),
    availableSpecs: character.characterClass.specs.map((spec) => ({
      id: spec.id,
      name: spec.name ?? `专精 ${spec.id}`,
      role: roleCodeToRole[spec.role ?? 0] ?? null,
    })),
  };
}
