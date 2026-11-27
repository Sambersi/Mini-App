CREATE TABLE IF NOT EXISTS player_preferences (
  player_id VARCHAR(32) CHARACTER SET ascii PRIMARY KEY,
  notifications_enabled BIGINT NULL,
  disable_hyperlink BIGINT NULL,
  is_hidden_in_top BIGINT NULL,
  report_blocked BIGINT NULL,
  selected_skin_id BIGINT NULL,
  active_prefix_id BIGINT NULL,
  card_level BIGINT NULL,
  FOREIGN KEY (player_id) REFERENCES players(telegram_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS player_bonus_state (
  player_id VARCHAR(32) CHARACTER SET ascii PRIMARY KEY,
  last_bonus_time DECIMAL(30,12) NULL,
  last_private_bonus_time DECIMAL(30,12) NULL,
  web_bonus_spins BIGINT NULL,
  FOREIGN KEY (player_id) REFERENCES players(telegram_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS player_statistics (
  player_id VARCHAR(32) CHARACTER SET ascii PRIMARY KEY,
  double_wins BIGINT NULL,
  double_losses BIGINT NULL,
  double_total_bets BIGINT NULL,
  double_total_winnings BIGINT NULL,
  double_total_losses BIGINT NULL,
  round_wins BIGINT NULL,
  round_losses BIGINT NULL,
  total_rounds BIGINT NULL,
  likes_received BIGINT NULL,
  dislikes_received BIGINT NULL,
  game_wins BIGINT NULL,
  max_win_amount BIGINT NULL,
  max_bet_amount BIGINT NULL,
  current_win_streak BIGINT NULL,
  best_win_streak BIGINT NULL,
  multiplier_stats LONGTEXT NULL,
  FOREIGN KEY (player_id) REFERENCES players(telegram_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS player_activity (
  player_id VARCHAR(32) CHARACTER SET ascii PRIMARY KEY,
  last_message_ts DECIMAL(30,12) NULL,
  last_app_ts DECIMAL(30,12) NULL,
  total_messages BIGINT NULL,
  FOREIGN KEY (player_id) REFERENCES players(telegram_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS player_boss_state (
  player_id VARCHAR(32) CHARACTER SET ascii PRIMARY KEY,
  attack_power BIGINT NULL,
  energy BIGINT NULL,
  last_energy_restore DECIMAL(30,12) NULL,
  active_weapon TEXT NULL,
  FOREIGN KEY (player_id) REFERENCES players(telegram_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS player_empire_state (
  player_id VARCHAR(32) CHARACTER SET ascii PRIMARY KEY,
  empire_imp_balance DECIMAL(65,30) NULL,
  empire_total_business_level BIGINT NULL,
  empire_total_imp_generated DECIMAL(65,30) NULL,
  empire_total_imp_spent DECIMAL(65,30) NULL,
  empire_clan_id BIGINT NULL,
  empire_is_hidden BIGINT NULL,
  FOREIGN KEY (player_id) REFERENCES players(telegram_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS player_referral_state (
  player_id VARCHAR(32) CHARACTER SET ascii PRIMARY KEY,
  referral_join_date DECIMAL(30,12) NULL,
  referral_bonus_amount BIGINT NULL,
  referrer_bank DECIMAL(65,30) NULL,
  FOREIGN KEY (player_id) REFERENCES players(telegram_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS player_donation_state (
  player_id VARCHAR(32) CHARACTER SET ascii PRIMARY KEY,
  total_donated_stars BIGINT NULL,
  FOREIGN KEY (player_id) REFERENCES players(telegram_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
