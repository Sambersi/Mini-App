'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const express = require('express');
const { createPlainFrontendRouter } = require('../src/http/plainFrontend');
const { findChrome, openBrowser } = require('./helpers/chrome.cjs');
const frontend = path.resolve(__dirname, '../app/frontend/plain');

async function serve(t) {
  const app = express();
  app.get('/api/v2/user/1234', (req, res) => res.json({ username: 'Тестовый игрок', numeric_id: 42, balance: 12345, df_balance: 100, topStatus: 'Player' }));
  app.get('/api/fortune/tickets/1234', (req, res) => res.json({ tickets: 2 }));
  app.get('/api/v2/bonus/status/1234', (req, res) => res.json({ availableIn: 3600, progress: 2, megaEvery: 6 }));
  app.use('/v2', createPlainFrontendRouter(frontend));
  app.use((req, res) => res.type('html').send('<html>React fallback</html>'));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  return 'http://127.0.0.1:' + server.address().port;
}

test('all active Mini App pages exclude dependent scripts from Rocket Loader and version local CSS/JS', () => {
  const pages = ['index.html', ...['profile', 'referrals', 'donate', 'play', 'more', 'admin'].map(name => 'pages/' + name + '/index.html')];
  for (const file of pages) {
    const html = fs.readFileSync(path.join(frontend, file), 'utf8');
    for (const tag of html.match(/<script\b[^>]*src=[^>]*>/g) || []) {
      assert.match(tag, /data-cfasync="false"\s+src=/, file);
    }
    for (const match of html.matchAll(/(?:src|href)="([^"#]+\.(?:css|js)(?:\?[^"#]*)?)"/g)) {
      if (match[1].startsWith('https:')) continue;
      assert.match(match[1], /\?v=/, file);
      const asset = path.resolve(path.dirname(path.join(frontend, file)), match[1].split('?')[0]);
      assert.ok(fs.existsSync(asset), file + ': missing asset ' + match[1]);
    }
  }
});

test('CSS has self-hosted fonts, valid WOFF2 assets and licenses, without blocking external imports', () => {
  const css = fs.readFileSync(path.join(frontend, 'style.css'), 'utf8');
  assert.doesNotMatch(css, /@import|fonts\.googleapis\.com|fonts\.gstatic\.com/);
  const fonts = [...css.matchAll(/url\((\.\/fonts\/[^)]+\.woff2)\)/g)];
  assert.equal(fonts.length, 12);
  for (const font of fonts) {
    assert.equal(fs.readFileSync(path.join(frontend, font[1])).subarray(0, 4).toString(), 'wOF2');
  }
  for (const name of ['montserrat', 'unbounded', 'daysone']) {
    assert.match(fs.readFileSync(path.join(frontend, 'fonts', name + '-OFL.txt'), 'utf8'), /SIL OPEN FONT LICENSE/i);
  }
});

test('static responses have correct MIME types and missing Mini App assets cannot return React HTML', async t => {
  const base = await serve(t);
  const html = await fetch(base + '/v2/');
  assert.equal(html.status, 200);
  assert.match(html.headers.get('cache-control'), /no-cache.*no-transform/);
  const css = await fetch(base + '/v2/style.css?v=test');
  assert.match(css.headers.get('content-type'), /text\/css/);
  const js = await fetch(base + '/v2/bind.js?v=test');
  assert.match(js.headers.get('content-type'), /javascript/);
  for (const name of ['missing.css', 'missing.js']) {
    const response = await fetch(base + '/v2/' + name);
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: 'Mini App resource not found' });
  }
});

test('mobile browser renders and loads profile when Google Fonts, Rocket Loader and Telegram SDK are unavailable',
  { skip: !findChrome(), timeout: 30000 }, async t => {
    const base = await serve(t);
    const browser = await openBrowser({
      blockedUrls: ['*fonts.googleapis.com*', '*fonts.gstatic.com*', '*cloudflare*', '*telegram.org/js/*'],
      initScript: 'window.Telegram={WebApp:{ready(){},expand(){},initDataUnsafe:{user:{id:1234}}}};',
    });
    t.after(() => browser.close());
    await browser.navigate(base + '/v2/');
    await browser.waitFor('document.getElementById("nickname")?.textContent === "Тестовый игрок"');
    assert.equal(await browser.evaluate('getComputedStyle(document.body).backgroundColor'), 'rgb(24, 15, 42)');
    assert.equal(await browser.evaluate('getComputedStyle(document.querySelector(".profile-card")).display'), 'flex');
    assert.equal(await browser.evaluate('document.getElementById("ticket-count").textContent'), '2');
    await browser.evaluate('document.querySelector(".profile-card__help").click()');
    assert.equal(await browser.evaluate('document.getElementById("modalOverlay").classList.contains("active")'), true);
    await browser.evaluate('document.getElementById("modalClose").click()');
    assert.equal(await browser.evaluate('document.getElementById("modalOverlay").classList.contains("active")'), false);
    assert.equal(browser.events.filter(e => e.method === 'Runtime.exceptionThrown').length, 0);
  });
