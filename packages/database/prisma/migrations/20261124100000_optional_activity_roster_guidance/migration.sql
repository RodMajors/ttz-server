-- Activity roster guidance is optional and never caps signups or confirmations.
ALTER TABLE activities
  MODIFY max_players SMALLINT UNSIGNED NULL DEFAULT NULL COMMENT '可选的活动建议人数，仅用于活动信息展示，不限制报名或确认人数';
