CREATE TABLE IF NOT EXISTS player_cards (
  player_id VARCHAR(32) CHARACTER SET ascii PRIMARY KEY,
  card_number VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL UNIQUE,
  account_level INT NULL DEFAULT 1,
  transfers_blocked BOOLEAN NOT NULL DEFAULT 0,
  account_blocked BOOLEAN NOT NULL DEFAULT 0,
  transfer_ceiling BIGINT NOT NULL DEFAULT 50000000,
  FOREIGN KEY (player_id) REFERENCES players(telegram_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS player_bans (
  player_id VARCHAR(32) CHARACTER SET ascii PRIMARY KEY,
  reason TEXT NULL,
  banned_until DECIMAL(30,12) NULL,
  FOREIGN KEY (player_id) REFERENCES players(telegram_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS role_catalog (
  id BIGINT PRIMARY KEY,
  name VARCHAR(191) NOT NULL,
  priority INT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS player_roles (
  player_id VARCHAR(32) CHARACTER SET ascii NOT NULL,
  role_id BIGINT NOT NULL,
  PRIMARY KEY (player_id,role_id),
  FOREIGN KEY (player_id) REFERENCES players(telegram_id),
  FOREIGN KEY (role_id) REFERENCES role_catalog(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
