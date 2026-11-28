CREATE TABLE IF NOT EXISTS double_bet_operations (
  bet_id BIGINT PRIMARY KEY,
  operation_key VARCHAR(150) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
  FOREIGN KEY (bet_id) REFERENCES double_bets_log(id),
  FOREIGN KEY (operation_key) REFERENCES wallet_operations(operation_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
