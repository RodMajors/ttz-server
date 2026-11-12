import { describe, expect, it } from "vitest";
import { canMemberChangeSignup } from "./signup-policy";

const beforeDeadline = {
  now: new Date("2026-11-12T10:00:00Z"),
  signupDeadline: new Date("2026-11-12T11:00:00Z"),
  activityStatus: 1,
  rosterLockedAt: null,
};
describe("canMemberChangeSignup", () => {
  it("allows a pending signup before the deadline", () => {
    expect(canMemberChangeSignup({ ...beforeDeadline, signupStatus: "PENDING" })).toBe(true);
  });
  it("blocks a confirmed signup even before the deadline", () => {
    expect(canMemberChangeSignup({ ...beforeDeadline, signupStatus: "CONFIRMED" })).toBe(false);
  });
  it("blocks changes at or after the deadline", () => {
    expect(
      canMemberChangeSignup({ ...beforeDeadline, now: new Date("2026-11-12T11:00:00Z"), signupStatus: "PENDING" }),
    ).toBe(false);
  });
  it("blocks changes when the roster is locked", () => {
    expect(canMemberChangeSignup({ ...beforeDeadline, rosterLockedAt: new Date(), signupStatus: "PENDING" })).toBe(
      false,
    );
  });
});
