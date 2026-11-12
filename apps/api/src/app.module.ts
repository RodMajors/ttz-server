import { type MiddlewareConsumer, Module, type NestModule, RequestMethod } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { parseEnv } from "@ttz/config";
import { ActivitiesModule } from "./activities/activities.module";
import { AttendanceModule } from "./attendance/attendance.module";
import { ApprovedMemberGuard } from "./auth/approved-member.guard";
import { AuthModule } from "./auth/auth.module";
import { PrivilegeGuard } from "./auth/privilege.guard";
import { RequestIdMiddleware } from "./common/request-id.middleware";
import { DatabaseModule } from "./database/database.module";
import { HealthController } from "./health.controller";
import { MembersModule } from "./members/members.module";
import { PublicModule } from "./public/public.module";
import { WarcraftLogsModule } from "./warcraft-logs/warcraft-logs.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: parseEnv }),
    DatabaseModule,
    AuthModule,
    MembersModule,
    ActivitiesModule,
    AttendanceModule,
    WarcraftLogsModule,
    PublicModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ApprovedMemberGuard },
    { provide: APP_GUARD, useClass: PrivilegeGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes({ path: "{*path}", method: RequestMethod.ALL });
  }
}
