import { ConflictException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../database/prisma.service";
import { RaidProgressService } from "./raid-progress.service";

describe("RaidProgressService", () => {
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
      where: { id: 12n },
      data: expect.objectContaining({ status: "PUBLISHED", publishedBy: 9n }),
    });
    expect(selectDefault).toHaveBeenCalledWith({
      where: { progressPlanId_bossId: { progressPlanId: 2n, bossId: 3n } },
      data: { defaultStrategyId: 4n },
    });
  });

  it("keeps a published strategy version immutable", async () => {
    const prisma = {
      bossStrategyVersion: { findUnique: vi.fn().mockResolvedValue({ id: 12n, status: "PUBLISHED" }) },
    } as unknown as PrismaService;

    await expect(
      new RaidProgressService(prisma).saveDraftVersion(12n, { blocks: [], slots: [] }),
    ).rejects.toBeInstanceOf(ConflictException);
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
    };
    const prisma = {
      bossStrategyVersion: { findUnique: vi.fn().mockResolvedValueOnce(version).mockResolvedValueOnce(fullVersion) },
      $transaction: vi.fn(async (callback) =>
        callback({
          bossStrategyVersion: { update: vi.fn() },
          bossStrategyBlock: { deleteMany: vi.fn() },
          bossStrategySlot: { deleteMany: vi.fn() },
        }),
      ),
    } as unknown as PrismaService;

    const result = await new RaidProgressService(prisma).saveDraftVersion(12n, { blocks: [], slots: [] });

    expect(result).toMatchObject({ id: "12", status: "DRAFT" });
  });
});
