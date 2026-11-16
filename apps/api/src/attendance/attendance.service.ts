import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { AttendanceStatus } from "@ttz/contracts";
import { attendanceCodeToStatus, attendanceStatusToCode } from "../activities/activity.constants";
import type { AuthUser } from "../auth/auth.types";
import { PrismaService } from "../database/prisma.service";

interface AttendanceFilter {
  memberId?: bigint;
  groupId?: bigint;
  from?: Date;
  to?: Date;
}

@Injectable()
export class AttendanceService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async summary(user: AuthUser, filter: AttendanceFilter = {}) {
    const userId = filter.memberId ?? user.id;
    const activities = await this.prisma.activity.findMany({
      where: {
        status: 2,
        attendanceEnabled: 1,
        typeDefinition: { code: "raid_progress" },
        finishedAt: { ...(filter.from ? { gte: filter.from } : {}), ...(filter.to ? { lte: filter.to } : {}) },
        ...(filter.groupId
          ? {
              attendanceRecords: {
                some: { userId, user: { groupMemberships: { some: { groupId: filter.groupId } } } },
              },
            }
          : {}),
      },
      select: {
        id: true,
        name: true,
        beginAt: true,
        attendanceRecords: { where: { userId }, select: { status: true } },
      },
      orderBy: { beginAt: "desc" },
    });
    const counts = Object.fromEntries(attendanceCodeToStatus.map((status) => [status, 0])) as Record<
      AttendanceStatus,
      number
    >;
    let effectiveCount = 0;
    for (const activity of activities) {
      const status = attendanceCodeToStatus[activity.attendanceRecords[0]?.status] ?? "UNKNOWN";
      counts[status] += 1;
      if (status === "PRESENT" || status === "LATE") effectiveCount += 1;
    }
    return {
      activityCount: activities.length,
      effectiveCount,
      rate: activities.length ? effectiveCount / activities.length : 0,
      counts,
      activities: activities.map(({ id, name, beginAt, attendanceRecords }) => ({
        id: id.toString(),
        name,
        beginAt: beginAt.toISOString(),
        status: attendanceCodeToStatus[attendanceRecords[0]?.status] ?? "UNKNOWN",
      })),
    };
  }

  async activityRecords(activityId: bigint, user: AuthUser) {
    const activity = await this.prisma.activity.findUnique({ where: { id: activityId } });
    if (!activity) throw new NotFoundException({ code: "ACTIVITY_NOT_FOUND", message: "活动不存在" });
    const canManage = activity.creator === user.id || user.privilege >= 1;
    const records = await this.prisma.attendanceRecord.findMany({
      where: { activityId },
      include: {
        user: { select: { id: true, name: true, guildNickname: true } },
        character: { select: { id: true, name: true, serverName: true } },
      },
      orderBy: [{ status: "asc" }, { user: { guildNickname: "asc" } }],
    });
    return {
      activityId: activity.id.toString(),
      activityName: activity.name,
      beginAt: activity.beginAt.toISOString(),
      canManage,
      records: records.map((record) => ({
        id: record.id.toString(),
        userId: record.userId.toString(),
        memberName: record.user.name ?? record.user.guildNickname ?? "TTZ 成员",
        characterId: record.characterId?.toString() ?? null,
        characterName: record.characterNameSnapshot ?? record.character?.name ?? null,
        realm: record.realmSnapshot ?? record.character?.serverName ?? null,
        status: attendanceCodeToStatus[record.status] ?? "UNKNOWN",
        note: canManage ? record.note : null,
      })),
    };
  }

  async put(
    activityId: bigint,
    records: Array<{ userId: string; characterId?: string | null; status: AttendanceStatus; note?: string | null }>,
    user: AuthUser,
  ) {
    const activity = await this.prisma.activity.findUnique({ where: { id: activityId } });
    if (!activity) throw new NotFoundException({ code: "ACTIVITY_NOT_FOUND", message: "活动不存在" });
    const activityType = await this.prisma.activityType.findUnique({
      where: { id: activity.type },
      select: { code: true },
    });
    if (
      activity.status !== 2 ||
      activity.attendanceEnabled !== 1 ||
      activityType?.code !== "raid_progress" ||
      (activity.creator !== user.id && user.privilege < 1)
    ) {
      throw new ForbiddenException({
        code: "ATTENDANCE_NOT_ALLOWED",
        message: "只有结束后的计入出勤活动负责人可登记出勤",
      });
    }
    const userIds = records.map((record) => BigInt(record.userId));
    if (new Set(userIds.map(String)).size !== userIds.length) {
      throw new ConflictException({ code: "DUPLICATE_ATTENDANCE_USER", message: "同一成员不能重复登记" });
    }
    const eligible = await this.prisma.user.findMany({
      where: { id: { in: userIds }, isApproved: 1 },
      select: { id: true },
    });
    if (eligible.length !== userIds.length) {
      throw new ConflictException({ code: "ATTENDANCE_MEMBER_INVALID", message: "出勤成员必须属于已审核成员池" });
    }
    const existingRecords = await this.prisma.attendanceRecord.findMany({
      where: { activityId, userId: { in: userIds } },
      select: { userId: true },
    });
    if (existingRecords.length !== userIds.length) {
      throw new ConflictException({ code: "ATTENDANCE_RECORD_MISSING", message: "成员不在活动结束时的统计名单中" });
    }
    for (const record of records) {
      if (!record.characterId) continue;
      const character = await this.prisma.character.findFirst({
        where: { id: BigInt(record.characterId), userId: BigInt(record.userId), isRetired: 0 },
      });
      if (!character)
        throw new ForbiddenException({ code: "CHARACTER_NOT_OWNED", message: "出勤角色必须属于对应成员" });
    }
    return this.prisma.$transaction(
      records.map((record) =>
        this.prisma.attendanceRecord.upsert({
          where: { activityId_userId: { activityId, userId: BigInt(record.userId) } },
          create: {
            activityId,
            userId: BigInt(record.userId),
            characterId: record.characterId ? BigInt(record.characterId) : null,
            status: attendanceStatusToCode[record.status],
            note: record.note,
            manuallyConfirmed: true,
            recordedBy: user.id,
          },
          update: {
            characterId: record.characterId ? BigInt(record.characterId) : null,
            status: attendanceStatusToCode[record.status],
            note: record.note,
            source: 0,
            manuallyConfirmed: true,
            recordedBy: user.id,
            recordedAt: new Date(),
          },
        }),
      ),
    );
  }
}
