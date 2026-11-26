import { describe, expect, it } from "vitest";
import { getActivityLifecycleStatus } from "./activity-lifecycle";

const schedule = {
  status: 1,
  signupDeadline: new Date("2026-12-01T19:00:00"),
  teamUpAt: new Date("2026-12-01T20:00:00"),
  beginAt: new Date("2026-12-01T20:20:00"),
  endAt: new Date("2026-12-01T22:20:00"),
};

describe("activity lifecycle status", () => {
  it.each([
    [0, "DRAFT"],
    [3, "CANCELLED"],
    [2, "COMPLETED"],
  ] as const)("keeps persisted terminal status %i", (status, expected) => {
    expect(getActivityLifecycleStatus({ ...schedule, status, now: new Date("2026-12-01T18:00:00") })).toBe(expected);
  });

  it.each([
    ["2026-12-01T18:59:59", "SIGNUP_OPEN"],
    ["2026-12-01T19:00:00", "PREPARATION"],
    ["2026-12-01T19:59:59", "PREPARATION"],
    ["2026-12-01T20:00:00", "GATHERING"],
    ["2026-12-01T20:20:00", "IN_PROGRESS"],
    ["2026-12-01T22:20:00", "COMPLETED"],
  ] as const)("maps %s to %s", (now, expected) => {
    expect(getActivityLifecycleStatus({ ...schedule, now: new Date(now) })).toBe(expected);
  });
});
