-- Review against the actual database and rehearse before applying.
-- Existing non-UNKNOWN records are conservatively treated as manually confirmed.
ALTER TABLE attendance_records
  ADD COLUMN manually_confirmed BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE attendance_records SET manually_confirmed = TRUE WHERE status <> 0 AND source = 0;
