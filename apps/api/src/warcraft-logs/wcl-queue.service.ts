import { Injectable, type OnModuleDestroy, ServiceUnavailableException } from "@nestjs/common";
import { Queue } from "bullmq";
import IORedis from "ioredis";

@Injectable()
export class WclQueueService implements OnModuleDestroy {
  private connection?: IORedis;
  private queue?: Queue;

  async enqueue(reportId: bigint) {
    if (process.env.REDIS_ENABLED !== "true") {
      throw new ServiceUnavailableException({ code: "WCL_QUEUE_DISABLED", message: "WCL 导入队列尚未启用" });
    }
    const queue = this.getQueue();
    const job = await queue.add(
      "import-report",
      { reportId: reportId.toString() },
      { attempts: 3, backoff: { type: "exponential", delay: 1500 }, removeOnComplete: 100, removeOnFail: 1000 },
    );
    return { jobId: String(job.id) };
  }

  async onModuleDestroy() {
    await this.queue?.close();
    await this.connection?.quit();
  }

  private getQueue() {
    if (!this.queue) {
      const redisUrl = process.env.REDIS_URL;
      if (!redisUrl) throw new ServiceUnavailableException("Redis is not configured");
      this.connection = new IORedis(redisUrl, { maxRetriesPerRequest: null, lazyConnect: true });
      this.queue = new Queue("ttz-wcl-import", { connection: this.connection });
    }
    return this.queue;
  }
}
