CREATE TABLE `wcl_servers` (
  `id` int NOT NULL,
  `name` varchar(64) NOT NULL,
  `slug` varchar(64) NOT NULL,
  `region` varchar(16) NOT NULL DEFAULT 'cn',
  `blizzard_id` int NULL,
  `connected_realm_id` int NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_wcl_server_region_slug` (`region`, `slug`),
  KEY `idx_wcl_server_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

ALTER TABLE `classes`
  ADD COLUMN `wcl_id` int NULL,
  ADD COLUMN `wcl_slug` varchar(32) NULL,
  ADD UNIQUE INDEX `uk_classes_wcl_id` (`wcl_id`);

ALTER TABLE `specs`
  ADD COLUMN `wcl_id` int NULL,
  ADD COLUMN `wcl_slug` varchar(32) NULL,
  ADD UNIQUE INDEX `uk_specs_class_wcl_id` (`class`, `wcl_id`);

ALTER TABLE `characters`
  ADD COLUMN `race_name` varchar(64) NULL AFTER `faction`,
  ADD COLUMN `gender` varchar(16) NULL AFTER `race_name`,
  ADD COLUMN `guild_name` varchar(128) NULL AFTER `gender`,
  ADD COLUMN `guild_server_name` varchar(64) NULL AFTER `guild_name`,
  ADD COLUMN `guild_server_slug` varchar(64) NULL AFTER `guild_server_name`,
  ADD COLUMN `active_spec_name` varchar(64) NULL AFTER `guild_server_slug`,
  ADD COLUMN `level` int NULL AFTER `active_spec_name`,
  ADD COLUMN `active_title` varchar(128) NULL AFTER `level`,
  ADD COLUMN `server_type_name` varchar(64) NULL AFTER `active_title`,
  ADD COLUMN `average_item_level` int NULL AFTER `item_level`,
  ADD COLUMN `last_login_at` datetime NULL AFTER `item_level_updated_at`,
  ADD COLUMN `achievement_points` int NULL AFTER `last_login_at`,
  ADD COLUMN `game_data` json NULL AFTER `achievement_points`;

UPDATE `classes` SET `wcl_id` = 11, `wcl_slug` = 'Warrior' WHERE `id` = 1;
UPDATE `classes` SET `wcl_id` = 6, `wcl_slug` = 'Paladin' WHERE `id` = 2;
UPDATE `classes` SET `wcl_id` = 3, `wcl_slug` = 'Hunter' WHERE `id` = 3;
UPDATE `classes` SET `wcl_id` = 8, `wcl_slug` = 'Rogue' WHERE `id` = 4;
UPDATE `classes` SET `wcl_id` = 7, `wcl_slug` = 'Priest' WHERE `id` = 5;
UPDATE `classes` SET `wcl_id` = 1, `wcl_slug` = 'DeathKnight' WHERE `id` = 6;
UPDATE `classes` SET `wcl_id` = 9, `wcl_slug` = 'Shaman' WHERE `id` = 7;
UPDATE `classes` SET `wcl_id` = 4, `wcl_slug` = 'Mage' WHERE `id` = 8;
UPDATE `classes` SET `wcl_id` = 10, `wcl_slug` = 'Warlock' WHERE `id` = 9;
UPDATE `classes` SET `wcl_id` = 5, `wcl_slug` = 'Monk' WHERE `id` = 10;
UPDATE `classes` SET `wcl_id` = 2, `wcl_slug` = 'Druid' WHERE `id` = 11;
UPDATE `classes` SET `wcl_id` = 12, `wcl_slug` = 'DemonHunter' WHERE `id` = 12;
UPDATE `classes` SET `wcl_id` = 13, `wcl_slug` = 'Evoker' WHERE `id` = 13;

UPDATE `specs` SET `wcl_id` = 1, `wcl_slug` = 'Arms' WHERE `id` = 1;
UPDATE `specs` SET `wcl_id` = 2, `wcl_slug` = 'Fury' WHERE `id` = 2;
UPDATE `specs` SET `wcl_id` = 3, `wcl_slug` = 'Protection' WHERE `id` = 3;
UPDATE `specs` SET `wcl_id` = 1, `wcl_slug` = 'Holy' WHERE `id` = 4;
UPDATE `specs` SET `wcl_id` = 2, `wcl_slug` = 'Protection' WHERE `id` = 5;
UPDATE `specs` SET `wcl_id` = 3, `wcl_slug` = 'Retribution' WHERE `id` = 6;
UPDATE `specs` SET `wcl_id` = 1, `wcl_slug` = 'BeastMastery' WHERE `id` = 7;
UPDATE `specs` SET `wcl_id` = 2, `wcl_slug` = 'Marksmanship' WHERE `id` = 8;
UPDATE `specs` SET `wcl_id` = 3, `wcl_slug` = 'Survival' WHERE `id` = 9;
UPDATE `specs` SET `wcl_id` = 1, `wcl_slug` = 'Assassination' WHERE `id` = 10;
UPDATE `specs` SET `wcl_id` = 4, `wcl_slug` = 'Outlaw' WHERE `id` = 11;
UPDATE `specs` SET `wcl_id` = 3, `wcl_slug` = 'Subtlety' WHERE `id` = 12;
UPDATE `specs` SET `wcl_id` = 1, `wcl_slug` = 'Discipline' WHERE `id` = 13;
UPDATE `specs` SET `wcl_id` = 2, `wcl_slug` = 'Holy' WHERE `id` = 14;
UPDATE `specs` SET `wcl_id` = 3, `wcl_slug` = 'Shadow' WHERE `id` = 15;
UPDATE `specs` SET `wcl_id` = 1, `wcl_slug` = 'Blood' WHERE `id` = 16;
UPDATE `specs` SET `wcl_id` = 2, `wcl_slug` = 'Frost' WHERE `id` = 17;
UPDATE `specs` SET `wcl_id` = 3, `wcl_slug` = 'Unholy' WHERE `id` = 18;
UPDATE `specs` SET `wcl_id` = 1, `wcl_slug` = 'Elemental' WHERE `id` = 19;
UPDATE `specs` SET `wcl_id` = 2, `wcl_slug` = 'Enhancement' WHERE `id` = 20;
UPDATE `specs` SET `wcl_id` = 3, `wcl_slug` = 'Restoration' WHERE `id` = 21;
UPDATE `specs` SET `wcl_id` = 1, `wcl_slug` = 'Arcane' WHERE `id` = 22;
UPDATE `specs` SET `wcl_id` = 2, `wcl_slug` = 'Fire' WHERE `id` = 23;
UPDATE `specs` SET `wcl_id` = 3, `wcl_slug` = 'Frost' WHERE `id` = 24;
UPDATE `specs` SET `wcl_id` = 1, `wcl_slug` = 'Affliction' WHERE `id` = 25;
UPDATE `specs` SET `wcl_id` = 2, `wcl_slug` = 'Demonology' WHERE `id` = 26;
UPDATE `specs` SET `wcl_id` = 3, `wcl_slug` = 'Destruction' WHERE `id` = 27;
UPDATE `specs` SET `wcl_id` = 1, `wcl_slug` = 'Brewmaster' WHERE `id` = 28;
UPDATE `specs` SET `wcl_id` = 3, `wcl_slug` = 'Windwalker' WHERE `id` = 29;
UPDATE `specs` SET `wcl_id` = 2, `wcl_slug` = 'Mistweaver' WHERE `id` = 30;
UPDATE `specs` SET `wcl_id` = 1, `wcl_slug` = 'Balance' WHERE `id` = 31;
UPDATE `specs` SET `wcl_id` = 2, `wcl_slug` = 'Feral' WHERE `id` = 32;
UPDATE `specs` SET `wcl_id` = 3, `wcl_slug` = 'Guardian' WHERE `id` = 33;
UPDATE `specs` SET `wcl_id` = 4, `wcl_slug` = 'Restoration' WHERE `id` = 34;
UPDATE `specs` SET `wcl_id` = 1, `wcl_slug` = 'Havoc' WHERE `id` = 35;
UPDATE `specs` SET `wcl_id` = 2, `wcl_slug` = 'Vengeance' WHERE `id` = 36;
UPDATE `specs` SET `wcl_id` = 3, `wcl_slug` = 'Devourer' WHERE `id` = 37;
UPDATE `specs` SET `wcl_id` = 1, `wcl_slug` = 'Devastation' WHERE `id` = 38;
UPDATE `specs` SET `wcl_id` = 2, `wcl_slug` = 'Preservation' WHERE `id` = 39;
UPDATE `specs` SET `wcl_id` = 3, `wcl_slug` = 'Augmentation' WHERE `id` = 40;
