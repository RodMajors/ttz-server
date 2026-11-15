-- WCL review suggestions are separate from confirmed attendance facts.
-- Apply only after a backup and after rehearsing against a production schema copy.
CREATE TABLE wcl_attendance_suggestions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  report_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  character_id BIGINT UNSIGNED NULL,
  status TINYINT NOT NULL DEFAULT 1,
  applied_at DATETIME NULL,
  applied_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_wcl_suggestion_report_user (report_id, user_id),
  KEY idx_wcl_suggestion_user (user_id, applied_at),
  CONSTRAINT fk_wcl_suggestion_report FOREIGN KEY (report_id) REFERENCES wcl_reports (id) ON DELETE CASCADE,
  CONSTRAINT fk_wcl_suggestion_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT fk_wcl_suggestion_character FOREIGN KEY (character_id) REFERENCES characters (id) ON DELETE SET NULL,
  CONSTRAINT fk_wcl_suggestion_applied_by FOREIGN KEY (applied_by) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT chk_wcl_suggestion_status CHECK (status BETWEEN 0 AND 6)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
