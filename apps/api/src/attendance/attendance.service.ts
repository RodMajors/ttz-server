import { ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { AttendanceStatus } from "@ttz/contracts";
import { attendanceCodeToStatus, attendanceStatusToCode } from "../activities/activity.constants";
import type { AuthUser } from "../auth/auth.types";
import { PrismaService } from "../database/prisma.service";

@Injectable()
export class AttendanceService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async summary(user: AuthUser, requestedUserId?: bigint) {
    const userId = requestedUserId ?? user.id;
    if (userId !== user.id && user.privilege < 1)
      throw new ForbiddenException({ code: "ATTENDANCE_PRIVATE", message: "只能查看自己的详细出勤" });
    const records = await this.prisma.attendanceRecord.findMany({
      where: { userId, activity: { status: 2, attendanceEnabled: 1, typeDefinition: { code: "raid_progress" } } },
    });
    const counts = Object.fromEntries(attendanceCodeToStatus.map((status) => [status, 0])) as Record<
      AttendanceStatus,
      number
    >;
    for (const record of records) counts[attendanceCodeToStatus[record.status] ?? "UNKNOWN"] += 1;
    const effectiveCount = counts.PRESENT + counts.LATE;
    return {
      activityCount: records.length,
      effectiveCount,
      rate: records.length ? effectiveCount / records.length : 0,
      counts,
    };
  }

  async put(
    activityId: bigint,
    records: Array<{ userId: string; characterId?: string | null; status: AttendanceStatus; note?: string | null }>,
    user: AuthUser,
  ) {
    const activity = await this.prisma.activity.findUnique({ where: { id: activityId } });
    if (!activity) throw new NotFoundException({ code: "ACTIVITY_NOT_FOUND", message: "活动不存在" });
    if (activity.creator !== user.id && user.privilege < 1)
      throw new ForbiddenException({ code: "ACTIVITY_NOT_OWNED", message: "只能登记自己活动的出勤" });
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
            recordedBy: user.id,
          },
          update: {
            characterId: record.characterId ? BigInt(record.characterId) : null,
            status: attendanceStatusToCode[record.status],
            note: record.note,
            source: 0,
            recordedBy: user.id,
            recordedAt: new Date(),
          },
        }),
      ),
    );
  }
}
