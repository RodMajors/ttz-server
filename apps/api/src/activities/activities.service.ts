import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { CreateActivityInput, Role, SignupInput, UpdateActivityInput } from "@ttz/contracts";
import type { AuthUser } from "../auth/auth.types";
import { PrismaService } from "../database/prisma.service";
import { characterInclude, serializeCharacter } from "../members/characters.service";
import {
  activityCodeToStatus,
  attendanceStatusToCode,
  roleToCode,
  signupCodeToStatus,
  signupStatusToCode,
} from "./activity.constants";
import { canMemberChangeSignup } from "./signup-policy";

@Injectable()
export class ActivitiesService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(user: AuthUser, page: number, pageSize: number) {
    const where = {
      isDeleted: 0,
      ...(user.privilege >= 1 ? {} : { OR: [{ status: { not: 0 } }, { creator: user.id }] }),
    };
    const [activities, total] = await this.prisma.$transaction([
      this.prisma.activity.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { beginAt: "desc" },
        include: {
          typeDefinition: true,
          creatorUser: { select: { name: true, guildNickname: true } },
          _count: { select: { signups: { where: { status: { in: [0, 1, 2] } } } } },
          signups: {
            where: { OR: [{ status: 1 }, { userId: user.id }] },
            select: { id: true, userId: true, status: true },
          },
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
        confirmedCount: activity.signups.filter((signup) => signup.status === signupStatusToCode.CONFIRMED).length,
        creatorName: activity.creatorUser.name ?? activity.creatorUser.guildNickname ?? "TTZ 成员",
        canManage: activity.creator === user.id || user.privilege >= 1,
        mySignupStatus:
          signupCodeToStatus[activity.signups.find((signup) => signup.userId === user.id)?.status ?? -1] ?? null,
        isSignupOpen:
          activity.status === 1 &&
          Boolean(activity.signupDeadline && activity.signupDeadline > new Date()) &&
          !activity.rosterLockedAt,
      })),
      pagination: { page, pageSize, total },
    };
  }

  async get(id: bigint, user: AuthUser) {
    const activity = await this.prisma.activity.findFirst({
      where: { id, isDeleted: 0 },
      include: {
        typeDefinition: true,
        creatorUser: { select: { id: true, name: true, guildNickname: true } },
        signups: {
          include: {
            user: { select: { id: true, name: true, guildNickname: true } },
            character: { include: characterInclude },
            choices: { include: { character: { include: characterInclude } }, orderBy: { priority: "asc" } },
          },
          orderBy: [{ groupNo: "asc" }, { orderIndex: "asc" }],
        },
      },
    });
    if (!activity) throw new NotFoundException({ code: "ACTIVITY_NOT_FOUND", message: "活动不存在" });
    const canManage = activity.creator === user.id || user.privilege >= 1;
    if (activity.status === 0 && !canManage) {
      throw new NotFoundException({ code: "ACTIVITY_NOT_FOUND", message: "活动不存在" });
    }
    const now = new Date();
    const mySignup = activity.signups.find((signup) => signup.userId === user.id);
    const canChangeMySignup = canMemberChangeSignup({
      now,
      signupDeadline: activity.signupDeadline,
      activityStatus: activity.status,
      rosterLockedAt: activity.rosterLockedAt,
      signupStatus: mySignup ? signupCodeToStatus[mySignup.status] : undefined,
    });
    return {
      id: activity.id.toString(),
      name: activity.name,
      type: activity.typeDefinition.code,
      status: activityCodeToStatus[activity.status] ?? "DRAFT",
      description: activity.description,
      passphrase: activity.passphrase,
      beginAt: activity.beginAt.toISOString(),
      endAt: activity.endAt.toISOString(),
      teamUpAt: (activity.teamUpAt ?? new Date(activity.beginAt.getTime() - 20 * 60_000)).toISOString(),
      signupDeadline: activity.signupDeadline?.toISOString() ?? null,
      maxPlayers: activity.maxPlayers,
      tankSlots: activity.tankSlots,
      healerSlots: activity.healerSlots,
      meleeSlots: activity.meleeSlots,
      rangedSlots: activity.rangedSlots,
      attendanceEnabled: activity.attendanceEnabled === 1,
      rosterLockedAt: activity.rosterLockedAt?.toISOString() ?? null,
      version: activity.version,
      creator: {
        id: activity.creatorUser.id.toString(),
        name: activity.creatorUser.name ?? activity.creatorUser.guildNickname ?? "TTZ 成员",
      },
      canManage,
      canSignup:
        canChangeMySignup &&
        (!mySignup || [signupStatusToCode.CANCELLED, signupStatusToCode.REJECTED].includes(mySignup.status)),
      canChangeMySignup,
      mySignup: mySignup ? serializeSignup(mySignup, canManage) : null,
      signups: activity.signups.map((signup) => serializeSignup(signup, canManage)),
    };
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
        passphrase: input.passphrase,
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
        attendanceEnabled: (input.attendanceEnabled ?? input.type === "raid_progress") ? 1 : 0,
      },
    });
  }

  async update(id: bigint, input: UpdateActivityInput, user: AuthUser) {
    const activity = await this.requireManageable(id, user);
    if (activity.status >= 2) {
      throw new ConflictException({ code: "ACTIVITY_READ_ONLY", message: "已结束或已取消的活动不能编辑" });
    }
    const beginAt = input.beginAt ? new Date(input.beginAt) : activity.beginAt;
    const durationMinutes = input.durationMinutes ?? activity.durationMinutes;
    const signupDeadline = input.signupDeadline ? new Date(input.signupDeadline) : activity.signupDeadline;
    const teamUpAt = input.teamUpAt ? new Date(input.teamUpAt) : activity.teamUpAt;
    const maxPlayers = input.maxPlayers ?? activity.maxPlayers;
    const requested = [
      input.tankSlots === undefined ? activity.tankSlots : input.tankSlots,
      input.healerSlots === undefined ? activity.healerSlots : input.healerSlots,
      input.meleeSlots === undefined ? activity.meleeSlots : input.meleeSlots,
      input.rangedSlots === undefined ? activity.rangedSlots : input.rangedSlots,
    ].reduce<number>((sum, count) => sum + (count ?? 0), 0);
    if (!signupDeadline || signupDeadline >= beginAt) {
      throw new ConflictException({ code: "INVALID_SIGNUP_DEADLINE", message: "报名截止时间必须早于活动开始时间" });
    }
    if (teamUpAt && teamUpAt > beginAt) {
      throw new ConflictException({ code: "INVALID_TEAM_UP_TIME", message: "集合时间不能晚于活动开始时间" });
    }
    if (requested > maxPlayers) {
      throw new ConflictException({ code: "INVALID_ROLE_SLOTS", message: "职责需求总数不能超过人数上限" });
    }
    const type = input.type ? await this.prisma.activityType.findUnique({ where: { code: input.type } }) : undefined;
    if (input.type && !type) {
      throw new ConflictException({ code: "ACTIVITY_TYPE_NOT_READY", message: "活动类型基础数据尚未配置" });
    }
    const result = await this.prisma.activity.updateMany({
      where: { id, version: input.version, isDeleted: 0 },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(type ? { type: type.id } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.passphrase !== undefined ? { passphrase: input.passphrase } : {}),
        beginAt,
        teamUpAt,
        endAt: new Date(beginAt.getTime() + durationMinutes * 60_000),
        signupDeadline,
        durationMinutes,
        ...(input.maxPlayers !== undefined ? { maxPlayers: input.maxPlayers } : {}),
        ...(input.tankSlots !== undefined ? { tankSlots: input.tankSlots } : {}),
        ...(input.healerSlots !== undefined ? { healerSlots: input.healerSlots } : {}),
        ...(input.meleeSlots !== undefined ? { meleeSlots: input.meleeSlots } : {}),
        ...(input.rangedSlots !== undefined ? { rangedSlots: input.rangedSlots } : {}),
        ...(input.attendanceEnabled !== undefined ? { attendanceEnabled: input.attendanceEnabled ? 1 : 0 } : {}),
        version: { increment: 1 },
      },
    });
    if (!result.count) throw versionConflict();
    return this.get(id, user);
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
    if (target !== "finish") {
      return this.prisma.activity.update({
        where: { id },
        data:
          target === "publish"
            ? { status: 1, publishedAt: now, version: { increment: 1 } }
            : { status: 3, cancelledAt: now, version: { increment: 1 } },
      });
    }
    return this.prisma.$transaction(async (transaction) => {
      const finished = await transaction.activity.update({
        where: { id },
        data: { status: 2, finishedAt: now, version: { increment: 1 } },
        include: { typeDefinition: true },
      });
      if (finished.attendanceEnabled !== 1 || finished.typeDefinition.code !== "raid_progress") return finished;
      const [members, signups] = await Promise.all([
        transaction.user.findMany({
          where: { isApproved: 1 },
          select: {
            id: true,
            characters: {
              where: { isRetired: 0 },
              include: characterInclude,
              orderBy: { isMain: "desc" },
              take: 1,
            },
          },
        }),
        transaction.activitySignup.findMany({
          where: { activityId: id, status: { in: [0, 1, 2] } },
          include: { character: { include: characterInclude } },
        }),
      ]);
      const signupByUser = new Map(signups.map((signup) => [signup.userId.toString(), signup]));
      await transaction.attendanceRecord.createMany({
        data: members.map((member) => {
          const signup = signupByUser.get(member.id.toString());
          const isRostered =
            signup?.status === signupStatusToCode.CONFIRMED || signup?.status === signupStatusToCode.BENCH;
          const character = isRostered ? signup.character : member.characters[0];
          return {
            activityId: id,
            signupId: isRostered ? signup.id : null,
            userId: member.id,
            characterId: character?.id ?? null,
            characterNameSnapshot: character?.name ?? null,
            realmSnapshot: character?.serverName ?? null,
            roleSnapshot: isRostered ? signup.preferredRole : null,
            status:
              signup?.status === signupStatusToCode.BENCH
                ? attendanceStatusToCode.BENCH
                : isRostered
                  ? attendanceStatusToCode.UNKNOWN
                  : attendanceStatusToCode.NOT_SIGNED_UP,
            source: 0,
            recordedBy: user.id,
          };
        }),
        skipDuplicates: true,
      });
      return finished;
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
    if (!input.preferredSpecId) {
      throw new ConflictException({ code: "SIGNUP_SPEC_REQUIRED", message: "请选择本次出战专精" });
    }
    const primarySpec = await this.prisma.specs.findFirst({
      where: { id: input.preferredSpecId, class: character.classId },
    });
    if (!primarySpec) {
      throw new ConflictException({ code: "SIGNUP_SPEC_INVALID", message: "所选专精不属于出战角色职业" });
    }
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
    const choiceIds = input.choices.map((choice) => BigInt(choice.characterId));
    const ownedChoices = choiceIds.length
      ? await this.prisma.character.findMany({
          where: { id: { in: choiceIds }, userId: user.id, isRetired: 0 },
          select: { id: true, classId: true },
        })
      : [];
    if (ownedChoices.length !== new Set(choiceIds.map(String)).size) {
      throw new ForbiddenException({ code: "CHARACTER_NOT_OWNED", message: "备选角色必须属于当前成员" });
    }
    if (input.choices.length) {
      const specs = await this.prisma.specs.findMany({
        where: { id: { in: [...new Set(input.choices.map((choice) => choice.specId))] } },
        select: { id: true, class: true },
      });
      const specById = new Map(specs.map((spec) => [spec.id, spec]));
      const characterById = new Map(ownedChoices.map((choice) => [choice.id.toString(), choice]));
      const invalid = input.choices.some((choice) => {
        const spec = specById.get(choice.specId);
        const choiceCharacter = characterById.get(choice.characterId);
        return !spec || !choiceCharacter || spec.class !== choiceCharacter.classId;
      });
      if (invalid) {
        throw new ConflictException({ code: "SIGNUP_SPEC_INVALID", message: "备选专精必须属于对应角色职业" });
      }
    }
    return this.prisma.$transaction(async (transaction) => {
      const open = await transaction.activity.updateMany({
        where: { id, status: 1, isDeleted: 0, rosterLockedAt: null, signupDeadline: { gt: new Date() } },
        data: { version: { increment: 1 } },
      });
      if (!open.count) {
        throw new ConflictException({ code: "SIGNUP_CLOSED", message: "报名已截止或名单已锁定" });
      }
      let signup: NonNullable<typeof existing>;
      if (existing) {
        const result = await transaction.activitySignup.updateMany({
          where: {
            id: existing.id,
            status: { not: signupStatusToCode.CONFIRMED },
            activity: { status: 1, isDeleted: 0, rosterLockedAt: null, signupDeadline: { gt: new Date() } },
          },
          data: {
            characterId,
            preferredRole: primarySpec.role,
            preferredSpecId: input.preferredSpecId,
            note: input.note,
            status: 0,
            signedUpAt: new Date(),
            cancelledAt: null,
          },
        });
        if (!result.count) {
          throw new ConflictException({
            code: "SIGNUP_CHANGE_LOCKED",
            message: "报名已确认或报名已截止，不能自行修改",
          });
        }
        signup = await transaction.activitySignup.findUniqueOrThrow({ where: { id: existing.id } });
      } else {
        signup = await transaction.activitySignup.create({
          data: {
            activityId: id,
            userId: user.id,
            characterId,
            preferredRole: primarySpec.role,
            preferredSpecId: input.preferredSpecId,
            note: input.note,
          },
        });
      }
      await transaction.activitySignupChoice.deleteMany({ where: { signupId: signup.id } });
      if (input.choices.length) {
        await transaction.activitySignupChoice.createMany({
          data: input.choices.map((choice, index) => ({
            signupId: signup.id,
            characterId: BigInt(choice.characterId),
            specId: choice.specId,
            priority: index + 1,
          })),
        });
      }
      return signup;
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
    const result = await this.prisma.activitySignup.updateMany({
      where: {
        id: signup.id,
        status: { not: signupStatusToCode.CONFIRMED },
        activity: { status: 1, isDeleted: 0, rosterLockedAt: null, signupDeadline: { gt: new Date() } },
      },
      data: { status: signupStatusToCode.CANCELLED, cancelledAt: new Date() },
    });
    if (!result.count) {
      throw new ConflictException({ code: "SIGNUP_CHANGE_LOCKED", message: "报名已确认或报名已截止，不能自行取消" });
    }
    return { cancelled: true };
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
    return this.prisma.$transaction(async (transaction) => {
      const activity = await transaction.activity.update({
        where: { id },
        data: { version: { increment: 1 } },
        select: { maxPlayers: true, status: true },
      });
      if (activity.status >= 2) {
        throw new ConflictException({ code: "ACTIVITY_READ_ONLY", message: "已结束或已取消的活动不能处理报名" });
      }
      const signup = await transaction.activitySignup.findFirst({ where: { id: signupId, activityId: id } });
      if (!signup) throw new NotFoundException({ code: "SIGNUP_NOT_FOUND", message: "报名记录不存在" });
      if (input.status === "CONFIRMED" && signup.status !== signupStatusToCode.CONFIRMED) {
        const confirmedCount = await transaction.activitySignup.count({
          where: { activityId: id, status: signupStatusToCode.CONFIRMED },
        });
        if (confirmedCount >= activity.maxPlayers) {
          throw new ConflictException({ code: "ROSTER_FULL", message: "正式名单已达到人数上限" });
        }
      }
      return transaction.activitySignup.update({
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
    });
  }

  async lockRoster(id: bigint, user: AuthUser) {
    await this.requireManageable(id, user);
    return this.prisma.activity.update({
      where: { id },
      data: { rosterLockedAt: new Date(), version: { increment: 1 } },
    });
  }

  async unlockRoster(id: bigint, user: AuthUser) {
    await this.requireManageable(id, user);
    return this.prisma.activity.update({
      where: { id },
      data: { rosterLockedAt: null, version: { increment: 1 } },
    });
  }

  async closeSignup(id: bigint, user: AuthUser) {
    const activity = await this.requireManageable(id, user);
    if (activity.status !== 1) {
      throw new ConflictException({ code: "INVALID_ACTIVITY_STATE", message: "只有已发布活动可以关闭报名" });
    }
    return this.prisma.activity.update({
      where: { id },
      data: { signupDeadline: new Date(), version: { increment: 1 } },
    });
  }

  async roster(id: bigint, user: AuthUser) {
    const activity = await this.prisma.activity.findFirst({ where: { id, isDeleted: 0 } });
    if (!activity) throw new NotFoundException({ code: "ACTIVITY_NOT_FOUND", message: "活动不存在" });
    const entries = await this.prisma.activitySignup.findMany({
      where: { activityId: id, status: { in: [1, 2] } },
      include: {
        user: { select: { id: true, name: true, guildNickname: true } },
        character: { include: characterInclude },
      },
      orderBy: [{ groupNo: "asc" }, { orderIndex: "asc" }],
    });
    const canManage = activity.creator === user.id || user.privilege >= 1;
    return {
      entries: entries.map((entry) => ({
        ...entry,
        officerNote: canManage ? entry.officerNote : undefined,
        decisionReason: canManage ? entry.decisionReason : undefined,
      })),
      canManage,
      version: activity.version,
      lockedAt: activity.rosterLockedAt,
    };
  }

  async updateRoster(
    id: bigint,
    input: {
      version: number;
      entries: Array<{
        signupId: string;
        status: "CONFIRMED" | "BENCH";
        characterId: string;
        preferredSpecId: number;
        groupNo?: number | null;
        orderIndex: number;
      }>;
    },
    user: AuthUser,
  ) {
    const activity = await this.requireManageable(id, user);
    if (activity.status >= 2) {
      throw new ConflictException({ code: "ACTIVITY_READ_ONLY", message: "已结束或已取消的活动不能调整名单" });
    }
    const signupIds = input.entries.map((entry) => BigInt(entry.signupId));
    const signups = signupIds.length
      ? await this.prisma.activitySignup.findMany({
          where: { id: { in: signupIds }, activityId: id },
          select: { id: true, userId: true },
        })
      : [];
    if (signups.length !== new Set(signupIds.map(String)).size) {
      throw new NotFoundException({ code: "SIGNUP_NOT_FOUND", message: "名单包含无效报名" });
    }
    if (input.entries.filter((entry) => entry.status === "CONFIRMED").length > activity.maxPlayers) {
      throw new ConflictException({ code: "ROSTER_FULL", message: "正式名单人数不能超过活动上限" });
    }
    const validCharacterCount = input.entries.length
      ? await this.prisma.character.count({
          where: {
            OR: input.entries.map((entry) => ({
              id: BigInt(entry.characterId),
              userId: signups.find((signup) => signup.id === BigInt(entry.signupId))?.userId,
              isRetired: 0,
            })),
          },
        })
      : 0;
    if (validCharacterCount !== input.entries.length) {
      throw new ForbiddenException({ code: "CHARACTER_NOT_OWNED", message: "名单角色必须属于对应报名成员" });
    }
    for (const entry of input.entries) {
      const character = await this.prisma.character.findUnique({
        where: { id: BigInt(entry.characterId) },
        select: { classId: true },
      });
      const spec = await this.prisma.specs.findFirst({
        where: { id: entry.preferredSpecId, class: character?.classId ?? -1 },
      });
      if (!character || !spec) {
        throw new ConflictException({ code: "SIGNUP_SPEC_INVALID", message: "名单专精必须属于角色职业" });
      }
    }
    return this.prisma.$transaction(async (transaction) => {
      const version = await transaction.activity.updateMany({
        where: { id, version: input.version },
        data: { version: { increment: 1 } },
      });
      if (!version.count) throw versionConflict();
      await transaction.activitySignup.updateMany({
        where: {
          activityId: id,
          status: { in: [signupStatusToCode.CONFIRMED, signupStatusToCode.BENCH] },
          id: { notIn: signupIds.length ? signupIds : [0n] },
        },
        data: {
          status: signupStatusToCode.PENDING,
          groupNo: null,
          orderIndex: 0,
          confirmedAt: null,
          handledBy: user.id,
          handledAt: new Date(),
        },
      });
      for (const entry of input.entries) {
        await transaction.activitySignup.update({
          where: { id: BigInt(entry.signupId) },
          data: {
            status: signupStatusToCode[entry.status],
            characterId: BigInt(entry.characterId),
            preferredSpecId: entry.preferredSpecId,
            preferredRole: (await transaction.specs.findUnique({ where: { id: entry.preferredSpecId } }))?.role,
            groupNo: entry.groupNo,
            orderIndex: entry.orderIndex,
            handledBy: user.id,
            handledAt: new Date(),
            confirmedAt: entry.status === "CONFIRMED" ? new Date() : null,
          },
        });
      }
      return { version: input.version + 1, updated: input.entries.length };
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

function versionConflict() {
  return new ConflictException({
    code: "VERSION_CONFLICT",
    message: "活动已被其他人更新，请刷新后重试",
  });
}

const roleCodeToRole = [null, "TANK", "HEALER", "MELEE", "RANGED"] as const;

function serializeSignup(
  signup: {
    id: bigint;
    userId: bigint;
    preferredRole: number | null;
    preferredSpecId: number | null;
    groupNo: number | null;
    orderIndex: number;
    status: number;
    note: string | null;
    officerNote: string | null;
    decisionReason: string | null;
    signedUpAt: Date;
    user: { id: bigint; name: string | null; guildNickname: string | null };
    character: Parameters<typeof serializeCharacter>[0];
    choices: Array<{ character: Parameters<typeof serializeCharacter>[0]; specId: number; priority: number }>;
  },
  canManage: boolean,
) {
  return {
    id: signup.id.toString(),
    userId: signup.userId.toString(),
    memberName: signup.user.name ?? signup.user.guildNickname ?? "TTZ 成员",
    character: serializeCharacter(signup.character),
    preferredRole: roleCodeToRole[signup.preferredRole ?? 0] ?? null,
    preferredSpecId: signup.preferredSpecId,
    groupNo: signup.groupNo,
    orderIndex: signup.orderIndex,
    status: signupCodeToStatus[signup.status] ?? "PENDING",
    note: signup.note,
    officerNote: canManage ? signup.officerNote : undefined,
    decisionReason: canManage ? signup.decisionReason : undefined,
    signedUpAt: signup.signedUpAt.toISOString(),
    choices: signup.choices.map((choice) => ({
      character: serializeCharacter(choice.character),
      specId: choice.specId,
      priority: choice.priority,
    })),
  };
}
