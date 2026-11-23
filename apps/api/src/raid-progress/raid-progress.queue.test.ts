import type { Queue } from "bullmq";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RaidProgressQueue } from "./raid-progress.queue";

describe("RaidProgressQueue", () => {
  const previousEnabled = process.env.REDIS_ENABLED;
  let queue: {
    add: ReturnType<typeof vi.fn>;
    getJob: ReturnType<typeof vi.fn>;
    getJobs: ReturnType<typeof vi.fn>;
  };
  let service: RaidProgressQueue;

  beforeEach(() => {
    process.env.REDIS_ENABLED = "true";
    queue = {
      add: vi.fn(),
      getJob: vi.fn(),
      getJobs: vi.fn().mockResolvedValue([]),
    };
    service = Object.assign(Object.create(RaidProgressQueue.prototype), {
      manualSyncJobId: "raid-progress-manual-sync",
      queue: queue as unknown as Queue,
    }) as RaidProgressQueue;
  });

  afterEach(() => {
    if (previousEnabled === undefined) delete process.env.REDIS_ENABLED;
    else process.env.REDIS_ENABLED = previousEnabled;
  });

  it("reuses a currently running sync instead of enqueueing another one", async () => {
    const job = { id: "running-sync", name: "sync-guild-raid-progress", getState: vi.fn().mockResolvedValue("active") };
    queue.getJobs.mockResolvedValue([job]);

    await expect(service.enqueue()).resolves.toEqual({ jobId: "running-sync", followUpJobIds: [] });
    expect(queue.add).not.toHaveBeenCalled();
  });

  it("does not mistake the periodic delayed job for a running manual sync", async () => {
    const scheduledJob = {
      id: "repeat-sync",
      name: "sync-guild-raid-progress",
      getState: vi.fn().mockResolvedValue("delayed"),
    };
    queue.getJobs.mockResolvedValue([scheduledJob]);
    queue.getJob.mockResolvedValue(undefined);
    queue.add.mockResolvedValue({ id: "raid-progress-manual-sync" });

    await expect(service.enqueue()).resolves.toEqual({
      jobId: "raid-progress-manual-sync",
      followUpJobIds: [],
    });
    expect(queue.add).toHaveBeenCalledWith(
      "sync-guild-raid-progress",
      {},
      expect.objectContaining({ jobId: "raid-progress-manual-sync" }),
    );
  });

  it("returns job state, progress, and continuation jobs", async () => {
    const job = {
      id: "sync-1",
      name: "sync-guild-raid-progress",
      progress: { phase: "syncing", page: 2 },
      returnvalue: { followUpJobIds: ["continue-1"] },
      failedReason: "",
      getState: vi.fn().mockResolvedValue("completed"),
    };
    queue.getJob.mockResolvedValue(job);

    await expect(service.getSyncStatus("sync-1")).resolves.toEqual({
      jobId: "sync-1",
      state: "completed",
      progress: { phase: "syncing", page: 2 },
      result: { followUpJobIds: ["continue-1"] },
      failedReason: null,
    });
  });
});
