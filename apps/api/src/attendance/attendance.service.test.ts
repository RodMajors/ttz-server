import { describe, expect, it, vi } from "vitest";
import type { AuthUser } from "../auth/auth.types";
import type { PrismaService } from "../database/prisma.service";
import { AttendanceService } from "./attendance.service";

describe("AttendanceService visibility", () => {
  it("lets an approved member view another member's summary", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: 21n,
        name: "Raid night",
        beginAt: new Date("2026-11-01T10:00:00.000Z"),
        attendanceRecords: [{ status: 1 }],
      },
    ]);
    const service = createService({ activity: { findMany } });

    const result = await service.summary(member(8n), { memberId: 9n });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({ attendanceRecords: { where: { userId: 9n }, select: { status: true } } }),
      }),
    );
    expect(result).toMatchObject({ activityCount: 1, effectiveCount: 1, rate: 1 });
  });

  it("shows all activity attendance records to members while hiding manager notes", async () => {
    const activity = {
      id: 21n,
      creator: 7n,
      name: "Raid night",
      beginAt: new Date("2026-11-01T10:00:00.000Z"),
    };
    const records = [8n, 9n].map((userId) => ({
      id: userId,
      userId,
      characterId: null,
      characterNameSnapshot: null,
      realmSnapshot: null,
      status: 1,
      note: "internal manager note",
      user: { id: userId, name: null, guildNickname: `Member ${userId}` },
      character: null,
    }));
    const service = createService({
      activity: { findUnique: vi.fn().mockResolvedValue(activity) },
      attendanceRecord: { findMany: vi.fn().mockResolvedValue(records) },
    });

    const result = await service.activityRecords(21n, member(8n));

    expect(result.records).toHaveLength(2);
    expect(result.records.map((record) => record.userId)).toEqual(["8", "9"]);
    expect(result.records.every((record) => record.note === null)).toBe(true);
    expect(result.canManage).toBe(false);
  });
});

function member(id: bigint): AuthUser {
  return {
    id,
    name: `Member ${id}`,
    wxNickname: null,
    guildNickname: `Member ${id}`,
    privilege: 0,
    isApproved: true,
    profileComplete: true,
    status: 1,
  };
}

function createService(prisma: Record<string, unknown>) {
  return new AttendanceService(prisma as unknown as PrismaService);
}
