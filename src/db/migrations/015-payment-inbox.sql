CREATE TABLE IF NOT EXISTS payment_inbox (
  charge_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  request_hash CHAR(64) CHARACTER SET ascii NOT NULL,
  event_json LONGTEXT NOT NULL CHECK (JSON_VALID(event_json)),
  state VARCHAR(16) CHARACTER SET ascii NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','processed')),
  result_json LONGTEXT NULL CHECK (result_json IS NULL OR JSON_VALID(result_json)),
  attempts BIGINT NOT NULL DEFAULT 0,
  last_error VARCHAR(64) CHARACTER SET ascii NULL,
  received_ms BIGINT NOT NULL,
  last_attempt_ms BIGINT NOT NULL DEFAULT 0,
  INDEX idx_payment_inbox_pending (state,received_ms)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
