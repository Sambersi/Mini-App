CREATE TABLE IF NOT EXISTS dice_runtime_rounds (
  round_id VARCHAR(191) PRIMARY KEY,
  entry_amount BIGINT NOT NULL,
  FOREIGN KEY (round_id) REFERENCES dice_rounds(round_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS dice_bet_operations (
  round_id VARCHAR(191) NOT NULL,
  player_id VARCHAR(32) CHARACTER SET ascii NOT NULL,
  bet_id BIGINT NOT NULL UNIQUE,
  log_id BIGINT NOT NULL UNIQUE,
  operation_key VARCHAR(150) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
  PRIMARY KEY (round_id,player_id),
  FOREIGN KEY (round_id) REFERENCES dice_runtime_rounds(round_id),
  FOREIGN KEY (bet_id) REFERENCES dice_bets(id),
  FOREIGN KEY (operation_key) REFERENCES wallet_operations(operation_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
