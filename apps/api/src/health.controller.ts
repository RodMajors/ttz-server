import { Controller, Get, Inject, ServiceUnavailableException } from "@nestjs/common";

import { healthResponseSchema } from "@ttz/contracts";
import { Public } from "./auth/auth.decorators";
import { PrismaService } from "./database/prisma.service";

@Public()
@Controller("health")
export class HealthController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Get()
  getHealth() {
    return this.live();
  }

  @Get("live")
  live() {
    return healthResponseSchema.parse({
      status: "ok",
      service: "ttz-api",
      timestamp: new Date().toISOString(),
    });
  }

  @Get("ready")
  async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { ...this.live(), dependencies: { database: "ok" } };
    } catch {
      throw new ServiceUnavailableException({
        code: "DEPENDENCY_UNAVAILABLE",
        message: "数据库尚未就绪",
        details: { database: "unavailable" },
      });
    }
  }
}
