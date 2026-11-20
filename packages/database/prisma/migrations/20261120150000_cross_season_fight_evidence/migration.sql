ALTER TABLE wcl_report_fight_evidence
    DROP INDEX uk_wcl_report_fight,
    ADD UNIQUE INDEX uk_wcl_attempt_report_fight (attempt_id, report_code, fight_id),
    ADD INDEX idx_wcl_report_fight (report_code, fight_id);
