-- Preserve a visible review signal when historical per-Boss team layouts disagreed.
ALTER TABLE activity_team_layouts
  ADD COLUMN needs_review TINYINT(1) NOT NULL DEFAULT 0 COMMENT '历史 Boss 分组不一致时需要管理员核对并保存确认';

UPDATE activity_team_layouts AS layouts
INNER JOIN (
  SELECT
    targets.activity_id,
    old_slots.group_no,
    old_slots.position_no
  FROM activity_strategy_snapshot_slots AS old_slots
  INNER JOIN activity_strategy_snapshots AS old_snapshots
    ON old_snapshots.id = old_slots.snapshot_id
  INNER JOIN activity_raid_targets AS targets
    ON targets.id = old_snapshots.target_id
  WHERE old_slots.group_no IS NOT NULL
    AND old_slots.position_no IS NOT NULL
  GROUP BY targets.activity_id, old_slots.group_no, old_slots.position_no
  HAVING COUNT(DISTINCT old_slots.signup_id) > 1
      OR (COUNT(old_slots.signup_id) > 0 AND COUNT(old_slots.signup_id) < COUNT(*))
) AS conflicts
  ON conflicts.activity_id = layouts.activity_id
SET layouts.needs_review = 1;
