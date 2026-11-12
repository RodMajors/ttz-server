import type { ActivityStatus, AttendanceStatus, Role, SignupStatus } from "@ttz/contracts";

export const activityStatusToCode: Record<ActivityStatus, number> = {
  DRAFT: 0,
  PUBLISHED: 1,
  FINISHED: 2,
  CANCELLED: 3,
};
export const activityCodeToStatus = ["DRAFT", "PUBLISHED", "FINISHED", "CANCELLED"] as const;
export const signupStatusToCode: Record<SignupStatus, number> = {
  PENDING: 0,
  CONFIRMED: 1,
  BENCH: 2,
  CANCELLED: 3,
  REJECTED: 4,
};
export const signupCodeToStatus = ["PENDING", "CONFIRMED", "BENCH", "CANCELLED", "REJECTED"] as const;
export const roleToCode: Record<Role, number> = { TANK: 1, HEALER: 2, MELEE: 3, RANGED: 4 };
export const attendanceStatusToCode: Record<AttendanceStatus, number> = {
  UNKNOWN: 0,
  PRESENT: 1,
  LATE: 2,
  EXCUSED_ABSENCE: 3,
  UNEXCUSED_ABSENCE: 4,
  BENCH: 5,
  NOT_SIGNED_UP: 6,
};
export const attendanceCodeToStatus = [
  "UNKNOWN",
  "PRESENT",
  "LATE",
  "EXCUSED_ABSENCE",
  "UNEXCUSED_ABSENCE",
  "BENCH",
  "NOT_SIGNED_UP",
] as const;
