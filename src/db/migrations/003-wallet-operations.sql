CREATE TABLE IF NOT EXISTS wallet_operations (
  operation_key VARCHAR(150) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  request_hash CHAR(64) CHARACTER SET ascii NOT NULL,
  result_json LONGTEXT NULL CHECK (result_json IS NULL OR JSON_VALID(result_json)),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

ALTER TABLE wallet_entries MODIFY source_run_id VARCHAR(64) CHARACTER SET ascii NULL;

ALTER TABLE wallet_entries MODIFY operation_key VARCHAR(191) CHARACTER SET ascii COLLATE ascii_bin NOT NULL;
