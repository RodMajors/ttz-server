import { BadRequestException, Body, Controller, Get, Inject, Param, Put } from "@nestjs/common";
import {
  contactSettingSchema,
  guildProfileSchema,
  recruitmentSettingSchema,
  siteSettingKeySchema,
  siteSettingValueSchema,
  toolLinksSettingSchema,
} from "@ttz/contracts";
import type { Prisma } from "@ttz/database";
import { CurrentUser, MinPrivilege, Public } from "../auth/auth.decorators";
import type { AuthUser } from "../auth/auth.types";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { PrismaService } from "../database/prisma.service";

@Public()
@Controller("public")
export class PublicController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}
  @Get("guild") guild() {
    return this.setting("guild_profile");
  }
  @Get("recruitment") recruitment() {
    return this.setting("recruitment");
  }
  @Get("contact") contact() {
    return this.setting("contact");
  }
  @Get("tools") tools() {
    return this.setting("tool_links");
  }
  @Get("progress") progress() {
    return this.prisma.wclReport
      .findMany({
        where: { status: 2, activity: { isDeleted: 0 } },
        orderBy: { importedAt: "desc" },
        take: 10,
        include: { activity: { select: { name: true, beginAt: true } } },
      })
      .then((reports) => ({
        source: "WCL",
        region: "CN",
        serverId: 569,
        reports: reports.map((report) => ({
          reportCode: report.reportCode,
          activityName: report.activity.name,
          beginAt: report.activity.beginAt.toISOString(),
          summary: isRecord(report.summaryJson) ? report.summaryJson : null,
        })),
      }));
  }

  private async setting(key: string) {
    const setting = await this.prisma.siteSetting.findUnique({ where: { key } });
    return setting?.jsonValue ?? {};
  }
}

@Controller("site-settings")
export class SiteSettingsController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Get(":key")
  @MinPrivilege(1)
  async get(@Param("key", new ZodValidationPipe(siteSettingKeySchema)) key: string) {
    const setting = await this.prisma.siteSetting.findUnique({ where: { key } });
    return setting?.jsonValue ?? {};
  }

  @Put(":key")
  @MinPrivilege(1)
  async put(
    @CurrentUser() user: AuthUser,
    @Param("key", new ZodValidationPipe(siteSettingKeySchema)) key: string,
    @Body(new ZodValidationPipe(siteSettingValueSchema)) body: Record<string, unknown>,
  ) {
    const schema = {
      guild_profile: guildProfileSchema,
      recruitment: recruitmentSettingSchema,
      contact: contactSettingSchema,
      tool_links: toolLinksSettingSchema,
    }[key];
    if (!schema) {
      throw new BadRequestException({ code: "SITE_SETTING_KEY_INVALID", message: "不支持的站点设置项" });
    }
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        code: "SITE_SETTING_INVALID",
        message: parsed.error.issues[0]?.message ?? "站点配置格式无效",
      });
    }
    const value = parsed.data as Prisma.InputJsonObject;
    const setting = await this.prisma.siteSetting.upsert({
      where: { key },
      create: { key, jsonValue: value, updatedBy: user.id },
      update: { jsonValue: value, updatedBy: user.id },
    });
    return setting.jsonValue;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
