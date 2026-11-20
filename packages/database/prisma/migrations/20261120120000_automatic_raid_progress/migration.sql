ALTER TABLE raid_progress_plans
    MODIFY created_by BIGINT UNSIGNED NULL COMMENT '历史创建人用户ID，自动同步创建时为空',
    ADD COLUMN sync_cursor_end_at DATETIME(0) NULL COMMENT 'WCL分页同步固定结束时间';

ALTER TABLE raid_boss_attempts
    MODIFY started_at DATETIME(3) NOT NULL COMMENT '拉次绝对开始时间（毫秒精度）';

ALTER TABLE raid_boss_attempts
    ADD COLUMN players JSON NULL COMMENT 'WCL fight 中规范化的参与玩家 ID';
