CREATE TABLE IF NOT EXISTS promo_redemptions (
  promo_id BIGINT NOT NULL,
  player_id VARCHAR(32) CHARACTER SET ascii NOT NULL,
  result_json LONGTEXT NOT NULL CHECK (JSON_VALID(result_json)),
  PRIMARY KEY (promo_id,player_id),
  FOREIGN KEY (player_id) REFERENCES players(telegram_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
