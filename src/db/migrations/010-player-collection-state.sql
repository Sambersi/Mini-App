CREATE TABLE IF NOT EXISTS player_prefix_ownership (
  player_id VARCHAR(32) CHARACTER SET ascii NOT NULL,
  kind VARCHAR(16) CHARACTER SET ascii NOT NULL,
  ordinal BIGINT NOT NULL,
  regular_prefix_id BIGINT NULL,
  special_prefix_id BIGINT NULL,
  value_json LONGTEXT NOT NULL CHECK (JSON_VALID(value_json)),
  PRIMARY KEY (player_id,kind,ordinal),
  FOREIGN KEY (player_id) REFERENCES players(telegram_id),
  FOREIGN KEY (regular_prefix_id) REFERENCES prefixes(id),
  FOREIGN KEY (special_prefix_id) REFERENCES special_prefixes(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS player_weapon_ownership (
  player_id VARCHAR(32) CHARACTER SET ascii NOT NULL,
  ordinal BIGINT NOT NULL,
  weapon_id BIGINT NULL,
  value_json LONGTEXT NOT NULL CHECK (JSON_VALID(value_json)),
  PRIMARY KEY (player_id,ordinal),
  FOREIGN KEY (player_id) REFERENCES players(telegram_id),
  FOREIGN KEY (weapon_id) REFERENCES weapons(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS player_donation_events (
  player_id VARCHAR(32) CHARACTER SET ascii NOT NULL,
  ordinal BIGINT NOT NULL,
  value_json LONGTEXT NOT NULL CHECK (JSON_VALID(value_json)),
  PRIMARY KEY (player_id,ordinal),
  FOREIGN KEY (player_id) REFERENCES players(telegram_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS player_forms (
  player_id VARCHAR(32) CHARACTER SET ascii NOT NULL,
  ordinal BIGINT NOT NULL,
  value_json LONGTEXT NOT NULL CHECK (JSON_VALID(value_json)),
  PRIMARY KEY (player_id,ordinal),
  FOREIGN KEY (player_id) REFERENCES players(telegram_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS player_invalid_lists (
  player_id VARCHAR(32) CHARACTER SET ascii NOT NULL,
  field_name VARCHAR(32) CHARACTER SET ascii NOT NULL,
  original_text LONGTEXT NOT NULL,
  PRIMARY KEY (player_id,field_name),
  FOREIGN KEY (player_id) REFERENCES players(telegram_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
