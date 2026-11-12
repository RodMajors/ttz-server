-- Identity/session foundation for TTZ MVP.
-- Review and rehearse against a schema copy before production deployment.

CREATE TABLE auth_sessions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  access_token_hash CHAR(64) NOT NULL,
  refresh_token_hash CHAR(64) NULL,
  kind TINYINT NOT NULL DEFAULT 0 COMMENT '0 web cookie, 1 miniapp token',
  access_expires_at DATETIME NOT NULL,
  refresh_expires_at DATETIME NULL,
  revoked_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_auth_session_access (access_token_hash),
  UNIQUE KEY uk_auth_session_refresh (refresh_token_hash),
  KEY idx_auth_session_user (user_id, revoked_at),
  KEY idx_auth_session_refresh_expiry (refresh_expires_at),
  CONSTRAINT fk_auth_session_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT chk_auth_session_kind CHECK (kind IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

ALTER TABLE login_session
  ADD COLUMN nonce_hash CHAR(64) NULL AFTER login_no,
  ADD COLUMN browser_secret_hash CHAR(64) NULL AFTER nonce_hash,
  ADD COLUMN user_id BIGINT UNSIGNED NULL AFTER openid,
  ADD COLUMN scanned_at DATETIME NULL AFTER expire_at,
  ADD COLUMN confirmed_at DATETIME NULL AFTER scanned_at,
  ADD COLUMN consumed_at DATETIME NULL AFTER confirmed_at,
  ADD COLUMN cancelled_at DATETIME NULL AFTER consumed_at,
  ADD KEY idx_login_session_user (user_id),
  ADD KEY idx_login_session_status_expiry (status, expire_at),
  ADD CONSTRAINT fk_login_session_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL;

-- Existing QR sessions are ephemeral and cannot be trusted after the nonce upgrade.
DELETE FROM login_session;

ALTER TABLE login_session
  MODIFY COLUMN nonce_hash CHAR(64) NOT NULL,
  MODIFY COLUMN browser_secret_hash CHAR(64) NOT NULL;
