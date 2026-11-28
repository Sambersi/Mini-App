CREATE TABLE IF NOT EXISTS double_bet_cooldowns (
  player_id VARCHAR(32) CHARACTER SET ascii NOT NULL,
  multiplier VARCHAR(8) CHARACTER SET ascii NOT NULL,
  last_accepted_ms BIGINT NOT NULL,
  PRIMARY KEY (player_id,multiplier),
  FOREIGN KEY (player_id) REFERENCES players(telegram_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
