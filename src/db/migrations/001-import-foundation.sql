CREATE TABLE IF NOT EXISTS schema_migrations (
  version INT PRIMARY KEY, checksum CHAR(64) CHARACTER SET ascii NOT NULL,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS migration_runs (
  run_id VARCHAR(64) CHARACTER SET ascii PRIMARY KEY,
  snapshot_sha256 CHAR(64) CHARACTER SET ascii NOT NULL,
  metadata_json LONGTEXT NOT NULL CHECK (JSON_VALID(metadata_json)),
  status VARCHAR(16) CHARACTER SET ascii NOT NULL,
  report_json LONGTEXT NULL CHECK (report_json IS NULL OR JSON_VALID(report_json)),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  verified_at TIMESTAMP NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS migration_tables (
  run_id VARCHAR(64) CHARACTER SET ascii NOT NULL,
  table_name VARCHAR(128) NOT NULL,
  metadata_json LONGTEXT NOT NULL CHECK (JSON_VALID(metadata_json)),
  source_count BIGINT NOT NULL, source_hash CHAR(64) CHARACTER SET ascii NOT NULL,
  target_hash CHAR(64) CHARACTER SET ascii NULL,
  status VARCHAR(16) CHARACTER SET ascii NOT NULL,
  PRIMARY KEY (run_id, table_name),
  FOREIGN KEY (run_id) REFERENCES migration_runs(run_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS migration_rows (
  run_id VARCHAR(64) CHARACTER SET ascii NOT NULL,
  table_name VARCHAR(128) NOT NULL,
  row_number BIGINT NOT NULL,
  payload LONGTEXT NOT NULL CHECK (JSON_VALID(payload)),
  row_hash CHAR(64) CHARACTER SET ascii NOT NULL,
  PRIMARY KEY (run_id, table_name, row_number),
  FOREIGN KEY (run_id, table_name) REFERENCES migration_tables(run_id, table_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS migration_issues (
  run_id VARCHAR(64) CHARACTER SET ascii NOT NULL,
  issue_code VARCHAR(64) CHARACTER SET ascii NOT NULL,
  record_key VARCHAR(128) NOT NULL,
  details_json LONGTEXT NOT NULL CHECK (JSON_VALID(details_json)),
  PRIMARY KEY (run_id, issue_code, record_key),
  FOREIGN KEY (run_id) REFERENCES migration_runs(run_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS runtime_control (
  id TINYINT PRIMARY KEY CHECK (id = 1),
  runtime_active BOOLEAN NOT NULL DEFAULT 0,
  projection_run_id VARCHAR(64) CHARACTER SET ascii NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS players (
  telegram_id VARCHAR(32) CHARACTER SET ascii PRIMARY KEY,
  numeric_id BIGINT NULL UNIQUE,
  display_name TEXT NOT NULL,
  registered BOOLEAN NOT NULL,
  registration_ts BIGINT NULL,
  source_run_id VARCHAR(64) CHARACTER SET ascii NOT NULL,
  FOREIGN KEY (source_run_id) REFERENCES migration_runs(run_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS wallets (
  player_id VARCHAR(32) CHARACTER SET ascii NOT NULL,
  asset VARCHAR(16) CHARACTER SET ascii NOT NULL,
  bucket VARCHAR(16) CHARACTER SET ascii NOT NULL,
  balance BIGINT NOT NULL CHECK (balance >= 0),
  PRIMARY KEY (player_id, asset, bucket),
  FOREIGN KEY (player_id) REFERENCES players(telegram_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS wallet_entries (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  operation_key VARCHAR(191) CHARACTER SET ascii NOT NULL UNIQUE,
  player_id VARCHAR(32) CHARACTER SET ascii NOT NULL,
  asset VARCHAR(16) CHARACTER SET ascii NOT NULL,
  bucket VARCHAR(16) CHARACTER SET ascii NOT NULL,
  amount BIGINT NOT NULL,
  entry_type VARCHAR(32) CHARACTER SET ascii NOT NULL,
  source_run_id VARCHAR(64) CHARACTER SET ascii NOT NULL,
  FOREIGN KEY (player_id, asset, bucket) REFERENCES wallets(player_id, asset, bucket),
  FOREIGN KEY (source_run_id) REFERENCES migration_runs(run_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS inventory_balances (
  player_id VARCHAR(32) CHARACTER SET ascii NOT NULL,
  item_code VARCHAR(64) CHARACTER SET ascii NOT NULL,
  quantity BIGINT NOT NULL CHECK (quantity >= 0),
  PRIMARY KEY (player_id, item_code),
  FOREIGN KEY (player_id) REFERENCES players(telegram_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS player_referrals (
  player_id VARCHAR(32) CHARACTER SET ascii PRIMARY KEY,
  referrer_id VARCHAR(32) CHARACTER SET ascii NOT NULL,
  CHECK (player_id <> referrer_id),
  FOREIGN KEY (player_id) REFERENCES players(telegram_id),
  FOREIGN KEY (referrer_id) REFERENCES players(telegram_id),
  INDEX idx_referrals_referrer (referrer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
