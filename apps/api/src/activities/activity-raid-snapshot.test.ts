import { describe, expect, it, vi } from "vitest";
import type { AuthUser } from "../auth/auth.types";
import type { PrismaService } from "../database/prisma.service";
import { ActivitiesService } from "./activities.service";

describe("raid activity strategy snapshots", () => {
  it.each(["LEGACY", "REQUIREMENTS"])(
    "copies %s requirements into an unassigned activity snapshot",
    async (contentMode) => {
      const createActivity = vi.fn().mockResolvedValue({ id: 99n });
      const prisma = {
        activityType: { findUnique: vi.fn().mockResolvedValue({ id: 1n }) },
        raidProgressPlan: {
          findUnique: vi.fn().mockResolvedValue({ id: 2n, raidId: 3n, difficulty: 3 }),
        },
        raidBossProgress: {
          findMany: vi.fn().mockResolvedValue([{ bossId: 4n }]),
        },
        bossStrategyVersion: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: 5n,
              contentMode,
              strategy: { bossId: 4n },
              blocks: [
                {
                  id: 6n,
                  type: "NOTES",
                  title: "核心机制",
                  orderIndex: 0,
                  schemaVersion: 1,
                  config: { legacy: true },
                  markdown: "先躲技能",
                },
              ],
              tasks: [
                {
                  id: 7n,
                  taskTypeId: 1,
                  kind: "TIMELINE",
                  orderIndex: 0,
                  label: "第一轮打断",
                  encounterSpellId: null,
                  encounterSpell: null,
                  playerSpellId: 8,
                  playerSpell: { name: "法术反制" },
                  executorSlotKey: "main-tank",
                  targetSlotKey: null,
                  fallbackSlotKey: null,
                  notes: "留意读条",
                  repeatRule: null,
                  offsetMs: 30000,
                  windowMs: null,
                  phaseLabel: null,
                  occurrence: null,
                  reminderMs: null,
                  taskType: { label: "打断" },
                },
              ],
              slots: [
                {
                  slotKey: "main-tank",
                  label: "主坦",
                  roleConstraint: 1,
                  isRequired: true,
                  orderIndex: 0,
                },
              ],
            },
          ]),
        },
        $transaction: vi.fn(async (callback) => callback({ activity: { create: createActivity } })),
      } as unknown as PrismaService;

      await new ActivitiesService(prisma).create(
        {
          name: "史诗团本开荒",
          type: "raid_progress",
          description: "",
          beginAt: "2026-12-01T12:00:00.000Z",
          signupDeadline: "2026-12-01T10:00:00.000Z",
          durationMinutes: 180,
          maxPlayers: 20,
          raid: {
            progressPlanId: "2",
            mode: "PROGRESSION",
            targets: [{ bossId: "4", orderIndex: 0, strategyVersionId: "5" }],
          },
        },
        admin(),
      );

      const data = createActivity.mock.calls[0]?.[0].data;
      expect(data.raidTargets.create[0]).toMatchObject({
        bossId: 4n,
        strategyVersionId: 5n,
        strategySnapshot: {
          create: {
            sourceVersionId: 5n,
            assignmentMode: "DIRECT",
            blocks: { create: [expect.objectContaining({ sourceBlockId: 6n, markdown: "先躲技能" })] },
            tasks: {
              create: [
                expect.objectContaining({
                  sourceTaskId: 7n,
                  taskTypeId: 1,
                  taskTypeLabelSnapshot: "打断",
                  playerSpellNameSnapshot: "法术反制",
                  kind: "TIMELINE",
                  notes: "留意读条",
                }),
              ],
            },
            slots: {
              create: expect.arrayContaining([
                expect.objectContaining({ slotKey: "__team_g1_p1", groupNo: 1, positionNo: 1 }),
                expect.objectContaining({ slotKey: "__team_g8_p5", groupNo: 8, positionNo: 5 }),
              ]),
            },
          },
        },
      });
      const snapshot = data.raidTargets.create[0].strategySnapshot.create;
      expect(snapshot.slots.create).toHaveLength(40);
      expect(snapshot.blocks.create[0]).not.toHaveProperty("config");
      expect(snapshot.tasks.create[0]).not.toHaveProperty("executorSlotKey");
      expect(snapshot.tasks.create[0]).not.toHaveProperty("offsetMs");
    },
  );
});

function admin(): AuthUser {
  return {
    id: 7n,
    name: "Admin",
    wxNickname: null,
    guildNickname: null,
    privilege: 1,
    isApproved: true,
    profileComplete: true,
    status: 1,
  };
}
