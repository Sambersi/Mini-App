'use strict';

// Explicit ownership of legacy player fields. Wallets, roles and inventories
// have dedicated tables; the remaining state is split by domain.
const groups = {
  player_preferences: {
    notifications_enabled:'BIGINT',disable_hyperlink:'BIGINT',is_hidden_in_top:'BIGINT',report_blocked:'BIGINT',
    selected_skin_id:'BIGINT',active_prefix_id:'BIGINT',card_level:'BIGINT',
  },
  player_bonus_state: {
    last_bonus_time:'DECIMAL(30,12)',last_private_bonus_time:'DECIMAL(30,12)',web_bonus_spins:'BIGINT',
  },
  player_statistics: {
    double_wins:'BIGINT',double_losses:'BIGINT',double_total_bets:'BIGINT',double_total_winnings:'BIGINT',double_total_losses:'BIGINT',
    round_wins:'BIGINT',round_losses:'BIGINT',total_rounds:'BIGINT',likes_received:'BIGINT',dislikes_received:'BIGINT',
    game_wins:'BIGINT',max_win_amount:'BIGINT',max_bet_amount:'BIGINT',current_win_streak:'BIGINT',best_win_streak:'BIGINT',
    multiplier_stats:'LONGTEXT',
  },
  player_activity: {last_message_ts:'DECIMAL(30,12)',last_app_ts:'DECIMAL(30,12)',total_messages:'BIGINT'},
  player_boss_state: {attack_power:'BIGINT',energy:'BIGINT',last_energy_restore:'DECIMAL(30,12)',active_weapon:'TEXT'},
  player_empire_state: {
    empire_imp_balance:'DECIMAL(65,30)',empire_total_business_level:'BIGINT',empire_total_imp_generated:'DECIMAL(65,30)',
    empire_total_imp_spent:'DECIMAL(65,30)',empire_clan_id:'BIGINT',empire_is_hidden:'BIGINT',
  },
  player_referral_state: {referral_join_date:'DECIMAL(30,12)',referral_bonus_amount:'BIGINT',referrer_bank:'DECIMAL(65,30)'},
  player_donation_state: {total_donated_stars:'BIGINT'},
};
const dedicated = new Set(['id','numeric_id','username','is_registered','registration_date','referrer_id',
  'balance','card_balance','df_balance','npf_shares','tickets','fortune_tickets','candy','secret_gifts',
  'container_type_1','container_type_2','container_type_3','card_number','account_level','transfers_blocked','is_blocked',
  'status_ids','prefix_ids','special_prefix_ids','owned_weapons','donations_history','form_ids']);

function assertPlayerFieldCoverage(columns) {
  const known=new Set([...dedicated,...Object.values(groups).flatMap(Object.keys)]);
  const unknown=columns.filter(column=>!known.has(column));
  if(unknown.length)throw Object.assign(new Error('Unmapped player columns'),{code:'PLAYER_FIELDS_UNMAPPED',details:{columns:unknown}});
}
module.exports={groups,dedicated,assertPlayerFieldCoverage};
