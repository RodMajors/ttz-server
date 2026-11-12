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
  ADD COLUMN browser_secret_hash CHAR(64) NULL AFTER nonce_hash;
