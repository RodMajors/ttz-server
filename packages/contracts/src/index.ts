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
  guildNickname: z.string().trim().min(1).max(255),
});
export type MemberProfileInput = z.infer<typeof memberProfileSchema>;
export const wechatProfileSchema = z.object({ wxNickname: z.string().trim().min(1).max(255) });
export type WechatProfileInput = z.infer<typeof wechatProfileSchema>;

export const refreshTokenSchema = z.object({ refreshToken: z.string().trim().min(32).max(256) });
export const qrSessionProofSchema = z.object({ nonce: z.string().trim().min(32).max(256) });
export const authUserSchema = z.object({
  id: idSchema,
  name: z.string(),
  wxNickname: z.string().nullable(),
  guildNickname: z.string().nullable(),
  avatar: z.string().nullable(),
  privilege: privilegeSchema,
  isApproved: z.boolean(),
  approvalStatus: z.enum(["PENDING", "APPROVED", "REJECTED"]),
  rejectReason: z.string().nullable(),
  profileComplete: z.boolean(),
  status: z.number().int(),
});
export type AuthUserDto = z.infer<typeof authUserSchema>;

export const qrSessionSchema = z.object({
  loginNo: z.string(),
  nonce: z.string(),
  browserSecret: z.string(),
  expiresAt: isoDateTimeSchema,
  miniappPath: z.string(),
});
export const qrSessionStatusSchema = z.object({
  status: z.enum(["PENDING", "SCANNED", "CONFIRMED", "EXPIRED", "CANCELLED"]),
});

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
  mySignupStatus: signupStatusSchema.nullable(),
  isSignupOpen: z.boolean(),
});
export type ActivitySummary = z.infer<typeof activitySummarySchema>;

export const activityListSchema = z.object({
  items: z.array(activitySummarySchema),
  pagination: z.object({ page: z.number(), pageSize: z.number(), total: z.number() }),
});
export type ActivityList = z.infer<typeof activityListSchema>;

export const characterSummarySchema = z.object({
  id: idSchema,
  userId: idSchema,
  name: z.string(),
  realm: z.string(),
  serverSlug: z.string(),
  serverRegion: z.string(),
  classId: z.number().int(),
  className: z.string(),
  classIconUrl: z.string().url().nullable(),
  classColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullable(),
  raceId: z.number().int().nullable(),
  raceName: z.string().nullable(),
  gender: z.string().nullable(),
  faction: z.number().int().nullable(),
  guildName: z.string().nullable(),
  guildServerName: z.string().nullable(),
  guildServerSlug: z.string().nullable(),
  activeSpecName: z.string().nullable(),
  level: z.number().int().nullable(),
  activeTitle: z.string().nullable(),
  serverTypeName: z.string().nullable(),
  averageItemLevel: z.number().int().nullable(),
  lastLoginAt: isoDateTimeSchema.nullable(),
  achievementPoints: z.number().int().nullable(),
  isMain: z.boolean(),
  isRetired: z.boolean(),
  itemLevel: z.number().int().nullable(),
  verificationStatus: z.enum(["UNVERIFIED", "PENDING", "VERIFIED", "REJECTED"]),
  verificationEvidence: z.string().nullable(),
  wclId: idSchema,
  wclCanonicalId: idSchema,
  availableSpecs: z.array(
    z.object({
      id: z.number().int(),
      name: z.string(),
      iconUrl: z.string().url().nullable(),
      role: roleSchema.nullable(),
    }),
  ),
});
export type CharacterSummary = z.infer<typeof characterSummarySchema>;
export const characterListSchema = z.array(characterSummarySchema);

export const activitySignupSchema = z.object({
  id: idSchema,
  userId: idSchema,
  memberName: z.string(),
  character: characterSummarySchema,
  preferredRole: roleSchema.nullable(),
  preferredSpecId: z.number().int().nullable(),
  groupNo: z.number().int().nullable(),
  orderIndex: z.number().int(),
  status: signupStatusSchema,
  note: z.string().nullable(),
  officerNote: z.string().nullable().optional(),
  decisionReason: z.string().nullable().optional(),
  signedUpAt: isoDateTimeSchema,
  choices: z.array(
    z.object({
      character: characterSummarySchema,
      specId: z.number().int(),
      priority: z.number().int(),
    }),
  ),
});
export type ActivitySignup = z.infer<typeof activitySignupSchema>;

export const activityDetailSchema = z.object({
  id: idSchema,
  name: z.string(),
  type: activityTypeCodeSchema,
  status: activityStatusSchema,
  description: z.string().nullable(),
  passphrase: z.string().nullable(),
  beginAt: isoDateTimeSchema,
  endAt: isoDateTimeSchema,
  teamUpAt: isoDateTimeSchema,
  signupDeadline: isoDateTimeSchema.nullable(),
  maxPlayers: z.number().int(),
  tankSlots: z.number().int().nullable(),
  healerSlots: z.number().int().nullable(),
  meleeSlots: z.number().int().nullable(),
  rangedSlots: z.number().int().nullable(),
  attendanceEnabled: z.boolean(),
  rosterLockedAt: isoDateTimeSchema.nullable(),
  version: z.number().int(),
  creator: z.object({ id: idSchema, name: z.string() }),
  canManage: z.boolean(),
  canSignup: z.boolean(),
  canChangeMySignup: z.boolean(),
  mySignup: activitySignupSchema.nullable(),
  signups: z.array(activitySignupSchema),
  raid: z.lazy(() => raidActivityDetailSchema).nullable(),
});
export type ActivityDetail = z.infer<typeof activityDetailSchema>;

const activityFieldsSchema = z.object({
  name: z.string().trim().min(2).max(64),
  type: activityTypeCodeSchema,
  description: z.string().trim().max(10_000).optional(),
  passphrase: z.string().trim().max(255).nullable().optional(),
  beginAt: isoDateTimeSchema,
  teamUpAt: isoDateTimeSchema.optional(),
  signupDeadline: isoDateTimeSchema,
  durationMinutes: z.number().int().min(30).max(1440).multipleOf(30).default(120),
  maxPlayers: z.number().int().min(1).max(100),
  tankSlots: z.number().int().min(0).max(100).nullable().optional(),
  healerSlots: z.number().int().min(0).max(100).nullable().optional(),
  meleeSlots: z.number().int().min(0).max(100).nullable().optional(),
  rangedSlots: z.number().int().min(0).max(100).nullable().optional(),
  attendanceEnabled: z.boolean().optional(),
  raid: z
    .object({
      progressPlanId: idSchema,
      mode: z.enum(["PROGRESSION", "FARM"]),
      targets: z
        .array(
          z.object({
            bossId: idSchema,
            orderIndex: z.number().int().min(0).max(100),
            targetCount: z.number().int().min(1).max(100).nullable().optional(),
            strategyVersionId: idSchema.nullable(),
          }),
        )
        .min(1)
        .max(20),
    })
    .optional(),
});

export const createActivitySchema = activityFieldsSchema.superRefine((value, context) => {
  const isRaid = value.type === "raid_progress" || value.type === "raid_farm";
  if (isRaid && !value.raid) {
    context.addIssue({ code: "custom", path: ["raid"], message: "团本活动必须选择进度计划和目标 Boss" });
  }
  if (!isRaid && value.raid) {
    context.addIssue({ code: "custom", path: ["raid"], message: "只有团本活动可以配置 Boss 目标" });
  }
  if (value.raid) {
    const bossIds = value.raid.targets.map((target) => target.bossId);
    if (new Set(bossIds).size !== bossIds.length) {
      context.addIssue({ code: "custom", path: ["raid", "targets"], message: "同一活动不能重复选择 Boss" });
    }
  }
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
export const createRaidActivitySchema = createActivitySchema;
export type CreateActivityInput = z.infer<typeof createRaidActivitySchema>;

export const updateActivitySchema = activityFieldsSchema.partial().extend({ version: z.number().int().positive() });
export type UpdateActivityInput = z.infer<typeof updateActivitySchema>;

export const raidActivityDetailSchema = z.object({
  progressPlanId: idSchema,
  raidName: z.string(),
  difficulty: z.enum(["HEROIC", "MYTHIC"]),
  mode: z.enum(["PROGRESSION", "FARM"]),
  targets: z.array(
    z.object({
      id: idSchema,
      bossId: idSchema,
      bossName: z.string(),
      wclId: z.number().int(),
      orderIndex: z.number().int(),
      strategyName: z.string(),
      strategyVersionNo: z.number().int().nullable(),
      strategySnapshotId: idSchema.nullable(),
      blocks: z.array(
        z.object({
          type: z.string(),
          title: z.string(),
          orderIndex: z.number().int(),
          config: z.record(z.string(), z.unknown()).nullable(),
          markdown: z.string().nullable(),
        }),
      ),
    }),
  ),
});

export const createCharacterSchema = z.object({
  name: z.string().trim().min(2).max(64),
  serverSlug: z.string().trim().min(2).max(64),
  serverRegion: z.string().trim().min(2).max(16).default("cn"),
  isMain: z.boolean().default(false),
});
export type CreateCharacterInput = z.infer<typeof createCharacterSchema>;

export const wclAuthorizeSchema = z.object({ authorizationUrl: z.string().url() });
export const wclLinkStatusSchema = z.object({
  linked: z.boolean(),
  wclUserId: z.number().int().nullable(),
  wclUsername: z.string().nullable(),
  linkedAt: isoDateTimeSchema.nullable(),
  lastVerifiedAt: isoDateTimeSchema.nullable(),
});
export const wclCharacterSearchSchema = z.object({
  name: z.string().trim().min(2).max(64),
  serverSlug: z.string().trim().min(2).max(64),
  serverRegion: z.string().trim().min(2).max(16).default("cn"),
});
export const wclCharacterCandidateSchema = z.object({
  name: z.string(),
  realm: z.string(),
  serverSlug: z.string(),
  serverRegion: z.string(),
  classId: z.number().int(),
  className: z.string(),
  classIconUrl: z.string().url().nullable(),
  classColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullable(),
  faction: z.number().int().nullable(),
  guildNames: z.array(z.string()),
  level: z.number().int().nullable(),
  raceName: z.string().nullable(),
  gender: z.string().nullable(),
  guildName: z.string().nullable(),
  guildServerName: z.string().nullable(),
  guildServerSlug: z.string().nullable(),
  activeSpecName: z.string().nullable(),
  activeTitle: z.string().nullable(),
  serverTypeName: z.string().nullable(),
  itemLevel: z.number().int().nullable(),
  averageItemLevel: z.number().int().nullable(),
  lastLoginAt: isoDateTimeSchema.nullable(),
  achievementPoints: z.number().int().nullable(),
  wclId: idSchema,
  wclCanonicalId: idSchema,
});
export const wclServerQuerySchema = z.object({ search: z.string().trim().max(64).optional() });
export const wclServerSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  slug: z.string(),
  region: z.string(),
  blizzardId: z.number().int().nullable(),
  connectedRealmId: z.number().int().nullable(),
});
export const wclServerListSchema = z.array(wclServerSchema);
export const wclReferenceSyncResultSchema = z.object({
  serverCount: z.number().int(),
  classCount: z.number().int(),
  specCount: z.number().int(),
});
export const characterVerificationDecisionSchema = z.object({
  approved: z.boolean(),
  note: z.string().trim().max(255).nullable().optional(),
});

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
export const guildGroupSchema = z.object({
  id: idSchema,
  name: z.string(),
  code: z.string(),
  description: z.string().nullable(),
  isActive: z.boolean(),
  sort: z.number().int(),
});
export const guildGroupListSchema = z.array(guildGroupSchema);
export const memberListSchema = z.object({
  items: z.array(
    z.object({
      id: idSchema,
      name: z.string().nullable(),
      wxNickname: z.string().nullable(),
      guildNickname: z.string().nullable(),
      avatar: z.string().nullable(),
      privilege: privilegeSchema,
      characters: z.array(characterSummarySchema),
      groups: z.array(guildGroupSchema.pick({ id: true, name: true, code: true })),
    }),
  ),
  pagination: z.object({ page: z.number(), pageSize: z.number(), total: z.number() }),
});
export const pendingMemberListSchema = z.object({
  items: z.array(
    z.object({
      id: idSchema,
      name: z.string().nullable(),
      wxNickname: z.string().nullable(),
      guildNickname: z.string().nullable(),
      avatar: z.string().nullable(),
      createdAt: isoDateTimeSchema,
    }),
  ),
  pagination: z.object({ page: z.number(), pageSize: z.number(), total: z.number() }),
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
    preferredSpecId: z.number().int().positive(),
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
  preferredSpecId: z.number().int().positive(),
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
  activities: z.array(
    z.object({
      id: idSchema,
      name: z.string(),
      beginAt: isoDateTimeSchema,
      status: attendanceStatusSchema,
    }),
  ),
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
  canManage: z.boolean(),
  records: z.array(
    z.object({
      id: idSchema,
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
export type AttendanceRecordList = z.infer<typeof attendanceRecordListSchema>;

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

export const wclReportSummarySchema = z.object({
  id: idSchema,
  reportCode: z.string(),
  status: z.number().int().min(0).max(3),
  importedAt: isoDateTimeSchema.nullable(),
  errorMessage: z.string().nullable(),
  createdAt: isoDateTimeSchema,
});
export const wclReportListSchema = z.array(wclReportSummarySchema);
export const wclReportDetailSchema = wclReportSummarySchema.extend({
  activityId: idSchema,
  region: z.literal("CN"),
  serverId: z.literal(569),
  summary: z.record(z.string(), z.unknown()).nullable(),
  actors: z.array(
    z.object({
      actorId: idSchema,
      actorName: z.string(),
      realmName: z.string().nullable(),
      characterId: idSchema.nullable(),
      matchStatus: z.number().int().min(0).max(2),
      character: z.object({ id: idSchema, name: z.string(), realm: z.string() }).nullable(),
    }),
  ),
  suggestions: z.array(
    z.object({
      userId: idSchema,
      memberName: z.string(),
      characterId: idSchema.nullable(),
      status: attendanceStatusSchema,
      appliedAt: isoDateTimeSchema.nullable(),
    }),
  ),
});
export type WclReportDetail = z.infer<typeof wclReportDetailSchema>;

export const siteSettingKeySchema = z.enum(["guild_profile", "recruitment", "contact", "tool_links"]);
export const siteSettingSchema = z.object({ key: siteSettingKeySchema, value: z.record(z.string(), z.unknown()) });
export const siteSettingValueSchema = z.record(z.string(), z.unknown());

export const guildProfileSchema = z
  .object({
    name: z.string().default("The Twilight Zone"),
    tagline: z.string().default("用有限的时间，打出值得记住的开荒。"),
    description: z.string().default("伊森利恩部落公会，重视效率、体验与长期稳定。"),
    realm: z.string().default("伊森利恩"),
    faction: z.string().default("部落"),
    schedule: z.array(z.string()).default([]),
    highlights: z.array(z.string()).default([]),
  })
  .passthrough();
export const recruitmentSettingSchema = z
  .object({
    title: z.string().default("加入 TTZ"),
    description: z.string().default("欢迎稳定、友善并愿意共同进步的玩家。"),
    needs: z
      .array(z.object({ role: z.string(), priority: z.string().optional(), description: z.string().optional() }))
      .default([]),
    requirements: z.array(z.string()).default([]),
    ngaUrl: z.string().url().nullable().optional(),
  })
  .passthrough();
export const contactSettingSchema = z
  .object({
    email: z.string().email().nullable().optional(),
    wechatLabel: z.string().nullable().optional(),
    wechatQrUrl: z.string().url().nullable().optional(),
  })
  .passthrough();
export const toolLinkSchema = z.object({ name: z.string(), url: z.string().url(), description: z.string().optional() });
export const toolLinksSettingSchema = z.object({ links: z.array(toolLinkSchema).default([]) }).passthrough();
export const wclGuildProgressSettingSchema = z.object({
  guildId: z.number().int().positive(),
  guildName: z.string().trim().min(1).max(128),
  serverId: z.number().int().positive(),
  serverName: z.string().trim().min(1).max(64),
  serverSlug: z.string().trim().min(1).max(64),
  serverRegion: z.string().trim().min(1).max(16),
  zoneId: z.number().int().positive(),
  season: z.string().trim().min(1).max(32),
});
export type WclGuildProgressSetting = z.infer<typeof wclGuildProgressSettingSchema>;

const raidBossPhaseDataSchema = z.object({
  phases: z.array(z.object({ id: z.number().int(), name: z.string(), isIntermission: z.boolean() })),
  transitions: z.array(z.object({ phaseId: z.number().int(), offsetMs: z.number().int().nonnegative() })),
});

export const raidBossPullPhaseSchema = z.object({
  phaseId: z.number().int().nullable(),
  phaseNumber: z.number().int().positive().nullable(),
  phaseName: z.string().nullable(),
  isIntermission: z.boolean().nullable(),
});
export const raidBossBestPullGraphSchema = z.object({
  pull: z.number().int().positive(),
  selection: z.enum(["FIRST_KILL", "LOWEST_HEALTH"]),
  kill: z.boolean(),
  bossPercent: z.number().min(0).max(100).nullable(),
  fightPercent: z.number().min(0).max(100).nullable(),
  durationMs: z.number().int().positive(),
  reportCode: z.string(),
  fightId: z.number().int().positive(),
  phaseData: raidBossPhaseDataSchema.nullable(),
  points: z.array(
    z.object({
      timeMs: z.number().int().nonnegative(),
      dps: z.number().nonnegative(),
      hps: z.number().nonnegative(),
      dtps: z.number().nonnegative(),
    }),
  ),
});
export const raidDifficultySchema = z.enum(["HEROIC", "MYTHIC"]);
export const raidPlanCreateSchema = z.object({
  raidId: idSchema,
  difficulty: raidDifficultySchema,
  season: z.string().trim().min(1).max(32),
  name: z.string().trim().min(2).max(128),
});
export const raidBossAttemptListSchema = z.array(
  z.object({
    pull: z.number().int().positive(),
    startedAt: isoDateTimeSchema,
    durationMs: z.number().int().nonnegative(),
    kill: z.boolean(),
    bossPercent: z.number().min(0).max(100).nullable(),
    fightPercent: z.number().min(0).max(100).nullable(),
    phaseData: raidBossPhaseDataSchema.nullable(),
    reportCode: z.string().nullable(),
    fightId: z.number().int().positive().nullable(),
  }),
);
export const raidEpicTimelineSchema = z
  .object({
    id: idSchema,
    raidId: idSchema,
    raidName: z.string(),
    raidIcon: z.string().nullable(),
    raidBackground: z.string().nullable(),
    zoneId: z.number().int().nullable(),
    difficulty: raidDifficultySchema,
    season: z.string(),
    name: z.string(),
    status: z.string(),
    startedAt: isoDateTimeSchema,
    completedAt: isoDateTimeSchema.nullable(),
    lastSyncedAt: isoDateTimeSchema.nullable(),
    bosses: z.array(
      z.object({
        progressId: idSchema,
        id: idSchema,
        wclId: z.number().int(),
        name: z.string(),
        icon: z.string().nullable(),
        orderIndex: z.number().int(),
        attemptCount: z.number().int().nonnegative(),
        pullPhases: z.array(raidBossPullPhaseSchema),
        status: z.enum(["NOT_STARTED", "PROGRESSING", "DEFEATED"]),
        bestPercent: z.number().nullable(),
        bestPhaseNumber: z.number().int().positive().nullable(),
        bestPhaseIsIntermission: z.boolean().nullable(),
        firstKillAt: isoDateTimeSchema.nullable(),
        lastKillAt: isoDateTimeSchema.nullable(),
        manuallyOverridden: z.boolean(),
        defaultStrategy: z.object({ id: idSchema, name: z.string() }).nullable(),
      }),
    ),
  })
  .nullable();
export const raidBossManualOverrideSchema = z.object({
  status: z.enum(["NOT_STARTED", "PROGRESSING", "DEFEATED"]).nullable(),
  bestPercent: z.number().min(0).max(100).nullable(),
  firstKillAt: isoDateTimeSchema.nullable(),
  lastKillAt: isoDateTimeSchema.nullable(),
  reason: z.string().trim().max(255).nullable(),
});
export const bossStrategyCreateSchema = z.object({
  progressPlanId: idSchema,
  bossId: idSchema,
  name: z.string().trim().min(2).max(128),
  description: z.string().trim().max(500).nullable().optional(),
});
export const raidGuildSettingsSchema = wclGuildProgressSettingSchema.extend({
  source: z.enum(["DATABASE", "ENVIRONMENT"]).optional(),
  updatedAt: isoDateTimeSchema.nullable().optional(),
});
export const createStrategyInputSchema = bossStrategyCreateSchema;
export const strategyVersionDtoSchema = z.object({
  id: idSchema,
  strategyId: idSchema,
  versionNo: z.number().int(),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]),
  changeSummary: z.string().nullable(),
  createdAt: isoDateTimeSchema,
  publishedAt: isoDateTimeSchema.nullable(),
  blocks: z.array(
    z.object({
      id: idSchema,
      type: z.string(),
      title: z.string(),
      orderIndex: z.number().int(),
      config: z.record(z.string(), z.unknown()).nullable(),
      markdown: z.string().nullable(),
    }),
  ),
  slots: z.array(
    z.object({
      id: idSchema,
      slotKey: z.string(),
      label: z.string(),
      roleConstraint: z.number().int().nullable(),
      isRequired: z.boolean(),
      orderIndex: z.number().int(),
    }),
  ),
});
export const bossStrategyVersionSaveSchema = z.object({
  changeSummary: z.string().trim().max(500).nullable().optional(),
  slots: z
    .array(
      z.object({
        slotKey: z.string().trim().min(1).max(64),
        label: z.string().trim().min(1).max(128),
        roleConstraint: z.number().int().min(1).max(4).nullable().optional(),
        isRequired: z.boolean(),
        orderIndex: z.number().int().min(0).max(1000),
      }),
    )
    .max(200)
    .refine((slots) => new Set(slots.map((slot) => slot.slotKey)).size === slots.length, "槽位键不能重复"),
  blocks: z
    .array(
      z.object({
        type: z.enum(["POSITIONING", "RAID_GROUPS", "SEQUENCE", "TIMELINE", "NOTES"]),
        title: z.string().trim().min(1).max(128),
        orderIndex: z.number().int().min(0).max(1000),
        config: z.record(z.string(), z.unknown()).nullable().optional(),
        markdown: z.string().max(200_000).nullable().optional(),
      }),
    )
    .max(50),
});
export const raidTargetCreateSchema = z.object({
  bossId: idSchema,
  orderIndex: z.number().int().min(0).max(100),
  targetCount: z.number().int().min(1).max(100).nullable().optional(),
  strategyVersionId: idSchema.nullable(),
});
export const raidActivityInputSchema = z
  .object({
    progressPlanId: idSchema,
    mode: z.enum(["PROGRESSION", "FARM"]),
    targets: z.array(raidTargetCreateSchema).min(1).max(20),
  })
  .superRefine((value, context) => {
    if (new Set(value.targets.map((target) => target.bossId)).size !== value.targets.length) {
      context.addIssue({ code: "custom", path: ["targets"], message: "活动目标 Boss 不能重复" });
    }
  });
export const publicProgressSchema = z.object({
  source: z.literal("WCL"),
  region: z.literal("CN"),
  serverId: z.literal(569),
  reports: z.array(
    z.object({
      reportCode: z.string(),
      activityName: z.string(),
      beginAt: isoDateTimeSchema,
      summary: z.record(z.string(), z.unknown()).nullable(),
    }),
  ),
});

export const announcementStatusSchema = z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]);
export const announcementInputSchema = z
  .object({
    title: z.string().trim().min(2).max(128),
    content: z.string().trim().min(1).max(50_000),
    status: announcementStatusSchema,
    audienceType: z.enum(["ALL", "GROUPS"]),
    groupIds: z.array(idSchema).max(50).default([]),
    isPinned: z.boolean().default(false),
    publishAt: isoDateTimeSchema,
    expireAt: isoDateTimeSchema.nullable().optional(),
  })
  .superRefine((value, context) => {
    if (new Set(value.groupIds).size !== value.groupIds.length) {
      context.addIssue({ code: "custom", path: ["groupIds"], message: "公告身份组不能重复" });
    }
    if (value.audienceType === "GROUPS" && !value.groupIds.length) {
      context.addIssue({ code: "custom", path: ["groupIds"], message: "按身份组投放时至少选择一个身份组" });
    }
    if (value.expireAt && new Date(value.expireAt) <= new Date(value.publishAt)) {
      context.addIssue({ code: "custom", path: ["expireAt"], message: "公告到期时间必须晚于发布时间" });
    }
  });
export type AnnouncementInput = z.infer<typeof announcementInputSchema>;
export const announcementSchema = z.object({
  id: idSchema,
  title: z.string(),
  content: z.string(),
  status: announcementStatusSchema,
  audienceType: z.enum(["ALL", "GROUPS"]),
  isPinned: z.boolean(),
  publishAt: isoDateTimeSchema,
  expireAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  groupIds: z.array(idSchema),
  canManage: z.boolean(),
});
export const announcementListSchema = z.array(announcementSchema);

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.literal("ttz-api"),
  timestamp: z.string().datetime(),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;
