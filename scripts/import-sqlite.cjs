'use strict';

const path = require('path');
const rootDir = path.join(__dirname, '..');
require('dotenv').config({ path: path.join(rootDir, '.env') });
const { runStageTwo } = require('../src/migration/stageTwo');
const { safeMysqlError } = require('../src/db/mysql');

runStageTwo({ rootDir }).catch(error => {
  console.error('[MYSQL IMPORT] FAILED ' + JSON.stringify(safeMysqlError(error)));
  process.exitCode = 1;
});
