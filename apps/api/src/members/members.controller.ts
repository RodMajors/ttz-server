import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query } from "@nestjs/common";
import {
  type CreateCharacterInput,
  characterVerificationDecisionSchema,
  createCharacterSchema,
  guildGroupInputSchema,
  guildGroupMemberSchema,
  idSchema,
  memberApprovalSchema,
  memberListQuerySchema,
  memberPrivilegeSchema,
  memberStatusSchema,
  notificationPreferenceSchema,
  pageQuerySchema,
} from "@ttz/contracts";
import { CurrentUser, MinPrivilege } from "../auth/auth.decorators";
import type { AuthUser } from "../auth/auth.types";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { PrismaService } from "../database/prisma.service";
import { CharactersService, characterInclude, serializeCharacter } from "./characters.service";

@Controller()
export class MembersController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CharactersService) private readonly characters: CharactersService,
  ) {}

  @Get("members")
  async members(
    @Query(new ZodValidationPipe(memberListQuerySchema)) query: {
      page: number;
      pageSize: number;
      search?: string;
      groupId?: string;
    },
  ) {
    const where = {
      isApproved: 1,
      status: 1,
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search } },
              { guildNickname: { contains: query.search } },
              { wxNickname: { contains: query.search } },
              { characters: { some: { name: { contains: query.search }, isRetired: 0 } } },
            ],
          }
        : {}),
      ...(query.groupId ? { groupMemberships: { some: { groupId: BigInt(query.groupId) } } } : {}),
    };
    const [users, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: [{ name: "asc" }, { id: "asc" }],
        select: {
          id: true,
          name: true,
          wxNickname: true,
          guildNickname: true,
          avatar: true,
          privilege: true,
          characters: {
            where: { isRetired: 0 },
            include: characterInclude,
            orderBy: [{ isMain: "desc" }, { name: "asc" }],
          },
          groupMemberships: { include: { group: true } },
        },
      }),
      this.prisma.user.count({ where }),
    ]);
    return {
      items: users.map((user) => ({
        id: user.id.toString(),
        name: user.name,
        wxNickname: user.wxNickname,
        guildNickname: user.guildNickname,
        avatar: user.avatar,
        privilege: user.privilege,
        characters: user.characters.map(serializeCharacter),
        groups: user.groupMemberships.map(({ group }) => ({
          id: group.id.toString(),
          name: group.name,
          code: group.code,
        })),
      })),
      pagination: { page: query.page, pageSize: query.pageSize, total },
    };
  }

  @Get("members/pending")
  @MinPrivilege(1)
  async pendingMembers(@Query(new ZodValidationPipe(pageQuerySchema)) query: { page: number; pageSize: number }) {
    const where = { isApproved: 0, status: 1 };
    const [users, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true, wxNickname: true, guildNickname: true, avatar: true, createdAt: true },
      }),
      this.prisma.user.count({ where }),
    ]);
    return { items: users.map((user) => ({ ...user, id: user.id.toString() })), pagination: { ...query, total } };
  }

  @Get("characters")
  async myCharacters(@CurrentUser() user: AuthUser) {
    return (await this.characters.list(user.id)).map(serializeCharacter);
  }

  @Post("characters")
  async createCharacter(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createCharacterSchema)) body: CreateCharacterInput,
  ) {
    return serializeCharacter(await this.characters.create(user.id, body));
  }

  @Post("characters/:id/sync-wcl")
  async syncCharacterFromWcl(@CurrentUser() user: AuthUser, @Param("id", new ZodValidationPipe(idSchema)) id: string) {
    return serializeCharacter(await this.characters.syncFromWcl(user.id, BigInt(id)));
  }

  @Post("characters/:id/set-main")
  setMain(@CurrentUser() user: AuthUser, @Param("id", new ZodValidationPipe(idSchema)) id: string) {
    return this.characters.setMain(user.id, BigInt(id));
  }

  @Post("characters/:id/retire")
  retire(@CurrentUser() user: AuthUser, @Param("id", new ZodValidationPipe(idSchema)) id: string) {
    return this.characters.retire(user.id, BigInt(id));
  }

  @Post("characters/:id/activate")
  activate(@CurrentUser() user: AuthUser, @Param("id", new ZodValidationPipe(idSchema)) id: string) {
    return this.characters.activate(user.id, BigInt(id));
  }

  @Post("characters/:id/request-verification")
  requestCharacterVerification(
    @CurrentUser() user: AuthUser,
    @Param("id", new ZodValidationPipe(idSchema)) id: string,
  ) {
    return this.characters.requestVerification(user.id, BigInt(id));
  }

  @Get("characters/pending-verification")
  @MinPrivilege(1)
  async pendingCharacterVerification() {
    const characters = await this.characters.pendingVerification();
    return characters.map((character) => ({
      ...serializeCharacter(character),
      memberName: character.user.name ?? character.user.guildNickname ?? "TTZ 成员",
    }));
  }

  @Post("characters/:id/verification-decision")
  @MinPrivilege(1)
  async decideCharacterVerification(
    @CurrentUser() user: AuthUser,
    @Param("id", new ZodValidationPipe(idSchema)) id: string,
    @Body(new ZodValidationPipe(characterVerificationDecisionSchema)) body: { approved: boolean; note?: string | null },
  ) {
    return serializeCharacter(await this.characters.decideVerification(BigInt(id), body.approved, body.note, user.id));
  }

  @Get("notification-preferences")
  async notificationPreferences(@CurrentUser() user: AuthUser) {
    const preference = await this.prisma.notificationPreference.findUnique({ where: { userId: user.id } });
    return {
      activityPublished: preference ? preference.activityPublished === 1 : true,
      signupResult: preference ? preference.signupResult === 1 : true,
      beforeTeamUp: preference ? preference.beforeTeamUp === 1 : true,
      activityCancelled: preference ? preference.activityCancelled === 1 : true,
    };
  }

  @Patch("notification-preferences")
  async updateNotificationPreferences(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(notificationPreferenceSchema))
    body: { activityPublished: boolean; signupResult: boolean; beforeTeamUp: boolean; activityCancelled: boolean },
  ) {
    const values = {
      activityPublished: body.activityPublished ? 1 : 0,
      signupResult: body.signupResult ? 1 : 0,
      beforeTeamUp: body.beforeTeamUp ? 1 : 0,
      activityCancelled: body.activityCancelled ? 1 : 0,
    };
    await this.prisma.notificationPreference.upsert({
      where: { userId: user.id },
      create: { userId: user.id, ...values },
      update: values,
    });
    return body;
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
      select: { id: true, isApproved: true, reviewedBy: true, reviewedAt: true, rejectReason: true },
    });
  }

  @Patch("members/:id/status")
  @MinPrivilege(1)
  async setMemberStatus(
    @Param("id", new ZodValidationPipe(idSchema)) id: string,
    @Body(new ZodValidationPipe(memberStatusSchema)) body: { status: "ACTIVE" | "DISABLED" },
  ) {
    const status = body.status === "ACTIVE" ? 1 : 0;
    const result = await this.prisma.user.updateMany({ where: { id: BigInt(id) }, data: { status } });
    if (!result.count) return { updated: false };
    if (status === 0) {
      await this.prisma.authSession.updateMany({
        where: { userId: BigInt(id), revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    return { updated: true, status: body.status };
  }

  @Patch("members/:id/privilege")
  @MinPrivilege(2)
  setPrivilege(
    @CurrentUser() currentUser: AuthUser,
    @Param("id", new ZodValidationPipe(idSchema)) id: string,
    @Body(new ZodValidationPipe(memberPrivilegeSchema)) body: { privilege: 0 | 1 | 2 },
  ) {
    if (currentUser.id === BigInt(id)) {
      return this.prisma.user.findUnique({ where: { id: BigInt(id) }, select: { id: true, privilege: true } });
    }
    return this.prisma.user.update({
      where: { id: BigInt(id) },
      data: { privilege: body.privilege },
      select: { id: true, privilege: true },
    });
  }

  @Get("guild-groups")
  async groups() {
    const groups = await this.prisma.guildGroup.findMany({
      where: { isActive: 1 },
      orderBy: [{ sort: "asc" }, { name: "asc" }],
    });
    return groups.map(serializeGroup);
  }

  @Post("guild-groups")
  @MinPrivilege(1)
  async createGroup(
    @Body(new ZodValidationPipe(guildGroupInputSchema)) body: {
      name: string;
      code: string;
      description?: string | null;
      isActive: boolean;
      sort: number;
    },
  ) {
    const group = await this.prisma.guildGroup.create({
      data: { ...body, isActive: body.isActive ? 1 : 0 },
    });
    return serializeGroup(group);
  }

  @Patch("guild-groups/:id")
  @MinPrivilege(1)
  async updateGroup(
    @Param("id", new ZodValidationPipe(idSchema)) id: string,
    @Body(new ZodValidationPipe(guildGroupInputSchema.partial())) body: {
      name?: string;
      code?: string;
      description?: string | null;
      isActive?: boolean;
      sort?: number;
    },
  ) {
    const group = await this.prisma.guildGroup.update({
      where: { id: BigInt(id) },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.code !== undefined ? { code: body.code } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.sort !== undefined ? { sort: body.sort } : {}),
        ...(body.isActive !== undefined ? { isActive: body.isActive ? 1 : 0 } : {}),
      },
    });
    return serializeGroup(group);
  }

  @Post("guild-groups/:id/members")
  @MinPrivilege(1)
  async addToGroup(
    @CurrentUser() user: AuthUser,
    @Param("id", new ZodValidationPipe(idSchema)) id: string,
    @Body(new ZodValidationPipe(guildGroupMemberSchema)) body: { userId: string },
  ) {
    return this.prisma.guildGroupMember.upsert({
      where: { groupId_userId: { groupId: BigInt(id), userId: BigInt(body.userId) } },
      create: { groupId: BigInt(id), userId: BigInt(body.userId), addedBy: user.id },
      update: {},
    });
  }

  @Delete("guild-groups/:id/members/:userId")
  @MinPrivilege(1)
  async removeFromGroup(
    @Param("id", new ZodValidationPipe(idSchema)) id: string,
    @Param("userId", new ZodValidationPipe(idSchema)) userId: string,
  ) {
    const result = await this.prisma.guildGroupMember.deleteMany({
      where: { groupId: BigInt(id), userId: BigInt(userId) },
    });
    return { removed: result.count > 0 };
  }
}

function serializeGroup(group: {
  id: bigint;
  name: string;
  code: string;
  description: string | null;
  isActive: number;
  sort: number;
}) {
  return {
    id: group.id.toString(),
    name: group.name,
    code: group.code,
    description: group.description,
    isActive: group.isActive === 1,
    sort: group.sort,
  };
}
