import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { findMatchingAttempt } from "./raid-progress-sync";

const start = Date.parse("2026-10-29T12:00:00.000Z");
function fight(code: string, offset: number, players: string[]) {
  return {
    id: 1,
    encounterId: 42,
    name: "Boss",
    difficulty: 4,
    kill: false,
    bossPercent: 32,
    fightPercent: 72,
    startTime: 0,
    endTime: 100_000,
    code,
    startedAt: start + offset,
    durationMs: 100_000,
    friendlyPlayers: players,
    phaseData: {
      phases: [{ id: 1, name: "Stage One", isIntermission: false }],
      transitions: [{ phaseId: 1, offsetMs: 0 }],
    },
  };
}
function attempt(offset: number, players: string[], reportCode = "report-a") {
  return {
    id: 1n,
    startedAt: new Date(start + offset),
    durationMs: 100_000,
    bossPercent: 35,
    fightPercent: 70,
    phaseData: {
      phases: [{ id: 1, name: "Stage One", isIntermission: false }],
      transitions: [{ phaseId: 1, offsetMs: 0 }],
    },
    players,
    evidence: [{ reportCode }],
  };
}

describe("WCL pull matching", () => {
  it("merges guild fights within five seconds when rosters are compatible", () => {
    assert.equal(findMatchingAttempt(fight("report-b", 4_900, ["a", "b", "c"]), [attempt(0, ["a", "b", "c"])])?.id, 1n);
  });

  it("uses roster overlap for the wider thirty-second window", () => {
    assert.equal(
      findMatchingAttempt(fight("report-b", 20_000, ["a", "b", "c", "d"]), [attempt(0, ["a", "b", "c", "d"])])?.id,
      1n,
    );
    assert.equal(
      findMatchingAttempt(fight("report-b", 20_000, ["x", "y", "z"]), [attempt(0, ["a", "b", "c"])]),
      undefined,
    );
  });

  it("rejects a contradictory roster even when timestamps are close", () => {
    assert.equal(findMatchingAttempt(fight("report-b", 1_000, ["x", "y"]), [attempt(0, ["a", "b"])]), undefined);
  });

  it("keeps same-report and ambiguous candidates separate", () => {
    assert.equal(findMatchingAttempt(fight("report-a", 0, ["a"]), [attempt(0, ["a"])]), undefined);
    assert.equal(
      findMatchingAttempt(fight("report-b", 0, ["a"]), [attempt(0, ["a"]), { ...attempt(0, ["a"]), id: 2n }]),
      undefined,
    );
  });
});
