'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const WebSocket = require('ws');

function findChrome() {
  return [process.env.CHROME_BIN,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/chromium', '/usr/bin/google-chrome',
  ].find(file => file && fs.existsSync(file));
}

async function openBrowser({ blockedUrls = [], initScript = '', http1 = false } = {}) {
  const executable = findChrome();
  if (!executable) throw new Error('Set CHROME_BIN to a Chromium browser executable');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mybot-browser-test-'));
  const child = spawn(executable, [
    '--headless=new', '--remote-debugging-port=0', '--no-first-run',
    '--no-default-browser-check', '--disable-gpu', '--user-data-dir=' + profile,
    ...(http1 ? ['--disable-http2', '--disable-quic'] : []), 'about:blank',
  ], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  let socket;
  const pending = new Map();
  let nextId = 0;
  const events = [];
  const call = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++nextId;
    const timeout = setTimeout(() => {
      pending.delete(id);
      reject(new Error('Browser command timed out: ' + method));
    }, 10000);
    pending.set(id, { resolve, reject, timeout });
    socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  async function close() {
    if (socket?.readyState === WebSocket.OPEN) {
      try { await call('Browser.close'); } catch (_) { /* May close before replying. */ }
    }
    socket?.close();
    child.kill();
    for (const item of pending.values()) clearTimeout(item.timeout);
    pending.clear();
  }
  try {
    const endpoint = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Browser did not start')), 10000);
      child.stderr.on('data', chunk => {
        const match = String(chunk).match(/DevTools listening on (ws:\/\/\S+)/);
        if (match) { clearTimeout(timeout); resolve(match[1]); }
      });
      child.once('error', error => { clearTimeout(timeout); reject(error); });
    });
    socket = new WebSocket(endpoint);
    await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
    socket.on('message', buffer => {
      const message = JSON.parse(buffer);
      if (!message.id) { events.push(message); return; }
      const item = pending.get(message.id);
      if (!item) return;
      clearTimeout(item.timeout);
      pending.delete(message.id);
      if (message.error) item.reject(new Error(message.error.message));
      else item.resolve(message.result);
    });
    const { targetId } = await call('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await call('Target.attachToTarget', { targetId, flatten: true });
    const page = (method, params) => call(method, params, sessionId);
    await page('Page.enable');
    await page('Network.enable');
    await page('Runtime.enable');
    await page('Emulation.setDeviceMetricsOverride', { width: 430, height: 900, deviceScaleFactor: 1, mobile: true });
    if (blockedUrls.length) await page('Network.setBlockedURLs', { urls: blockedUrls });
    if (initScript) await page('Page.addScriptToEvaluateOnNewDocument', { source: initScript });
    async function evaluate(expression) {
      const response = await page('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (response.exceptionDetails) throw new Error(response.exceptionDetails.text);
      return response.result.value;
    }
    async function waitFor(expression, timeout = 10000) {
      const end = Date.now() + timeout;
      while (Date.now() < end) {
        if (await evaluate(expression)) return;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      throw new Error('Browser condition timed out: ' + expression);
    }
    return { events, close, evaluate, waitFor,
      navigate: url => page('Page.navigate', { url }),
      screenshot: async file => {
        const result = await page('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
        fs.writeFileSync(file, Buffer.from(result.data, 'base64'));
      },
    };
  } catch (error) {
    await close();
    throw error;
  }
}

module.exports = { findChrome, openBrowser };
