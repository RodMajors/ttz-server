import {
  Body,
  ConflictException,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import {
  applyWclSuggestionsSchema,
  attendanceStatusSchema,
  idSchema,
  registerWclReportSchema,
  wclActorMappingSchema,
  wclCharacterSearchSchema,
} from "@ttz/contracts";
import { attendanceCodeToStatus, attendanceStatusToCode } from "../activities/activity.constants";
import { CurrentUser } from "../auth/auth.decorators";
import type { AuthUser } from "../auth/auth.types";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { PrismaService } from "../database/prisma.service";
import { WclBindingService } from "./wcl-binding.service";
import { WclQueueService } from "./wcl-queue.service";

@Controller()
export class WarcraftLogsController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(WclQueueService) private readonly queue: WclQueueService,
    @Inject(WclBindingService) private readonly binding: WclBindingService,
  ) {}

  @Get("wcl/characters")
  searchCharacter(
    @Query(new ZodValidationPipe(wclCharacterSearchSchema)) query: {
      name: string;
      serverSlug: string;
      serverRegion: string;
    },
  ) {
    return this.binding.searchCharacter(query.name, query.serverSlug, query.serverRegion);
  }

  @Post("activities/:id/wcl-reports")
  async register(
    @CurrentUser() user: AuthUser,
    @Param("id", new ZodValidationPipe(idSchema)) id: string,
    @Body(new ZodValidationPipe(registerWclReportSchema)) body: { reportCode: string },
  ) {
    const activityId = BigInt(id);
    const activity = await this.prisma.activity.findFirst({ where: { id: activityId, isDeleted: 0 } });
    if (!activity) throw new NotFoundException({ code: "ACTIVITY_NOT_FOUND", message: "活动不存在" });
    if (activity.creator !== user.id && user.privilege < 1) {
      throw new NotFoundException({ code: "ACTIVITY_NOT_FOUND", message: "活动不存在" });
    }
    const existing = await this.prisma.wclReport.findUnique({ where: { reportCode: body.reportCode } });
    if (existing && existing.activityId !== activityId) {
      throw new NotFoundException({ code: "WCL_REPORT_NOT_FOUND", message: "WCL 报告已关联到其他活动" });
    }
    const report = existing
      ? await this.prisma.wclReport.update({
          where: { id: existing.id },
          data: { status: 0, errorMessage: null, createdBy: user.id },
        })
      : await this.prisma.wclReport.create({
          data: { activityId, reportCode: body.reportCode, region: "CN", serverId: 569, createdBy: user.id },
        });
    const queued = await this.queue.enqueue(report.id);
    return { reportId: report.id.toString(), ...queued };
  }

  @Get("activities/:id/wcl-reports")
  async list(@CurrentUser() user: AuthUser, @Param("id", new ZodValidationPipe(idSchema)) id: string) {
    const activityId = BigInt(id);
    const activity = await this.prisma.activity.findFirst({ where: { id: activityId, isDeleted: 0 } });
    if (!activity || (activity.creator !== user.id && user.privilege < 1)) {
      throw new NotFoundException({ code: "ACTIVITY_NOT_FOUND", message: "活动不存在" });
    }
    const reports = await this.prisma.wclReport.findMany({ where: { activityId }, orderBy: { createdAt: "desc" } });
    return reports.map((report) => serializeReportSummary(report));
  }

  @Get("wcl-reports/:id")
  async get(@CurrentUser() user: AuthUser, @Param("id", new ZodValidationPipe(idSchema)) id: string) {
    const report = await this.prisma.wclReport.findUnique({
      where: { id: BigInt(id) },
      include: {
        activity: { select: { creator: true } },
        actors: { include: { character: { select: { id: true, name: true, serverName: true, userId: true } } } },
        suggestions: { include: { user: { select: { id: true, name: true, guildNickname: true } } } },
      },
    });
    if (!report) throw new NotFoundException({ code: "WCL_REPORT_NOT_FOUND", message: "WCL 报告不存在" });
    if (report.activity.creator !== user.id && user.privilege < 1) {
      throw new NotFoundException({ code: "WCL_REPORT_NOT_FOUND", message: "WCL 报告不存在" });
    }
    return {
      ...serializeReportSummary(report),
      activityId: report.activityId.toString(),
      region: report.region,
      serverId: report.serverId,
      summary: isRecord(report.summaryJson) ? report.summaryJson : null,
      actors: report.actors.map((actor) => ({
        actorId: actor.actorId.toString(),
        actorName: actor.actorName,
        realmName: actor.realmName,
        characterId: actor.characterId?.toString() ?? null,
        matchStatus: actor.matchStatus,
        character: actor.character
          ? { id: actor.character.id.toString(), name: actor.character.name, realm: actor.character.serverName }
          : null,
      })),
      suggestions: report.suggestions.map((suggestion) => ({
        userId: suggestion.userId.toString(),
        memberName: suggestion.user.name ?? suggestion.user.guildNickname ?? "TTZ 成员",
        characterId: suggestion.characterId?.toString() ?? null,
        status: attendanceCodeToStatus[suggestion.status] ?? "UNKNOWN",
        appliedAt: suggestion.appliedAt?.toISOString() ?? null,
      })),
    };
  }

  @Put("wcl-reports/:id/actor-mappings")
  async mapActors(
    @CurrentUser() user: AuthUser,
    @Param("id", new ZodValidationPipe(idSchema)) id: string,
    @Body(new ZodValidationPipe(wclActorMappingSchema)) body: {
      mappings: Array<{ actorId: string; characterId: string | null; ignored: boolean }>;
    },
  ) {
    const report = await this.requireManageableReport(BigInt(id), user);
    const actorRows = await this.prisma.wclReportActor.findMany({
      where: { reportId: report.id },
      select: { actorId: true, actorName: true, realmName: true },
    });
    for (const mapping of body.mappings) {
      const actor = actorRows.find((row) => row.actorId === BigInt(mapping.actorId));
      if (!actor) continue;
      let characterId: bigint | null = null;
      let characterUserId: bigint | null = null;
      if (mapping.characterId && !mapping.ignored) {
        characterId = BigInt(mapping.characterId);
        const character = await this.prisma.character.findFirst({
          where: {
            id: characterId,
            isRetired: 0,
            user: { isApproved: 1, status: 1 },
          },
        });
        if (!character)
          throw new NotFoundException({ code: "CHARACTER_NOT_FOUND", message: "角色不匹配或不属于当前成员" });
        characterUserId = character.userId;
      }
      await this.prisma.$transaction(async (transaction) => {
        await transaction.wclReportActor.updateMany({
          where: { reportId: report.id, actorId: BigInt(mapping.actorId) },
          data: {
            characterId,
            matchStatus: mapping.ignored ? 2 : characterId ? 1 : 0,
            matchedBy: user.id,
            matchedAt: new Date(),
          },
        });
        if (characterId && characterUserId) {
          const existing = await transaction.wclAttendanceSuggestion.findUnique({
            where: { reportId_userId: { reportId: report.id, userId: characterUserId } },
          });
          if (!existing) {
            await transaction.wclAttendanceSuggestion.create({
              data: { reportId: report.id, userId: characterUserId, characterId, status: 1 },
            });
          } else if (!existing.appliedAt) {
            await transaction.wclAttendanceSuggestion.updateMany({
              where: { id: existing.id, appliedAt: null },
              data: { characterId },
            });
          }
        }
      });
    }
    return { updated: body.mappings.length };
  }

  @Post("wcl-reports/:id/apply-attendance-suggestions")
  async applySuggestions(
    @CurrentUser() user: AuthUser,
    @Param("id", new ZodValidationPipe(idSchema)) id: string,
    @Body(new ZodValidationPipe(applyWclSuggestionsSchema)) body: {
      statuses: Array<{ userId: string; status: string }>;
    },
  ) {
    const report = await this.requireManageableReport(BigInt(id), user);
    const statusResults = body.statuses.map((item) => ({
      userId: BigInt(item.userId),
      status: attendanceStatusSchema.parse(item.status),
    }));
    return this.prisma.$transaction(async (transaction) => {
      for (const item of statusResults) {
        const suggestion = await transaction.wclAttendanceSuggestion.findUnique({
          where: { reportId_userId: { reportId: report.id, userId: item.userId } },
        });
        if (!suggestion) continue;
        const result = await transaction.attendanceRecord.updateMany({
          where: { activityId: report.activityId, userId: item.userId, manuallyConfirmed: false },
          data: {
            characterId: suggestion.characterId,
            wclReportId: report.id,
            status: attendanceStatusToCode[item.status],
            source: 1,
            recordedBy: user.id,
            recordedAt: new Date(),
          },
        });
        if (!result.count) {
          throw new ConflictException({
            code: "MANUAL_ATTENDANCE_PROTECTED",
            message: "出勤记录不存在或已由负责人确认，不能应用 WCL 建议",
          });
        }
        await transaction.wclAttendanceSuggestion.update({
          where: { id: suggestion.id },
          data: { appliedAt: new Date(), appliedBy: user.id, status: attendanceStatusToCode[item.status] },
        });
      }
      return { applied: statusResults.length };
    });
  }

  private async requireManageableReport(reportId: bigint, user: AuthUser) {
    const report = await this.prisma.wclReport.findUnique({
      where: { id: reportId },
      include: { activity: { select: { creator: true } } },
    });
    if (!report || (report.activity.creator !== user.id && user.privilege < 1)) {
      throw new NotFoundException({ code: "WCL_REPORT_NOT_FOUND", message: "WCL 报告不存在" });
    }
    return report;
  }
}

function serializeReportSummary(report: {
  id: bigint;
  reportCode: string;
  status: number;
  importedAt: Date | null;
  errorMessage: string | null;
  createdAt: Date;
}) {
  return {
    id: report.id.toString(),
    reportCode: report.reportCode,
    status: report.status,
    importedAt: report.importedAt?.toISOString() ?? null,
    errorMessage: report.errorMessage,
    createdAt: report.createdAt.toISOString(),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
