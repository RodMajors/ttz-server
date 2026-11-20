-- Keep the highest-ID plan for each raid/difficulty pair only when every
-- lower-ID duplicate is fully represented by the keeper and has no domain references.
DELETE stale
FROM raid_progress_plans AS stale
JOIN raid_progress_plans AS keeper
  ON keeper.raid_id = stale.raid_id
 AND keeper.difficulty = stale.difficulty
 AND keeper.id > stale.id
WHERE NOT EXISTS (
    SELECT 1
    FROM activity_raid_ext AS activity_raid
    WHERE activity_raid.progress_plan_id = stale.id
)
AND NOT EXISTS (
    SELECT 1
    FROM boss_strategies AS strategy
    WHERE strategy.progress_plan_id = stale.id
)
AND NOT EXISTS (
    SELECT 1
    FROM raid_boss_progress AS progress
    LEFT JOIN raid_boss_progress_override_logs AS override_log
      ON override_log.progress_id = progress.id
    WHERE progress.progress_plan_id = stale.id
      AND (
        progress.manual_status IS NOT NULL
        OR progress.default_strategy_id IS NOT NULL
        OR override_log.id IS NOT NULL
      )
)
AND NOT EXISTS (
    SELECT 1
    FROM raid_boss_attempts AS old_attempt
    WHERE old_attempt.progress_plan_id = stale.id
      AND (
        NOT EXISTS (
          SELECT 1
          FROM wcl_report_fight_evidence AS old_evidence
          WHERE old_evidence.attempt_id = old_attempt.id
        )
        OR EXISTS (
          SELECT 1
          FROM wcl_report_fight_evidence AS old_evidence
          WHERE old_evidence.attempt_id = old_attempt.id
            AND NOT EXISTS (
              SELECT 1
              FROM raid_boss_attempts AS keeper_attempt
              JOIN wcl_report_fight_evidence AS keeper_evidence
                ON keeper_evidence.attempt_id = keeper_attempt.id
              WHERE keeper_attempt.progress_plan_id = keeper.id
                AND keeper_evidence.report_code = old_evidence.report_code
                AND keeper_evidence.fight_id = old_evidence.fight_id
            )
        )
      )
);

ALTER TABLE raid_progress_plans
  DROP INDEX uk_raid_progress_plan_season,
  ADD UNIQUE INDEX uk_raid_progress_plan_raid_difficulty (raid_id, difficulty);

ALTER TABLE bosses
  ADD COLUMN exclude_from_progress TINYINT(1) NOT NULL DEFAULT 0
    COMMENT '是否从公会团本开荒进度、尝试次数和活动目标中排除';

-- These two Zone 53 encounters are optional side encounters rather than the
-- core raid progression bosses. Keep them in WCL's catalog but exclude them
-- from progression; the flag remains manually reversible in the database.
UPDATE bosses AS boss
JOIN raids AS raid ON raid.id = boss.raid_id
SET boss.exclude_from_progress = 1
WHERE raid.wcl_zone_id = 53
  AND boss.wcl_id IN (3379, 3513);
