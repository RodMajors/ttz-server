import { Module } from "@nestjs/common";
import { RaidProgressController } from "./raid-progress.controller";
import { RaidProgressQueue } from "./raid-progress.queue";
import { RaidProgressService } from "./raid-progress.service";

@Module({
  controllers: [RaidProgressController],
  providers: [RaidProgressQueue, RaidProgressService],
  exports: [RaidProgressService],
})
export class RaidProgressModule {}
