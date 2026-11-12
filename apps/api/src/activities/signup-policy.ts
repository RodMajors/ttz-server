import type { SignupStatus } from "@ttz/contracts";

export function canMemberChangeSignup(input: {
  now: Date;
  signupDeadline: Date | null;
  activityStatus: number;
  rosterLockedAt: Date | null;
  signupStatus?: SignupStatus;
}) {
  if (input.activityStatus !== 1 || !input.signupDeadline || input.now >= input.signupDeadline || input.rosterLockedAt)
    return false;
  return input.signupStatus !== "CONFIRMED";
}
