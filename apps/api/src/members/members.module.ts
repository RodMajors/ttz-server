import { Module } from "@nestjs/common";
import { CharactersService } from "./characters.service";
import { MembersController } from "./members.controller";

@Module({ controllers: [MembersController], providers: [CharactersService] })
export class MembersModule {}
