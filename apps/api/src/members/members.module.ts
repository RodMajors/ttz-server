import { Module } from "@nestjs/common";
import { WarcraftLogsModule } from "../warcraft-logs/warcraft-logs.module";
import { CharactersService } from "./characters.service";
import { MembersController } from "./members.controller";

@Module({ imports: [WarcraftLogsModule], controllers: [MembersController], providers: [CharactersService] })
export class MembersModule {}
