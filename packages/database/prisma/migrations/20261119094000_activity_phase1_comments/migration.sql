ALTER TABLE raid_progress_plans
  MODIFY id bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '进度计划主键ID',
  MODIFY raid_id bigint unsigned NOT NULL COMMENT '团本ID',
  MODIFY difficulty tinyint NOT NULL COMMENT '难度：2英雄，3史诗',
  MODIFY season varchar(32) NOT NULL COMMENT '赛季标识',
  MODIFY name varchar(128) NOT NULL COMMENT '进度计划名称',
  MODIFY status varchar(16) NOT NULL DEFAULT 'ACTIVE' COMMENT '计划状态',
  MODIFY started_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '开始时间',
  MODIFY completed_at datetime NULL COMMENT '完成时间',
  MODIFY last_synced_at datetime NULL COMMENT '最近完整WCL同步时间',
  MODIFY sync_cursor_at datetime NULL COMMENT 'WCL历史分页同步起点',
  MODIFY sync_cursor_page int unsigned NOT NULL DEFAULT 1 COMMENT 'WCL历史分页同步页码',
  MODIFY created_by bigint unsigned NOT NULL COMMENT '创建人用户ID',
  MODIFY created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  MODIFY updated_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间';

ALTER TABLE raid_boss_progress
  MODIFY id bigint unsigned NOT NULL AUTO_INCREMENT COMMENT 'Boss进度主键ID',
  MODIFY progress_plan_id bigint unsigned NOT NULL COMMENT '进度计划ID',
  MODIFY boss_id bigint unsigned NOT NULL COMMENT 'Boss ID',
  MODIFY wcl_status varchar(16) NOT NULL DEFAULT 'NOT_STARTED' COMMENT 'WCL聚合状态',
  MODIFY wcl_best_percent double NULL COMMENT 'WCL最佳剩余血量百分比',
  MODIFY wcl_first_kill_at datetime NULL COMMENT 'WCL首杀时间',
  MODIFY wcl_last_kill_at datetime NULL COMMENT 'WCL最近击杀时间',
  MODIFY wcl_updated_at datetime NULL COMMENT 'WCL进度更新时间',
  MODIFY manual_status varchar(16) NULL COMMENT '人工覆盖状态',
  MODIFY manual_best_percent double NULL COMMENT '人工覆盖最佳剩余血量',
  MODIFY manual_first_kill_at datetime NULL COMMENT '人工覆盖首杀时间',
  MODIFY manual_last_kill_at datetime NULL COMMENT '人工覆盖最近击杀时间',
  MODIFY manual_reason varchar(255) NULL COMMENT '人工覆盖理由',
  MODIFY manual_updated_by bigint unsigned NULL COMMENT '人工覆盖操作人',
  MODIFY manual_updated_at datetime NULL COMMENT '人工覆盖时间',
  MODIFY default_strategy_id bigint unsigned NULL COMMENT '默认战术方案ID',
  MODIFY created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  MODIFY updated_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间';

ALTER TABLE raid_boss_progress_override_logs
  MODIFY id bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '覆盖日志主键ID',
  MODIFY progress_id bigint unsigned NOT NULL COMMENT 'Boss进度ID',
  MODIFY before_value json NULL COMMENT '覆盖前值',
  MODIFY after_value json NOT NULL COMMENT '覆盖后值',
  MODIFY reason varchar(255) NULL COMMENT '覆盖理由',
  MODIFY updated_by bigint unsigned NOT NULL COMMENT '操作人用户ID',
  MODIFY created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间';

ALTER TABLE raid_progress_sync_runs
  MODIFY id bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '同步运行主键ID',
  MODIFY progress_plan_id bigint unsigned NULL COMMENT '进度计划ID',
  MODIFY zone_id int NOT NULL COMMENT 'WCL团本zone ID',
  MODIFY status varchar(16) NOT NULL DEFAULT 'RUNNING' COMMENT '同步状态',
  MODIFY reports_read int unsigned NOT NULL DEFAULT 0 COMMENT '读取报告数',
  MODIFY fights_read int unsigned NOT NULL DEFAULT 0 COMMENT '读取战斗数',
  MODIFY started_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '开始时间',
  MODIFY finished_at datetime NULL COMMENT '完成时间',
  MODIFY error_message varchar(1000) NULL COMMENT '错误信息',
  MODIFY summary json NULL COMMENT '同步摘要';

ALTER TABLE raid_boss_attempts
  MODIFY id bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '拉次主键ID',
  MODIFY progress_plan_id bigint unsigned NOT NULL COMMENT '进度计划ID',
  MODIFY progress_id bigint unsigned NOT NULL COMMENT 'Boss进度ID',
  MODIFY encounter_id int NOT NULL COMMENT 'WCL encounter ID',
  MODIFY difficulty tinyint NOT NULL COMMENT 'WCL难度：4英雄，5史诗',
  MODIFY started_at datetime NOT NULL COMMENT '拉次绝对开始时间',
  MODIFY duration_ms int unsigned NOT NULL COMMENT '持续毫秒数',
  MODIFY `kill` tinyint(1) NOT NULL COMMENT '是否击杀',
  MODIFY boss_percent double NULL COMMENT '结束时Boss剩余血量百分比',
  MODIFY dedup_key char(64) NOT NULL COMMENT '跨报告去重哈希',
  MODIFY created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  MODIFY updated_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间';

ALTER TABLE wcl_report_fight_evidence
  MODIFY id bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '来源证据主键ID',
  MODIFY attempt_id bigint unsigned NOT NULL COMMENT '归并后的拉次ID',
  MODIFY report_code varchar(32) NOT NULL COMMENT 'WCL报告代码',
  MODIFY fight_id int unsigned NOT NULL COMMENT 'WCL报告内fight ID',
  MODIFY created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间';

ALTER TABLE boss_strategies
  MODIFY id bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '战术方案主键ID',
  MODIFY progress_plan_id bigint unsigned NOT NULL COMMENT '进度计划ID',
  MODIFY boss_id bigint unsigned NOT NULL COMMENT 'Boss ID',
  MODIFY name varchar(128) NOT NULL COMMENT '方案名称',
  MODIFY description varchar(500) NULL COMMENT '方案说明',
  MODIFY status varchar(16) NOT NULL DEFAULT 'ACTIVE' COMMENT '方案状态',
  MODIFY created_by bigint unsigned NOT NULL COMMENT '创建人用户ID',
  MODIFY created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  MODIFY updated_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间';

ALTER TABLE boss_strategy_versions
  MODIFY id bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '战术版本主键ID',
  MODIFY strategy_id bigint unsigned NOT NULL COMMENT '战术方案ID',
  MODIFY version_no int unsigned NOT NULL COMMENT '版本号',
  MODIFY status varchar(16) NOT NULL DEFAULT 'DRAFT' COMMENT '版本状态',
  MODIFY change_summary varchar(500) NULL COMMENT '版本变更说明',
  MODIFY created_by bigint unsigned NOT NULL COMMENT '创建人用户ID',
  MODIFY published_by bigint unsigned NULL COMMENT '发布人用户ID',
  MODIFY created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  MODIFY published_at datetime NULL COMMENT '发布时间';

ALTER TABLE boss_strategy_blocks
  MODIFY id bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '战术区块主键ID',
  MODIFY version_id bigint unsigned NOT NULL COMMENT '战术版本ID',
  MODIFY type varchar(24) NOT NULL COMMENT '区块类型',
  MODIFY title varchar(128) NOT NULL COMMENT '区块标题',
  MODIFY order_index smallint NOT NULL DEFAULT 0 COMMENT '排序值',
  MODIFY schema_version smallint unsigned NOT NULL DEFAULT 1 COMMENT '结构化JSON版本',
  MODIFY config json NULL COMMENT '结构化区块配置',
  MODIFY markdown mediumtext NULL COMMENT 'Markdown战术笔记',
  MODIFY created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间';

ALTER TABLE boss_strategy_slots
  MODIFY id bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '参与者槽位主键ID',
  MODIFY version_id bigint unsigned NOT NULL COMMENT '战术版本ID',
  MODIFY slot_key varchar(64) NOT NULL COMMENT '版本内稳定槽位键',
  MODIFY label varchar(128) NOT NULL COMMENT '槽位显示名称',
  MODIFY role_constraint tinyint NULL COMMENT '职责限制：1坦克2治疗3近战4远程',
  MODIFY is_required tinyint(1) NOT NULL DEFAULT 0 COMMENT '是否必须绑定',
  MODIFY order_index smallint NOT NULL DEFAULT 0 COMMENT '排序值';

ALTER TABLE activity_raid_targets
  MODIFY id bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '活动Boss目标主键ID',
  MODIFY activity_id bigint unsigned NOT NULL COMMENT '活动ID',
  MODIFY boss_id bigint unsigned NOT NULL COMMENT '目标Boss ID',
  MODIFY order_index smallint NOT NULL DEFAULT 0 COMMENT '本场目标顺序',
  MODIFY target_count smallint unsigned NULL COMMENT '目标次数',
  MODIFY strategy_version_id bigint unsigned NULL COMMENT '引用的已发布战术版本ID',
  MODIFY status varchar(16) NOT NULL DEFAULT 'PLANNED' COMMENT '目标状态',
  MODIFY created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间';

ALTER TABLE activity_strategy_snapshots
  MODIFY id bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '活动战术快照主键ID',
  MODIFY target_id bigint unsigned NOT NULL COMMENT '活动Boss目标ID',
  MODIFY source_version_id bigint unsigned NULL COMMENT '来源战术版本ID',
  MODIFY status varchar(16) NOT NULL DEFAULT 'EDITING' COMMENT '快照状态',
  MODIFY created_by bigint unsigned NOT NULL COMMENT '创建人用户ID',
  MODIFY locked_by bigint unsigned NULL COMMENT '锁定人用户ID',
  MODIFY created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  MODIFY locked_at datetime NULL COMMENT '锁定时间';

ALTER TABLE activity_strategy_snapshot_blocks
  MODIFY id bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '快照区块主键ID',
  MODIFY snapshot_id bigint unsigned NOT NULL COMMENT '活动战术快照ID',
  MODIFY source_block_id bigint unsigned NULL COMMENT '来源模板区块ID',
  MODIFY type varchar(24) NOT NULL COMMENT '区块类型',
  MODIFY title varchar(128) NOT NULL COMMENT '区块标题快照',
  MODIFY order_index smallint NOT NULL DEFAULT 0 COMMENT '排序值',
  MODIFY schema_version smallint unsigned NOT NULL DEFAULT 1 COMMENT '结构化JSON版本',
  MODIFY config json NULL COMMENT '结构化配置快照',
  MODIFY markdown mediumtext NULL COMMENT 'Markdown笔记快照';

ALTER TABLE activity_strategy_snapshot_slots
  MODIFY id bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '快照槽位主键ID',
  MODIFY snapshot_id bigint unsigned NOT NULL COMMENT '活动战术快照ID',
  MODIFY slot_key varchar(64) NOT NULL COMMENT '稳定槽位键',
  MODIFY label varchar(128) NOT NULL COMMENT '槽位名称快照',
  MODIFY signup_id bigint unsigned NULL COMMENT '绑定的活动报名ID',
  MODIFY user_id_snapshot bigint unsigned NULL COMMENT '用户ID快照',
  MODIFY user_name_snapshot varchar(255) NULL COMMENT '用户名快照',
  MODIFY character_id_snapshot bigint unsigned NULL COMMENT '角色ID快照',
  MODIFY character_name_snapshot varchar(64) NULL COMMENT '角色名快照',
  MODIFY realm_name_snapshot varchar(64) NULL COMMENT '服务器名快照',
  MODIFY class_name_snapshot varchar(25) NULL COMMENT '职业名快照',
  MODIFY spec_id_snapshot int NULL COMMENT '专精ID快照',
  MODIFY spec_name_snapshot varchar(25) NULL COMMENT '专精名快照',
  MODIFY order_index smallint NOT NULL DEFAULT 0 COMMENT '排序值';

ALTER TABLE activity_raid_ext MODIFY progress_plan_id bigint unsigned NULL COMMENT '团本进度计划ID';
