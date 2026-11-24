import { createActivitySchema, rosterUpdateSchema, signupSchema } from "@ttz/contracts";
import { describe, expect, it } from "vitest";

describe("activity request rules", () => {
  it("rejects duplicate alternative character/spec choices", () => {
    const result = signupSchema.safeParse({
      characterId: "1",
      choices: [
        { characterId: "2", specId: 3 },
        { characterId: "2", specId: 3 },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a duplicate signup in the final roster", () => {
    const entry = {
      signupId: "9",
      status: "CONFIRMED",
      characterId: "2",
      orderIndex: 0,
    } as const;
    const result = rosterUpdateSchema.safeParse({ version: 1, entries: [entry, entry] });
    expect(result.success).toBe(false);
  });

  it("rejects duplicate Boss targets in a raid activity", () => {
    const result = createActivitySchema.safeParse({
      name: "史诗团本开荒",
      type: "raid_progress",
      beginAt: "2026-12-01T12:00:00.000Z",
      signupDeadline: "2026-12-01T10:00:00.000Z",
      durationMinutes: 180,
      maxPlayers: 20,
      raid: {
        raidId: "3",
        progressPlanId: "1",
        targets: [
          { bossId: "2", orderIndex: 0, strategyVersionId: null },
          { bossId: "2", orderIndex: 1, strategyVersionId: null },
        ],
      },
    });

    expect(result.success).toBe(false);
  });

  it("accepts a manually selected raid without a progress plan", () => {
    const result = createActivitySchema.safeParse({
      name: "团本 Farm",
      type: "raid_farm",
      beginAt: "2026-12-01T12:00:00.000Z",
      signupDeadline: "2026-12-01T10:00:00.000Z",
      durationMinutes: 180,
      raid: { raidId: "3", targets: [{ bossId: "2", orderIndex: 0, strategyVersionId: null }] },
    });
    expect(result.success).toBe(true);
  });

  it("allows an activity to omit roster guidance and does not cap displayed role guidance", () => {
    const result = createActivitySchema.safeParse({
      name: "团本开荒",
      type: "raid_progress",
      beginAt: "2026-12-01T12:00:00.000Z",
      signupDeadline: "2026-12-01T10:00:00.000Z",
      durationMinutes: 180,
      maxPlayers: 10,
      tankSlots: 5,
      healerSlots: 5,
      meleeSlots: 5,
      rangedSlots: 5,
      raid: {
        raidId: "3",
        progressPlanId: "1",
        targets: [{ bossId: "2", orderIndex: 0, strategyVersionId: null }],
      },
    });
    const noGuidance = createActivitySchema.safeParse({
      name: "团本开荒",
      type: "raid_progress",
      beginAt: "2026-12-01T12:00:00.000Z",
      signupDeadline: "2026-12-01T10:00:00.000Z",
      durationMinutes: 180,
      maxPlayers: null,
      tankSlots: null,
      healerSlots: null,
      meleeSlots: null,
      rangedSlots: null,
      raid: {
        raidId: "3",
        progressPlanId: "1",
        targets: [{ bossId: "2", orderIndex: 0, strategyVersionId: null }],
      },
    });

    expect(result.success).toBe(true);
    expect(noGuidance.success).toBe(true);
  });
});
