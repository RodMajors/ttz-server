import { Body, Controller, Get, Inject, Param, Put, Query } from "@nestjs/common";
import { attendanceBatchSchema, idSchema } from "@ttz/contracts";
import { CurrentUser } from "../auth/auth.decorators";
import type { AuthUser } from "../auth/auth.types";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { AttendanceService } from "./attendance.service";

@Controller()
export class AttendanceController {
  constructor(@Inject(AttendanceService) private readonly attendance: AttendanceService) {}
  @Get("attendance/summary")
  summary(@CurrentUser() user: AuthUser, @Query("memberId") memberId?: string) {
    return this.attendance.summary(user, memberId ? BigInt(idSchema.parse(memberId)) : undefined);
  }
  @Put("activities/:id/attendance")
  put(
    @CurrentUser() user: AuthUser,
    @Param("id", new ZodValidationPipe(idSchema)) id: string,
    @Body(new ZodValidationPipe(attendanceBatchSchema)) body: {
      records: Array<{
        userId: string;
        characterId?: string | null;
        status: "UNKNOWN" | "PRESENT" | "LATE" | "EXCUSED_ABSENCE" | "UNEXCUSED_ABSENCE" | "BENCH" | "NOT_SIGNED_UP";
        note?: string | null;
      }>;
    },
  ) {
    return this.attendance.put(BigInt(id), body.records, user);
  }
}
