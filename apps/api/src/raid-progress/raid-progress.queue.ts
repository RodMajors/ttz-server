import { Injectable, type OnModuleDestroy, ServiceUnavailableException } from "@nestjs/common";
import { Queue } from "bullmq";
import IORedis from "ioredis";

@Injectable()
export class RaidProgressQueue implements OnModuleDestroy {
  private connection?: IORedis;
  private queue?: Queue;

  async enqueue() {
    if (process.env.REDIS_ENABLED !== "true") {
      throw new ServiceUnavailableException({ code: "WCL_QUEUE_DISABLED", message: "后台队列尚未启用" });
    }
    const job = await this.getQueue().add(
      "sync-guild-raid-progress",
      {},
      { attempts: 3, backoff: { type: "exponential", delay: 5000 }, removeOnComplete: 20, removeOnFail: 100 },
    );
    return { jobId: String(job.id) };
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
