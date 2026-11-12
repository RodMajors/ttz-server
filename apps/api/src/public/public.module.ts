import { Module } from "@nestjs/common";
import { PublicController, SiteSettingsController } from "./public.controller";
@Module({ controllers: [PublicController, SiteSettingsController] })
export class PublicModule {}
