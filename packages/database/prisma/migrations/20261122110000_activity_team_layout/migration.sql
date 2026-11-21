-- Team grouping is activity-wide infrastructure, not a Boss strategy preset item.
CREATE TABLE activity_team_layouts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '活动团队框架主键',
  activity_id BIGINT UNSIGNED NOT NULL COMMENT '所属活动 ID；每个活动只有一个当前团队框架',
  revision INT UNSIGNED NOT NULL DEFAULT 1 COMMENT '团队框架乐观锁修订号，每次保存分组后递增',
  group_count TINYINT UNSIGNED NOT NULL DEFAULT 8 COMMENT '团队组数，当前默认 8 组',
  seats_per_group TINYINT UNSIGNED NOT NULL DEFAULT 5 COMMENT '每组席位数，当前默认 5 个席位',
  status VARCHAR(16) NOT NULL DEFAULT 'EDITING' COMMENT '框架状态：EDITING 可编辑，LOCKED 已锁定',
  locked_at DATETIME(0) NULL COMMENT '团队框架锁定时间',
  locked_by BIGINT UNSIGNED NULL COMMENT '执行团队框架锁定操作的用户 ID',
  created_at DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '团队框架创建时间',
  updated_at DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '团队框架最后修改时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_activity_team_layout_activity (activity_id),
  KEY idx_activity_team_layout_locker (locked_by),
  CONSTRAINT chk_activity_team_layout_group_count CHECK (group_count BETWEEN 1 AND 8),
  CONSTRAINT chk_activity_team_layout_seats_per_group CHECK (seats_per_group BETWEEN 1 AND 5),
  CONSTRAINT chk_activity_team_layout_status CHECK (status IN ('EDITING', 'LOCKED')),
  CONSTRAINT fk_activity_team_layout_activity FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT fk_activity_team_layout_locker FOREIGN KEY (locked_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE RESTRICT
) COMMENT='活动级团队分组框架；所有 Boss 战术快照共享同一份 8×5 团队布局';

CREATE TABLE activity_team_seats (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '活动团队席位主键',
  layout_id BIGINT UNSIGNED NOT NULL COMMENT '所属活动团队框架 ID',
  group_no TINYINT UNSIGNED NOT NULL COMMENT '团队组号，从 1 开始',
  position_no TINYINT UNSIGNED NOT NULL COMMENT '组内席位号，从 1 开始',
  signup_id BIGINT UNSIGNED NULL COMMENT '当前绑定的活动报名记录 ID，未分配时为空',
  user_id_snapshot BIGINT UNSIGNED NULL COMMENT '团队框架锁定时固化的用户 ID',
  user_name_snapshot VARCHAR(255) NULL COMMENT '团队框架锁定时固化的成员名称',
  character_id_snapshot BIGINT UNSIGNED NULL COMMENT '团队框架锁定时固化的角色 ID',
  character_name_snapshot VARCHAR(64) NULL COMMENT '团队框架锁定时固化的角色名称',
  realm_name_snapshot VARCHAR(64) NULL COMMENT '团队框架锁定时固化的服务器名称',
  class_id_snapshot INT NULL COMMENT '团队框架锁定时固化的职业 ID',
  class_name_snapshot VARCHAR(64) NULL COMMENT '团队框架锁定时固化的职业名称',
  spec_id_snapshot INT NULL COMMENT '团队框架锁定时固化的专精 ID',
  spec_name_snapshot VARCHAR(64) NULL COMMENT '团队框架锁定时固化的专精名称',
  assigned_by BIGINT UNSIGNED NULL COMMENT '最近一次修改该团队席位的用户 ID',
  assigned_at DATETIME(0) NULL COMMENT '最近一次修改该团队席位的时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_activity_team_seat_position (layout_id, group_no, position_no),
  KEY idx_activity_team_seat_signup (signup_id),
  KEY idx_activity_team_seat_assigner (assigned_by),
  CONSTRAINT chk_activity_team_seat_group_no CHECK (group_no BETWEEN 1 AND 8),
  CONSTRAINT chk_activity_team_seat_position_no CHECK (position_no BETWEEN 1 AND 5),
  CONSTRAINT fk_activity_team_seat_layout FOREIGN KEY (layout_id) REFERENCES activity_team_layouts(id) ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT fk_activity_team_seat_signup FOREIGN KEY (signup_id) REFERENCES activity_signups(id) ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT fk_activity_team_seat_assigner FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE SET NULL ON UPDATE RESTRICT
) COMMENT='活动团队框架中的固定席位；每个新框架默认生成 8×5 共 40 个席位';

-- Existing activities receive one shared layout. Existing per-Boss grids are copied below when possible.
INSERT INTO activity_team_layouts (
  activity_id,
  revision,
  group_count,
  seats_per_group,
  status,
  locked_at,
  created_at,
  updated_at
)
SELECT
  id,
  1,
  8,
  5,
  CASE WHEN roster_locked_at IS NULL THEN 'EDITING' ELSE 'LOCKED' END,
  roster_locked_at,
  created_at,
  updated_at
FROM activities;

INSERT INTO activity_team_seats (
  layout_id,
  group_no,
  position_no
)
SELECT
  layouts.id,
  team_groups.group_no,
  positions.position_no
FROM activity_team_layouts AS layouts
CROSS JOIN (
  SELECT 1 AS group_no UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4
  UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8
) AS team_groups
CROSS JOIN (
  SELECT 1 AS position_no UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5
) AS positions;

-- When an old activity has different layouts per Boss, the earliest snapshot is used as the initial shared layout.
WITH ranked_legacy_assignments AS (
  SELECT
    targets.activity_id,
    old_slots.group_no,
    old_slots.position_no,
    old_slots.signup_id,
    old_slots.user_id_snapshot,
    old_slots.user_name_snapshot,
    old_slots.character_id_snapshot,
    old_slots.character_name_snapshot,
    old_slots.realm_name_snapshot,
    old_slots.class_id_snapshot,
    old_slots.class_name_snapshot,
    old_slots.spec_id_snapshot,
    old_slots.spec_name_snapshot,
    old_slots.assigned_by,
    old_slots.assigned_at,
    ROW_NUMBER() OVER (
      PARTITION BY targets.activity_id, old_slots.group_no, old_slots.position_no
      ORDER BY old_snapshots.id ASC
    ) AS row_no
  FROM activity_strategy_snapshot_slots AS old_slots
  INNER JOIN activity_strategy_snapshots AS old_snapshots
    ON old_snapshots.id = old_slots.snapshot_id
  INNER JOIN activity_raid_targets AS targets
    ON targets.id = old_snapshots.target_id
  WHERE old_slots.group_no IS NOT NULL
    AND old_slots.position_no IS NOT NULL
    AND old_slots.signup_id IS NOT NULL
)
UPDATE activity_team_seats AS seats
INNER JOIN activity_team_layouts AS layouts
  ON layouts.id = seats.layout_id
INNER JOIN ranked_legacy_assignments AS legacy
  ON legacy.activity_id = layouts.activity_id
 AND legacy.group_no = seats.group_no
 AND legacy.position_no = seats.position_no
 AND legacy.row_no = 1
SET
  seats.signup_id = legacy.signup_id,
  seats.user_id_snapshot = legacy.user_id_snapshot,
  seats.user_name_snapshot = legacy.user_name_snapshot,
  seats.character_id_snapshot = legacy.character_id_snapshot,
  seats.character_name_snapshot = legacy.character_name_snapshot,
  seats.realm_name_snapshot = legacy.realm_name_snapshot,
  seats.class_id_snapshot = legacy.class_id_snapshot,
  seats.class_name_snapshot = legacy.class_name_snapshot,
  seats.spec_id_snapshot = legacy.spec_id_snapshot,
  seats.spec_name_snapshot = legacy.spec_name_snapshot,
  seats.assigned_by = legacy.assigned_by,
  seats.assigned_at = legacy.assigned_at;
