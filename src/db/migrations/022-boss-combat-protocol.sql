CREATE TABLE IF NOT EXISTS boss_runtime_mutex (
  id TINYINT PRIMARY KEY CHECK (id=1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
INSERT IGNORE INTO boss_runtime_mutex(id) VALUES (1);

CREATE TABLE IF NOT EXISTS boss_event_receipts (
  event_key VARCHAR(150) CHARACTER SET ascii PRIMARY KEY,
  request_hash CHAR(64) CHARACTER SET ascii NOT NULL,
  consumed_question VARCHAR(36) CHARACTER SET ascii NULL UNIQUE,
  result_json LONGTEXT NOT NULL CHECK (JSON_VALID(result_json))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS boss_damage_history (
  boss_id BIGINT NOT NULL,
  damage_id BIGINT NOT NULL,
  user_id VARCHAR(191) NOT NULL,
  damage DECIMAL(65,30) NULL,
  timestamp DECIMAL(30,12) NOT NULL,
  PRIMARY KEY (boss_id,damage_id),
  FOREIGN KEY (boss_id) REFERENCES bosses(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
