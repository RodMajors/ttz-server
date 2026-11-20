ALTER TABLE activity_strategy_snapshots
  ADD COLUMN revision INT UNSIGNED NOT NULL DEFAULT 1 COMMENT '活动战术快照乐观锁版本';

ALTER TABLE activity_strategy_snapshot_slots
  ADD COLUMN class_id_snapshot INT NULL COMMENT '锁定时职业 ID 快照',
  ADD COLUMN group_no TINYINT UNSIGNED NULL COMMENT '团队组号，1 至 8；仅团队席位使用',
  ADD COLUMN position_no TINYINT UNSIGNED NULL COMMENT '组内位置，1 至 5；仅团队席位使用',
  ADD COLUMN assigned_by BIGINT UNSIGNED NULL COMMENT '最近一次分配操作人',
  ADD COLUMN assigned_at DATETIME(0) NULL COMMENT '最近一次分配时间',
  ADD UNIQUE INDEX uk_activity_strategy_slot_group_position (snapshot_id, group_no, position_no),
  ADD INDEX idx_activity_strategy_slot_assigned_by (assigned_by),
  ADD CONSTRAINT fk_activity_strategy_slot_assigner FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE RESTRICT;

-- Each existing Boss snapshot receives a complete, stable 8 x 5 roster grid.
INSERT INTO activity_strategy_snapshot_slots (snapshot_id, slot_key, label, group_no, position_no, order_index)
SELECT snapshots.id,
       CONCAT('__team_g', team_groups.group_no, '_p', positions.position_no),
       CONCAT('第', team_groups.group_no, '组 · ', positions.position_no, '号位'),
       team_groups.group_no,
       positions.position_no,
       (team_groups.group_no - 1) * 5 + positions.position_no
FROM activity_strategy_snapshots AS snapshots
CROSS JOIN (
  SELECT 1 AS group_no UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4
  UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8
) AS team_groups
CROSS JOIN (
  SELECT 1 AS position_no UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5
) AS positions;
