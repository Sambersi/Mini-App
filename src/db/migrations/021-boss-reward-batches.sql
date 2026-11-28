CREATE TABLE IF NOT EXISTS boss_reward_batches (
  boss_id BIGINT PRIMARY KEY,
  result_json LONGTEXT NOT NULL CHECK (JSON_VALID(result_json)),
  settled_ms BIGINT NOT NULL,
  FOREIGN KEY (boss_id) REFERENCES bosses(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS boss_import_states (
  boss_id BIGINT PRIMARY KEY,
  source_run_id VARCHAR(64) CHARACTER SET ascii NOT NULL,
  was_defeated BOOLEAN NOT NULL,
  FOREIGN KEY (boss_id) REFERENCES bosses(id),
  FOREIGN KEY (source_run_id) REFERENCES migration_runs(run_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
