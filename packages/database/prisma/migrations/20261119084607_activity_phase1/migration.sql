-- AlterTable
ALTER TABLE `activity_raid_ext` ADD COLUMN `progress_plan_id` BIGINT UNSIGNED NULL;

-- CreateTable
CREATE TABLE `raid_progress_plans` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `raid_id` BIGINT UNSIGNED NOT NULL,
    `difficulty` TINYINT NOT NULL,
    `season` VARCHAR(32) NOT NULL,
    `name` VARCHAR(128) NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    `started_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `completed_at` DATETIME(0) NULL,
    `last_synced_at` DATETIME(0) NULL,
    `created_by` BIGINT UNSIGNED NOT NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_raid_progress_plan_status`(`status`, `difficulty`),
    INDEX `idx_raid_progress_plan_raid_season`(`raid_id`, `season`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `raid_boss_progress` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `progress_plan_id` BIGINT UNSIGNED NOT NULL,
    `boss_id` BIGINT UNSIGNED NOT NULL,
    `wcl_status` VARCHAR(16) NOT NULL DEFAULT 'NOT_STARTED',
    `wcl_best_percent` DOUBLE NULL,
    `wcl_first_kill_at` DATETIME(0) NULL,
    `wcl_last_kill_at` DATETIME(0) NULL,
    `wcl_updated_at` DATETIME(0) NULL,
    `manual_status` VARCHAR(16) NULL,
    `manual_best_percent` DOUBLE NULL,
    `manual_first_kill_at` DATETIME(0) NULL,
    `manual_last_kill_at` DATETIME(0) NULL,
    `manual_reason` VARCHAR(255) NULL,
    `manual_updated_by` BIGINT UNSIGNED NULL,
    `manual_updated_at` DATETIME(0) NULL,
    `default_strategy_id` BIGINT UNSIGNED NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `uk_raid_boss_progress_default_strategy`(`default_strategy_id`),
    INDEX `idx_raid_boss_progress_boss`(`boss_id`),
    UNIQUE INDEX `uk_raid_boss_progress`(`progress_plan_id`, `boss_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `raid_boss_progress_override_logs` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `progress_id` BIGINT UNSIGNED NOT NULL,
    `before_value` JSON NULL,
    `after_value` JSON NOT NULL,
    `reason` VARCHAR(255) NULL,
    `updated_by` BIGINT UNSIGNED NOT NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_raid_boss_override_history`(`progress_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `raid_progress_sync_runs` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `progress_plan_id` BIGINT UNSIGNED NULL,
    `zone_id` INTEGER NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'RUNNING',
    `reports_read` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `fights_read` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `started_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `finished_at` DATETIME(0) NULL,
    `error_message` VARCHAR(1000) NULL,
    `summary` JSON NULL,

    INDEX `idx_raid_progress_sync_status`(`status`, `started_at`),
    INDEX `idx_raid_progress_sync_plan_time`(`progress_plan_id`, `started_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `raid_boss_attempts` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `progress_plan_id` BIGINT UNSIGNED NOT NULL,
    `progress_id` BIGINT UNSIGNED NOT NULL,
    `encounter_id` INTEGER NOT NULL,
    `difficulty` TINYINT NOT NULL,
    `started_at` DATETIME(0) NOT NULL,
    `duration_ms` INTEGER UNSIGNED NOT NULL,
    `kill` BOOLEAN NOT NULL,
    `boss_percent` DOUBLE NULL,
    `dedup_key` CHAR(64) NOT NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `uk_raid_boss_attempt_dedup`(`dedup_key`),
    INDEX `idx_raid_boss_attempt_time`(`progress_id`, `started_at`),
    INDEX `idx_raid_boss_attempt_kill`(`progress_id`, `difficulty`, `kill`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `wcl_report_fight_evidence` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `attempt_id` BIGINT UNSIGNED NOT NULL,
    `report_code` VARCHAR(32) NOT NULL,
    `fight_id` INTEGER UNSIGNED NOT NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_wcl_fight_evidence_attempt`(`attempt_id`),
    UNIQUE INDEX `uk_wcl_report_fight`(`report_code`, `fight_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `boss_strategies` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `progress_plan_id` BIGINT UNSIGNED NOT NULL,
    `boss_id` BIGINT UNSIGNED NOT NULL,
    `name` VARCHAR(128) NOT NULL,
    `description` VARCHAR(500) NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    `created_by` BIGINT UNSIGNED NOT NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_boss_strategy_plan_boss`(`progress_plan_id`, `boss_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `boss_strategy_versions` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `strategy_id` BIGINT UNSIGNED NOT NULL,
    `version_no` INTEGER UNSIGNED NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
    `change_summary` VARCHAR(500) NULL,
    `created_by` BIGINT UNSIGNED NOT NULL,
    `published_by` BIGINT UNSIGNED NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `published_at` DATETIME(0) NULL,

    INDEX `idx_boss_strategy_version_status`(`strategy_id`, `status`),
    UNIQUE INDEX `uk_boss_strategy_version`(`strategy_id`, `version_no`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `boss_strategy_blocks` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `version_id` BIGINT UNSIGNED NOT NULL,
    `type` VARCHAR(24) NOT NULL,
    `title` VARCHAR(128) NOT NULL,
    `order_index` SMALLINT NOT NULL DEFAULT 0,
    `schema_version` SMALLINT UNSIGNED NOT NULL DEFAULT 1,
    `config` JSON NULL,
    `markdown` MEDIUMTEXT NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_boss_strategy_block_order`(`version_id`, `order_index`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `boss_strategy_slots` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `version_id` BIGINT UNSIGNED NOT NULL,
    `slot_key` VARCHAR(64) NOT NULL,
    `label` VARCHAR(128) NOT NULL,
    `role_constraint` TINYINT NULL,
    `is_required` BOOLEAN NOT NULL DEFAULT false,
    `order_index` SMALLINT NOT NULL DEFAULT 0,

    INDEX `idx_boss_strategy_slot_order`(`version_id`, `order_index`),
    UNIQUE INDEX `uk_boss_strategy_slot_key`(`version_id`, `slot_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `activity_raid_targets` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `activity_id` BIGINT UNSIGNED NOT NULL,
    `boss_id` BIGINT UNSIGNED NOT NULL,
    `order_index` SMALLINT NOT NULL DEFAULT 0,
    `target_count` SMALLINT UNSIGNED NULL,
    `strategy_version_id` BIGINT UNSIGNED NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'PLANNED',
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_activity_raid_target_order`(`activity_id`, `order_index`),
    UNIQUE INDEX `uk_activity_raid_target_boss`(`activity_id`, `boss_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `activity_strategy_snapshots` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `target_id` BIGINT UNSIGNED NOT NULL,
    `source_version_id` BIGINT UNSIGNED NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'EDITING',
    `created_by` BIGINT UNSIGNED NOT NULL,
    `locked_by` BIGINT UNSIGNED NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `locked_at` DATETIME(0) NULL,

    UNIQUE INDEX `uk_activity_strategy_snapshot_target`(`target_id`),
    INDEX `idx_activity_strategy_snapshot_source`(`source_version_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `activity_strategy_snapshot_blocks` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `snapshot_id` BIGINT UNSIGNED NOT NULL,
    `source_block_id` BIGINT UNSIGNED NULL,
    `type` VARCHAR(24) NOT NULL,
    `title` VARCHAR(128) NOT NULL,
    `order_index` SMALLINT NOT NULL DEFAULT 0,
    `schema_version` SMALLINT UNSIGNED NOT NULL DEFAULT 1,
    `config` JSON NULL,
    `markdown` MEDIUMTEXT NULL,

    INDEX `idx_activity_strategy_snapshot_block_order`(`snapshot_id`, `order_index`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `activity_strategy_snapshot_slots` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `snapshot_id` BIGINT UNSIGNED NOT NULL,
    `slot_key` VARCHAR(64) NOT NULL,
    `label` VARCHAR(128) NOT NULL,
    `signup_id` BIGINT UNSIGNED NULL,
    `user_id_snapshot` BIGINT UNSIGNED NULL,
    `user_name_snapshot` VARCHAR(255) NULL,
    `character_id_snapshot` BIGINT UNSIGNED NULL,
    `character_name_snapshot` VARCHAR(64) NULL,
    `realm_name_snapshot` VARCHAR(64) NULL,
    `class_name_snapshot` VARCHAR(25) NULL,
    `spec_id_snapshot` INTEGER NULL,
    `spec_name_snapshot` VARCHAR(25) NULL,
    `order_index` SMALLINT NOT NULL DEFAULT 0,

    INDEX `idx_activity_strategy_slot_signup`(`signup_id`),
    UNIQUE INDEX `uk_activity_strategy_slot_key`(`snapshot_id`, `slot_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `idx_activity_raid_progress_plan` ON `activity_raid_ext`(`progress_plan_id`);

-- AddForeignKey
ALTER TABLE `raid_progress_plans` ADD CONSTRAINT `fk_raid_progress_plan_raid` FOREIGN KEY (`raid_id`) REFERENCES `raids`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `raid_progress_plans` ADD CONSTRAINT `fk_raid_progress_plan_creator` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `raid_boss_progress` ADD CONSTRAINT `fk_raid_boss_progress_plan` FOREIGN KEY (`progress_plan_id`) REFERENCES `raid_progress_plans`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `raid_boss_progress` ADD CONSTRAINT `fk_raid_boss_progress_boss` FOREIGN KEY (`boss_id`) REFERENCES `bosses`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `raid_boss_progress` ADD CONSTRAINT `fk_raid_boss_progress_manual_user` FOREIGN KEY (`manual_updated_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `raid_boss_progress` ADD CONSTRAINT `fk_raid_boss_progress_default_strategy` FOREIGN KEY (`default_strategy_id`) REFERENCES `boss_strategies`(`id`) ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `raid_boss_progress_override_logs` ADD CONSTRAINT `fk_raid_boss_override_progress` FOREIGN KEY (`progress_id`) REFERENCES `raid_boss_progress`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `raid_boss_progress_override_logs` ADD CONSTRAINT `fk_raid_boss_override_user` FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `raid_progress_sync_runs` ADD CONSTRAINT `fk_raid_progress_sync_plan` FOREIGN KEY (`progress_plan_id`) REFERENCES `raid_progress_plans`(`id`) ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `raid_boss_attempts` ADD CONSTRAINT `fk_raid_boss_attempt_plan` FOREIGN KEY (`progress_plan_id`) REFERENCES `raid_progress_plans`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `raid_boss_attempts` ADD CONSTRAINT `fk_raid_boss_attempt_progress` FOREIGN KEY (`progress_id`) REFERENCES `raid_boss_progress`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `wcl_report_fight_evidence` ADD CONSTRAINT `fk_wcl_fight_evidence_attempt` FOREIGN KEY (`attempt_id`) REFERENCES `raid_boss_attempts`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `boss_strategies` ADD CONSTRAINT `fk_boss_strategy_plan` FOREIGN KEY (`progress_plan_id`) REFERENCES `raid_progress_plans`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `boss_strategies` ADD CONSTRAINT `fk_boss_strategy_boss` FOREIGN KEY (`boss_id`) REFERENCES `bosses`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `boss_strategies` ADD CONSTRAINT `fk_boss_strategy_creator` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `boss_strategy_versions` ADD CONSTRAINT `fk_boss_strategy_version_strategy` FOREIGN KEY (`strategy_id`) REFERENCES `boss_strategies`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `boss_strategy_versions` ADD CONSTRAINT `fk_boss_strategy_version_creator` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `boss_strategy_versions` ADD CONSTRAINT `fk_boss_strategy_version_publisher` FOREIGN KEY (`published_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `boss_strategy_blocks` ADD CONSTRAINT `fk_boss_strategy_block_version` FOREIGN KEY (`version_id`) REFERENCES `boss_strategy_versions`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `boss_strategy_slots` ADD CONSTRAINT `fk_boss_strategy_slot_version` FOREIGN KEY (`version_id`) REFERENCES `boss_strategy_versions`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `activity_raid_targets` ADD CONSTRAINT `fk_activity_raid_target_activity` FOREIGN KEY (`activity_id`) REFERENCES `activities`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `activity_raid_targets` ADD CONSTRAINT `fk_activity_raid_target_boss` FOREIGN KEY (`boss_id`) REFERENCES `bosses`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `activity_raid_targets` ADD CONSTRAINT `fk_activity_raid_target_strategy_version` FOREIGN KEY (`strategy_version_id`) REFERENCES `boss_strategy_versions`(`id`) ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `activity_strategy_snapshots` ADD CONSTRAINT `fk_activity_strategy_snapshot_target` FOREIGN KEY (`target_id`) REFERENCES `activity_raid_targets`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `activity_strategy_snapshots` ADD CONSTRAINT `fk_activity_strategy_snapshot_source` FOREIGN KEY (`source_version_id`) REFERENCES `boss_strategy_versions`(`id`) ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `activity_strategy_snapshots` ADD CONSTRAINT `fk_activity_strategy_snapshot_creator` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `activity_strategy_snapshots` ADD CONSTRAINT `fk_activity_strategy_snapshot_locker` FOREIGN KEY (`locked_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `activity_strategy_snapshot_blocks` ADD CONSTRAINT `fk_activity_strategy_block_snapshot` FOREIGN KEY (`snapshot_id`) REFERENCES `activity_strategy_snapshots`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `activity_strategy_snapshot_slots` ADD CONSTRAINT `fk_activity_strategy_slot_snapshot` FOREIGN KEY (`snapshot_id`) REFERENCES `activity_strategy_snapshots`(`id`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `activity_strategy_snapshot_slots` ADD CONSTRAINT `fk_activity_strategy_slot_signup` FOREIGN KEY (`signup_id`) REFERENCES `activity_signups`(`id`) ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `activity_raid_ext` ADD CONSTRAINT `fk_activity_raid_progress_plan` FOREIGN KEY (`progress_plan_id`) REFERENCES `raid_progress_plans`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
