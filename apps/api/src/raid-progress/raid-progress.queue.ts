import { Injectable, type OnModuleDestroy, ServiceUnavailableException } from "@nestjs/common";
import { Queue } from "bullmq";
import IORedis from "ioredis";

@Injectable()
export class RaidProgressQueue implements OnModuleDestroy {
  private readonly manualSyncJobId = "raid-progress-manual-sync";
  private connection?: IORedis;
  private queue?: Queue;

  async enqueue() {
    if (process.env.REDIS_ENABLED !== "true") {
      throw new ServiceUnavailableException({ code: "WCL_QUEUE_DISABLED", message: "后台队列尚未启用" });
    }
    const queue = this.getQueue();
    const queuedJobs = await queue.getJobs(["active", "waiting", "delayed", "prioritized", "waiting-children"], 0, -1);
    const syncJobs = [];
    for (const job of queuedJobs) {
      if (job.name !== "sync-guild-raid-progress" && job.name !== "continue-guild-raid-progress") continue;
      const state = await job.getState();
      const isActive =
        state === "active" ||
        state === "waiting" ||
        state === "prioritized" ||
        state === "waiting-children" ||
        (state === "delayed" && job.name === "continue-guild-raid-progress");
      if (isActive) syncJobs.push(job);
    }
    if (syncJobs.length) {
      const [currentSync, ...followUpJobs] = syncJobs;
      return {
        jobId: String(currentSync.id),
        followUpJobIds: followUpJobs.map((job) => String(job.id)),
      };
    }

    const previousManualJob = await queue.getJob(this.manualSyncJobId);
    if (previousManualJob) {
      const state = await previousManualJob.getState();
      if (["active", "waiting", "delayed", "prioritized", "waiting-children"].includes(state))
        return { jobId: String(previousManualJob.id), followUpJobIds: [] };
      try {
        await previousManualJob.remove();
      } catch {
        const latestState = await previousManualJob.getState();
        if (["active", "waiting", "delayed", "prioritized", "waiting-children"].includes(latestState))
          return { jobId: String(previousManualJob.id), followUpJobIds: [] };
        throw new ServiceUnavailableException({ code: "WCL_QUEUE_BUSY", message: "同步任务状态正在更新，请稍后重试" });
      }
    }

    const job = await queue.add(
      "sync-guild-raid-progress",
      {},
      {
        jobId: this.manualSyncJobId,
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: 20,
        removeOnFail: 100,
      },
    );
    return { jobId: String(job.id), followUpJobIds: [] };
  }

  async getSyncStatus(jobId: string) {
    if (process.env.REDIS_ENABLED !== "true") {
      throw new ServiceUnavailableException({ code: "WCL_QUEUE_DISABLED", message: "后台队列尚未启用" });
    }
    const job = await this.getQueue().getJob(jobId);
    if (!job || (job.name !== "sync-guild-raid-progress" && job.name !== "continue-guild-raid-progress"))
      return { jobId, state: "missing", progress: null, result: null, failedReason: null };
    const state = await job.getState();
    return {
      jobId,
      state,
      progress: job.progress ?? null,
      result: state === "completed" ? job.returnvalue : null,
      failedReason: job.failedReason || null,
    };
  }

  async continue(planId: bigint) {
    if (process.env.REDIS_ENABLED !== "true") {
      throw new ServiceUnavailableException({ code: "WCL_QUEUE_DISABLED", message: "后台队列尚未启用" });
    }
    const job = await this.getQueue().add(
      "continue-guild-raid-progress",
      { planId: planId.toString() },
      {
        jobId: `raid-progress-continue-${planId}-${Date.now()}`,
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: 20,
        removeOnFail: 100,
      },
    );
    return { jobId: String(job.id) };
  }

  async onModuleDestroy() {
    await this.queue?.close();
    await this.connection?.quit();
  }

  private getQueue() {
    if (!this.queue) {
      if (!process.env.REDIS_URL) throw new ServiceUnavailableException("Redis is not configured");
      this.connection = new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: true });
      this.queue = new Queue("ttz-raid-progress", { connection: this.connection });
    }
    return this.queue;
  }
}
