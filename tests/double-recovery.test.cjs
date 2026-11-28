'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {buildDoubleResults} = require('../src/telegram/doubleResults');

const result = {
  roundId: 'fixture', result: 'GAME', salt: 'salt', finalMultipliers: {left: 'x2', right: 'x25'},
  outcomes: [
    {chatId: '-100', playerId: '10', username: '<Fixture>', multiplier: 'GAME', amount: '100000', selected: 'left', candy: 1},
    {chatId: '-100', playerId: '10', username: '<Fixture>', multiplier: 'x3', amount: '1'},
  ],
  credits: [{chatId: '-100', playerId: '10', multiplier: 'GAME', gross: '200000', credited: '0', burned: '200000'}],
};

test('Double renders stored GAME outcomes, cap, candies and verification without rounding', () => {
  const [delivery] = buildDoubleResults(result);
  assert.equal(delivery.chatId, '-100');
  assert.equal(delivery.image, '2l_25p.png');
  assert.match(delivery.text, /&lt;Fixture&gt;/);
  assert.match(delivery.text, /Начислено 0 PF/);
  assert.match(delivery.text, /\+1 конфет/);
  assert.match(delivery.text, /на x3 проиграла/);
  assert.match(delivery.text, /GAME\|salt/);
});

test('Double retries the same persisted round after an unknown settlement result', async t => {
  const dbPath = require.resolve('../db');
  const gamePath = require.resolve('../games/doubleGame');
  const previousDb = require.cache[dbPath];
  const previousGame = require.cache[gamePath];
  const calls = [];
  const notifications = new Set();
  let settlementFails = true;
  let deliveryFails = true;
  let openingFails = true;
  const db = {
    async getDoubleRoundState() {return {hash:'fixture',state:'FINISHED',endTime:0};},
    async recordDoubleGameChoice({choice}) {
      if (choice==='right') throw new Error('Fixture write failure');
      return {gameChoices:{'-100_10':choice},globalChoices:{global_choice_10:choice}};
    },
    async settleDoubleRound(hash) {
      calls.push(['settle', hash]);
      if (settlementFails) throw Object.assign(new Error('Fixture acknowledgement lost'), {code: 'FIXTURE_ACK'});
      return result;
    },
    async openDoubleRound({previousHash, round}) {
      calls.push(['open', previousHash]);
      if (openingFails) throw Object.assign(new Error('Fixture opening interrupted'), {code: 'FIXTURE_OPEN'});
      return {created:true, round:{...round,state:'ACCEPTING'}};
    },
    async getDoubleNotification(key) {return notifications.has(key);},
    async markDoubleNotificationSent(key) {notifications.add(key);},
    async refundBetsForRound() {assert.fail('Settlement failure must never trigger refund');},
  };
  require.cache[dbPath] = {id:dbPath, filename:dbPath, loaded:true, exports:db};
  delete require.cache[gamePath];
  t.after(() => {
    if (previousDb) require.cache[dbPath] = previousDb;
    else delete require.cache[dbPath];
    if (previousGame) require.cache[gamePath] = previousGame;
    else delete require.cache[gamePath];
  });
  t.mock.method(console, 'error', () => {});
  t.mock.method(console, 'log', () => {});
  const {doubleGame} = require(gamePath);
  t.mock.method(doubleGame, '_sendLogMessage', () => {});
  const send = async chatId => {
    calls.push(['send', chatId]);
    if (deliveryFails) throw Object.assign(new Error('Fixture Telegram outage'), {code:'ETIMEDOUT'});
  };
  const bot = {telegram:{sendPhoto:send,sendMessage:send}};
  doubleGame.round = {hash:'fixture',gameButtonActive:true};
  doubleGame.state = 'GAME_CHOICE';
  await assert.rejects(doubleGame.recordGameChoice('10','-100','right'), /Fixture write failure/);
  assert.deepEqual(doubleGame.globalChoices, {});
  assert.equal(await doubleGame.recordGameChoice('10','-100','left'), true);
  assert.equal(doubleGame.globalChoices.global_choice_10, 'left');
  doubleGame.state = 'RESOLVING';

  await doubleGame._resolveRound(bot);
  assert.deepEqual(calls, [['settle','fixture']]);
  assert.equal(doubleGame.round.hash, 'fixture');
  settlementFails = false;
  doubleGame._resolveRetryAt = 0;
  await doubleGame._tick(bot);
  assert.equal(doubleGame.round.hash, 'fixture');
  assert.equal(notifications.size, 0);
  deliveryFails = false;
  doubleGame._resolveRetryAt = 0;
  await doubleGame._tick(bot);
  assert.equal(doubleGame.round.hash, 'fixture');
  openingFails = false;
  doubleGame._resolveRetryAt = 0;
  await doubleGame._tick(bot);
  assert.notEqual(doubleGame.round.hash, 'fixture');
  assert.deepEqual(calls, [
    ['settle','fixture'], ['settle','fixture'], ['send','-100'],
    ['settle','fixture'], ['send','-100'], ['open','fixture'],
    ['settle','fixture'], ['open','fixture'],
  ]);

  let resume;
  t.mock.method(globalThis, 'setTimeout', callback => {resume=callback;});
  t.mock.method(globalThis, 'setInterval', () => null);
  delete require.cache[gamePath];
  const restarted = require(gamePath).doubleGame;
  t.mock.method(restarted, '_sendLogMessage', () => {});
  calls.length=0;
  await restarted.initGame(bot);
  assert.equal(restarted.round.hash, 'fixture');
  assert.equal(restarted.state, 'RESOLVING');
  await resume();
  assert.deepEqual(calls, [['settle','fixture'], ['open','fixture']]);
  assert.notEqual(restarted.round.hash, 'fixture');
});
