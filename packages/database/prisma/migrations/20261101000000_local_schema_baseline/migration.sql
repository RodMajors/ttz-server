-- Baseline snapshot of the local ttz schema as of 2026-11-15.
-- Schema only: no application rows or local AUTO_INCREMENT counters are included.
SET FOREIGN_KEY_CHECKS=0;

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `activities` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '主键',
  `name` varchar(64) NOT NULL COMMENT '活动名称',
  `type` bigint unsigned NOT NULL COMMENT '活动类型',
  `status` smallint NOT NULL DEFAULT '0' COMMENT '0草稿 1已发布 2已结束 3已取消',
  `creator` bigint unsigned NOT NULL COMMENT '创建者',
  `template` bigint unsigned DEFAULT '0' COMMENT '活动模板',
  `description` longtext COMMENT '活动说明',
  `inviter` bigint unsigned DEFAULT NULL COMMENT '发起邀请角色',
  `passphrase` varchar(255) DEFAULT NULL COMMENT '进组暗号',
  `signup_deadline` datetime DEFAULT NULL COMMENT '报名截止时间，发布前必填',
  `max_players` smallint unsigned NOT NULL DEFAULT '20' COMMENT '人数上限',
  `tank_slots` smallint unsigned DEFAULT NULL COMMENT '可选坦克需求数',
  `healer_slots` smallint unsigned DEFAULT NULL COMMENT '可选治疗需求数',
  `melee_slots` smallint unsigned DEFAULT NULL COMMENT '可选近战DPS需求数',
  `ranged_slots` smallint unsigned DEFAULT NULL COMMENT '可选远程DPS需求数',
  `team_up_at` datetime DEFAULT NULL COMMENT '开始组队时间',
  `begin_at` datetime NOT NULL COMMENT '活动开始时间',
  `end_at` datetime NOT NULL COMMENT '活动结束时间',
  `duration_minutes` smallint unsigned NOT NULL DEFAULT '120' COMMENT '持续分钟数，前端以0.5小时为步长',
  `attendance_enabled` tinyint NOT NULL DEFAULT '0' COMMENT '是否计入出勤统计：0否 1是',
  `published_at` datetime DEFAULT NULL COMMENT '发布时间',
  `roster_locked_at` datetime DEFAULT NULL COMMENT '最终名单锁定时间',
  `finished_at` datetime DEFAULT NULL COMMENT '结束确认时间',
  `cancelled_at` datetime DEFAULT NULL COMMENT '取消时间',
  `version` int unsigned NOT NULL DEFAULT '1' COMMENT '乐观锁版本',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `is_deleted` tinyint NOT NULL DEFAULT '0' COMMENT '软删除',
  PRIMARY KEY (`id`),
  KEY `activities_characters_id_fk` (`inviter`),
  KEY `activities_types_id_fk` (`type`),
  KEY `idx_activities_list` (`is_deleted`,`status`,`begin_at`),
  KEY `idx_activities_creator_time` (`creator`,`begin_at`),
  CONSTRAINT `activities_characters_id_fk` FOREIGN KEY (`inviter`) REFERENCES `characters` (`id`),
  CONSTRAINT `activities_types_id_fk` FOREIGN KEY (`type`) REFERENCES `activity_types` (`id`),
  CONSTRAINT `activities_users_id_fk` FOREIGN KEY (`creator`) REFERENCES `users` (`id`),
  CONSTRAINT `chk_activities_attendance_enabled` CHECK ((`attendance_enabled` in (0,1))),
  CONSTRAINT `chk_activities_duration` CHECK (((`duration_minutes` between 30 and 1440) and ((`duration_minutes` % 30) = 0))),
  CONSTRAINT `chk_activities_max_players` CHECK ((`max_players` between 1 and 100)),
  CONSTRAINT `chk_activities_role_slots` CHECK (((((coalesce(`tank_slots`,0) + coalesce(`healer_slots`,0)) + coalesce(`melee_slots`,0)) + coalesce(`ranged_slots`,0)) <= `max_players`)),
  CONSTRAINT `chk_activities_status` CHECK ((`status` in (0,1,2,3)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='公会活动表';
/*!40101 SET character_set_client = @saved_cs_client */;

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `activity_casual_ext` (
  `activity_id` bigint unsigned NOT NULL,
  `location` varchar(128) DEFAULT NULL COMMENT '集合地点/频道',
  `max_players` int DEFAULT NULL COMMENT '人数上限',
  PRIMARY KEY (`activity_id`),
  CONSTRAINT `fk_casual_ext_activity` FOREIGN KEY (`activity_id`) REFERENCES `activities` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='休闲活动扩展';
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `activity_mythic_plus_ext` (
  `activity_id` bigint unsigned NOT NULL,
  `dungeon_id` bigint unsigned NOT NULL COMMENT '地下城ID',
  `key_level` smallint NOT NULL COMMENT '钥石层数',
  PRIMARY KEY (`activity_id`),
  KEY `activity_mythic_plus_ext_dungeons_id_fk` (`dungeon_id`),
  CONSTRAINT `activity_mythic_plus_ext_dungeons_id_fk` FOREIGN KEY (`dungeon_id`) REFERENCES `dungeons` (`id`),
  CONSTRAINT `fk_mplus_ext_activity` FOREIGN KEY (`activity_id`) REFERENCES `activities` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='大秘境活动扩展';
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `activity_raid_ext` (
  `activity_id` bigint unsigned NOT NULL COMMENT '关联 activities.id',
  `raid_id` bigint unsigned NOT NULL COMMENT '团本ID',
  `difficulty` tinyint NOT NULL COMMENT '1普通 2英雄 3史诗',
  `mode` tinyint NOT NULL COMMENT '1开荒 2Farm',
  `boss_id` bigint unsigned DEFAULT NULL COMMENT '开荒时指定的BOSS，Farm可为空',
  `target_count` int DEFAULT NULL COMMENT '目标次数（Farm用）',
  PRIMARY KEY (`activity_id`),
  KEY `activity_raid_ext_raids_id_fk` (`raid_id`),
  KEY `idx_activity_raid_boss_id` (`boss_id`),
  CONSTRAINT `activity_raid_ext_raids_id_fk` FOREIGN KEY (`raid_id`) REFERENCES `raids` (`id`),
  CONSTRAINT `fk_activity_raid_boss` FOREIGN KEY (`boss_id`) REFERENCES `bosses` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT `fk_raid_ext_activity` FOREIGN KEY (`activity_id`) REFERENCES `activities` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='团本活动扩展表';
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `activity_signup_choices` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `signup_id` bigint unsigned NOT NULL,
  `character_id` bigint unsigned NOT NULL,
  `spec_id` int NOT NULL,
  `priority` tinyint unsigned NOT NULL COMMENT '1为最高优先级',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_signup_choice_priority` (`signup_id`,`priority`),
  UNIQUE KEY `uk_signup_character_spec` (`signup_id`,`character_id`,`spec_id`),
  KEY `idx_signup_choice_character` (`character_id`),
  KEY `idx_signup_choice_spec` (`spec_id`),
  CONSTRAINT `fk_signup_choice_character` FOREIGN KEY (`character_id`) REFERENCES `characters` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_signup_choice_signup` FOREIGN KEY (`signup_id`) REFERENCES `activity_signups` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT `fk_signup_choice_spec` FOREIGN KEY (`spec_id`) REFERENCES `specs` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `chk_signup_choice_priority` CHECK ((`priority` between 1 and 10))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='报名备选角色和专精';
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `activity_signups` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `activity_id` bigint unsigned NOT NULL COMMENT '关联活动',
  `user_id` bigint unsigned NOT NULL COMMENT '报名用户（冗余，方便查询）',
  `character_id` bigint unsigned NOT NULL COMMENT '报名的角色',
  `preferred_role` tinyint DEFAULT NULL COMMENT '首选职责：1坦克 2治疗 3近战DPS 4远程DPS',
  `preferred_spec_id` int DEFAULT NULL COMMENT '首选专精',
  `group_no` tinyint unsigned DEFAULT NULL COMMENT '最终名单可选分组',
  `order_index` smallint NOT NULL DEFAULT '0' COMMENT '最终名单排序',
  `status` tinyint NOT NULL DEFAULT '0' COMMENT '0待确认 1已确认 2替补 3已取消 4已拒绝',
  `note` varchar(255) DEFAULT NULL COMMENT '报名备注（玩家自己填）',
  `officer_note` varchar(255) DEFAULT NULL COMMENT '指挥备注（仅管理员可见）',
  `handled_by` bigint unsigned DEFAULT NULL COMMENT '最后处理人 user.id',
  `handled_at` datetime DEFAULT NULL COMMENT '最后处理时间',
  `decision_reason` varchar(255) DEFAULT NULL COMMENT '拒绝/替补/移出原因',
  `signed_up_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '报名时间',
  `confirmed_at` datetime DEFAULT NULL COMMENT '确认时间',
  `cancelled_at` datetime DEFAULT NULL COMMENT '取消时间',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_activity_user` (`activity_id`,`user_id`),
  KEY `fk_signup_user` (`user_id`),
  KEY `fk_signup_character` (`character_id`),
  KEY `idx_signup_preferred_spec` (`preferred_spec_id`),
  KEY `idx_signup_handled_by` (`handled_by`),
  CONSTRAINT `fk_signup_activity` FOREIGN KEY (`activity_id`) REFERENCES `activities` (`id`),
  CONSTRAINT `fk_signup_character` FOREIGN KEY (`character_id`) REFERENCES `characters` (`id`),
  CONSTRAINT `fk_signup_handled_by` FOREIGN KEY (`handled_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT `fk_signup_preferred_spec` FOREIGN KEY (`preferred_spec_id`) REFERENCES `specs` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT `fk_signup_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`),
  CONSTRAINT `chk_signup_preferred_role` CHECK (((`preferred_role` is null) or (`preferred_role` in (1,2,3,4)))),
  CONSTRAINT `chk_signup_status` CHECK ((`status` in (0,1,2,3,4)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='活动报名表';
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `activity_types` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '主键',
  `name` varchar(32) NOT NULL COMMENT '类型名',
  `code` varchar(32) NOT NULL COMMENT '类型编码',
  `category` varchar(32) NOT NULL COMMENT '大类：团本/地下城/休闲/其他',
  `description` varchar(255) DEFAULT NULL COMMENT '类型说明',
  `sort` int DEFAULT '0',
  `is_active` int DEFAULT '1',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_activity_type_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='活动类型表';
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `announcement_groups` (
  `announcement_id` bigint unsigned NOT NULL,
  `group_id` bigint unsigned NOT NULL,
  PRIMARY KEY (`announcement_id`,`group_id`),
  KEY `idx_announcement_group_group` (`group_id`),
  CONSTRAINT `fk_announcement_group_announcement` FOREIGN KEY (`announcement_id`) REFERENCES `announcements` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT `fk_announcement_group_group` FOREIGN KEY (`group_id`) REFERENCES `guild_groups` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='公告身份组投放范围';
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `announcements` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `title` varchar(128) NOT NULL,
  `content` mediumtext NOT NULL COMMENT '首期使用安全 Markdown',
  `status` tinyint NOT NULL DEFAULT '0' COMMENT '0草稿 1启用 2归档',
  `audience_type` tinyint NOT NULL DEFAULT '0' COMMENT '0全部已审核成员 1指定身份组',
  `is_pinned` tinyint NOT NULL DEFAULT '0',
  `publish_at` datetime NOT NULL,
  `expire_at` datetime DEFAULT NULL,
  `created_by` bigint unsigned NOT NULL,
  `updated_by` bigint unsigned NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_announcement_publish` (`status`,`publish_at`,`expire_at`,`is_pinned`),
  KEY `idx_announcement_created_by` (`created_by`),
  KEY `idx_announcement_updated_by` (`updated_by`),
  CONSTRAINT `fk_announcement_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_announcement_updated_by` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `chk_announcement_audience` CHECK ((`audience_type` in (0,1))),
  CONSTRAINT `chk_announcement_dates` CHECK (((`expire_at` is null) or (`expire_at` > `publish_at`))),
  CONSTRAINT `chk_announcement_pinned` CHECK ((`is_pinned` in (0,1))),
  CONSTRAINT `chk_announcement_status` CHECK ((`status` in (0,1,2)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='公会公告';
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `attendance_records` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `activity_id` bigint unsigned NOT NULL,
  `signup_id` bigint unsigned DEFAULT NULL,
  `user_id` bigint unsigned NOT NULL,
  `character_id` bigint unsigned DEFAULT NULL,
  `spec_id` int DEFAULT NULL,
  `wcl_report_id` bigint unsigned DEFAULT NULL,
  `character_name_snapshot` varchar(64) DEFAULT NULL,
  `realm_snapshot` varchar(64) DEFAULT NULL,
  `spec_name_snapshot` varchar(25) DEFAULT NULL,
  `role_snapshot` tinyint DEFAULT NULL COMMENT '1坦克 2治疗 3近战DPS 4远程DPS',
  `status` tinyint NOT NULL DEFAULT '0' COMMENT '0待记录 1正常出勤 2迟到 3请假 4缺席 5替补 6未报名',
  `source` tinyint NOT NULL DEFAULT '0',
  `note` varchar(255) DEFAULT NULL,
  `recorded_by` bigint unsigned NOT NULL,
  `recorded_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_attendance_activity_user` (`activity_id`,`user_id`),
  KEY `idx_attendance_user_time` (`user_id`,`recorded_at`),
  KEY `idx_attendance_signup` (`signup_id`),
  KEY `idx_attendance_character` (`character_id`),
  KEY `idx_attendance_spec` (`spec_id`),
  KEY `idx_attendance_wcl_report` (`wcl_report_id`),
  KEY `idx_attendance_recorded_by` (`recorded_by`),
  CONSTRAINT `fk_attendance_activity` FOREIGN KEY (`activity_id`) REFERENCES `activities` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT `fk_attendance_character` FOREIGN KEY (`character_id`) REFERENCES `characters` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT `fk_attendance_recorded_by` FOREIGN KEY (`recorded_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_attendance_signup` FOREIGN KEY (`signup_id`) REFERENCES `activity_signups` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT `fk_attendance_spec` FOREIGN KEY (`spec_id`) REFERENCES `specs` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT `fk_attendance_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `fk_attendance_wcl_report` FOREIGN KEY (`wcl_report_id`) REFERENCES `wcl_reports` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT `chk_attendance_role` CHECK (((`role_snapshot` is null) or (`role_snapshot` in (1,2,3,4)))),
  CONSTRAINT `chk_attendance_source` CHECK ((`source` in (0,1,2))),
  CONSTRAINT `chk_attendance_status_v2` CHECK ((`status` in (0,1,2,3,4,5,6)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='活动出勤事实记录';
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `bosses` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `raid_id` bigint unsigned NOT NULL COMMENT '所属团本',
  `wcl_id` int NOT NULL COMMENT 'wcl对应id',
  `name` varchar(64) NOT NULL COMMENT 'BOSS名称',
  `short_name` varchar(32) DEFAULT NULL COMMENT '简称',
  `order_index` tinyint NOT NULL DEFAULT '1' COMMENT '本内顺序，从1开始',
  `icon` varchar(255) DEFAULT NULL COMMENT '头像/图标',
  `is_final` tinyint NOT NULL DEFAULT '0' COMMENT '是否尾王',
  `progress` smallint NOT NULL DEFAULT '0' COMMENT '进度：0未攻略，1英雄难度击杀，2史诗难度击杀',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_raid_boss` (`raid_id`,`name`),
  CONSTRAINT `fk_boss_raid` FOREIGN KEY (`raid_id`) REFERENCES `raids` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='团本BOSS表';
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `characters` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL COMMENT '关联 user.id',
  `name` varchar(64) NOT NULL COMMENT '角色名',
  `realm` varchar(64) NOT NULL COMMENT '服务器/大区',
  `faction` tinyint DEFAULT NULL COMMENT '阵营：0部落，1联盟',
  `spec` int DEFAULT NULL COMMENT '专精id',
  `is_main` tinyint NOT NULL DEFAULT '0' COMMENT '是否主角色：1主号，0小号',
  `is_retired` tinyint NOT NULL DEFAULT '0' COMMENT '是否暂离/退役角色',
  `remark` varchar(255) DEFAULT NULL COMMENT '备注，例如替补、备用号',
  `wcl_id` bigint unsigned DEFAULT NULL COMMENT 'WCL 角色 ID，可在绑定后补充',
  `item_level` int DEFAULT NULL COMMENT '当前装等',
  `item_level_updated_at` datetime DEFAULT NULL COMMENT '装等更新时间',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_char` (`name`,`realm`),
  KEY `idx_user_id` (`user_id`),
  KEY `characters_spec_id_fk` (`spec`),
  CONSTRAINT `characters_spec_id_fk` FOREIGN KEY (`spec`) REFERENCES `specs` (`id`),
  CONSTRAINT `characters_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='魔兽角色表';
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `classes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(25) DEFAULT NULL COMMENT '职业名称',
  `en_name` varchar(25) DEFAULT NULL COMMENT '职业英文名',
  `icon` varchar(255) DEFAULT NULL COMMENT '职业头像',
  `color` varchar(25) DEFAULT NULL COMMENT '职业颜色',
  `description` text COMMENT '职业描述',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='职业表';
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `dungeons` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(64) NOT NULL COMMENT '地下城名称',
  `wcl_id` int NOT NULL COMMENT 'wcl对应id',
  `short_name` varchar(32) DEFAULT NULL COMMENT '简称',
  `expansion` varchar(32) DEFAULT NULL COMMENT '资料片',
  `season` varchar(32) DEFAULT NULL COMMENT '所属赛季',
  `map_id` int DEFAULT NULL COMMENT '游戏内 map id',
  `icon` varchar(255) DEFAULT NULL COMMENT '图标',
  `background` varchar(255) DEFAULT NULL COMMENT '背景',
  `sort` int DEFAULT '0',
  `is_active` tinyint NOT NULL DEFAULT '1' COMMENT '本赛季是否在池子里',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_dungeon_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='地下城表（大秘用）';
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `guild_group_members` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `group_id` bigint unsigned NOT NULL,
  `user_id` bigint unsigned NOT NULL,
  `added_by` bigint unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_group_member` (`group_id`,`user_id`),
  KEY `idx_group_member_user` (`user_id`),
  KEY `idx_group_member_added_by` (`added_by`),
  CONSTRAINT `fk_group_member_added_by` FOREIGN KEY (`added_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT `fk_group_member_group` FOREIGN KEY (`group_id`) REFERENCES `guild_groups` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT `fk_group_member_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='成员当前身份组关系';
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `guild_groups` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(64) NOT NULL COMMENT '显示名称，如开荒组',
  `code` varchar(32) NOT NULL COMMENT '稳定代码，如 progression',
  `description` varchar(255) DEFAULT NULL,
  `is_active` tinyint NOT NULL DEFAULT '1',
  `sort` int NOT NULL DEFAULT '0',
  `created_by` bigint unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_guild_group_name` (`name`),
  UNIQUE KEY `uk_guild_group_code` (`code`),
  KEY `idx_guild_group_created_by` (`created_by`),
  CONSTRAINT `fk_guild_group_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT `chk_guild_group_active` CHECK ((`is_active` in (0,1)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='公会身份组标签';
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `login_session` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `login_no` varchar(64) NOT NULL COMMENT '登录流水号，前端生成/后端生成，二维码里带这个',
  `nonce_hash` char(64) DEFAULT NULL COMMENT '二维码随机值 SHA-256',
  `openid` varchar(128) DEFAULT NULL COMMENT '扫码后回填openid，未扫码为NULL',
  `user_id` bigint unsigned DEFAULT NULL COMMENT '扫码用户 user.id',
  `status` tinyint NOT NULL DEFAULT '0' COMMENT '0待扫码 1已扫码待确认 2登录成功 3超时失效 4已取消',
  `ip` varchar(64) DEFAULT NULL COMMENT '网页端IP，风控留痕',
  `expire_at` datetime NOT NULL COMMENT '过期时间（建议3-5分钟）',
  `scanned_at` datetime DEFAULT NULL COMMENT '扫码时间',
  `confirmed_at` datetime DEFAULT NULL COMMENT '用户确认时间',
  `consumed_at` datetime DEFAULT NULL COMMENT 'Web 会话完成消费时间',
  `cancelled_at` datetime DEFAULT NULL COMMENT '取消时间',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_login_no` (`login_no`),
  KEY `idx_expire` (`expire_at`),
  KEY `idx_login_session_user` (`user_id`),
  CONSTRAINT `fk_login_session_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT `chk_login_session_status` CHECK ((`status` in (0,1,2,3,4)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='网页扫码登录流水';
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `notification_deliveries` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL,
  `template_code` varchar(64) NOT NULL COMMENT '站内模板代码，不保存 AppSecret',
  `business_type` varchar(32) NOT NULL COMMENT 'activity/announcement 等',
  `business_id` bigint unsigned NOT NULL,
  `openid_snapshot` varchar(128) NOT NULL COMMENT '发送目标快照',
  `payload_json` json NOT NULL,
  `status` tinyint NOT NULL DEFAULT '0',
  `attempts` tinyint unsigned NOT NULL DEFAULT '0',
  `error_message` varchar(1000) DEFAULT NULL,
  `scheduled_at` datetime NOT NULL,
  `sent_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_notification_business_user` (`user_id`,`template_code`,`business_type`,`business_id`),
  KEY `idx_notification_queue` (`status`,`scheduled_at`),
  CONSTRAINT `fk_notification_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `chk_notification_attempts` CHECK ((`attempts` <= 10)),
  CONSTRAINT `chk_notification_status` CHECK ((`status` in (0,1,2,3)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='小程序订阅消息投递记录';
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `notification_preferences` (
  `user_id` bigint unsigned NOT NULL,
  `activity_published` tinyint NOT NULL DEFAULT '1',
  `signup_result` tinyint NOT NULL DEFAULT '1',
  `before_team_up` tinyint NOT NULL DEFAULT '1',
  `activity_cancelled` tinyint NOT NULL DEFAULT '1',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`),
  CONSTRAINT `fk_notification_preference_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT `chk_notification_preference_flags` CHECK (((`activity_published` in (0,1)) and (`signup_result` in (0,1)) and (`before_team_up` in (0,1)) and (`activity_cancelled` in (0,1))))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='用户小程序订阅消息偏好';
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `raids` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(64) NOT NULL COMMENT '团本名称',
  `wcl_id` int NOT NULL COMMENT 'wcl对应id',
  `short_name` varchar(32) DEFAULT NULL COMMENT '简称',
  `expansion` varchar(32) DEFAULT NULL COMMENT '资料片',
  `season` varchar(32) DEFAULT NULL COMMENT '赛季',
  `instance_id` int DEFAULT NULL COMMENT '游戏内 instance id',
  `icon` varchar(255) DEFAULT NULL COMMENT '图标URL',
  `background` varchar(255) DEFAULT NULL COMMENT '背景图URL',
  `sort` int DEFAULT '0' COMMENT '排序，越大越靠前',
  `is_active` tinyint NOT NULL DEFAULT '1' COMMENT '是否当前在用',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_raid_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='团本表';
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `site_settings` (
  `setting_key` varchar(64) NOT NULL COMMENT '如 guild_profile/recruitment/contact/tool_links',
  `json_value` json NOT NULL,
  `updated_by` bigint unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`setting_key`),
  KEY `idx_site_setting_updated_by` (`updated_by`),
  CONSTRAINT `fk_site_setting_updated_by` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='站点结构化配置';
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `specs` (
  `id` int NOT NULL AUTO_INCREMENT COMMENT '主键',
  `name` varchar(25) DEFAULT NULL COMMENT '专精名',
  `class` int NOT NULL COMMENT '所属职业',
  `role` int DEFAULT NULL COMMENT '角色定位：1坦克 2治疗 3近战DPS 4远程DPS',
  `icon` varchar(255) DEFAULT NULL COMMENT '专精头像',
  `description` text COMMENT '描述',
  PRIMARY KEY (`id`),
  KEY `specs_classes_id_fk` (`class`),
  CONSTRAINT `specs_classes_id_fk` FOREIGN KEY (`class`) REFERENCES `classes` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '主键',
  `name` varchar(255) DEFAULT NULL COMMENT '自定义用户名',
  `wx_nickname` varchar(255) DEFAULT NULL COMMENT '微信昵称（仅展示，不可信）',
  `guild_nickname` varchar(255) DEFAULT NULL COMMENT 'TTZ 微信群内昵称',
  `openid` varchar(128) NOT NULL COMMENT '微信小程序openid',
  `unionid` varchar(128) DEFAULT NULL COMMENT 'unionid，多端打通预留',
  `avatar` varchar(255) DEFAULT NULL COMMENT '微信头像链接',
  `privilege` tinyint NOT NULL DEFAULT '0' COMMENT '权限：0普通成员，1管理员，2超级管理员',
  `is_approved` tinyint NOT NULL DEFAULT '0' COMMENT '白名单：0待审核，1已通过，2拒绝',
  `reviewed_by` bigint unsigned DEFAULT NULL COMMENT '审核管理员 user.id',
  `reviewed_at` datetime DEFAULT NULL COMMENT '审核时间',
  `reject_reason` varchar(255) DEFAULT NULL COMMENT '拒绝原因',
  `remark` varchar(255) DEFAULT NULL COMMENT '备注，群备注/特殊说明',
  `status` tinyint NOT NULL DEFAULT '1' COMMENT '用户状态：1活跃，0退坑',
  `last_login_at` datetime DEFAULT NULL COMMENT '最后登录时间',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_openid` (`openid`),
  KEY `idx_users_approval` (`is_approved`,`status`),
  KEY `idx_users_reviewed_by` (`reviewed_by`),
  CONSTRAINT `fk_users_reviewed_by` FOREIGN KEY (`reviewed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT `chk_users_approval` CHECK ((`is_approved` in (0,1,2))),
  CONSTRAINT `chk_users_privilege` CHECK ((`privilege` in (0,1,2)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='公会微信用户表';
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `wcl_report_actors` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `report_id` bigint unsigned NOT NULL,
  `actor_id` bigint unsigned NOT NULL COMMENT 'WCL 报告内 actor id',
  `actor_name` varchar(64) NOT NULL,
  `realm_name` varchar(64) DEFAULT NULL,
  `character_id` bigint unsigned DEFAULT NULL,
  `match_status` tinyint NOT NULL DEFAULT '0' COMMENT '0待匹配 1已匹配 2已忽略',
  `matched_by` bigint unsigned DEFAULT NULL,
  `matched_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_wcl_report_actor` (`report_id`,`actor_id`),
  KEY `idx_wcl_actor_character` (`character_id`),
  KEY `idx_wcl_actor_matched_by` (`matched_by`),
  CONSTRAINT `fk_wcl_actor_character` FOREIGN KEY (`character_id`) REFERENCES `characters` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT `fk_wcl_actor_matched_by` FOREIGN KEY (`matched_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT `fk_wcl_actor_report` FOREIGN KEY (`report_id`) REFERENCES `wcl_reports` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT `chk_wcl_actor_match_status` CHECK ((`match_status` in (0,1,2)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='WCL 报告角色映射';
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `wcl_reports` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `activity_id` bigint unsigned NOT NULL,
  `report_code` varchar(32) NOT NULL,
  `region` varchar(8) NOT NULL DEFAULT 'CN',
  `server_id` int NOT NULL DEFAULT '569',
  `status` tinyint NOT NULL DEFAULT '0',
  `report_start_at` datetime DEFAULT NULL,
  `report_end_at` datetime DEFAULT NULL,
  `imported_at` datetime DEFAULT NULL,
  `error_message` text,
  `summary_json` json DEFAULT NULL COMMENT '不保存密钥，仅保存必要导入摘要',
  `created_by` bigint unsigned NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_wcl_report_code` (`report_code`),
  KEY `idx_wcl_report_activity` (`activity_id`,`created_at`),
  KEY `idx_wcl_report_created_by` (`created_by`),
  CONSTRAINT `fk_wcl_report_activity` FOREIGN KEY (`activity_id`) REFERENCES `activities` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT `fk_wcl_report_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `chk_wcl_report_server` CHECK (((`region` = _utf8mb4'CN') and (`server_id` = 569))),
  CONSTRAINT `chk_wcl_report_status` CHECK ((`status` in (0,1,2,3)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='活动关联 WCL 公开报告';
/*!40101 SET character_set_client = @saved_cs_client */;

SET FOREIGN_KEY_CHECKS=1;


