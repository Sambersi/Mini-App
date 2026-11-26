'use strict';

const path = require('path');
const { execFileSync } = require('child_process');

function getRuntimeInfo(rootDir = path.resolve(__dirname, '..')) {
  let commit = 'unknown';
  try {
    const value = execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], {
      cwd: rootDir, encoding: 'utf8', timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (/^[a-f0-9]{7,40}$/.test(value)) commit = value;
  } catch (_) {
    // Deployments without .git still run; diagnostics must not stop the server.
  }
  return { commit, stage: '01-db-connectivity', activeStorage: 'sqlite' };
}

module.exports = { getRuntimeInfo };
