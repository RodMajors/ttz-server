-- Move strategy ownership and the optional default from a plan/Boss pair to the Boss.
-- Existing duplicate defaults resolve deterministically to the highest-ID plan (latest plan).
ALTER TABLE bosses
  ADD COLUMN default_strategy_id BIGINT UNSIGNED NULL
    COMMENT '该 Boss 的全局默认战术方案 ID';

UPDATE bosses AS boss
JOIN (
  SELECT progress.boss_id, progress.default_strategy_id
  FROM raid_boss_progress AS progress
  JOIN (
    SELECT boss_id, MAX(progress_plan_id) AS progress_plan_id
    FROM raid_boss_progress
    WHERE default_strategy_id IS NOT NULL
    GROUP BY boss_id
  ) AS latest
    ON latest.boss_id = progress.boss_id
   AND latest.progress_plan_id = progress.progress_plan_id
  WHERE progress.default_strategy_id IS NOT NULL
) AS boss_default ON boss_default.boss_id = boss.id
SET boss.default_strategy_id = boss_default.default_strategy_id;

ALTER TABLE bosses
  ADD UNIQUE INDEX uk_boss_default_strategy (default_strategy_id),
  ADD CONSTRAINT fk_boss_default_strategy
    FOREIGN KEY (default_strategy_id) REFERENCES boss_strategies (id)
    ON DELETE SET NULL ON UPDATE RESTRICT;

ALTER TABLE raid_boss_progress
  DROP FOREIGN KEY fk_raid_boss_progress_default_strategy,
  DROP INDEX uk_raid_boss_progress_default_strategy,
  DROP COLUMN default_strategy_id;

ALTER TABLE boss_strategies
  DROP FOREIGN KEY fk_boss_strategy_plan,
  DROP INDEX idx_boss_strategy_plan_boss,
  DROP COLUMN progress_plan_id,
  ADD INDEX idx_boss_strategy_boss (boss_id, status);
