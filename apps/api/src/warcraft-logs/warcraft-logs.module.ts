import { Module } from "@nestjs/common";
import { WarcraftLogsController } from "./warcraft-logs.controller";
import { WclAuthController } from "./wcl-auth.controller";
import { WclBindingService } from "./wcl-binding.service";
import { WclQueueService } from "./wcl-queue.service";

@Module({
  controllers: [WarcraftLogsController, WclAuthController],
  providers: [WclQueueService, WclBindingService],
  exports: [WclBindingService],
})
export class WarcraftLogsModule {}
