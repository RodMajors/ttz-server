import { z } from "zod";

export const idSchema = z.string().regex(/^\d+$/, "ID 必须为正整数");
export const isoDateTimeSchema = z.iso.datetime({ offset: true });
export const pageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const privilegeSchema = z.union([z.literal(0), z.literal(1), z.literal(2)]);
export type Privilege = z.infer<typeof privilegeSchema>;

export const wechatCodeLoginSchema = z.object({
  code: z.string().trim().min(6).max(128),
  wxNickname: z.string().trim().min(1).max(255).optional(),
  guildNickname: z.string().trim().min(1).max(255).optional(),
});
export type WechatCodeLoginInput = z.infer<typeof wechatCodeLoginSchema>;

export const memberProfileSchema = z.object({
  name: z.string().trim().min(1).max(255).nullable().optional(),
  wxNickname: z.string().trim().min(1).max(255),
  guildNickname: z.string().trim().min(1).max(255),
});
export type MemberProfileInput = z.infer<typeof memberProfileSchema>;

export const refreshTokenSchema = z.object({ refreshToken: z.string().trim().min(32).max(256) });
export const qrSessionProofSchema = z.object({ nonce: z.string().trim().min(32).max(256) });

export const attendanceStatusSchema = z.enum([
  "UNKNOWN",
  "PRESENT",
  "LATE",
  "EXCUSED_ABSENCE",
  "UNEXCUSED_ABSENCE",
  "BENCH",
  "NOT_SIGNED_UP",
]);
export type AttendanceStatus = z.infer<typeof attendanceStatusSchema>;
export const effectiveAttendanceStatuses = ["PRESENT", "LATE"] as const satisfies readonly AttendanceStatus[];

export const activityStatusSchema = z.enum(["DRAFT", "PUBLISHED", "FINISHED", "CANCELLED"]);
export type ActivityStatus = z.infer<typeof activityStatusSchema>;

export const roleSchema = z.enum(["TANK", "HEALER", "MELEE", "RANGED"]);
export type Role = z.infer<typeof roleSchema>;

export const notificationPreferenceSchema = z.object({
  activityPublished: z.boolean(),
  signupResult: z.boolean(),
  beforeTeamUp: z.boolean(),
  activityCancelled: z.boolean(),
});
export type NotificationPreference = z.infer<typeof notificationPreferenceSchema>;

export const signupStatusSchema = z.enum(["PENDING", "CONFIRMED", "BENCH", "CANCELLED", "REJECTED"]);
export type SignupStatus = z.infer<typeof signupStatusSchema>;

export const activityTypeCodeSchema = z.enum([
  "raid_progress",
  "raid_farm",
  "mythic_plus_push",
  "mythic_plus_vault",
  "casual",
]);
export type ActivityTypeCode = z.infer<typeof activityTypeCodeSchema>;

export const activitySummarySchema = z.object({
  id: idSchema,
  name: z.string(),
  type: activityTypeCodeSchema,
  status: activityStatusSchema,
  beginAt: isoDateTimeSchema,
  teamUpAt: isoDateTimeSchema,
  maxPlayers: z.number().int().positive(),
  signupDeadline: isoDateTimeSchema.nullable(),
  signupCount: z.number().int().nonnegative(),
  confirmedCount: z.number().int().nonnegative(),
  creatorName: z.string(),
  canManage: z.boolean(),
});
export type ActivitySummary = z.infer<typeof activitySummarySchema>;

export const activityListSchema = z.object({
  items: z.array(activitySummarySchema),
  pagination: z.object({ page: z.number(), pageSize: z.number(), total: z.number() }),
});
export type ActivityList = z.infer<typeof activityListSchema>;

const activityFieldsSchema = z.object({
  name: z.string().trim().min(2).max(64),
  type: activityTypeCodeSchema,
  description: z.string().trim().max(10_000).optional(),
  beginAt: isoDateTimeSchema,
  teamUpAt: isoDateTimeSchema.optional(),
  signupDeadline: isoDateTimeSchema,
  durationMinutes: z.number().int().min(30).max(1440).multipleOf(30).default(120),
  maxPlayers: z.number().int().min(1).max(100),
  tankSlots: z.number().int().min(0).max(100).nullable().optional(),
  healerSlots: z.number().int().min(0).max(100).nullable().optional(),
  meleeSlots: z.number().int().min(0).max(100).nullable().optional(),
  rangedSlots: z.number().int().min(0).max(100).nullable().optional(),
  attendanceEnabled: z.boolean().default(false),
});

export const createActivitySchema = activityFieldsSchema.superRefine((value, context) => {
  const beginAt = new Date(value.beginAt);
  if (new Date(value.signupDeadline) >= beginAt) {
    context.addIssue({ code: "custom", path: ["signupDeadline"], message: "报名截止时间必须早于活动开始时间" });
  }
  if (value.teamUpAt && new Date(value.teamUpAt) > beginAt) {
    context.addIssue({ code: "custom", path: ["teamUpAt"], message: "集合时间不能晚于活动开始时间" });
  }
  const requested = [value.tankSlots, value.healerSlots, value.meleeSlots, value.rangedSlots].reduce<number>(
    (sum, count) => sum + (count ?? 0),
    0,
  );
  if (requested > value.maxPlayers) {
    context.addIssue({ code: "custom", path: ["maxPlayers"], message: "职责需求总数不能超过人数上限" });
  }
});
export type CreateActivityInput = z.infer<typeof createActivitySchema>;

export const updateActivitySchema = activityFieldsSchema.partial().extend({ version: z.number().int().positive() });
export type UpdateActivityInput = z.infer<typeof updateActivitySchema>;

export const createCharacterSchema = z.object({
  name: z.string().trim().min(2).max(64),
  realm: z.string().trim().min(2).max(64),
  faction: z.number().int().min(0).max(1).nullable().optional(),
  specId: z.number().int().positive().nullable().optional(),
  itemLevel: z.number().int().min(1).max(999).nullable().optional(),
  isMain: z.boolean().default(false),
});
export type CreateCharacterInput = z.infer<typeof createCharacterSchema>;
export const updateCharacterSchema = createCharacterSchema.partial();
export type UpdateCharacterInput = z.infer<typeof updateCharacterSchema>;

export const memberApprovalSchema = z
  .object({
    approved: z.boolean(),
    reason: z.string().trim().min(2).max(255).optional(),
  })
  .superRefine((value, context) => {
    if (!value.approved && !value.reason) {
      context.addIssue({ code: "custom", path: ["reason"], message: "拒绝成员申请时必须填写原因" });
    }
  });

export const memberStatusSchema = z.object({ status: z.enum(["ACTIVE", "DISABLED"]) });
export const memberPrivilegeSchema = z.object({ privilege: privilegeSchema });
export const memberListQuerySchema = pageQuerySchema.extend({
  search: z.string().trim().max(100).optional(),
  groupId: idSchema.optional(),
});

export const guildGroupInputSchema = z.object({
  name: z.string().trim().min(1).max(64),
  code: z
    .string()
    .trim()
    .regex(/^[a-z0-9_-]{2,32}$/),
  description: z.string().trim().max(255).nullable().optional(),
  isActive: z.boolean().default(true),
  sort: z.number().int().min(-1000).max(1000).default(0),
});
export const guildGroupMemberSchema = z.object({ userId: idSchema });

export const signupSchema = z
  .object({
    characterId: idSchema,
    preferredRole: roleSchema.nullable().optional(),
    preferredSpecId: z.number().int().positive().nullable().optional(),
    note: z.string().trim().max(255).nullable().optional(),
    choices: z
      .array(
        z.object({
          characterId: idSchema,
          specId: z.number().int().positive(),
        }),
      )
      .max(10)
      .default([]),
  })
  .superRefine((value, context) => {
    const keys = value.choices.map((choice) => [choice.characterId, choice.specId].join(":"));
    if (new Set(keys).size !== keys.length) {
      context.addIssue({ code: "custom", path: ["choices"], message: "备选角色和专精不能重复" });
    }
  });
export type SignupInput = z.infer<typeof signupSchema>;

export const signupDecisionSchema = z.object({
  status: z.enum(["PENDING", "CONFIRMED", "BENCH", "REJECTED"]),
  officerNote: z.string().trim().max(255).nullable().optional(),
  reason: z.string().trim().max(255).nullable().optional(),
  groupNo: z.number().int().min(1).max(8).nullable().optional(),
  orderIndex: z.number().int().min(0).max(100).default(0),
});

export const rosterEntrySchema = z.object({
  signupId: idSchema,
  status: z.enum(["CONFIRMED", "BENCH"]),
  characterId: idSchema,
  preferredSpecId: z.number().int().positive().nullable().optional(),
  preferredRole: roleSchema.nullable().optional(),
  groupNo: z.number().int().min(1).max(8).nullable().optional(),
  orderIndex: z.number().int().min(0).max(100),
});
export const rosterUpdateSchema = z
  .object({
    version: z.number().int().positive(),
    entries: z.array(rosterEntrySchema).max(100),
  })
  .superRefine((value, context) => {
    const signupIds = value.entries.map((entry) => entry.signupId);
    if (new Set(signupIds).size !== signupIds.length) {
      context.addIssue({ code: "custom", path: ["entries"], message: "同一报名不能在名单中重复出现" });
    }
  });

export const attendanceRecordInputSchema = z.object({
  userId: idSchema,
  characterId: idSchema.nullable().optional(),
  status: attendanceStatusSchema,
  note: z.string().trim().max(255).nullable().optional(),
});
export const attendanceBatchSchema = z.object({ records: z.array(attendanceRecordInputSchema).min(1).max(100) });

export const attendanceSummarySchema = z.object({
  activityCount: z.number().int().nonnegative(),
  effectiveCount: z.number().int().nonnegative(),
  rate: z.number().min(0).max(1),
  counts: z.record(attendanceStatusSchema, z.number().int().nonnegative()),
});
export type AttendanceSummary = z.infer<typeof attendanceSummarySchema>;

export const attendanceQuerySchema = z.object({
  memberId: idSchema.optional(),
  groupId: idSchema.optional(),
  from: isoDateTimeSchema.optional(),
  to: isoDateTimeSchema.optional(),
});
export const attendanceRecordListSchema = z.object({
  activityId: idSchema,
  activityName: z.string(),
  beginAt: isoDateTimeSchema,
  records: z.array(
    z.object({
      userId: idSchema,
      memberName: z.string(),
      guildNickname: z.string().nullable(),
      characterId: idSchema.nullable(),
      characterName: z.string().nullable(),
      realm: z.string().nullable(),
      status: attendanceStatusSchema,
      note: z.string().nullable(),
    }),
  ),
});

export const registerWclReportSchema = z.object({
  reportCode: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9]{8,32}$/),
});

export const wclActorMappingSchema = z.object({
  mappings: z
    .array(
      z.object({
        actorId: idSchema,
        characterId: idSchema.nullable(),
        ignored: z.boolean().default(false),
      }),
    )
    .min(1)
    .max(100),
});

export const applyWclSuggestionsSchema = z.object({
  statuses: z
    .array(
      z.object({
        userId: idSchema,
        status: z.enum(["PRESENT", "LATE", "EXCUSED_ABSENCE", "UNEXCUSED_ABSENCE", "BENCH", "NOT_SIGNED_UP"]),
      }),
    )
    .min(1)
    .max(100),
});

export const siteSettingKeySchema = z.enum(["guild_profile", "recruitment", "contact", "tool_links"]);
export const siteSettingSchema = z.object({ key: siteSettingKeySchema, value: z.record(z.string(), z.unknown()) });

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.literal("ttz-api"),
  timestamp: z.string().datetime(),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;
