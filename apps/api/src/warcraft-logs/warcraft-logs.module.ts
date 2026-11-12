import { Module } from "@nestjs/common";
import { WarcraftLogsController } from "./warcraft-logs.controller";
@Module({ controllers: [WarcraftLogsController] })
export class WarcraftLogsModule {}
