import { Module } from "@nestjs/common";
import { WarcraftLogsController } from "./warcraft-logs.controller";
import { WclQueueService } from "./wcl-queue.service";

@Module({ controllers: [WarcraftLogsController], providers: [WclQueueService] })
export class WarcraftLogsModule {}
