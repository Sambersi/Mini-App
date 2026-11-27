CREATE TABLE IF NOT EXISTS telegram_payments (
  charge_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  request_hash CHAR(64) CHARACTER SET ascii NOT NULL,
  player_id VARCHAR(32) CHARACTER SET ascii NOT NULL,
  stars BIGINT NOT NULL CHECK (stars > 0),
  currency VARCHAR(8) CHARACTER SET ascii NOT NULL,
  result_json LONGTEXT NULL CHECK (result_json IS NULL OR JSON_VALID(result_json)),
  created_ms BIGINT NOT NULL,
  FOREIGN KEY (player_id) REFERENCES players(telegram_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
