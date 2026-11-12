import { BadRequestException, Body, Controller, Get, Inject, Param, Patch, Post } from "@nestjs/common";
import { type AnnouncementInput, announcementInputSchema, idSchema } from "@ttz/contracts";
import { CurrentUser, MinPrivilege } from "../auth/auth.decorators";
import type { AuthUser } from "../auth/auth.types";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { PrismaService } from "../database/prisma.service";

const statusCode = { DRAFT: 0, ACTIVE: 1, ARCHIVED: 2 } as const;
const statusName = ["DRAFT", "ACTIVE", "ARCHIVED"] as const;

@Controller("announcements")
export class AnnouncementsController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Get()
  async list(@CurrentUser() user: AuthUser) {
    const now = new Date();
    const rows = await this.prisma.announcement.findMany({
      where:
        user.privilege >= 1
          ? {}
          : {
              status: 1,
              publishAt: { lte: now },
              OR: [{ expireAt: null }, { expireAt: { gt: now } }],
              AND: [
                {
                  OR: [
                    { audienceType: 0 },
                    {
                      audienceType: 1,
                      groups: { some: { group: { members: { some: { userId: user.id } } } } },
                    },
                  ],
                },
              ],
            },
      include: { groups: { select: { groupId: true } } },
      orderBy: [{ isPinned: "desc" }, { publishAt: "desc" }, { id: "desc" }],
    });
    return rows.map((row) => serializeAnnouncement(row, user.privilege >= 1));
  }

  @Post()
  @MinPrivilege(1)
  async create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(announcementInputSchema)) body: AnnouncementInput,
  ) {
    await this.validateGroups(body);
    const announcement = await this.prisma.announcement.create({
      data: {
        title: body.title,
        content: body.content,
        status: statusCode[body.status],
        audienceType: body.audienceType === "GROUPS" ? 1 : 0,
        isPinned: body.isPinned ? 1 : 0,
        publishAt: new Date(body.publishAt),
        expireAt: body.expireAt ? new Date(body.expireAt) : null,
        createdBy: user.id,
        updatedBy: user.id,
        groups:
          body.audienceType === "GROUPS"
            ? { create: body.groupIds.map((groupId) => ({ groupId: BigInt(groupId) })) }
            : undefined,
      },
      include: { groups: { select: { groupId: true } } },
    });
    return serializeAnnouncement(announcement, true);
  }

  @Patch(":id")
  @MinPrivilege(1)
  async update(
    @CurrentUser() user: AuthUser,
    @Param("id", new ZodValidationPipe(idSchema)) id: string,
    @Body(new ZodValidationPipe(announcementInputSchema)) body: AnnouncementInput,
  ) {
    await this.validateGroups(body);
    const announcementId = BigInt(id);
    return this.prisma.$transaction(async (transaction) => {
      await transaction.announcementGroup.deleteMany({ where: { announcementId } });
      const announcement = await transaction.announcement.update({
        where: { id: announcementId },
        data: {
          title: body.title,
          content: body.content,
          status: statusCode[body.status],
          audienceType: body.audienceType === "GROUPS" ? 1 : 0,
          isPinned: body.isPinned ? 1 : 0,
          publishAt: new Date(body.publishAt),
          expireAt: body.expireAt ? new Date(body.expireAt) : null,
          updatedBy: user.id,
          groups:
            body.audienceType === "GROUPS"
              ? { create: body.groupIds.map((groupId) => ({ groupId: BigInt(groupId) })) }
              : undefined,
        },
        include: { groups: { select: { groupId: true } } },
      });
      return serializeAnnouncement(announcement, true);
    });
  }

  private async validateGroups(body: AnnouncementInput) {
    if (body.audienceType !== "GROUPS") return;
    const count = await this.prisma.guildGroup.count({
      where: { id: { in: body.groupIds.map(BigInt) }, isActive: 1 },
    });
    if (count !== body.groupIds.length) {
      throw new BadRequestException({ code: "ANNOUNCEMENT_GROUP_INVALID", message: "公告包含不存在或已停用的身份组" });
    }
  }
}

function serializeAnnouncement(
  row: {
    id: bigint;
    title: string;
    content: string;
    status: number;
    audienceType: number;
    isPinned: number;
    publishAt: Date;
    expireAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    groups: Array<{ groupId: bigint }>;
  },
  canManage: boolean,
) {
  return {
    id: row.id.toString(),
    title: row.title,
    content: row.content,
    status: statusName[row.status] ?? "DRAFT",
    audienceType: row.audienceType === 1 ? "GROUPS" : "ALL",
    isPinned: row.isPinned === 1,
    publishAt: row.publishAt.toISOString(),
    expireAt: row.expireAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    groupIds: row.groups.map((group) => group.groupId.toString()),
    canManage,
  };
}
