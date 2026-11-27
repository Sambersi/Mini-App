CREATE TABLE IF NOT EXISTS action_logs (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `user_id` VARCHAR(191) NOT NULL,
  `action_type` LONGTEXT NOT NULL,
  `target_user_id` VARCHAR(191) NULL,
  `details` LONGTEXT NULL,
  `timestamp` DECIMAL(30,12) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_action_logs_0` (`user_id`),
  KEY `idx_action_logs_1` (`target_user_id`),
  KEY `idx_action_logs_2` (`timestamp`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS auction (
  `id` BIGINT NOT NULL,
  `prize` LONGTEXT NOT NULL,
  `minBet` BIGINT NOT NULL,
  `minStep` BIGINT NOT NULL,
  `highestBid` BIGINT NULL,
  `highestBidder` LONGTEXT NULL,
  `participants` LONGTEXT NULL,
  `bids` LONGTEXT NULL,
  `isFinished` BIGINT NULL DEFAULT 0,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS bet_history (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `user_id` VARCHAR(191) NOT NULL,
  `round_hash` VARCHAR(191) NOT NULL,
  `multiplier` LONGTEXT NOT NULL,
  `amount` BIGINT NOT NULL,
  `is_win` BIGINT NOT NULL,
  `win_amount` BIGINT NULL DEFAULT 0,
  `timestamp` DECIMAL(30,12) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_bet_history_0` (`user_id`),
  KEY `idx_bet_history_1` (`timestamp`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS boss_damage (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `user_id` VARCHAR(191) NOT NULL,
  `damage` BIGINT NULL DEFAULT 0,
  `timestamp` DECIMAL(30,12) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_boss_damage_0` (`user_id`),
  KEY `idx_boss_damage_1` (`timestamp`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS boss_state (
  `id` VARCHAR(191) NOT NULL,
  `last_attack_time` DECIMAL(30,12) NULL DEFAULT 0,
  `boss_caller_id` LONGTEXT NULL DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS bosses (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `name` LONGTEXT NOT NULL,
  `phase` BIGINT NULL DEFAULT 1,
  `start_time` DECIMAL(30,12) NULL,
  `imageFile` LONGTEXT NULL,
  `phase1_hp` BIGINT NULL DEFAULT 0,
  `phase2_hp` BIGINT NULL DEFAULT 0,
  `phase1_max_hp` BIGINT NULL DEFAULT 0,
  `phase2_max_hp` BIGINT NULL DEFAULT 0,
  `correct_button_index` BIGINT NULL DEFAULT NULL,
  `prize_type` LONGTEXT NULL,
  `prize_amount` DECIMAL(65,30) NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS chats (
  `chat_id` VARCHAR(191) NOT NULL,
  `is_double_chat` BIGINT NULL DEFAULT 0,
  `is_dice_chat` BIGINT NULL DEFAULT 0,
  PRIMARY KEY (`chat_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS daily_admin_actions (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `admin_id` VARCHAR(191) NOT NULL,
  `action_type` LONGTEXT NOT NULL,
  `target_user_id` VARCHAR(191) NOT NULL,
  `timestamp` DECIMAL(30,12) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_daily_admin_actions_0` (`admin_id`),
  KEY `idx_daily_admin_actions_1` (`target_user_id`),
  KEY `idx_daily_admin_actions_2` (`timestamp`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS daily_admin_kick_actions (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `admin_id` VARCHAR(191) NOT NULL,
  `target_user_id` VARCHAR(191) NOT NULL,
  `timestamp` DECIMAL(30,12) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_daily_admin_kick_actions_0` (`admin_id`),
  KEY `idx_daily_admin_kick_actions_1` (`target_user_id`),
  KEY `idx_daily_admin_kick_actions_2` (`timestamp`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS dice_bets (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `round_id` VARCHAR(191) NOT NULL,
  `user_id` VARCHAR(191) NOT NULL,
  `username` LONGTEXT NOT NULL,
  `amount` BIGINT NOT NULL,
  `dice1` BIGINT NULL DEFAULT NULL,
  `dice2` BIGINT NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_dice_bets_0` (`round_id`),
  KEY `idx_dice_bets_1` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS dice_bets_log (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `ts` BIGINT NOT NULL,
  `round_id` VARCHAR(191) NOT NULL,
  `chat_id` VARCHAR(191) NOT NULL,
  `user_id` VARCHAR(191) NOT NULL,
  `username` LONGTEXT NOT NULL,
  `amount` BIGINT NOT NULL,
  `dice1` BIGINT NULL DEFAULT NULL,
  `dice2` BIGINT NULL DEFAULT NULL,
  `total_points` BIGINT NULL DEFAULT NULL,
  `is_winner` BIGINT NULL DEFAULT 0,
  `win_amount` BIGINT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `idx_dice_bets_log_0` (`round_id`),
  KEY `idx_dice_bets_log_1` (`chat_id`),
  KEY `idx_dice_bets_log_2` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS dice_game_logs (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `user_id` VARCHAR(191) NOT NULL,
  `chat_id` VARCHAR(191) NULL,
  `round_id` VARCHAR(191) NULL,
  `amount` BIGINT NULL,
  `dice1` BIGINT NULL,
  `dice2` BIGINT NULL,
  `is_win` BIGINT NULL,
  `win_amount` BIGINT NULL,
  `timestamp` DECIMAL(30,12) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_dice_game_logs_0` (`user_id`),
  KEY `idx_dice_game_logs_1` (`chat_id`),
  KEY `idx_dice_game_logs_2` (`round_id`),
  KEY `idx_dice_game_logs_3` (`timestamp`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS dice_rounds (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `chat_id` VARCHAR(191) NOT NULL,
  `start_time` DECIMAL(30,12) NOT NULL,
  `end_time` DECIMAL(30,12) NOT NULL,
  `total_bank` BIGINT NULL DEFAULT 0,
  `round_id` VARCHAR(191) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_dice_rounds_0` (`round_id`),
  KEY `idx_dice_rounds_0` (`chat_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS dice_rounds_log (
  `round_id` VARCHAR(191) NOT NULL,
  `chat_id` VARCHAR(191) NOT NULL,
  `start_ts` DECIMAL(30,12) NOT NULL,
  `end_ts` DECIMAL(30,12) NULL DEFAULT NULL,
  `round_amount` BIGINT NOT NULL,
  `total_bank` BIGINT NULL DEFAULT 0,
  `participants_count` BIGINT NULL DEFAULT 0,
  `winner_id` LONGTEXT NULL DEFAULT NULL,
  `status` LONGTEXT NULL DEFAULT 'active',
  PRIMARY KEY (`round_id`),
  KEY `idx_dice_rounds_log_0` (`chat_id`),
  KEY `idx_dice_rounds_log_1` (`start_ts`),
  KEY `idx_dice_rounds_log_2` (`end_ts`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS double_bets (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `round_id` VARCHAR(191) NOT NULL,
  `chat_id` VARCHAR(191) NOT NULL,
  `user_id` VARCHAR(191) NOT NULL,
  `username` LONGTEXT NOT NULL,
  `multiplier` LONGTEXT NOT NULL,
  `amount` BIGINT NOT NULL,
  `is_win` BIGINT NULL DEFAULT 0,
  `win_amount` BIGINT NULL DEFAULT 0,
  `created_at` DECIMAL(30,12) NOT NULL,
  `game_choice` LONGTEXT NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_double_bets_0` (`round_id`),
  KEY `idx_double_bets_1` (`chat_id`),
  KEY `idx_double_bets_2` (`user_id`),
  KEY `idx_double_bets_3` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS double_bets_log (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `ts` BIGINT NOT NULL,
  `round_id` VARCHAR(191) NOT NULL,
  `user_id` VARCHAR(191) NOT NULL,
  `username` LONGTEXT NOT NULL,
  `chat_id` VARCHAR(191) NOT NULL,
  `multiplier` LONGTEXT NOT NULL,
  `amount` BIGINT NOT NULL,
  `status` LONGTEXT NOT NULL DEFAULT 'accepted',
  `reject_reason` LONGTEXT NULL DEFAULT NULL,
  `game_choice` LONGTEXT NULL DEFAULT NULL,
  `is_win` BIGINT NULL DEFAULT NULL,
  `win_amount` BIGINT NULL DEFAULT NULL,
  `payout_status` LONGTEXT NULL DEFAULT 'pending',
  `chat_title` LONGTEXT NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_double_bets_log_0` (`round_id`),
  KEY `idx_double_bets_log_1` (`user_id`),
  KEY `idx_double_bets_log_2` (`chat_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS double_game_logs (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `user_id` VARCHAR(191) NOT NULL,
  `chat_id` VARCHAR(191) NULL,
  `round_hash` VARCHAR(191) NULL,
  `multiplier` LONGTEXT NULL,
  `amount` BIGINT NULL,
  `is_win` BIGINT NULL,
  `win_amount` BIGINT NULL,
  `timestamp` DECIMAL(30,12) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_double_game_logs_0` (`user_id`),
  KEY `idx_double_game_logs_1` (`chat_id`),
  KEY `idx_double_game_logs_2` (`timestamp`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS double_notifications (
  `notification_key` VARCHAR(191) NOT NULL,
  `round_hash` VARCHAR(191) NOT NULL,
  `sent_at` DECIMAL(30,12) NOT NULL,
  PRIMARY KEY (`notification_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS double_round_state (
  `id` BIGINT NOT NULL,
  `state` LONGTEXT NOT NULL DEFAULT 'ACCEPTING',
  `hash` LONGTEXT NULL,
  `result` LONGTEXT NULL,
  `salt` LONGTEXT NULL,
  `end_time` DECIMAL(30,12) NULL,
  `cell_contents` LONGTEXT NULL,
  `final_multipliers` LONGTEXT NULL,
  `game_button_active` BIGINT NULL DEFAULT 0,
  `processed_chats` LONGTEXT NULL DEFAULT '[]',
  `game_choices` LONGTEXT NULL DEFAULT '{}',
  `global_choices` LONGTEXT NULL DEFAULT '{}',
  `notifications` LONGTEXT NULL DEFAULT '{}',
  `updated_at` DECIMAL(30,12) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS double_rounds (
  `round_id` VARCHAR(191) NOT NULL,
  `start_ts` DECIMAL(30,12) NOT NULL,
  `end_ts` DECIMAL(30,12) NULL DEFAULT NULL,
  `result_multiplier` LONGTEXT NULL DEFAULT NULL,
  `salt` LONGTEXT NULL DEFAULT NULL,
  `total_bank` BIGINT NULL DEFAULT 0,
  `bets_count` BIGINT NULL DEFAULT 0,
  `chats_count` BIGINT NULL DEFAULT 0,
  `participants_count` BIGINT NULL DEFAULT 0,
  `status` LONGTEXT NULL DEFAULT 'active',
  PRIMARY KEY (`round_id`),
  KEY `idx_double_rounds_0` (`start_ts`),
  KEY `idx_double_rounds_1` (`end_ts`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS empire_attacks (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `attacker_id` VARCHAR(191) NOT NULL,
  `defender_id` VARCHAR(191) NOT NULL,
  `business_id` BIGINT NOT NULL,
  `timestamp` DECIMAL(30,12) NULL DEFAULT (UNIX_TIMESTAMP()),
  `result` LONGTEXT NULL,
  `stolen_imp` DECIMAL(65,30) NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `idx_empire_attacks_0` (`attacker_id`),
  KEY `idx_empire_attacks_1` (`defender_id`),
  KEY `idx_empire_attacks_2` (`business_id`),
  KEY `idx_empire_attacks_3` (`timestamp`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS empire_businesses (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `owner_id` VARCHAR(191) NOT NULL,
  `type` LONGTEXT NOT NULL,
  `level` BIGINT NULL DEFAULT 1,
  `imp_generation_rate` DECIMAL(65,30) NULL DEFAULT 0,
  `max_daily_imp` BIGINT NULL DEFAULT 0,
  `imp_accumulated` DECIMAL(65,30) NULL DEFAULT 0,
  `wear_percentage` BIGINT NULL DEFAULT 0,
  `last_income_time` DECIMAL(30,12) NULL DEFAULT NULL,
  `created_at` DECIMAL(30,12) NULL DEFAULT (UNIX_TIMESTAMP()),
  PRIMARY KEY (`id`),
  KEY `idx_empire_businesses_0` (`owner_id`),
  KEY `idx_empire_businesses_1` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS empire_clan_members (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `user_id` VARCHAR(191) NOT NULL,
  `clan_id` BIGINT NOT NULL,
  `join_date` BIGINT NULL DEFAULT (UNIX_TIMESTAMP()),
  PRIMARY KEY (`id`),
  KEY `idx_empire_clan_members_0` (`user_id`),
  KEY `idx_empire_clan_members_1` (`clan_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS empire_clans (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(191) NOT NULL,
  `leader_id` VARCHAR(191) NOT NULL,
  `created_at` DECIMAL(30,12) NULL DEFAULT (UNIX_TIMESTAMP()),
  `treasury_imp` DECIMAL(65,30) NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_empire_clans_0` (`name`),
  KEY `idx_empire_clans_0` (`leader_id`),
  KEY `idx_empire_clans_1` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS empire_licenses (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `owner_id` VARCHAR(191) NOT NULL,
  `business_id` BIGINT NOT NULL,
  `daily_limit_increase` BIGINT NULL DEFAULT 0,
  `expires_at` DECIMAL(30,12) NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_empire_licenses_0` (`owner_id`),
  KEY `idx_empire_licenses_1` (`business_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS finance_log (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `ts` BIGINT NOT NULL,
  `type` LONGTEXT NOT NULL,
  `actor_user_id` VARCHAR(191) NOT NULL,
  `target_user_id` VARCHAR(191) NULL DEFAULT NULL,
  `amount` BIGINT NULL DEFAULT NULL,
  `currency` LONGTEXT NULL DEFAULT NULL,
  `ref` LONGTEXT NULL DEFAULT NULL,
  `chat_id` VARCHAR(191) NULL DEFAULT NULL,
  `reason` LONGTEXT NULL DEFAULT NULL,
  `action` LONGTEXT NULL DEFAULT NULL,
  `payload` LONGTEXT NULL DEFAULT NULL,
  `success` BIGINT NULL DEFAULT 1,
  `chat_title` LONGTEXT NULL DEFAULT NULL,
  `chat_type` LONGTEXT NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_finance_log_0` (`actor_user_id`),
  KEY `idx_finance_log_1` (`target_user_id`),
  KEY `idx_finance_log_2` (`chat_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS message_log (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `user_id` VARCHAR(191) NOT NULL,
  `ts` BIGINT NOT NULL,
  `chat_type` LONGTEXT NOT NULL,
  `chat_id` VARCHAR(191) NOT NULL,
  `chat_title` LONGTEXT NULL DEFAULT NULL,
  `message_text` LONGTEXT NOT NULL,
  `is_command` BIGINT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `idx_message_log_0` (`user_id`),
  KEY `idx_message_log_1` (`chat_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS message_logs (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `user_id` VARCHAR(191) NOT NULL,
  `chat_id` VARCHAR(191) NULL,
  `message_text` LONGTEXT NULL,
  `timestamp` DECIMAL(30,12) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_message_logs_0` (`user_id`),
  KEY `idx_message_logs_1` (`chat_id`),
  KEY `idx_message_logs_2` (`timestamp`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS mutes (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `user_id` VARCHAR(191) NOT NULL,
  `chat_id` VARCHAR(191) NOT NULL,
  `muted_until` DECIMAL(30,12) NULL,
  `reason` LONGTEXT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_mutes_0` (`user_id`,`chat_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS partner_requests (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `partner_id` VARCHAR(191) NOT NULL,
  `name` LONGTEXT NOT NULL,
  `prize_type` LONGTEXT NOT NULL,
  `prize_amount` BIGINT NOT NULL,
  `audience_type` LONGTEXT NOT NULL,
  `status` LONGTEXT NULL DEFAULT 'pending',
  `admin_message_id` BIGINT NULL,
  `created_at` DECIMAL(30,12) NULL DEFAULT (UNIX_TIMESTAMP()),
  `template` LONGTEXT NULL DEFAULT 'normal',
  `request_type` LONGTEXT NULL DEFAULT 'promo',
  PRIMARY KEY (`id`),
  KEY `idx_partner_requests_0` (`partner_id`),
  KEY `idx_partner_requests_1` (`admin_message_id`),
  KEY `idx_partner_requests_2` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS prefixes (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `prefix` LONGTEXT NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS promo_activations (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `promo_id` BIGINT NOT NULL,
  `user_id` VARCHAR(191) NOT NULL,
  `activated_at` DECIMAL(30,12) NULL DEFAULT (UNIX_TIMESTAMP()),
  PRIMARY KEY (`id`),
  KEY `idx_promo_activations_0` (`promo_id`),
  KEY `idx_promo_activations_1` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS promo_link_aliases (
  `alias` VARCHAR(191) NOT NULL,
  `promo_name` LONGTEXT NOT NULL,
  `created_at` DECIMAL(30,12) NULL DEFAULT (UNIX_TIMESTAMP()),
  PRIMARY KEY (`alias`),
  KEY `idx_promo_link_aliases_0` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS promos (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(191) NOT NULL,
  `activations_left` BIGINT NOT NULL,
  `prize_type` LONGTEXT NOT NULL,
  `prize_amount` BIGINT NOT NULL,
  `created_by` VARCHAR(191) NOT NULL,
  `min_status_id` BIGINT NOT NULL DEFAULT 0,
  `expires_at` DECIMAL(30,12) NULL DEFAULT NULL,
  `creator_id` VARCHAR(191) NULL DEFAULT NULL,
  `audience_type` LONGTEXT NULL DEFAULT 'all',
  `template` LONGTEXT NULL DEFAULT 'normal',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_promos_0` (`name`),
  KEY `idx_promos_0` (`min_status_id`),
  KEY `idx_promos_1` (`creator_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS registration_sessions (
  `user_id` BIGINT NOT NULL,
  `registration_data` LONGTEXT NULL DEFAULT NULL,
  `last_accessed` BIGINT NOT NULL,
  `started_at` DECIMAL(30,12) NULL DEFAULT 0,
  PRIMARY KEY (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS reports (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `user_id` VARCHAR(191) NOT NULL,
  `username` LONGTEXT NOT NULL,
  `report_text` LONGTEXT NOT NULL,
  `status` LONGTEXT NULL DEFAULT 'not_answered',
  `admin_response` LONGTEXT NULL DEFAULT NULL,
  `admin_id` VARCHAR(191) NULL DEFAULT NULL,
  `admin_username` LONGTEXT NULL DEFAULT NULL,
  `created_at` DECIMAL(30,12) NULL DEFAULT (UNIX_TIMESTAMP()),
  `likes` BIGINT NULL DEFAULT 0,
  `dislikes` BIGINT NULL DEFAULT 0,
  `user_feedback` LONGTEXT NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_reports_0` (`user_id`),
  KEY `idx_reports_1` (`admin_id`),
  KEY `idx_reports_2` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS skin_shop_sessions (
  `user_id` BIGINT NOT NULL,
  `skin_shop_data` LONGTEXT NULL DEFAULT NULL,
  `last_accessed` BIGINT NOT NULL,
  PRIMARY KEY (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS skins (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `name` LONGTEXT NOT NULL,
  `file_name` LONGTEXT NOT NULL,
  `price` BIGINT NOT NULL,
  `currency_type` LONGTEXT NOT NULL,
  `rarity` LONGTEXT NOT NULL,
  `glow_id` BIGINT NULL,
  `glow_file_name` LONGTEXT NULL,
  `stock` BIGINT NULL DEFAULT 0,
  `max_stock` BIGINT NULL DEFAULT 0,
  `total_serials` BIGINT NULL DEFAULT 0,
  `is_visible_in_shop` BIGINT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  KEY `idx_skins_0` (`glow_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS special_prefixes (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `prefix` VARCHAR(191) NOT NULL,
  `created_by` VARCHAR(191) NOT NULL,
  `created_at` VARCHAR(64) NULL DEFAULT (CURRENT_TIMESTAMP),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_special_prefixes_0` (`prefix`),
  KEY `idx_special_prefixes_0` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS user_attack_states (
  `user_id` VARCHAR(191) NOT NULL,
  `correct_button_index` BIGINT NULL,
  `message_id` BIGINT NULL,
  `created_at` DECIMAL(30,12) NOT NULL,
  PRIMARY KEY (`user_id`),
  KEY `idx_user_attack_states_0` (`message_id`),
  KEY `idx_user_attack_states_1` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS user_skins (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `user_id` VARCHAR(191) NOT NULL,
  `skin_id` BIGINT NOT NULL,
  `serial_number` VARCHAR(191) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_user_skins_0` (`serial_number`),
  KEY `idx_user_skins_0` (`user_id`),
  KEY `idx_user_skins_1` (`skin_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS user_weapon_durability (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `user_id` VARCHAR(191) NOT NULL,
  `weapon_id` BIGINT NOT NULL,
  `current_durability` BIGINT NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_user_weapon_durability_0` (`user_id`,`weapon_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS weapons (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `name` LONGTEXT NOT NULL,
  `image_file` LONGTEXT NOT NULL,
  `base_damage` BIGINT NOT NULL,
  `price` BIGINT NOT NULL,
  `price_type` LONGTEXT NOT NULL,
  `is_visible_in_shop` BIGINT NULL DEFAULT 1,
  `is_visible_in_case` BIGINT NULL DEFAULT 1,
  `width` BIGINT NOT NULL,
  `height` BIGINT NOT NULL,
  `x_position` BIGINT NOT NULL,
  `y_position` BIGINT NOT NULL,
  `durability` BIGINT NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS domain_import_tables (
  run_id VARCHAR(64) CHARACTER SET ascii NOT NULL,
  table_name VARCHAR(128) NOT NULL,
  source_count BIGINT NOT NULL,
  source_hash CHAR(64) CHARACTER SET ascii NOT NULL,
  target_hash CHAR(64) CHARACTER SET ascii NOT NULL,
  status VARCHAR(16) CHARACTER SET ascii NOT NULL,
  PRIMARY KEY (run_id,table_name),
  FOREIGN KEY (run_id) REFERENCES migration_runs(run_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
