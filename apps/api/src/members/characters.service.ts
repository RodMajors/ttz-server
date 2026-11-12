import { ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { CreateCharacterInput } from "@ttz/contracts";
import { PrismaService } from "../database/prisma.service";

@Injectable()
export class CharactersService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  list(userId: bigint) {
    return this.prisma.character.findMany({ where: { userId }, orderBy: [{ isMain: "desc" }, { name: "asc" }] });
  }

  async create(userId: bigint, input: CreateCharacterInput) {
    return this.prisma.$transaction(async (transaction) => {
      if (input.isMain) await transaction.character.updateMany({ where: { userId }, data: { isMain: 0 } });
      return transaction.character.create({
        data: {
          userId,
          name: input.name,
          realm: input.realm,
          faction: input.faction,
          spec: input.specId,
          itemLevel: input.itemLevel,
          itemLevelUpdatedAt: input.itemLevel ? new Date() : null,
          isMain: input.isMain ? 1 : 0,
        },
      });
    });
  }

  async setMain(userId: bigint, characterId: bigint) {
    const character = await this.prisma.character.findUnique({ where: { id: characterId } });
    if (!character) throw new NotFoundException({ code: "CHARACTER_NOT_FOUND", message: "角色不存在" });
    if (character.userId !== userId)
      throw new ForbiddenException({ code: "CHARACTER_NOT_OWNED", message: "不能管理其他成员的角色" });
    return this.prisma.$transaction([
      this.prisma.character.updateMany({ where: { userId }, data: { isMain: 0 } }),
      this.prisma.character.update({ where: { id: characterId }, data: { isMain: 1, isRetired: 0 } }),
    ]);
  }

  async retire(userId: bigint, characterId: bigint) {
    const result = await this.prisma.character.updateMany({
      where: { id: characterId, userId },
      data: { isRetired: 1, isMain: 0 },
    });
    if (!result.count) throw new NotFoundException({ code: "CHARACTER_NOT_FOUND", message: "角色不存在" });
    return { retired: true };
  }
}
