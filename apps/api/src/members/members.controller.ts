import { Body, Controller, Get, Inject, Param, Post, Query } from "@nestjs/common";
import {
  type CreateCharacterInput,
  createCharacterSchema,
  idSchema,
  memberApprovalSchema,
  pageQuerySchema,
} from "@ttz/contracts";
import { CurrentUser, MinPrivilege } from "../auth/auth.decorators";
import type { AuthUser } from "../auth/auth.types";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { PrismaService } from "../database/prisma.service";
import { CharactersService } from "./characters.service";

@Controller()
export class MembersController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CharactersService) private readonly characters: CharactersService,
  ) {}

  @Get("members")
  async members(@Query(new ZodValidationPipe(pageQuerySchema)) query: { page: number; pageSize: number }) {
    const where = { isApproved: 1, status: 1 };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: { name: "asc" },
        include: { characters: { where: { isRetired: 0 } }, groupMemberships: { include: { group: true } } },
      }),
      this.prisma.user.count({ where }),
    ]);
    return { items, pagination: { ...query, total } };
  }

  @Get("characters")
  myCharacters(@CurrentUser() user: AuthUser) {
    return this.characters.list(user.id);
  }

  @Post("characters")
  createCharacter(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createCharacterSchema)) body: CreateCharacterInput,
  ) {
    return this.characters.create(user.id, body);
  }

  @Post("characters/:id/set-main")
  setMain(@CurrentUser() user: AuthUser, @Param("id", new ZodValidationPipe(idSchema)) id: string) {
    return this.characters.setMain(user.id, BigInt(id));
  }

  @Post("characters/:id/retire")
  retire(@CurrentUser() user: AuthUser, @Param("id", new ZodValidationPipe(idSchema)) id: string) {
    return this.characters.retire(user.id, BigInt(id));
  }

  @Post("members/:id/approval")
  @MinPrivilege(1)
  approve(
    @CurrentUser() user: AuthUser,
    @Param("id", new ZodValidationPipe(idSchema)) id: string,
    @Body(new ZodValidationPipe(memberApprovalSchema)) body: { approved: boolean; reason?: string },
  ) {
    return this.prisma.user.update({
      where: { id: BigInt(id) },
      data: {
        isApproved: body.approved ? 1 : 2,
        reviewedBy: user.id,
        reviewedAt: new Date(),
        rejectReason: body.approved ? null : body.reason,
      },
    });
  }
}
