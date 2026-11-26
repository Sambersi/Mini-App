# Инвентаризация команд и кнопок

Дата: 2026-11-27. Коммит: `2784ebcc9be775a224a2ba5a1285dbf958194e7d`.

Статический снимок исходников, без запуска бота. Это исходная карта для миграции, а не список уже изменённых или проверенных сценариев. Условия маршрутизации, права, динамические callback и переходы между меню требуют отдельного сопоставления. JSON рядом содержит импорты, места создания кнопок и идентификаторы вызовов.

## Повторные регистрации callback

- `enable_notifications`: bot.js:2878, bot.js:4232
- `top_seasonal_referrals`: bot.js:3850, bot.js:3858
- `card`: bot.js:4032, bot.js:4184
- `spin_fortune_wheel`: bot.js:5033, bot.js:5093

## Входные команды

| Команда | Тип | Источник | Вызовы кандидаты |
|---|---|---|---|
| /start | start | bot.js:867 | startPayload.startsWith, startPayload.substring, require, getPromoNameByAlias, console.error, ctx.from.id.toString, getUserById, Date.now, ctx.reply.bind, ctx.replyWithHTML.bind, ctx.replyWithPhoto.bind, ctx.answerCbQuery.bind, console.log, usePromoHandler, registerHandler, Markup.inlineKeyboard, Markup.button.url, createUserLink, ctx.replyWithHTML |
| 'help' | command | bot.js:963 |  |
| 'sequential' | command | bot.js:966 |  |
| создать | text-map | bot.js:1006 | startPromoCreationSession |
| рег | text-map | bot.js:1010 | registerHandler |
| помощь | text-map | bot.js:1013 | helpHandler |
| баланс | text-map | bot.js:1016 | balanceHandler |
| /buttons | text-map | bot.js:1019 | handleChatModeKeyboard |
| /buttons@f_roobot | text-map | bot.js:1022 | handleChatModeKeyboard |
| анонимность | text-map | bot.js:1025 | toggleHyperlinkHandler |
| начать игру | text-map | bot.js:1028 | startGame |
| 2 | text-map | bot.js:1031 | handleMultiplierCommand |
| 3 | text-map | bot.js:1032 | handleMultiplierCommand |
| 5 | text-map | bot.js:1033 | handleMultiplierCommand |
| игра | text-map | bot.js:1034 | handleMultiplierCommand |
| game | text-map | bot.js:1035 | handleMultiplierCommand |
| х2 | text-map | bot.js:1036 | handleMultiplierCommand |
| х3 | text-map | bot.js:1037 | handleMultiplierCommand |
| х5 | text-map | bot.js:1038 | handleMultiplierCommand |
| бонус | text-map | bot.js:1039 | bonusHandler |
| протокол 42 | text-map | bot.js:1042 | fortyTwoHandler |
| профиль | text-map | bot.js:1051 | profileHandler |
| 🪪 профиль | text-map | bot.js:1054 | profileHandler |
| проф | text-map | bot.js:1057 | profileHandler |
| статистика | text-map | bot.js:1060 | statisticsHandler |
| стата | text-map | bot.js:1063 | statisticsHandler |
| /help | text-map | bot.js:1066 | helpHandler |
| правила | text-map | bot.js:1069 | rulesHandler |
| зарегистрировать карту | text-map | bot.js:1072 | registerCardHandler |
| карта | text-map | bot.js:1075 | cardInfoHandler |
| карты | text-map | bot.js:1078 | cardInfoHandler |
| ник | text-map | bot.js:1081 | changeNicknameHandler |
| форбс | text-map | bot.js:1084 | forbesHandler |
| топ | text-map | bot.js:1087 | forbesHandler |
| рейтинг | text-map | bot.js:1090 | forbesHandler |
| 🏆 рейтинг | text-map | bot.js:1093 | forbesHandler |
| реф | text-map | bot.js:1096 | referralLinkHandler |
| 👥 реф система | text-map | bot.js:1099 | referralLinkHandler |
| рефы | text-map | bot.js:1102 | handleMyReferrals |
| размер | text-map | bot.js:1106 | handleDbSizeCommand |
| бэкап | text-map | bot.js:1109 | handleBackupCommand |
| финансы | text-map | bot.js:1112 | financeHandler |
| экономика | text-map | bot.js:1115 | financeHandler |
| эко | text-map | bot.js:1118 | financeHandler |
| бизнес | text-map | bot.js:1121 | financeHandler |
| 🏦 финансы | text-map | bot.js:1124 | financeHandler |
| банк | text-map | bot.js:1127 | ctx.reply |
| скины | text-map | bot.js:1130 | skinShopHandler |
| донат | text-map | bot.js:1133 | handleDonationCommand |
| 🍩 донат | text-map | bot.js:1136 | handleDonationCommand |
| /delete | text-map | bot.js:1139 | deleteHandler |
| бот | text-map | bot.js:1142 | checkMasterHandler |
| /reset | text-map | bot.js:1145 | resetHandler |
| реф_вычесть | text-map | bot.js:1148 | subtractReferralsHandler |
| /changeid | text-map | bot.js:1151 | changeIdHandler |
| /свободныеид | text-map | bot.js:1154 | freeIdsHandler |
| проверить_топ | text-map | bot.js:1157 | detailedTopHandler |
| топ_кулаков | text-map | bot.js:1160 | topAttackPowerHandler |
| снятьхп | text-map | bot.js:1163 | reduceBossHpHandler |
| проверить_босстоп | text-map | bot.js:1166 | topBossDamageHandler |
| проверить_статусы | text-map | bot.js:1169 | statusReportHandler |
| смс | text-map | bot.js:1172 | sendMessageToUserHandler |
| проверить_рефтоп | text-map | bot.js:1175 | topReferrersHandler |
| новая_цена | text-map | bot.js:1178 | updateSkinPriceHandler |
| проверить_конт | text-map | bot.js:1181 | topContainersHandler |
| проверить_дф | text-map | bot.js:1185 | topDfBalanceHandler |
| проверить_акции | text-map | bot.js:1188 | topNpfSharesHandler |
| проверить_карты | text-map | bot.js:1191 | topCardBalanceHandler |
| проверить_скины | text-map | bot.js:1194 | checkSkins |
| блок_переводы | text-map | bot.js:1197 | blockTransfersHandler |
| разблок_переводы | text-map | bot.js:1200 | unblockTransfersHandler |
| чек_скин | text-map | bot.js:1203 | checkSkinImage |
| выдать_скин | text-map | bot.js:1206 | giveSkinHandler |
| забрать_скин | text-map | bot.js:1209 | takeSkinHandler |
| забор | text-map | bot.js:1216 | takeHandler |
| дать | text-map | bot.js:1219 | giveHandler |
| уровень | text-map | bot.js:1222 | showAccountLevelMenu |
| объявление | text-map | bot.js:1231 | callEveryoneHandler |
| завершить_аукцион | text-map | bot.js:1234 | isAdmin, endAuction |
| аук_инфо | text-map | bot.js:1238 | isAdmin, ctx.reply, exportAuctionBids |
| новый_аукцион | text-map | bot.js:1244 | isAdmin, ctx.message.text.split(/\s+/).slice, ctx.message.text.split, ctx.reply, parseInt, args.slice(2).join, args.slice, isNaN, startNewAuction |
| аук | text-map | bot.js:1266 | auctionHandler |
| аукцион | text-map | bot.js:1269 | auctionHandler |
| приложение | text-map | bot.js:1272 | sendMiniAppMessage |
| новый_босс | text-map | bot.js:1276 | isAdmin, ctx.reply, ctx.message.text.split(/\s+/).slice, ctx.message.text.split, parseInt, isNaN, startNewBoss, console.error |
| бос | text-map | bot.js:1306 | bossHandler |
| босс | text-map | bot.js:1309 | bossHandler |
| 👾 босс | text-map | bot.js:1312 | bossHandler |
| боссс | text-map | bot.js:1315 | bossHandler |
| атака | text-map | bot.js:1319 | ctx.from.id.toString, checkCooldown, ctx.reply, handleCallbackWithErrorHandling, attackBoss |
| энергия | text-map | bot.js:1332 | energyHandler |
| info_balance | text-map | bot.js:1335 | infoBalanceHandler |
| set_balance | text-map | bot.js:1338 | setBalanceHandler |
| дать_энергию | text-map | bot.js:1341 | giveEnergyHandler |
| забрать_энергию | text-map | bot.js:1344 | takeEnergyHandler |
| повысить урон | text-map | bot.js:1347 | ctx.from.id.toString, checkCooldown, ctx.reply, handleCallbackWithErrorHandling, upgradeAttackPower |
| босс_топ | text-map | bot.js:1361 | bossTopHandler |
| блок_топа | text-map | bot.js:1364 | toggleTopVisibilityHandler |
| разблок_топа | text-map | bot.js:1367 | unblockTopVisibilityHandler |
| создать_префикс | text-map | bot.js:1370 | createSpecialPrefixCommand |
| выдать_спец_префикс | text-map | bot.js:1373 | assignSpecialPrefix |
| забрать_спец_префикс | text-map | bot.js:1376 | removeSpecialPrefix |
| сменить_ник | text-map | bot.js:1379 | changeNicknameByNumericIdHandler |
| список_оружия | text-map | bot.js:1382 | checkPlayerWeaponsAndDamage |
| сотрудничество | text-map | bot.js:1386 | handlePartnershipCommand |
| кейсы | text-map | bot.js:1389 | sendContainerInfoMessage |
| кейс | text-map | bot.js:1392 | sendContainerInfoMessage |
| пополнить | text-map | bot.js:1395 | topUpHandler |
| снять | text-map | bot.js:1398 | withdrawHandler |
| перевод | text-map | bot.js:1401 |  |
| передать | text-map | bot.js:1402 |  |
| перевести | text-map | bot.js:1403 |  |
| магазин | text-map | bot.js:1404 |  |
| шоп | text-map | bot.js:1405 |  |
| удалить промо | text-map | bot.js:1406 | ctx.reply, deletePromoHandler |
| список промо | text-map | bot.js:1412 | ctx.reply, listPromosHandler |
| добавить админа | text-map | bot.js:1418 | ctx.reply, addAdmin |
| удалить админа | text-map | bot.js:1424 | ctx.reply, removeAdmin |
| список админов | text-map | bot.js:1430 | ctx.reply, listAdmins |
| админ панель | text-map | bot.js:1436 | ctx.reply, showAdminPanel |
| бан | text-map | bot.js:1442 | isAdmin_ban, ctx.reply, message.text.trim, text.split, getUserById, repliedMessage.from.id.toString, parseFloat, isNaN, parts.slice(thirdParamStartIndex).join, parts.slice, parts.slice(1).join, parseInt, parts.slice(3).join, `бан ${numericId} ${banType} ${reason \|\| ''}`.trim, require('./admin/blacklistManagement').banUserHandler, require, console.error |
| разбан | text-map | bot.js:1513 | isAdmin_ban, ctx.reply, message.text.trim, text.split, getUserById, repliedMessage.from.id.toString, parseInt, isNaN, require('./admin/blacklistManagement').unbanUserHandler, require, console.error |
| рассылка | text-map | bot.js:1559 | isAdmin, ctx.reply, require('./admin/broadcast').broadcastMessage, require |
| чс | text-map | bot.js:1569 | ctx.reply, require('./admin/blacklistManagement').listBannedPlayersHandler, require |
| репорт | text-map | bot.js:1575 | ctx.message.text.trim, text.split(/\s+/).slice(1).join, text.split(/\s+/).slice, text.split, ctx.reply, require('./admin/reports').createReport, require, console.error |
| ответить | text-map | bot.js:1594 | ctx.reply, require('./admin/reports').answerReport, require |
| список репортов | text-map | bot.js:1600 | ctx.reply, require('./admin/reports').getReports, require |
| контейнер | text-map | bot.js:1606 | ctx.message.text.trim().toLowerCase, ctx.message.text.trim, text.split, parseInt, [1, 2, 3].includes, ctx.reply, isNaN, ctx.from.id.toString, getUserStatuses, userStatuses.includes, openContainerHandler, buyContainerHandler, console.error |
| контейнеры | text-map | bot.js:1653 | containersHandler |
| конт | text-map | bot.js:1656 | containersHandler |
| конты | text-map | bot.js:1659 | containersHandler |
| 📦 контейнеры | text-map | bot.js:1662 | containersHandler |
| список статусов | text-map | bot.js:1665 |  |
| наградить | text-map | bot.js:1666 |  |
| разжаловать | text-map | bot.js:1667 |  |
| /id | text-map | bot.js:1668 |  |
| ид | text-map | bot.js:1669 |  |
| /prof | text-map | bot.js:1670 |  |
| чек | text-map | bot.js:1671 |  |
| гет | text-map | bot.js:1672 |  |
| игровые режимы | text-map | bot.js:1673 |  |
| дабл | text-map | bot.js:1674 |  |
| рулетка | text-map | bot.js:1675 | handleCallbackWithErrorHandling, rouletteHandler |
| казино | text-map | bot.js:1680 | handleCallbackWithErrorHandling, rouletteHandler |
| азино | text-map | bot.js:1685 | handleCallbackWithErrorHandling, rouletteHandler |
| 🎮 игровые режимы | text-map | bot.js:1690 |  |
| выдать | text-map | bot.js:1691 | ctx.from.id.toString, isTechAdmin, ctx.reply, parts[1].toLowerCase, parseInt, isNaN, parseAmountWithSuffix, addBalanceHandler, assignPrefix, console.error |
| забрать | text-map | bot.js:1745 | ctx.from.id.toString, isTechAdmin, ctx.reply, parts[1].toLowerCase, parseInt, isNaN, parseAmountWithSuffix, removeBalanceHandler, removePrefix, console.error |
| промо | text-map | bot.js:1798 | ctx.reply, usePromoHandler |
| мут | text-map | bot.js:1805 | muteUserHandler, console.error, ctx.reply |
| размут | text-map | bot.js:1821 | unmuteUserHandler, console.error, ctx.reply |
| донатная статистика | text-map | bot.js:1836 | require('./handlers/donationStats').getDonationStatistics, require |
| топ донатеров | text-map | bot.js:1839 | getTopDonators |
| топ_рефералов | text-map | bot.js:1842 | topReferralsHandler |
| мутлист | text-map | bot.js:1845 | listMutedPlayersHandler |
| все префиксы | text-map | bot.js:1848 | listAllPrefixes |
| мои префиксы | text-map | bot.js:1851 | listUserPrefixes |
| сменить_реф | text-map | bot.js:1855 | changeReferralBonus |
| задать_уровень | text-map | bot.js:1858 | setCardLevelHandler |
| сменить_реф_бонус_30000 | text-map | bot.js:1861 | setReferralBonusForAllUsers |
| уведы вкл | text-map | bot.js:1864 | enableNotificationsHandler |
| уведы выкл | text-map | bot.js:1867 | disableNotificationsHandler |
| чатид | text-map | bot.js:1870 | sendChatIdToUser |
| dice | text-map | bot.js:1873 | diceHandler |
| удалить_репорт | text-map | bot.js:1876 | ctx.reply, parseInt, isNaN, require('./admin/reports').deleteReportById, require, console.error |
| установить префикс | text-map | bot.js:1898 | setActivePrefix |
| !ник | text-map | bot.js:1901 | changeNicknameHandler |
| кик | text-map | bot.js:1905 | kickUserHandler, console.error, ctx.reply |
| конфеты | text-map | bot.js:1926 | require, candyHandler |
| ивент | text-map | bot.js:1930 | require, candyHandler |
| хэллоуин | text-map | bot.js:1934 | require, candyHandler |
| хэллуин | text-map | bot.js:1938 | require, candyHandler |
| хэлоуин | text-map | bot.js:1942 | require, candyHandler |
| 🎃 halloween event | text-map | bot.js:1946 | require, candyHandler |
| выдать_конфеты | text-map | bot.js:1950 | require('./Events/Halloween/adminCandy').giveCandyHandler, require |
| забрать_конфеты | text-map | bot.js:1953 | require('./Events/Halloween/adminCandy').takeCandyHandler, require |
| обменник | text-map | bot.js:1956 | require('./Events/Halloween/exchange.js').exchangeCandyToTickets, require |
| колесо | text-map | bot.js:1959 | require, fortuneWheelHandler |
| фортуна | text-map | bot.js:1963 | require, fortuneWheelHandler |
| фартуна | text-map | bot.js:1967 | require, fortuneWheelHandler |
| хэллоуин_шоп | text-map | bot.js:1971 | require, candyShopMenu |
| скрепыш | text-map | bot.js:1975 | showSecretGiftMenu |
| кнопка | text-map | bot.js:1978 | handleTestCommand |
| выдать_билетики | text-map | bot.js:1981 | giveTicketsHandler |
| забрать_билетики | text-map | bot.js:1984 | takeTicketsHandler |
| партнер | text-map | bot.js:1987 | ctx.reply, showPartnerMenu |
| партнёр | text-map | bot.js:1991 | ctx.reply, showPartnerMenu |
| партнёрка | text-map | bot.js:1995 | ctx.reply, showPartnerMenu |
| партнерка | text-map | bot.js:1999 | ctx.reply, showPartnerMenu |
| запросы | text-map | bot.js:2003 | ctx.reply, showAdminRequestsMenu |
| запрос | text-map | bot.js:2007 | ctx.reply, ctx.message.text.trim().split, ctx.message.text.trim, openAdminRequestById |
| блок_репорт | text-map | bot.js:2012 | parseInt, isNaN, ctx.reply, require('./admin/reports').blockUserReports, require |
| разблок_репорт | text-map | bot.js:2017 | parseInt, isNaN, ctx.reply, require('./admin/reports').unblockUserReports, require |
| очистить_репорты | text-map | bot.js:2022 | require('./admin/reports').clearAllReports, require |

## Обработчики кнопок

| Callback или шаблон | Источник | Обработчик |
|---|---|---|
| 'sequential_cancel' | bot.js:969 | handleCancel |
| 'manage_profile' | bot.js:2874 | async (ctx) => { await handleManageProfile(ctx); } |
| 'enable_notifications' | bot.js:2878 | async (ctx) => { await enableNotificationsHandler(ctx); } |
| 'disable_notifications' | bot.js:2882 | async (ctx) => { await disableNotificationsHandler(ctx); } |
| 'toggle_hyperlink' | bot.js:2886 | async (ctx) => { await toggleHyperlinkHandler(ctx, db); // Убедитесь, что db доступен } |
| 'back_to_profile' | bot.js:2890 | async (ctx) => { await profileHandler(ctx); } |
| 'list_admins' | bot.js:2897 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { await handleListAdmins(ctx); }); } } |
| 'admin_commands' | bot.js:2905 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { await handleAdminCommands(ctx); }); } } |
| 'close_panel' | bot.js:2913 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { await handleClosePanel(ctx); }); } } |
| /^open_container_(\d+)$/ | bot.js:2931 | async (ctx) => { if (await checkUserStatus(ctx)) { const userId = ctx.from.id.toString(); // ID пользователя const containerNumber = parseInt(ctx.match[1], 10); // Получаем номер контейнера из callback_data // Проверяем  |
| /^game_choice_(-?\d+)_([a-z]+)$/ | bot.js:2952 | async (ctx) => { try { if (!(await checkUserStatus(ctx))) return ctx.answerCbQuery('❌ Вы не можете участвовать в игре.'); const [, chatIdStr, choice] = ctx.match; const chatId = parseInt(chatIdStr, 10); const userId = ct |
| /^report_feedback_(\d+)_(like\|dislike)$/ | bot.js:2992 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { const reportId = parseInt(ctx.match[1], 10); // ID репорта const feedbackType = ctx.match[2]; // Тип обратной св |
| /^participate_(.+)$/ | bot.js:3048 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { const roundId = ctx.match[1]; const chatId = ctx.chat.id; const userId = ctx.from.id.toString(); const usernameF |
| /^dice_accept_auto_(\d+)$/ | bot.js:3097 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { const amount = parseInt(ctx.match[1], 10); const chatId = ctx.chat.id; const userId = ctx.from.id.toString(); co |
| /^play_with_bot_(.+)$/ | bot.js:3127 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { const roundId = ctx.match[1]; const chatId = ctx.chat.id; const userId = ctx.from.id.toString(); const result =  |
| /^repeat_round_(\d+)$/ | bot.js:3145 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { const betAmount = parseInt(ctx.match[1], 10); // Извлекаем сумму ставки из callback_data const chatId = ctx.chat |
| /^donate_(\d+)$/ | bot.js:3203 | async (ctx) => { try { const userId = ctx.from.id.toString(); const amount = parseInt(ctx.match[1], 10); // Получаем сумму доната из callback_data // Передаем управление в функцию handleDonation await handleDonation(ctx, |
| 'donation_stats' | bot.js:3308 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { const userId = ctx.from.id.toString(); await require('./handlers/donationStats').getDonationStatistics(ctx); }); |
| 'donate_cancel' | bot.js:3318 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { console.log(`Отмена доната пользователем ${ctx.from.id}`); await ctx.answerCbQuery('😢 Донат отменен.'); await c |
| /^page_(\d+)$/ | bot.js:3329 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { await handlePageChange(ctx); }); } } |
| 'show_statistics' | bot.js:3338 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { await showStatisticsMenu(ctx); }); } } |
| 'statistics_handler' | bot.js:3347 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { await statisticsHandler(ctx); }); } } |
| 'donation_statistics' | bot.js:3356 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { await getDonationStatistics(ctx); }); } } |
| 'select_skin_to_buy' | bot.js:3365 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { await handleSelectSkinToBuy(ctx); }); } } |
| /^(prev\|next)_skin_(\d+)$/ | bot.js:3374 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { await handleSkinNavigation(ctx); }); } } |
| /^buy_skin_(\d+)$/ | bot.js:3383 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { await handleBuySkin(ctx); }); } } |
| /^apply_skin_(\d+)$/ | bot.js:3392 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { await handleApplySkin(ctx); }); } } |
| 'partnership_info' | bot.js:3400 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { await handlePartnershipCommand(ctx); }); } } |
| 'open_containers' | bot.js:3408 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { await containersHandler(ctx); }); } } |
| 'close_shop' | bot.js:3417 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { await handleCloseShop(ctx); }); } } |
| 'my_skins' | bot.js:3426 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { await handleMySkins(ctx); }); } } |
| /^(prev\|next)_my_skin_(\d+)$/ | bot.js:3435 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { await handleMySkinsNavigation(ctx, ctx.match[1]); }); } } |
| 'to_shop' | bot.js:3444 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { await handleToShop(ctx); }); } } |
| /^captcha_\w+$/ | bot.js:3454 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { await handleCaptchaCorrect(ctx); }); } } |
| /^wrong_\w+$/ | bot.js:3463 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { await handleCaptchaWrong(ctx); }); } } |
| /^casino_captcha_\d+$/ | bot.js:3472 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { await casinoCaptchaCorrectHandler(ctx); }); } } |
| /^casino_wrong_\d+$/ | bot.js:3480 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { await casinoCaptchaWrongHandler(ctx); }); } } |
| 'accept_policy' | bot.js:3489 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { await handlePrivacyPolicyAcceptance(ctx); }); } } |
| 'referral_link' | bot.js:3498 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { await referralLinkHandler(ctx); }); } } |
| 'donate' | bot.js:3509 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { await handleDonationCommand(ctx); // Вызываем обработчик из модуля donations/donationShop }); } } |
| 'donate_balance' | bot.js:3518 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { await sendDonationOptions(ctx); // Вызываем функцию для пополнения баланса }); } } |
| 'donate_shop' | bot.js:3527 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { await donationShop.showDonationShopMenu(ctx); // Показываем меню донат-шопа }); } } |
| 'donate_back' | bot.js:3536 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { await donationShop.showDonationMenu(ctx); // Возвращаемся к начальному меню доната }); } } |
| 'donate_currency_pf' | bot.js:3545 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { await donationShop.showCurrencyPFMenu(ctx); // Показываем меню покупки валюты }); } } |
| 'buy_pf_15000' | bot.js:3554 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { await donationShop.handleBuyPF(ctx, 20000, 180); // 15.000 PF за 130 DF }); } } |
| 'buy_pf_50000' | bot.js:3562 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { await donationShop.handleBuyPF(ctx, 100000, 900); // 50.000 PF за 420 DF }); } } |
| 'buy_pf_100000' | bot.js:3570 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { await donationShop.handleBuyPF(ctx, 500000, 3600); // 500.000 PF за 3600 DF }); } } |
| 'buy_pf_250000' | bot.js:3578 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { await donationShop.handleBuyPF(ctx, 1000000, 6800); // PF за 000 DF }); } } |
| 'buy_pf_1000000' | bot.js:3586 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { await donationShop.handleBuyPF(ctx, 3000000, 17900); // 3.000.000 PF за 00 DF }); } } |
| 'buy_pf_2250000' | bot.js:3594 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { await donationShop.handleBuyPF(ctx, 10000000, 44750); // PF за DF }); } } |
| 'pf_info' | bot.js:3603 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { await donationShop.showPFInfo(ctx); // Показываем информацию о PF }); } } |
| 'donate_currency_pf_back' | bot.js:3612 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { await donationShop.showDonationShopMenu(ctx); // Возвращаемся в донат-шоп }); } } |
| 'donate_statuses' | bot.js:3621 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { await donationShop.showStatusesMenu(ctx); // Показываем меню покупки статусов }); } } |
| 'buy_status_gold' | bot.js:3630 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { await donationShop.handleBuyStatus(ctx, 'GOLD', 899, 6); // 899 DF за статус GOLD (ID 6) }); } } |
| 'buy_status_platinum' | bot.js:3638 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { await donationShop.handleBuyStatus(ctx, 'PLATINUM', 1999, 5); // 1999 DF за статус PLATINUM (ID 5) }); } } |
| 'buy_status_diamond' | bot.js:3646 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { await donationShop.handleBuyStatus(ctx, 'DIAMOND', 4499, 4); // 4499 DF за статус DIAMOND (ID 4) }); } } |
| 'buy_status_admin' | bot.js:3654 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { await donationShop.handleBuyStatus(ctx, 'Администратор', 6499, 1); // 6499 DF за статус Администратор (ID 1) }); |
| 'status_info' | bot.js:3663 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { await donationShop.showStatusInfo(ctx); // Показываем информацию о статусах }); } } |
| 'donate_statuses_back' | bot.js:3672 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { await donationShop.showDonationShopMenu(ctx); // Возвращаемся в донат-шоп }); } } |
| 'status_info_Администратор' | bot.js:3681 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { await donationShop.handleStatusInfo(ctx, 'Администратор'); // Показываем информацию о статусе Администратор });  |
| 'status_info_DIAMOND' | bot.js:3689 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { await donationShop.handleStatusInfo(ctx, 'DIAMOND'); // Показываем информацию о статусе DIAMOND }); } } |
| 'status_info_PLATINUM' | bot.js:3697 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { await donationShop.handleStatusInfo(ctx, 'PLATINUM'); // Показываем информацию о статусе PLATINUM }); } } |
| 'status_info_GOLD' | bot.js:3705 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { await donationShop.handleStatusInfo(ctx, 'GOLD'); // Показываем информацию о статусе GOLD }); } } |
| 'status_info_back' | bot.js:3714 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { await donationShop.showStatusesMenu(ctx); // Возвращаемся в меню покупки статусов }); } } |
| 'donate_containers' | bot.js:3725 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { await donationShop.showContainersMenu(ctx); // Показываем меню покупки контейнеров }); } } |
| 'buy_container_1' | bot.js:3734 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { await donationShop.handleBuyContainer(ctx, 1, 200); // 1 контейнер за 100 DF }); } } |
| 'buy_container_5' | bot.js:3742 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { await donationShop.handleBuyContainer(ctx, 5, 900); // 5 контейнеров за 449 DF }); } } |
| 'buy_container_25' | bot.js:3750 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { await donationShop.handleBuyContainer(ctx, 25, 4500); // 25 контейнеров за 2299 DF }); } } |
| 'buy_container_100' | bot.js:3758 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { await donationShop.handleBuyContainer(ctx, 100, 17000); // 100 контейнеров за 8499 DF }); } } |
| 'container_info' | bot.js:3767 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { await donationShop.showContainerInfo(ctx); // Показываем информацию о контейнерах }); } } |
| 'donate_containers_back' | bot.js:3776 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { await donationShop.showDonationShopMenu(ctx); // Возвращаемся в донат-шоп }); } } |
| 'donate_skins' | bot.js:3785 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { await skinShopHandler(ctx); // Вызываем функцию из импортированного модуля }); } } |
| 'my_referrals' | bot.js:3794 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { await handleMyReferrals(ctx); // Вызываем обработчик без проверок }); } } |
| 'my_prefixes' | bot.js:3802 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { await listUserPrefixes(ctx); // Вызываем обработчик без проверок }); } } |
| 'ref_info' | bot.js:3811 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { await handleRefInfo(ctx); // Вызываем обработчик без проверок }); } } |
| 'top_pf' | bot.js:3819 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { await require('./handlers/top').forbesHandler(ctx, db); }); } } |
| 'top_players' | bot.js:3827 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { await require('./handlers/top').forbesHandler(ctx, db); }); } } |
| 'top_referrals' | bot.js:3836 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { await require('./handlers/top').handleTopReferrals(ctx); }); } } |
| 'contest_info' | bot.js:3846 | async (ctx) => { await handleContestInfo(ctx); } |
| 'top_seasonal_referrals' | bot.js:3850 | async (ctx) => { await topSeasonalReferralsHandler(ctx); } |
| 'back_to_ref_menu' | bot.js:3854 | async (ctx) => { await handleBackToRefMenu(ctx); } |
| 'top_seasonal_referrals' | bot.js:3858 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { await require('./handlers/referralSystem').topSeasonalReferralsHandler(ctx); }); } } |
| 'top_donators' | bot.js:3866 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { await require('./handlers/top').handleTopDonators(ctx); }); } } |
| 'topup_card' | bot.js:3874 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { await showTopUpInstruction(ctx); // Вызов функции с инструкциями }); } } |
| /buy_discounted_status_(.+)/ | bot.js:3891 | async (ctx) => { try { const [_, statusName] = ctx.match; // Извлекаем только название статуса const availableStatuses = [ { name: 'GOLD', cost: 674, id: 6 }, // 899 - 25% = 674 { name: 'PLATINUM', cost: 1499, id: 5 }, / |
| 'donate_shares_back' | bot.js:3919 | async (ctx) => { try { // Возвращаемся к основному меню донат-шопа await showDonationShopMenu(ctx); } catch (error) { console.error('Ошибка при возврате из меню акций:', error); ctx.reply('Произошла ошибка. Попробуйте по |
| 'double_plus' | bot.js:3943 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { await handleDoublePlusButton(ctx); }); } } |
| 'dice' | bot.js:3951 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { await handleDiceButton(ctx); }); } } |
| 'roulete' | bot.js:3959 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { // Подтверждаем нажатие кнопки await ctx.answerCbQuery(); // Редактируем сообщение или отправляем новое с подска |
| 'about_double_plus' | bot.js:3981 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { await handleAboutDoublePlusButton(ctx); }); } } |
| 'about_dice' | bot.js:3989 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { await handleAboutDiceButton(ctx); }); } } |
| 'back_to_modes' | bot.js:3997 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { await handleBackToModesButton(ctx); }); } } |
| 'register_card' | bot.js:4006 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { await handleRegisterCardAction(ctx); }); } } |
| 'manage_card' | bot.js:4015 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { await handleManageCardButton(ctx); }); } } |
| 'skin_shop' | bot.js:4024 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { await skinShopHandler(ctx); }); } } |
| 'card' | bot.js:4032 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { await cardInfoHandler(ctx); }); } } |
| 'card_info' | bot.js:4041 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { await handleCardInfoButton(ctx); }); } } |
| 'back_to_card_menu' | bot.js:4050 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { await cardInfoHandler(ctx); }); } } |
| 'finance_menu' | bot.js:4058 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { try { await ctx.answerCbQuery(); } catch (error) { console.error('[FINANCE] Не удалось подтвердить нажатие кнопк |
| 'close_card_menu' | bot.js:4083 | async (ctx) => { try { const messageId = ctx.callbackQuery?.message?.message_id; if (messageId) { await ctx.deleteMessage(messageId); } } catch (error) { console.error('[CARD] Не удалось закрыть меню карты:', error); } t |
| /^(?:upgrade_level_confirm\|account_level_confirm)_(\d+)$/ | bot.js:4103 | async (ctx) => { if (!(await checkUserStatus(ctx))) return; const targetLevel = Number(ctx.match[1]); if (!Number.isInteger(targetLevel) \|\| targetLevel < 1 \|\| targetLevel > 20) { try { await ctx.answerCbQuery('❌ Некоррек |
| /^(?:show_upgrade_grid\|account_level_grid)$/ | bot.js:4132 | async (ctx) => { if (!(await checkUserStatus(ctx))) return; try { await handleShowAccountLevelGrid(ctx); } catch (error) { console.error('[LEVEL] Ошибка открытия сетки прокачки:', error); try { await ctx.reply('❌ Не удал |
| 'account_level_menu' | bot.js:4149 | async (ctx) => { if (!(await checkUserStatus(ctx))) return; try { await handleUpgradeAccountLevel(ctx); } catch (error) { console.error('[LEVEL] Ошибка открытия меню уровня:', error); try { await ctx.reply('❌ Не удалось  |
| 'account_level_noop' | bot.js:4166 | async (ctx) => { try { await ctx.answerCbQuery('❌ Недостаточно средств для повышения уровня.'); } catch (error) { console.warn('[LEVEL] Не удалось ответить на noop callback:', error.message); } } |
| 'back_to_main_menu' | bot.js:4175 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { await ctx.reply('Вы вернулись в главное меню.'); }); } } |
| 'card' | bot.js:4184 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { await cardInfoHandler(ctx); }); } } |
| 'finance_open_card' | bot.js:4192 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { await handleFinanceCardAction(ctx); }); } } |
| 'finance_open_bank' | bot.js:4200 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { await handleFinanceBankAction(ctx); }); } } |
| 'finance_open_crypto' | bot.js:4208 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { await handleFinanceCryptoAction(ctx); }); } } |
| 'finance_open_skin_market' | bot.js:4216 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { await handleFinanceSkinMarketAction(ctx); }); } } |
| /disable_notifications:(\d+)/ | bot.js:4225 | async (ctx) => { await handleCallbackWithErrorHandling(ctx, async () => { await handleNotificationButton(ctx); }); } |
| 'enable_notifications' | bot.js:4232 | async (ctx) => { await handleCallbackWithErrorHandling(ctx, async () => { await handleEnableNotificationsButton(ctx); }); } |
| 'donate_unique_offers' | bot.js:4240 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { await require('./donations/donationShop').showUniqueOffersMenu(ctx); }); } } |
| 'donate_shares' | bot.js:4249 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { await ctx.replyWithHTML( `🚀 <b>Акции</b>\n\n` + `На данный момент никаких акций не проводится!\n\n` + `Следите  |
| /status_list_(.+)/ | bot.js:4274 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { try { // Вызываем нашу функцию handleStatusList, которая формирует файлы await handleStatusList(ctx); } catch (e |
| /^bet_(x\d+\|GAME)_(\d+)$/ | bot.js:4289 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { const [, multiplier, amount] = ctx.match; const userId = ctx.from.id; const userFromDb = await getUserById(userI |
| /^start_dice_(\d+)$/ | bot.js:4342 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { try { const betAmount = parseInt(ctx.match[1], 10); const chatId = ctx.chat.id; const userId = ctx.from.id; cons |
| 'topup_all' | bot.js:4381 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { await handleTopUpAll(ctx); // Вызываем обработчик пополнения всей суммы }); } } |
| 'withdraw_all' | bot.js:4390 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { await handleWithdrawAll(ctx); // Вызываем обработчик снятия всей суммы }); } } |
| 'show_topup_instruction' | bot.js:4399 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { await showTopUpInstruction(ctx); // Вызываем функцию из cardTopUp.js }); } } |
| 'show_withdraw_instruction' | bot.js:4408 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { await showWithdrawInstruction(ctx); // Вызываем функцию из cardTopUp.js }); } } |
| 'buy_id_6' | bot.js:4426 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { await require('./donations/donationShop').handleBuyId(ctx, 6, 5000); }); } } |
| /repeat_bet_(\d+)/ | bot.js:4444 | async (ctx) => { await handleCallbackWithErrorHandling(ctx, async () => { if (!(await checkUserStatus(ctx))) return; await repeatBetHandler(ctx); }); } |
| /double_bet_(\d+)/ | bot.js:4452 | async (ctx) => { await handleCallbackWithErrorHandling(ctx, async () => { if (!(await checkUserStatus(ctx))) return; // Извлекаем сумму удвоенной ставки из callback_data const doubledBetAmount = parseInt(ctx.match[1]); / |
| /make_bid_(\d+)/ | bot.js:4470 | async (ctx) => { await handleCallbackWithErrorHandling(ctx, async () => { if (!(await checkUserStatus(ctx))) return; // Извлекаем сумму ставки из callback_data const amount = parseInt(ctx.match[1]); // Проверяем, что сум |
| 'show_coefficients' | bot.js:4488 | async (ctx) => { await handleCallbackWithErrorHandling(ctx, async () => { if (!(await checkUserStatus(ctx))) return; // Текст с коэффициентами (исправленные множители) const coefficientsText = ` ✖️ КОЭФФИЦИЕНТЫ КОМБИНАЦИ |
| 'open_contest' | bot.js:4532 | async (ctx) => { try { await handleContestInfo(ctx); // Вызываем функцию handleContestInfo } catch (error) { console.error('Ошибка при обработке нажатия на кнопку "Открыть конкурс":', error); await ctx.reply('Произошла о |
| 'auction' | bot.js:4542 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { // Вызываем функцию auctionHandler для обработки запроса await auctionHandler(ctx); }); } } |
| /help_page_(\d+)/ | bot.js:4552 | handleHelpNavigation |
| 'attack_boss' | bot.js:4558 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { await attackBoss(ctx); // Вызываем функцию атаки босса }); } } |
| /attack_boss_(\d+)/ | bot.js:4567 | async (ctx) => { await handleCallbackWithErrorHandling(ctx, async () => { try { const userId = ctx.from.id.toString(); // ID текущего пользователя const selectedButtonIndex = parseInt(ctx.match[1], 10); // Индекс нажатой |
| 'boss_damage_top' | bot.js:4649 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { await bossTopHandler(ctx); // Вызываем функцию топа по урону }); } } |
| 'energy_info' | bot.js:4658 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { await energyHandler(ctx); }); } } |
| 'skill_upgrade' | bot.js:4667 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { await showSkillUpgradeMenu(ctx); // Вызываем функцию для отображения меню прокачки навыков }); } } |
| 'boss_info' | bot.js:4677 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { await sendBossGameInfo(ctx); // Вызываем функцию для отправки информации о игре "босс" }); } } |
| 'back_to_boss_handler' | bot.js:4686 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { await bossHandler(ctx); // Вызываем функцию bossHandler }); } } |
| 'upgrade_attack_power' | bot.js:4709 | async (ctx) => { const userId = ctx.from.id.toString(); if (!checkCooldown(userId, 'upgrade_attack_power')) { return await ctx.answerCbQuery('⏳ Подождите немного перед следующей попыткой.'); } await handleCallbackWithErr |
| /select_weapon_(\d+)/ | bot.js:4723 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { const weaponId = ctx.match[1]; // Извлекаем ID оружия из callback_data // Получаем информацию об оружии const we |
| 'change_weapon' | bot.js:4747 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { await changeWeapon(ctx); // Вызываем функцию смены оружия }); } } |
| 'weapon_shop' | bot.js:4756 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { await weaponShop(ctx); // Вызываем функцию отображения магазина оружия }); } } |
| /buy_weapon_(\d+)/ | bot.js:4769 | async (ctx) => { try { const weaponId = parseInt(ctx.match[1], 10); // Извлекаем ID оружия из callback_data // Получаем информацию об оружии const weapon = getWeaponById(weaponId); if (!weapon) { return await ctx.reply(' |
| /view_weapon_(\d+)/ | bot.js:4831 | async (ctx) => { try { const weaponId = parseInt(ctx.match[1], 10); // Извлекаем ID оружия из callback_data // Получаем информацию об оружии const weapon = getWeaponById(weaponId); if (!weapon) { return await ctx.reply(' |
| 'back_to_skill_upgrade_menu' | bot.js:4893 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { await showSkillUpgradeMenu(ctx); // Возвращаемся в меню прокачки навыков }); } } |
| 'show_energy_info' | bot.js:4902 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { await showEnergyInfo(ctx); // Вызываем функцию для вывода информации об энергии }); } } |
| 'close_energy_info' | bot.js:4911 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { await ctx.deleteMessage(); // Удаляем сообщение с информацией об энергии }); } } |
| 'empire_stats' | bot.js:4984 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { await empireStatisticsHandler(ctx); }); } } |
| 'candy_top' | bot.js:4992 | async (ctx) => { const { candyTopHandler } = require('./Events/Halloween/candy'); await candyTopHandler(ctx); } |
| 'candy_shop' | bot.js:4997 | async (ctx) => { const { newYearShopHandler } = require('./Events/Halloween/candy'); // Импортируем новую функцию await newYearShopHandler(ctx); // Вызываем новую функцию } |
| 'candy_exchange' | bot.js:5002 | async (ctx) => { const { exchangeCandyToTickets } = require('./Events/Halloween/exchange'); await exchangeCandyToTickets(ctx); } |
| 'exchange_one_ticket' | bot.js:5008 | async (ctx) => { if (await checkUserStatus(ctx)) { const { exchangeOneTicket } = require('./Events/Halloween/exchange'); await handleCallbackWithErrorHandling(ctx, exchangeOneTicket); } } |
| 'exchange_all_candy' | bot.js:5016 | async (ctx) => { if (await checkUserStatus(ctx)) { const { exchangeAllCandy } = require('./Events/Halloween/exchange'); await handleCallbackWithErrorHandling(ctx, exchangeAllCandy); } } |
| 'halloween_fortune' | bot.js:5024 | async (ctx) => { if (await checkUserStatus(ctx)) { const { fortuneWheelHandler } = require('./Events/fortuneWheel'); await handleCallbackWithErrorHandling(ctx, fortuneWheelHandler); } } |
| 'spin_fortune_wheel' | bot.js:5033 | async (ctx) => { // Удаляем сообщение с кнопкой "Вращать снова" (или любое другое, содержащее эту кнопку) if (ctx.callbackQuery?.message) { try { await ctx.deleteMessage(); // ✅ Удаляем сообщение с кнопкой } catch (err)  |
| 'get_fortune_tickets' | bot.js:5049 | async (ctx) => { if (await checkUserStatus(ctx)) { await ctx.answerCbQuery('🎫 Функция получения билетиков пока недоступна.'); // Позже можешь реализовать выдачу за определённые условия (например, за донат, за время и т. |
| 'buy_pf_with_candy' | bot.js:5056 | async (ctx) => { if (await checkUserStatus(ctx)) await handleCallbackWithErrorHandling(ctx, buyPfWithCandy); } |
| 'buy_fortune_ticket' | bot.js:5059 | async (ctx) => { if (await checkUserStatus(ctx)) { const { exchangeCandyToTickets } = require('./Events/Halloween/exchange'); await handleCallbackWithErrorHandling(ctx, exchangeCandyToTickets); } } |
| 'buy_new_year_card' | bot.js:5065 | async (ctx) => { if (await checkUserStatus(ctx)) { const { buyNewYearCard } = require('./Events/Halloween/candyShop'); await handleCallbackWithErrorHandling(ctx, buyNewYearCard); } } |
| 'buy_snowman_prefix' | bot.js:5071 | async (ctx) => { if (await checkUserStatus(ctx)) { const { buySnowmanPrefix } = require('./Events/Halloween/candyShop'); await handleCallbackWithErrorHandling(ctx, buySnowmanPrefix); } } |
| 'buy_gold_containers' | bot.js:5077 | async (ctx) => { if (await checkUserStatus(ctx)) await handleCallbackWithErrorHandling(ctx, buyGoldContainers); } |
| 'open_secret_gift' | bot.js:5082 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, openSecretGift); } } |
| 'close_secret_gift_menu' | bot.js:5088 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, closeSecretGiftMenu); } } |
| 'spin_fortune_wheel' | bot.js:5093 | async (ctx) => { if (ctx.callbackQuery && ctx.callbackQuery.message) { try { await ctx.deleteMessage(); // ✅ Удаляем кнопку } catch (e) { // Игнорируем, если сообщение уже удалено } } await spinFortuneWheel(ctx); } |
| 'test_button' | bot.js:5105 | handleTestButton |
| 'confirm_action' | bot.js:5106 | handleConfirmAction |
| /^promo_/ | bot.js:5109 | async (ctx) => { const { handleCallback } = require('./handlers/promoHandler'); await handleCallback(ctx); } |
| 'withdraw_referrer_bank' | bot.js:5115 | async (ctx) => { if (await checkUserStatus(ctx)) { await handleCallbackWithErrorHandling(ctx, async () => { const userId = ctx.from.id.toString(); // Импортируем функции прямо здесь или убедись, что они импортированы све |
| 'tech_admin_panel' | bot.js:5147 | async (ctx) => { await handleCallbackWithErrorHandling(ctx, async () => { await handleTechAdminPanelButton(ctx); }); } |
| 'back_to_admin_panel' | bot.js:5153 | async (ctx) => { await handleCallbackWithErrorHandling(ctx, async () => { await handleBackToAdminPanel(ctx); }); } |
| /^tech_/ | bot.js:5161 | async (ctx) => { const { handleTechAdminCallback } = require('./admin/techAdminPanel'); await handleTechAdminCallback(ctx); } |
| /^pm_/ | bot.js:5165 | async (ctx) => { const { handlePlayerManagementCallback } = require('./admin/playerManagement'); await handlePlayerManagementCallback(ctx); } |
| /^tech_post_/ | bot.js:5170 | async (ctx) => { await handlePostCallback(ctx); } |
| /^promo_/ | bot.js:5174 | async (ctx) => { const { handleCallback } = require('./handlers/promoHandler'); await handleCallback(ctx); } |
| 'open_partner_panel' | bot.js:5179 | async (ctx) => { await ctx.answerCbQuery(); await showPartnerMenu(ctx); } |
| 'partner_info' | bot.js:5184 | async (ctx) => { await ctx.answerCbQuery(); await handlePartnerInfo(ctx); } |
| /^partner_.*/ | bot.js:5189 | handlePartnerCallback |
| /^admin_req_.*/ | bot.js:5192 | async (ctx) => { await handleAdminRequestCallback(ctx); } |
| /^admin_(req\|curr)_.*/ | bot.js:5197 | handleAdminRequestCallback |
| /^adminid_.*/ | bot.js:5198 | handleAdminRequestCallback |
| /^adminedit_.*/ | bot.js:5199 | handleAdminRequestCallback |
| /^adminreqs_.*/ | bot.js:5200 | handleAdminRequestCallback |
| 'info_container' | handlers/buyContainer.js:225 | async (ctx) => { try { const infoMessage = ` ℹ️ <b>Как купить контейнер:</b> Используйте команду: <code>контейнер купить [номер] [количество]</code> Пример: <code>контейнер купить 1 5</code> — купить 5 CLASSIC контейнеро |
| 'open_container_info' | handlers/buyContainer.js:244 | async (ctx) => { try { const userId = ctx.from.id.toString(); const user = await getUserById(userId); const openMessage = ` 🔑 <b>Как открыть контейнер:</b> Используйте команду: <code>контейнер открыть [номер]</code> При |
| 'container_rewards_info' | handlers/buyContainer.js:284 | async (ctx) => { try { const rewardsInfo = ` 🎁 <b>Что может выпасть в контейнерах:</b> 📦 <b>CLASSIC Контейнер</b> Всегда содержит 1 предмет • PF: 85% шанс • DF: 0.4% шанс • Статус-привилегия: 0.001% шанс • Префикс в пр |
