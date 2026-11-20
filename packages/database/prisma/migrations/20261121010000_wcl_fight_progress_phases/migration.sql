ALTER TABLE raid_boss_attempts
  ADD COLUMN fight_percent DOUBLE NULL COMMENT 'WCL整体战斗进度百分比',
  ADD COLUMN phase_data JSON NULL COMMENT 'WCL阶段名称与拉次内阶段转换时间快照';

-- Re-read existing season reports so historical pulls receive the new fields.
UPDATE raid_progress_plans
SET last_synced_at = NULL,
    sync_cursor_at = NULL,
    sync_cursor_end_at = NULL,
    sync_cursor_page = 1
WHERE status IN ('ACTIVE', 'COMPLETED');

