-- 修复此前应用层将 WCL 阵营写反的数据：本站统一约定 0=部落、1=联盟。
UPDATE `characters`
SET `faction` = CASE `faction` WHEN 0 THEN 1 WHEN 1 THEN 0 ELSE `faction` END
WHERE `faction` IN (0, 1);

-- 为所有尚无说明的业务字段补齐数据库 COMMENT。Prisma 内部表 _prisma_migrations 不属于业务表。
ALTER TABLE `activity_casual_ext`
  MODIFY COLUMN `activity_id` bigint unsigned NOT NULL COMMENT '活动ID';

ALTER TABLE `activity_mythic_plus_ext`
  MODIFY COLUMN `activity_id` bigint unsigned NOT NULL COMMENT '活动ID';

ALTER TABLE `activity_signup_choices`
  MODIFY COLUMN `id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  MODIFY COLUMN `signup_id` bigint unsigned NOT NULL COMMENT '报名ID',
  MODIFY COLUMN `character_id` bigint unsigned NOT NULL COMMENT '角色ID',
  MODIFY COLUMN `spec_id` int NOT NULL COMMENT '专精ID',
  MODIFY COLUMN `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间';

ALTER TABLE `activity_signups`
  MODIFY COLUMN `id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  MODIFY COLUMN `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  MODIFY COLUMN `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间';

ALTER TABLE `activity_types`
  MODIFY COLUMN `sort` int DEFAULT 0 COMMENT '排序值',
  MODIFY COLUMN `is_active` int DEFAULT 1 COMMENT '是否启用：0否，1是',
  MODIFY COLUMN `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间';

ALTER TABLE `announcement_groups`
  MODIFY COLUMN `announcement_id` bigint unsigned NOT NULL COMMENT '公告ID',
  MODIFY COLUMN `group_id` bigint unsigned NOT NULL COMMENT '分组ID';

ALTER TABLE `announcements`
  MODIFY COLUMN `id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  MODIFY COLUMN `title` varchar(128) NOT NULL COMMENT '标题',
  MODIFY COLUMN `is_pinned` tinyint NOT NULL DEFAULT 0 COMMENT '是否置顶：0否，1是',
  MODIFY COLUMN `publish_at` datetime NOT NULL COMMENT '发布时间',
  MODIFY COLUMN `expire_at` datetime DEFAULT NULL COMMENT '失效时间',
  MODIFY COLUMN `created_by` bigint unsigned NOT NULL COMMENT '创建人用户ID',
  MODIFY COLUMN `updated_by` bigint unsigned NOT NULL COMMENT '最后更新人用户ID',
  MODIFY COLUMN `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  MODIFY COLUMN `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间';

ALTER TABLE `attendance_records`
  MODIFY COLUMN `id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  MODIFY COLUMN `activity_id` bigint unsigned NOT NULL COMMENT '活动ID',
  MODIFY COLUMN `signup_id` bigint unsigned DEFAULT NULL COMMENT '报名ID',
  MODIFY COLUMN `user_id` bigint unsigned NOT NULL COMMENT '用户ID',
  MODIFY COLUMN `character_id` bigint unsigned DEFAULT NULL COMMENT '角色ID',
  MODIFY COLUMN `spec_id` int DEFAULT NULL COMMENT '专精ID',
  MODIFY COLUMN `wcl_report_id` bigint unsigned DEFAULT NULL COMMENT 'WCL报告ID',
  MODIFY COLUMN `character_name_snapshot` varchar(64) DEFAULT NULL COMMENT '角色名称快照',
  MODIFY COLUMN `realm_snapshot` varchar(64) DEFAULT NULL COMMENT '服务器名称快照',
  MODIFY COLUMN `spec_name_snapshot` varchar(25) DEFAULT NULL COMMENT '专精名称快照',
  MODIFY COLUMN `source` tinyint NOT NULL DEFAULT 0 COMMENT '数据来源：0人工，1 WCL',
  MODIFY COLUMN `note` varchar(255) DEFAULT NULL COMMENT '备注',
  MODIFY COLUMN `recorded_by` bigint unsigned NOT NULL COMMENT '记录人用户ID',
  MODIFY COLUMN `recorded_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '记录时间',
  MODIFY COLUMN `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  MODIFY COLUMN `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  MODIFY COLUMN `manually_confirmed` tinyint(1) NOT NULL DEFAULT 0 COMMENT '是否人工确认出勤';

ALTER TABLE `auth_sessions`
  MODIFY COLUMN `id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  MODIFY COLUMN `user_id` bigint unsigned NOT NULL COMMENT '用户ID',
  MODIFY COLUMN `access_token_hash` char(64) NOT NULL COMMENT '访问令牌哈希',
  MODIFY COLUMN `refresh_token_hash` char(64) DEFAULT NULL COMMENT '刷新令牌哈希',
  MODIFY COLUMN `access_expires_at` datetime NOT NULL COMMENT '访问令牌过期时间',
  MODIFY COLUMN `refresh_expires_at` datetime DEFAULT NULL COMMENT '刷新令牌过期时间',
  MODIFY COLUMN `revoked_at` datetime DEFAULT NULL COMMENT '会话撤销时间',
  MODIFY COLUMN `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  MODIFY COLUMN `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间';

ALTER TABLE `bosses`
  MODIFY COLUMN `id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  MODIFY COLUMN `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  MODIFY COLUMN `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间';

ALTER TABLE `characters`
  MODIFY COLUMN `id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  MODIFY COLUMN `server_name` varchar(64) NOT NULL COMMENT '服务器中文名',
  MODIFY COLUMN `server_slug` varchar(64) NOT NULL COMMENT 'WCL服务器slug',
  MODIFY COLUMN `server_region` varchar(16) NOT NULL DEFAULT 'cn' COMMENT '服务器区域代码',
  MODIFY COLUMN `class_id` int NOT NULL COMMENT '本地职业ID',
  MODIFY COLUMN `race_id` int DEFAULT NULL COMMENT '本地种族ID',
  MODIFY COLUMN `race_name` varchar(64) DEFAULT NULL COMMENT 'WCL种族名称',
  MODIFY COLUMN `gender` varchar(16) DEFAULT NULL COMMENT 'WCL性别名称',
  MODIFY COLUMN `guild_name` varchar(128) DEFAULT NULL COMMENT 'WCL公会名称',
  MODIFY COLUMN `guild_server_name` varchar(64) DEFAULT NULL COMMENT 'WCL公会服务器中文名',
  MODIFY COLUMN `guild_server_slug` varchar(64) DEFAULT NULL COMMENT 'WCL公会服务器slug',
  MODIFY COLUMN `active_spec_name` varchar(64) DEFAULT NULL COMMENT 'WCL当前专精名称',
  MODIFY COLUMN `level` int DEFAULT NULL COMMENT '角色等级',
  MODIFY COLUMN `active_title` varchar(128) DEFAULT NULL COMMENT 'WCL当前称号',
  MODIFY COLUMN `server_type_name` varchar(64) DEFAULT NULL COMMENT 'WCL游戏版本名称',
  MODIFY COLUMN `wcl_id` bigint unsigned NOT NULL COMMENT 'WCL角色ID',
  MODIFY COLUMN `wcl_canonical_id` bigint unsigned NOT NULL COMMENT 'WCL角色规范ID',
  MODIFY COLUMN `wcl_verification_status` tinyint NOT NULL DEFAULT 0 COMMENT 'WCL验证状态：0未验证，1待审核，2已验证，3拒绝',
  MODIFY COLUMN `wcl_verified_at` datetime DEFAULT NULL COMMENT 'WCL验证时间',
  MODIFY COLUMN `wcl_evidence` varchar(16) DEFAULT NULL COMMENT 'WCL验证证据类型',
  MODIFY COLUMN `wcl_verified_by` bigint unsigned DEFAULT NULL COMMENT '验证管理员用户ID',
  MODIFY COLUMN `wcl_verification_note` varchar(255) DEFAULT NULL COMMENT 'WCL验证备注',
  MODIFY COLUMN `average_item_level` int DEFAULT NULL COMMENT 'WCL平均物品等级',
  MODIFY COLUMN `last_login_at` datetime DEFAULT NULL COMMENT 'WCL最后登录时间',
  MODIFY COLUMN `achievement_points` int DEFAULT NULL COMMENT 'WCL成就点数',
  MODIFY COLUMN `game_data` json DEFAULT NULL COMMENT 'WCL原始gameData JSON',
  MODIFY COLUMN `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  MODIFY COLUMN `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间';

ALTER TABLE `classes`
  MODIFY COLUMN `id` int NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  MODIFY COLUMN `wcl_id` int DEFAULT NULL COMMENT 'WCL职业ID',
  MODIFY COLUMN `wcl_slug` varchar(32) DEFAULT NULL COMMENT 'WCL职业slug';

ALTER TABLE `dungeons`
  MODIFY COLUMN `id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  MODIFY COLUMN `sort` int DEFAULT 0 COMMENT '排序值',
  MODIFY COLUMN `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  MODIFY COLUMN `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间';

ALTER TABLE `guild_group_members`
  MODIFY COLUMN `id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  MODIFY COLUMN `group_id` bigint unsigned NOT NULL COMMENT '分组ID',
  MODIFY COLUMN `user_id` bigint unsigned NOT NULL COMMENT '用户ID',
  MODIFY COLUMN `added_by` bigint unsigned DEFAULT NULL COMMENT '添加人用户ID',
  MODIFY COLUMN `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间';

ALTER TABLE `guild_groups`
  MODIFY COLUMN `id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  MODIFY COLUMN `description` varchar(255) DEFAULT NULL COMMENT '分组说明',
  MODIFY COLUMN `is_active` tinyint NOT NULL DEFAULT 1 COMMENT '是否启用：0否，1是',
  MODIFY COLUMN `sort` int NOT NULL DEFAULT 0 COMMENT '排序值',
  MODIFY COLUMN `created_by` bigint unsigned DEFAULT NULL COMMENT '创建人用户ID',
  MODIFY COLUMN `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  MODIFY COLUMN `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间';

ALTER TABLE `login_session`
  MODIFY COLUMN `id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  MODIFY COLUMN `browser_secret_hash` char(64) DEFAULT NULL COMMENT '浏览器端登录密钥哈希',
  MODIFY COLUMN `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  MODIFY COLUMN `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间';

ALTER TABLE `notification_deliveries`
  MODIFY COLUMN `id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  MODIFY COLUMN `user_id` bigint unsigned NOT NULL COMMENT '用户ID',
  MODIFY COLUMN `business_id` bigint unsigned NOT NULL COMMENT '业务对象ID',
  MODIFY COLUMN `payload_json` json NOT NULL COMMENT '通知载荷JSON',
  MODIFY COLUMN `status` tinyint NOT NULL DEFAULT 0 COMMENT '投递状态码',
  MODIFY COLUMN `attempts` tinyint unsigned NOT NULL DEFAULT 0 COMMENT '投递尝试次数',
  MODIFY COLUMN `error_message` varchar(1000) DEFAULT NULL COMMENT '错误信息',
  MODIFY COLUMN `scheduled_at` datetime NOT NULL COMMENT '计划发送时间',
  MODIFY COLUMN `sent_at` datetime DEFAULT NULL COMMENT '实际发送时间',
  MODIFY COLUMN `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  MODIFY COLUMN `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间';

ALTER TABLE `notification_preferences`
  MODIFY COLUMN `user_id` bigint unsigned NOT NULL COMMENT '用户ID',
  MODIFY COLUMN `activity_published` tinyint NOT NULL DEFAULT 1 COMMENT '是否订阅活动发布通知',
  MODIFY COLUMN `signup_result` tinyint NOT NULL DEFAULT 1 COMMENT '是否订阅报名结果通知',
  MODIFY COLUMN `before_team_up` tinyint NOT NULL DEFAULT 1 COMMENT '是否订阅集合前提醒',
  MODIFY COLUMN `activity_cancelled` tinyint NOT NULL DEFAULT 1 COMMENT '是否订阅活动取消通知',
  MODIFY COLUMN `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间';

ALTER TABLE `races`
  MODIFY COLUMN `id` int NOT NULL COMMENT '主键ID',
  MODIFY COLUMN `name` varchar(32) NOT NULL COMMENT '种族中文名',
  MODIFY COLUMN `en_name` varchar(32) DEFAULT NULL COMMENT '种族英文名',
  MODIFY COLUMN `faction` tinyint DEFAULT NULL COMMENT '阵营：0部落，1联盟',
  MODIFY COLUMN `icon` varchar(255) DEFAULT NULL COMMENT '图标地址';

ALTER TABLE `raids`
  MODIFY COLUMN `id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  MODIFY COLUMN `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  MODIFY COLUMN `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间';

ALTER TABLE `site_settings`
  MODIFY COLUMN `json_value` json NOT NULL COMMENT '设置项JSON值',
  MODIFY COLUMN `updated_by` bigint unsigned DEFAULT NULL COMMENT '最后更新人用户ID',
  MODIFY COLUMN `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  MODIFY COLUMN `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间';

ALTER TABLE `specs`
  MODIFY COLUMN `wcl_id` int DEFAULT NULL COMMENT '职业内WCL专精ID',
  MODIFY COLUMN `wcl_slug` varchar(32) DEFAULT NULL COMMENT 'WCL专精slug';

ALTER TABLE `wcl_attendance_suggestions`
  MODIFY COLUMN `id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  MODIFY COLUMN `report_id` bigint unsigned NOT NULL COMMENT 'WCL报告ID',
  MODIFY COLUMN `user_id` bigint unsigned NOT NULL COMMENT '用户ID',
  MODIFY COLUMN `character_id` bigint unsigned DEFAULT NULL COMMENT '角色ID',
  MODIFY COLUMN `status` tinyint NOT NULL DEFAULT 1 COMMENT '建议的出勤状态码',
  MODIFY COLUMN `applied_at` datetime DEFAULT NULL COMMENT '建议应用时间',
  MODIFY COLUMN `applied_by` bigint unsigned DEFAULT NULL COMMENT '应用人用户ID',
  MODIFY COLUMN `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  MODIFY COLUMN `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间';

ALTER TABLE `wcl_oauth_sessions`
  MODIFY COLUMN `id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  MODIFY COLUMN `user_id` bigint unsigned NOT NULL COMMENT '用户ID',
  MODIFY COLUMN `state_hash` char(64) NOT NULL COMMENT 'OAuth state哈希',
  MODIFY COLUMN `code_verifier` varchar(255) NOT NULL COMMENT '加密后的PKCE verifier',
  MODIFY COLUMN `redirect_uri` varchar(255) NOT NULL COMMENT 'OAuth回调地址',
  MODIFY COLUMN `expires_at` datetime NOT NULL COMMENT '过期时间',
  MODIFY COLUMN `consumed_at` datetime DEFAULT NULL COMMENT '消费时间',
  MODIFY COLUMN `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间';

ALTER TABLE `wcl_report_actors`
  MODIFY COLUMN `id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  MODIFY COLUMN `report_id` bigint unsigned NOT NULL COMMENT 'WCL报告ID',
  MODIFY COLUMN `actor_name` varchar(64) NOT NULL COMMENT 'WCL角色名称',
  MODIFY COLUMN `realm_name` varchar(64) DEFAULT NULL COMMENT 'WCL服务器名称',
  MODIFY COLUMN `character_id` bigint unsigned DEFAULT NULL COMMENT '角色ID',
  MODIFY COLUMN `matched_by` bigint unsigned DEFAULT NULL COMMENT '匹配人用户ID',
  MODIFY COLUMN `matched_at` datetime DEFAULT NULL COMMENT '角色匹配时间',
  MODIFY COLUMN `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  MODIFY COLUMN `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间';

ALTER TABLE `wcl_reports`
  MODIFY COLUMN `id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  MODIFY COLUMN `activity_id` bigint unsigned NOT NULL COMMENT '活动ID',
  MODIFY COLUMN `report_code` varchar(32) NOT NULL COMMENT 'WCL报告代码',
  MODIFY COLUMN `region` varchar(8) NOT NULL DEFAULT 'CN' COMMENT '区域代码',
  MODIFY COLUMN `server_id` int NOT NULL DEFAULT 569 COMMENT 'WCL服务器ID',
  MODIFY COLUMN `status` tinyint NOT NULL DEFAULT 0 COMMENT '导入状态码',
  MODIFY COLUMN `report_start_at` datetime DEFAULT NULL COMMENT '报告开始时间',
  MODIFY COLUMN `report_end_at` datetime DEFAULT NULL COMMENT '报告结束时间',
  MODIFY COLUMN `imported_at` datetime DEFAULT NULL COMMENT '报告导入完成时间',
  MODIFY COLUMN `error_message` text COMMENT '错误信息',
  MODIFY COLUMN `created_by` bigint unsigned NOT NULL COMMENT '创建人用户ID',
  MODIFY COLUMN `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  MODIFY COLUMN `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间';

ALTER TABLE `wcl_servers`
  MODIFY COLUMN `id` int NOT NULL COMMENT 'WCL服务器ID',
  MODIFY COLUMN `name` varchar(64) NOT NULL COMMENT '服务器中文名',
  MODIFY COLUMN `slug` varchar(64) NOT NULL COMMENT 'WCL服务器slug',
  MODIFY COLUMN `region` varchar(16) NOT NULL DEFAULT 'cn' COMMENT '区域代码',
  MODIFY COLUMN `blizzard_id` int DEFAULT NULL COMMENT '暴雪服务器ID',
  MODIFY COLUMN `connected_realm_id` int DEFAULT NULL COMMENT '暴雪连接服务器ID',
  MODIFY COLUMN `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  MODIFY COLUMN `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间';

ALTER TABLE `wcl_user_links`
  MODIFY COLUMN `id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  MODIFY COLUMN `user_id` bigint unsigned NOT NULL COMMENT '用户ID',
  MODIFY COLUMN `wcl_user_id` int NOT NULL COMMENT 'WCL用户ID',
  MODIFY COLUMN `wcl_username` varchar(64) NOT NULL COMMENT 'WCL用户名',
  MODIFY COLUMN `wcl_region` varchar(16) NOT NULL DEFAULT 'cn' COMMENT 'WCL用户区域',
  MODIFY COLUMN `linked_at` datetime NOT NULL COMMENT '首次关联时间',
  MODIFY COLUMN `last_verified_at` datetime DEFAULT NULL COMMENT '最后验证时间',
  MODIFY COLUMN `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  MODIFY COLUMN `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间';
