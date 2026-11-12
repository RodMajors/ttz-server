import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { CreateActivityInput, SignupInput } from "@ttz/contracts";
import type { AuthUser } from "../auth/auth.types";
import { PrismaService } from "../database/prisma.service";
import { roleToCode, signupStatusToCode } from "./activity.constants";
import { canMemberChangeSignup } from "./signup-policy";

@Injectable()
export class ActivitiesService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(user: AuthUser, page: number, pageSize: number) {
    const where = { isDeleted: 0 };
    const [activities, total] = await this.prisma.$transaction([
      this.prisma.activity.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { beginAt: "desc" },
        include: {
          typeDefinition: true,
          creatorUser: true,
          _count: { select: { signups: true } },
          signups: { where: { status: 1 }, select: { id: true } },
        },
      }),
      this.prisma.activity.count({ where }),
    ]);
    return {
      items: activities.map((activity) => ({
        id: activity.id.toString(),
        name: activity.name,
        type: activity.typeDefinition.code,
        status: (["DRAFT", "PUBLISHED", "FINISHED", "CANCELLED"] as const)[activity.status] ?? "DRAFT",
        beginAt: activity.beginAt.toISOString(),
        teamUpAt: (activity.teamUpAt ?? new Date(activity.beginAt.getTime() - 20 * 60_000)).toISOString(),
        maxPlayers: activity.maxPlayers,
        signupDeadline: activity.signupDeadline?.toISOString() ?? null,
        signupCount: activity._count.signups,
        confirmedCount: activity.signups.length,
        creatorName: activity.creatorUser.name ?? activity.creatorUser.guildNickname ?? "TTZ 成员",
        canManage: activity.creator === user.id || user.privilege >= 1,
      })),
      pagination: { page, pageSize, total },
    };
  }

  async get(id: bigint, user: AuthUser) {
    const activity = await this.prisma.activity.findFirst({
      where: { id, isDeleted: 0 },
      include: {
        typeDefinition: true,
        creatorUser: true,
        signups: { include: { user: true, character: true }, orderBy: [{ groupNo: "asc" }, { orderIndex: "asc" }] },
      },
    });
    if (!activity) throw new NotFoundException({ code: "ACTIVITY_NOT_FOUND", message: "活动不存在" });
    return { ...activity, canManage: activity.creator === user.id || user.privilege >= 1 };
  }

  async create(input: CreateActivityInput, user: AuthUser) {
    const type = await this.prisma.activityType.findUnique({ where: { code: input.type } });
    if (!type) throw new ConflictException({ code: "ACTIVITY_TYPE_NOT_READY", message: "活动类型基础数据尚未配置" });
    const beginAt = new Date(input.beginAt);
    return this.prisma.activity.create({
      data: {
        name: input.name,
        type: type.id,
        creator: user.id,
        description: input.description,
        beginAt,
        teamUpAt: input.teamUpAt ? new Date(input.teamUpAt) : new Date(beginAt.getTime() - 20 * 60_000),
        endAt: new Date(beginAt.getTime() + input.durationMinutes * 60_000),
        signupDeadline: new Date(input.signupDeadline),
        durationMinutes: input.durationMinutes,
        maxPlayers: input.maxPlayers,
        tankSlots: input.tankSlots,
        healerSlots: input.healerSlots,
        meleeSlots: input.meleeSlots,
        rangedSlots: input.rangedSlots,
        attendanceEnabled: input.attendanceEnabled ? 1 : 0,
      },
    });
  }

  async transition(id: bigint, target: "publish" | "cancel" | "finish", user: AuthUser) {
    const activity = await this.requireManageable(id, user);
    const allowed = { publish: [0], cancel: [0, 1], finish: [1] }[target];
    if (!allowed.includes(activity.status))
      throw new ConflictException({ code: "INVALID_ACTIVITY_STATE", message: "当前活动状态不允许执行此操作" });
    const now = new Date();
    if (target === "publish" && (!activity.signupDeadline || activity.signupDeadline >= activity.beginAt)) {
      throw new ConflictException({
        code: "INVALID_SIGNUP_DEADLINE",
        message: "发布前必须设置早于活动开始时间的报名截止时间",
      });
    }
    return this.prisma.activity.update({
      where: { id },
      data:
        target === "publish"
          ? { status: 1, publishedAt: now, version: { increment: 1 } }
          : target === "cancel"
            ? { status: 3, cancelledAt: now, version: { increment: 1 } }
            : { status: 2, finishedAt: now, version: { increment: 1 } },
    });
  }

  async signup(id: bigint, input: SignupInput, user: AuthUser) {
    const activity = await this.requireOpenSignup(id);
    const characterId = BigInt(input.characterId);
    const character = await this.prisma.character.findFirst({
      where: { id: characterId, userId: user.id, isRetired: 0 },
    });
    if (!character)
      throw new ForbiddenException({ code: "CHARACTER_NOT_OWNED", message: "只能使用自己的有效角色报名" });
    const existing = await this.prisma.activitySignup.findUnique({
      where: { activityId_userId: { activityId: id, userId: user.id } },
    });
    if (
      !canMemberChangeSignup({
        now: new Date(),
        signupDeadline: activity.signupDeadline,
        activityStatus: activity.status,
        rosterLockedAt: activity.rosterLockedAt,
        signupStatus: existing
          ? (["PENDING", "CONFIRMED", "BENCH", "CANCELLED", "REJECTED"] as const)[existing.status]
          : undefined,
      })
    ) {
      throw new ConflictException({ code: "CONFIRMED_SIGNUP_LOCKED", message: "报名已由团长确认，不能自行修改" });
    }
    return this.prisma.activitySignup.upsert({
      where: { activityId_userId: { activityId: id, userId: user.id } },
      create: {
        activityId: id,
        userId: user.id,
        characterId,
        preferredRole: input.preferredRole ? roleToCode[input.preferredRole] : null,
        preferredSpecId: input.preferredSpecId,
        note: input.note,
      },
      update: {
        characterId,
        preferredRole: input.preferredRole ? roleToCode[input.preferredRole] : null,
        preferredSpecId: input.preferredSpecId,
        note: input.note,
        status: 0,
        signedUpAt: new Date(),
        cancelledAt: null,
      },
    });
  }

  async cancelSignup(id: bigint, user: AuthUser) {
    const activity = await this.requireOpenSignup(id);
    const signup = await this.prisma.activitySignup.findUnique({
      where: { activityId_userId: { activityId: id, userId: user.id } },
    });
    if (!signup) throw new NotFoundException({ code: "SIGNUP_NOT_FOUND", message: "尚未报名该活动" });
    if (
      !canMemberChangeSignup({
        now: new Date(),
        signupDeadline: activity.signupDeadline,
        activityStatus: activity.status,
        rosterLockedAt: activity.rosterLockedAt,
        signupStatus: (["PENDING", "CONFIRMED", "BENCH", "CANCELLED", "REJECTED"] as const)[signup.status],
      })
    )
      throw new ConflictException({ code: "CONFIRMED_SIGNUP_LOCKED", message: "报名已由团长确认，不能自行取消" });
    return this.prisma.activitySignup.update({
      where: { id: signup.id },
      data: { status: signupStatusToCode.CANCELLED, cancelledAt: new Date() },
    });
  }

  async decide(
    id: bigint,
    signupId: bigint,
    input: {
      status: "PENDING" | "CONFIRMED" | "BENCH" | "REJECTED";
      officerNote?: string | null;
      reason?: string | null;
      groupNo?: number | null;
      orderIndex: number;
    },
    user: AuthUser,
  ) {
    await this.requireManageable(id, user);
    const signup = await this.prisma.activitySignup.findFirst({ where: { id: signupId, activityId: id } });
    if (!signup) throw new NotFoundException({ code: "SIGNUP_NOT_FOUND", message: "报名记录不存在" });
    return this.prisma.activitySignup.update({
      where: { id: signupId },
      data: {
        status: signupStatusToCode[input.status],
        officerNote: input.officerNote,
        decisionReason: input.reason,
        groupNo: input.groupNo,
        orderIndex: input.orderIndex,
        handledBy: user.id,
        handledAt: new Date(),
        confirmedAt: input.status === "CONFIRMED" ? new Date() : null,
      },
    });
  }

  async lockRoster(id: bigint, user: AuthUser) {
    await this.requireManageable(id, user);
    return this.prisma.activity.update({
      where: { id },
      data: { rosterLockedAt: new Date(), version: { increment: 1 } },
    });
  }

  private async requireOpenSignup(id: bigint) {
    const activity = await this.prisma.activity.findFirst({ where: { id, isDeleted: 0 } });
    if (!activity) throw new NotFoundException({ code: "ACTIVITY_NOT_FOUND", message: "活动不存在" });
    if (
      activity.status !== 1 ||
      !activity.signupDeadline ||
      activity.signupDeadline <= new Date() ||
      activity.rosterLockedAt
    ) {
      throw new ConflictException({ code: "SIGNUP_CLOSED", message: "报名已截止或名单已锁定" });
    }
    return activity;
  }

  private async requireManageable(id: bigint, user: AuthUser) {
    const activity = await this.prisma.activity.findFirst({ where: { id, isDeleted: 0 } });
    if (!activity) throw new NotFoundException({ code: "ACTIVITY_NOT_FOUND", message: "活动不存在" });
    if (activity.creator !== user.id && user.privilege < 1)
      throw new ForbiddenException({ code: "ACTIVITY_NOT_OWNED", message: "只能管理自己创建的活动" });
    return activity;
  }
}
