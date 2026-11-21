import { ConflictException } from "@nestjs/common";
import { WarcraftLogsClient } from "@ttz/warcraft-logs";
import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../database/prisma.service";
import { bestPhaseProgress, progressionPullPhases, RaidProgressService } from "./raid-progress.service";

describe("RaidProgressService", () => {
  it("includes a source WCL report and fight link for each attempt", async () => {
    const prisma = {
      raidBossProgress: {
        findUnique: vi.fn().mockResolvedValue({ id: 7n, boss: { excludeFromProgress: false } }),
      },
      raidBossAttempt: {
        findMany: vi.fn().mockResolvedValue([
          {
            startedAt: new Date("2026-11-20T12:00:00.000Z"),
            durationMs: 120_000,
            kill: false,
            bossPercent: 54.99,
            fightPercent: 90.99,
            phaseData: {
              phases: [{ id: 1, name: "Stage One", isIntermission: false }],
              transitions: [{ phaseId: 1, offsetMs: 0 }],
            },
            sources: [{ reportCode: "abc123", fightId: 4 }],
          },
        ]),
      },
    } as unknown as PrismaService;

    const result = await new RaidProgressService(prisma).getBossAttempts(2n, 3n);

    expect(result).toEqual([
      {
        pull: 1,
        startedAt: "2026-11-20T12:00:00.000Z",
        durationMs: 120_000,
        kill: false,
        bossPercent: 54.99,
        fightPercent: 90.99,
        phaseData: {
          phases: [{ id: 1, name: "Stage One", isIntermission: false }],
          transitions: [{ phaseId: 1, offsetMs: 0 }],
        },
        reportCode: "abc123",
        fightId: 4,
      },
    ]);
  });

  it("selects the first kill before a lower-health wipe for best-pull graphs", async () => {
    const getGraph = vi.spyOn(WarcraftLogsClient.prototype, "getFightMetricGraph").mockResolvedValue({
      durationMs: 60_000,
      points: [{ timeMs: 0, dps: 100, hps: 20, dtps: 30 }],
    });
    const prisma = {
      raidBossProgress: {
        findUnique: vi.fn().mockResolvedValue({ id: 7n, boss: { excludeFromProgress: false } }),
      },
      raidBossAttempt: {
        findMany: vi.fn().mockResolvedValue([
          {
            startedAt: new Date("2026-11-20T12:00:00.000Z"),
            durationMs: 70_000,
            kill: false,
            bossPercent: 0.01,
            fightPercent: 80,
            phaseData: null,
            sources: [{ reportCode: "wipe", fightId: 1 }],
          },
          {
            startedAt: new Date("2026-11-20T12:10:00.000Z"),
            durationMs: 60_000,
            kill: true,
            bossPercent: 0,
            fightPercent: 100,
            phaseData: null,
            sources: [{ reportCode: "kill", fightId: 2 }],
          },
        ]),
      },
    } as unknown as PrismaService;

    await expect(new RaidProgressService(prisma).getBestAttemptMetrics(2n, 3n)).resolves.toMatchObject({
      pull: 2,
      selection: "FIRST_KILL",
      kill: true,
      reportCode: "kill",
      fightId: 2,
      points: [{ dps: 100, hps: 20, dtps: 30 }],
    });
    expect(getGraph).toHaveBeenCalledWith("kill", 2, "cn");
    getGraph.mockRestore();
  });

  it("prefers the lowest-health Pull within the furthest reached phase", () => {
    const phases = [
      { id: 1, name: "Stage One", isIntermission: false },
      { id: 2, name: "Stage Two", isIntermission: false },
    ];
    expect(
      bestPhaseProgress([
        { kill: false, bossPercent: 54, phaseData: { phases, transitions: [{ phaseId: 1, offsetMs: 0 }] } },
        {
          kill: false,
          bossPercent: 2.86,
          phaseData: {
            phases,
            transitions: [
              { phaseId: 1, offsetMs: 0 },
              { phaseId: 2, offsetMs: 90_000 },
            ],
          },
        },
        { kill: false, bossPercent: 0.01, phaseData: { phases, transitions: [{ phaseId: 1, offsetMs: 0 }] } },
      ]),
    ).toEqual({ bestPercent: 2.86, bestPhaseNumber: 2, bestPhaseIsIntermission: false });
  });

  it("uses the pull with the lowest remaining Boss health when no kill exists", async () => {
    const getGraph = vi.spyOn(WarcraftLogsClient.prototype, "getFightMetricGraph").mockResolvedValue({
      durationMs: 90_000,
      points: [{ timeMs: 0, dps: 200, hps: 30, dtps: 40 }],
    });
    const attempts = [45, 12, 30].map((bossPercent, index) => ({
      startedAt: new Date(`2026-11-20T12:${String(index).padStart(2, "0")}:00.000Z`),
      durationMs: 90_000,
      kill: false,
      bossPercent,
      fightPercent: 90 - index,
      phaseData: null,
      sources: [{ reportCode: `report-${index}`, fightId: index + 1 }],
    }));
    const prisma = {
      raidBossProgress: {
        findUnique: vi.fn().mockResolvedValue({ id: 7n, boss: { excludeFromProgress: false } }),
      },
      raidBossAttempt: { findMany: vi.fn().mockResolvedValue(attempts) },
    } as unknown as PrismaService;

    await expect(new RaidProgressService(prisma).getBestAttemptMetrics(2n, 3n)).resolves.toMatchObject({
      pull: 2,
      selection: "LOWEST_HEALTH",
      bossPercent: 12,
      reportCode: "report-1",
      fightId: 2,
    });
    expect(getGraph).toHaveBeenCalledWith("report-1", 2, "cn");
    getGraph.mockRestore();
  });

  it("carries the furthest WCL phase forward across later pulls", () => {
    const phases = [
      { id: 1, name: "Stage One", isIntermission: false },
      { id: 2, name: "Stage Two", isIntermission: false },
      { id: 3, name: "Intermission", isIntermission: true },
      { id: 4, name: "Stage Three", isIntermission: false },
    ];
    expect(
      progressionPullPhases([
        {
          kill: false,
          bossPercent: 40,
          phaseData: { phases, transitions: [{ phaseId: 1, offsetMs: 0 }] },
        },
        {
          kill: false,
          bossPercent: 25,
          phaseData: {
            phases,
            transitions: [
              { phaseId: 1, offsetMs: 0 },
              { phaseId: 2, offsetMs: 60_000 },
            ],
          },
        },
        {
          kill: false,
          bossPercent: 15,
          phaseData: { phases, transitions: [{ phaseId: 1, offsetMs: 0 }] },
        },
      ]),
    ).toEqual([
      { phaseId: 1, phaseNumber: 1, phaseName: "Stage One", isIntermission: false },
      { phaseId: 2, phaseNumber: 2, phaseName: "Stage Two", isIntermission: false },
      { phaseId: 2, phaseNumber: 2, phaseName: "Stage Two", isIntermission: false },
    ]);
  });

  it("records a manual override without changing WCL evidence", async () => {
    const update = vi.fn().mockResolvedValue({ id: 7n, manualStatus: "PROGRESSING" });
    const createLog = vi.fn().mockResolvedValue({ id: 1n });
    const prisma = {
      raidBossProgress: {
        findUnique: vi.fn().mockResolvedValue({
          id: 7n,
          wclStatus: "DEFEATED",
          wclBestPercent: 0,
          manualStatus: null,
          manualBestPercent: null,
          manualFirstKillAt: null,
          manualLastKillAt: null,
          manualReason: null,
        }),
      },
      $transaction: vi.fn(async (callback) =>
        callback({
          raidBossProgress: { update },
          raidBossProgressOverrideLog: { create: createLog },
        }),
      ),
    } as unknown as PrismaService;

    const result = await new RaidProgressService(prisma).overrideBoss(7n, 9n, {
      status: "PROGRESSING",
      bestPercent: 31.5,
      firstKillAt: null,
      lastKillAt: null,
      reason: "WCL 尚未上传",
    });

    expect(result).toEqual({ id: "7", manuallyOverridden: true });
    expect(update).toHaveBeenCalledWith({
      where: { id: 7n },
      data: expect.objectContaining({
        manualStatus: "PROGRESSING",
        manualBestPercent: 31.5,
        manualUpdatedBy: 9n,
      }),
    });
    expect(update.mock.calls[0]?.[0].data).not.toHaveProperty("wclStatus");
    expect(createLog).toHaveBeenCalledWith({
      data: expect.objectContaining({
        progressId: 7n,
        beforeValue: expect.objectContaining({ status: null }),
        afterValue: expect.objectContaining({ status: "PROGRESSING" }),
        updatedBy: 9n,
      }),
    });
  });

  it("publishes a draft and selects its strategy as the Boss default", async () => {
    const publish = vi.fn().mockResolvedValue({ id: 12n, versionNo: 2, status: "PUBLISHED" });
    const selectDefault = vi.fn().mockResolvedValue({ id: 4n });
    const prisma = {
      bossStrategyVersion: {
        findUnique: vi.fn().mockResolvedValue({
          id: 12n,
          strategyId: 4n,
          status: "DRAFT",
          strategy: { progressPlanId: 2n, bossId: 3n },
        }),
      },
      $transaction: vi.fn(async (callback) =>
        callback({
          bossStrategyVersion: { update: publish },
          raidBossProgress: { update: selectDefault },
        }),
      ),
    } as unknown as PrismaService;

    const result = await new RaidProgressService(prisma).publishVersion(12n, 9n, true);

    expect(result).toEqual({ id: "12", versionNo: 2, status: "PUBLISHED" });
    expect(publish).toHaveBeenCalledWith({
      where: { id: 12n, status: "DRAFT", contentMode: "REQUIREMENTS", strategy: { status: "ACTIVE" } },
      data: expect.objectContaining({ status: "PUBLISHED", publishedBy: 9n }),
    });
    expect(selectDefault).toHaveBeenCalledWith({
      where: { progressPlanId_bossId: { progressPlanId: 2n, bossId: 3n } },
      data: { defaultStrategyId: 4n },
    });
  });

  it("keeps a published strategy version immutable", async () => {
    const prisma = {
      $transaction: vi.fn(async (callback) =>
        callback({ bossStrategyVersion: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) } }),
      ),
    } as unknown as PrismaService;

    await expect(new RaidProgressService(prisma).savePreset(12n, { items: [] })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it("hides draft strategy versions from ordinary members", async () => {
    const prisma = {
      bossStrategyVersion: {
        findUnique: vi.fn().mockResolvedValue({
          id: 12n,
          status: "DRAFT",
          strategy: { id: 4n, name: "草稿方案", boss: { id: 3n, name: "Boss" } },
          blocks: [],
          slots: [],
        }),
      },
    } as unknown as PrismaService;

    await expect(new RaidProgressService(prisma).getStrategyVersion(12n)).rejects.toMatchObject({
      response: { code: "STRATEGY_VERSION_NOT_FOUND" },
    });
  });

  it("returns the draft after an administrator saves it", async () => {
    const version = { id: 12n, status: "DRAFT" };
    const fullVersion = {
      ...version,
      strategyId: 4n,
      versionNo: 1,
      changeSummary: null,
      createdAt: new Date(),
      publishedAt: null,
      strategy: { id: 4n, name: "草稿方案", boss: { id: 3n, name: "Boss" } },
      blocks: [],
      slots: [],
      tasks: [],
    };
    const prisma = {
      bossStrategyVersion: { findUnique: vi.fn().mockResolvedValue(fullVersion) },
      $transaction: vi.fn(async (callback) =>
        callback({
          bossStrategyVersion: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
          bossStrategyBlock: { deleteMany: vi.fn() },
          bossStrategySlot: { deleteMany: vi.fn() },
          bossStrategyTask: { deleteMany: vi.fn() },
        }),
      ),
    } as unknown as PrismaService;

    const result = await new RaidProgressService(prisma).savePreset(12n, { items: [] });

    expect(result).toMatchObject({ id: "12", status: "DRAFT" });
  });
  it("keeps draft, published, and archived strategy versions discoverable for administrators", async () => {
    const prisma = {
      bossStrategy: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 9n,
            progressPlanId: 2n,
            bossId: 3n,
            name: "稳健方案",
            description: null,
            status: "ACTIVE",
            plan: { name: "当前史诗计划", difficulty: 3, status: "ACTIVE" },
            boss: { name: "盘卷祭坛" },
            versions: [
              {
                id: 91n,
                versionNo: 2,
                status: "DRAFT",
                changeSummary: "调整分组",
                createdAt: new Date("2026-11-21T00:00:00Z"),
                publishedAt: null,
                creator: { name: "作者", guildNickname: null },
                publisher: null,
              },
              {
                id: 90n,
                versionNo: 1,
                status: "PUBLISHED",
                changeSummary: null,
                createdAt: new Date("2026-11-20T00:00:00Z"),
                publishedAt: new Date("2026-11-20T01:00:00Z"),
                creator: { name: "作者", guildNickname: null },
                publisher: { name: "审核人", guildNickname: null },
              },
            ],
          },
        ]),
      },
      raidBossProgress: {
        findMany: vi.fn().mockResolvedValue([{ progressPlanId: 2n, bossId: 3n, defaultStrategyId: 9n }]),
      },
    } as unknown as PrismaService;
    const rows = await new RaidProgressService(prisma).listStrategiesForManagement();
    expect(rows[0]).toMatchObject({ id: "9", bossName: "盘卷祭坛", status: "ACTIVE", isDefault: true });
    expect(rows[0]?.versions).toMatchObject([
      { id: "91", status: "DRAFT", createdByName: "作者", publishedByName: null },
      { id: "90", status: "PUBLISHED", publishedByName: "审核人" },
    ]);
  });

  it("clears the default pointer before archiving and supports restoration", async () => {
    const clearDefault = vi.fn().mockResolvedValue({ count: 1 });
    const updateStrategy = vi.fn().mockResolvedValue({ id: 9n, status: "ARCHIVED" });
    const transaction = vi.fn(async (callback: (tx: unknown) => unknown) =>
      callback({
        raidBossProgress: { updateMany: clearDefault },
        bossStrategy: { update: updateStrategy },
      }),
    );
    const prisma = {
      bossStrategy: { findUnique: vi.fn().mockResolvedValue({ id: 9n, progressPlanId: 2n, bossId: 3n }) },
      $transaction: transaction,
    } as unknown as PrismaService;
    await expect(new RaidProgressService(prisma).setStrategyArchived(9n, true)).resolves.toEqual({
      id: "9",
      status: "ARCHIVED",
    });
    expect(clearDefault).toHaveBeenCalledWith(
      expect.objectContaining({ where: { progressPlanId: 2n, bossId: 3n, defaultStrategyId: 9n } }),
    );
    expect(updateStrategy).toHaveBeenCalledWith({ where: { id: 9n }, data: { status: "ARCHIVED" } });
  });
  it("converts a legacy draft without persisting slot assignments, timeline offsets or board configs", async () => {
    const saveTasks = vi.fn();
    const dropSlots = vi.fn();
    const saveBlocks = vi.fn();
    const prisma = {
      bossStrategyVersion: {
        findUnique: vi.fn().mockResolvedValue({
          id: 12n,
          strategyId: 4n,
          versionNo: 1,
          status: "DRAFT",
          contentMode: "REQUIREMENTS",
          createdAt: new Date(),
          strategy: { name: "方案", boss: { id: 3n, name: "Boss" } },
          blocks: [],
          slots: [],
          tasks: [],
        }),
      },
      $transaction: vi.fn(async (callback) =>
        callback({
          bossStrategyVersion: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
          strategyTaskType: { findMany: vi.fn().mockResolvedValue([{ id: 1, isActive: true }]) },
          bossStrategyTask: { deleteMany: vi.fn(), createMany: saveTasks },
          bossStrategySlot: { deleteMany: dropSlots },
          bossStrategyBlock: { deleteMany: vi.fn(), createMany: saveBlocks },
        }),
      ),
    } as unknown as PrismaService;
    await new RaidProgressService(prisma).savePreset(12n, {
      items: [
        { type: "POSITIONING", title: "分散站位", markdown: "按队伍分散", orderIndex: 0 },
        { type: "TIMELINE", taskTypeId: 1, title: "打断", markdown: "约开战后 30 秒", orderIndex: 4 },
      ],
    });
    expect(dropSlots).toHaveBeenCalledWith({ where: { versionId: 12n } });
    expect(saveTasks).toHaveBeenCalledWith({
      data: [
        { versionId: 12n, kind: "TIMELINE", taskTypeId: 1, label: "打断", notes: "约开战后 30 秒", orderIndex: 4 },
      ],
    });
    expect(saveBlocks).toHaveBeenCalledWith({
      data: [{ versionId: 12n, type: "POSITIONING", title: "分散站位", markdown: "按队伍分散", orderIndex: 0 }],
    });
  });
});
