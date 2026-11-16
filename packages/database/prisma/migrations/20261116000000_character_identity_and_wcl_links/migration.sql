CREATE TABLE `races` (
  `id` int NOT NULL,
  `name` varchar(32) NOT NULL,
  `en_name` varchar(32) NULL,
  `faction` tinyint NULL,
  `icon` varchar(255) NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `wcl_user_links` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL,
  `wcl_user_id` int NOT NULL,
  `wcl_username` varchar(64) NOT NULL,
  `wcl_region` varchar(16) NOT NULL DEFAULT 'cn',
  `linked_at` datetime NOT NULL,
  `last_verified_at` datetime NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_wcl_user_link_user` (`user_id`),
  UNIQUE KEY `uk_wcl_user_link_region_user` (`wcl_region`, `wcl_user_id`),
  CONSTRAINT `fk_wcl_user_link_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `wcl_oauth_sessions` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL,
  `state_hash` char(64) NOT NULL,
  `code_verifier` varchar(255) NOT NULL,
  `redirect_uri` varchar(255) NOT NULL,
  `expires_at` datetime NOT NULL,
  `consumed_at` datetime NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_wcl_oauth_state` (`state_hash`),
  KEY `idx_wcl_oauth_session_user` (`user_id`, `expires_at`),
  KEY `idx_wcl_oauth_session_expiry` (`expires_at`, `consumed_at`),
  CONSTRAINT `fk_wcl_oauth_session_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

ALTER TABLE `characters`
  DROP FOREIGN KEY `characters_spec_id_fk`,
  DROP INDEX `uk_char`,
  DROP INDEX `characters_spec_id_fk`,
  CHANGE COLUMN `realm` `server_name` varchar(64) NOT NULL,
  DROP COLUMN `spec`,
  ADD COLUMN `server_slug` varchar(64) NOT NULL AFTER `server_name`,
  ADD COLUMN `server_region` varchar(16) NOT NULL DEFAULT 'cn' AFTER `server_slug`,
  ADD COLUMN `class_id` int NOT NULL AFTER `server_region`,
  ADD COLUMN `race_id` int NULL AFTER `class_id`,
  MODIFY COLUMN `wcl_id` bigint unsigned NOT NULL,
  ADD COLUMN `wcl_canonical_id` bigint unsigned NOT NULL AFTER `wcl_id`,
  ADD COLUMN `wcl_verification_status` tinyint NOT NULL DEFAULT 0 AFTER `wcl_canonical_id`,
  ADD COLUMN `wcl_verified_at` datetime NULL AFTER `wcl_verification_status`,
  ADD COLUMN `wcl_evidence` varchar(16) NULL AFTER `wcl_verified_at`,
  ADD COLUMN `wcl_verified_by` bigint unsigned NULL AFTER `wcl_evidence`,
  ADD COLUMN `wcl_verification_note` varchar(255) NULL AFTER `wcl_verified_by`,
  ADD UNIQUE INDEX `uk_character_identity` (`server_region`, `server_slug`, `name`),
  ADD UNIQUE INDEX `uk_character_wcl_canonical` (`server_region`, `wcl_canonical_id`),
  ADD UNIQUE INDEX `uk_character_wcl_id` (`server_region`, `wcl_id`),
  ADD INDEX `idx_character_class` (`class_id`),
  ADD INDEX `idx_character_race` (`race_id`),
  ADD INDEX `idx_character_verified_by` (`wcl_verified_by`),
  ADD CONSTRAINT `fk_character_class` FOREIGN KEY (`class_id`) REFERENCES `classes` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `fk_character_race` FOREIGN KEY (`race_id`) REFERENCES `races` (`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `fk_character_verified_by` FOREIGN KEY (`wcl_verified_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE RESTRICT;

INSERT INTO `classes` (`id`, `name`, `en_name`) VALUES
  (1, '战士', 'WARRIOR'),
  (2, '圣骑士', 'PALADIN'),
  (3, '猎人', 'HUNTER'),
  (4, '潜行者', 'ROGUE'),
  (5, '牧师', 'PRIEST'),
  (6, '死亡骑士', 'DEATHKNIGHT'),
  (7, '萨满祭司', 'SHAMAN'),
  (8, '法师', 'MAGE'),
  (9, '术士', 'WARLOCK'),
  (10, '武僧', 'MONK'),
  (11, '德鲁伊', 'DRUID'),
  (12, '恶魔猎手', 'DEMONHUNTER'),
  (13, '唤魔师', 'EVOKER')
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`), `en_name` = VALUES(`en_name`);

INSERT INTO `specs` (`id`, `name`, `class`, `role`) VALUES
  (1, '武器', 1, 3), (2, '狂怒', 1, 3), (3, '防护', 1, 1),
  (4, '神圣', 2, 2), (5, '防护', 2, 1), (6, '惩戒', 2, 3),
  (7, '野兽控制', 3, 4), (8, '射击', 3, 4), (9, '生存', 3, 3),
  (10, '奇袭', 4, 3), (11, '狂徒', 4, 3), (12, '敏锐', 4, 3),
  (13, '戒律', 5, 2), (14, '神圣', 5, 2), (15, '暗影', 5, 4),
  (16, '鲜血', 6, 1), (17, '冰霜', 6, 3), (18, '邪恶', 6, 3),
  (19, '元素', 7, 4), (20, '增强', 7, 3), (21, '恢复', 7, 2),
  (22, '奥术', 8, 4), (23, '火焰', 8, 4), (24, '冰霜', 8, 4),
  (25, '痛苦', 9, 4), (26, '恶魔学识', 9, 4), (27, '毁灭', 9, 4),
  (28, '酒仙', 10, 1), (29, '踏风', 10, 3), (30, '织雾', 10, 2),
  (31, '平衡', 11, 4), (32, '野性', 11, 3), (33, '守护', 11, 1), (34, '恢复', 11, 2),
  (35, '浩劫', 12, 3), (36, '复仇', 12, 1), (37, '噬灭', 12, 4),
  (38, '湮灭', 13, 4), (39, '恩护', 13, 2), (40, '增辉', 13, 4)
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`), `class` = VALUES(`class`), `role` = VALUES(`role`);
