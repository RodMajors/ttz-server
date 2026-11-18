import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { AvatarStorageService } from "./avatar-storage.service";

@Module({ controllers: [AuthController], providers: [AuthService, AvatarStorageService], exports: [AuthService] })
export class AuthModule {}
