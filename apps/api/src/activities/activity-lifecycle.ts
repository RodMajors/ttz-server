import type { ActivityLifecycleStatus } from "@ttz/contracts";

export function getActivityLifecycleStatus(input: {
  status: number;
  signupDeadline: Date | null;
  teamUpAt: Date | null;
  beginAt: Date;
  endAt: Date;
  now: Date;
}): ActivityLifecycleStatus {
  if (input.status === 0) return "DRAFT";
  if (input.status === 3) return "CANCELLED";
  if (input.status === 2 || input.now >= input.endAt) return "COMPLETED";
  if (input.status !== 1) return "DRAFT";
  if (input.signupDeadline && input.now < input.signupDeadline) return "SIGNUP_OPEN";
  const teamUpAt = input.teamUpAt ?? new Date(input.beginAt.getTime() - 20 * 60_000);
  if (input.now < teamUpAt) return "PREPARATION";
  if (input.now < input.beginAt) return "GATHERING";
  return "IN_PROGRESS";
}
