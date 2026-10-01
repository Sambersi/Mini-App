/**
 * config.js — Централизованные критические переменные проекта.
 * Все ключевые значения вынесены сюда для удобной настройки.
 * Импортировать: const CONFIG = require('./config');
 */
module.exports = {
    // === РЕФЕРАЛЬНАЯ СИСТЕМА ===
    // Бонус для НОВОГО пользователя (реферала)
    REFERRAL_BONUS_NEW_USER_PF: 5000,
    REFERRAL_BONUS_NEW_USER_TICKETS: 1,

    // Бонус для РЕФЕРОВОДА (пригласившего)
    REFERRAL_BONUS_REFERRER_PF: 10000,
    REFERRAL_BONUS_REFERRER_TICKETS: 1,

    // Процент DF с донатов реферала (число, не дробь: 10 = 10%)
    REFERRAL_DONATION_PERCENT_DF: 10,

    // Конфеты при регистрации реферала
    REGISTRATION_CANDY_AMOUNT: 25,

    // === БАНК РЕФЕРОВОДА ===
    // Максимальный лимит банка (PF). Свыше — бонусы сгорают.
    REFERRER_BANK_LIMIT: 25000,

    // Пороги процента от побед рефералов.
    // percent — это значение в процентах (0.1 означает 0.1%).
    REFERRER_BANK_TIERS: [
        { minRefs: 0,  maxRefs: 20,       percent: 0.1 },
        { minRefs: 21, maxRefs: 40,       percent: 0.2 },
        { minRefs: 41, maxRefs: 60,       percent: 0.3 },
        { minRefs: 61, maxRefs: 80,       percent: 0.4 },
        { minRefs: 81, maxRefs: Infinity,  percent: 0.5 },
    ],

    // === НАЧАЛЬНЫЕ ЗНАЧЕНИЯ ===
    INITIAL_BALANCE: 0,
};