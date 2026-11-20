-- Bind the single-guild site to its WCL public progress source.
ALTER TABLE `raid_progress_plans`
  ADD COLUMN `sync_cursor_at` datetime NULL COMMENT 'WCL 历史分页同步起点',
  ADD COLUMN `sync_cursor_page` int unsigned NOT NULL DEFAULT 1 COMMENT 'WCL 历史分页同步页码';

ALTER TABLE `raids`
  ADD COLUMN `wcl_zone_id` int NULL COMMENT 'WCL v2 团本 zone ID';

CREATE TABLE `wcl_guild_progress_settings` (
  `id` int NOT NULL DEFAULT 1 COMMENT '单公会配置主键，固定为1',
  `guild_id` int NOT NULL DEFAULT 820881 COMMENT 'WCL 公会 ID',
  `guild_name` varchar(128) NOT NULL DEFAULT 'TheTwilightZone' COMMENT 'WCL 公会名称',
  `server_id` int NOT NULL DEFAULT 569 COMMENT 'WCL 服务器 ID',
  `server_name` varchar(64) NOT NULL DEFAULT '伊森利恩' COMMENT '服务器名称',
  `server_slug` varchar(64) NOT NULL DEFAULT 'isillien' COMMENT '服务器 slug',
  `server_region` varchar(16) NOT NULL DEFAULT 'CN' COMMENT 'WCL 区域代码',
  `zone_id` int NOT NULL DEFAULT 53 COMMENT '当前同步 WCL 团本 zone ID',
  `season` varchar(32) NOT NULL DEFAULT 'current' COMMENT '当前团本赛季标识',
  `updated_by` bigint unsigned NULL COMMENT '最后更新人用户 ID',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_wcl_guild_progress_setting_user` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE UNIQUE INDEX `uk_raid_boss_wcl_id` ON `bosses` (`raid_id`, `wcl_id`);
CREATE UNIQUE INDEX `uk_raid_progress_plan_season` ON `raid_progress_plans` (`raid_id`, `difficulty`, `season`);
CREATE UNIQUE INDEX `uk_raid_wcl_zone_id` ON `raids` (`wcl_zone_id`);
