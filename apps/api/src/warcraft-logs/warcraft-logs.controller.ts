import { Body, Controller, Get, Inject, NotFoundException, Param, Post } from "@nestjs/common";
import { idSchema, registerWclReportSchema } from "@ttz/contracts";
import { CurrentUser } from "../auth/auth.decorators";
import type { AuthUser } from "../auth/auth.types";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { PrismaService } from "../database/prisma.service";

@Controller()
export class WarcraftLogsController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}
  @Post("activities/:id/wcl-reports")
  async register(
    @CurrentUser() user: AuthUser,
    @Param("id", new ZodValidationPipe(idSchema)) id: string,
    @Body(new ZodValidationPipe(registerWclReportSchema)) body: { reportCode: string },
  ) {
    const activityId = BigInt(id);
    const activity = await this.prisma.activity.findUnique({ where: { id: activityId } });
    if (!activity || (activity.creator !== user.id && user.privilege < 1))
      throw new NotFoundException({ code: "ACTIVITY_NOT_FOUND", message: "活动不存在" });
    return this.prisma.wclReport.create({
      data: { activityId, reportCode: body.reportCode, region: "CN", serverId: 569, createdBy: user.id },
    });
  }
  @Get("wcl-reports/:id")
  async get(@Param("id", new ZodValidationPipe(idSchema)) id: string) {
    const report = await this.prisma.wclReport.findUnique({ where: { id: BigInt(id) }, include: { actors: true } });
    if (!report) throw new NotFoundException({ code: "WCL_REPORT_NOT_FOUND", message: "WCL 报告不存在" });
    return report;
  }
}
