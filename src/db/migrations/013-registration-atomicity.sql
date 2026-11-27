ALTER TABLE players MODIFY source_run_id VARCHAR(64) CHARACTER SET ascii NULL;

CREATE TABLE IF NOT EXISTS player_id_allocator (
  id TINYINT PRIMARY KEY CHECK (id = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

INSERT IGNORE INTO player_id_allocator(id) VALUES (1);

CREATE TABLE IF NOT EXISTS player_referral_intents (
  player_id VARCHAR(32) CHARACTER SET ascii PRIMARY KEY,
  referral_code TEXT NOT NULL,
  FOREIGN KEY (player_id) REFERENCES players(telegram_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS registration_completions (
  player_id VARCHAR(32) CHARACTER SET ascii PRIMARY KEY,
  result_json LONGTEXT NOT NULL CHECK (JSON_VALID(result_json)),
  completed_ms BIGINT NOT NULL,
  FOREIGN KEY (player_id) REFERENCES players(telegram_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS inventory_entries (
  operation_key VARCHAR(191) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  player_id VARCHAR(32) CHARACTER SET ascii NOT NULL,
  item_code VARCHAR(64) CHARACTER SET ascii NOT NULL,
  amount BIGINT NOT NULL,
  entry_type VARCHAR(32) CHARACTER SET ascii NOT NULL,
  FOREIGN KEY (player_id,item_code) REFERENCES inventory_balances(player_id,item_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
