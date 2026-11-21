-- Existing releases and activities retain the legacy slot-based interpretation.
ALTER TABLE boss_strategy_versions
  ADD COLUMN content_mode VARCHAR(16) NOT NULL DEFAULT 'LEGACY' COMMENT 'LEGACY 或 REQUIREMENTS 预设内容模式';

ALTER TABLE boss_strategy_tasks
  MODIFY executor_slot_key VARCHAR(64) NULL COMMENT '仅旧版保留的主执行者抽象槽位';

ALTER TABLE activity_strategy_snapshots
  ADD COLUMN assignment_mode VARCHAR(16) NOT NULL DEFAULT 'LEGACY' COMMENT 'LEGACY 槽位绑定或 DIRECT 报名直绑';

ALTER TABLE activity_strategy_snapshot_tasks
  MODIFY executor_slot_key VARCHAR(64) NULL COMMENT '仅旧版保留的主执行者抽象槽位',
  ADD COLUMN executor_signup_id BIGINT UNSIGNED NULL COMMENT '本场主执行者报名记录',
  ADD COLUMN fallback_signup_id BIGINT UNSIGNED NULL COMMENT '本场后备执行者报名记录',
  ADD COLUMN target_signup_id BIGINT UNSIGNED NULL COMMENT '本场目标报名记录',
  ADD COLUMN people_snapshot JSON NULL COMMENT '锁定时三类人员的姓名、角色、职业、专精等历史值',
  ADD INDEX idx_strategy_task_executor_signup (executor_signup_id),
  ADD INDEX idx_strategy_task_fallback_signup (fallback_signup_id),
  ADD INDEX idx_strategy_task_target_signup (target_signup_id),
  ADD CONSTRAINT fk_strategy_task_executor_signup FOREIGN KEY (executor_signup_id) REFERENCES activity_signups(id) ON DELETE SET NULL ON UPDATE RESTRICT,
  ADD CONSTRAINT fk_strategy_task_fallback_signup FOREIGN KEY (fallback_signup_id) REFERENCES activity_signups(id) ON DELETE SET NULL ON UPDATE RESTRICT,
  ADD CONSTRAINT fk_strategy_task_target_signup FOREIGN KEY (target_signup_id) REFERENCES activity_signups(id) ON DELETE SET NULL ON UPDATE RESTRICT;
