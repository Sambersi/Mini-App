'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { checkMysqlConnection, safeMysqlError } = require('../src/db/mysql');

checkMysqlConnection().then(result => {
  console.log('[MYSQL PREFLIGHT] OK ' + JSON.stringify(result));
}).catch(error => {
  console.error('[MYSQL PREFLIGHT] FAILED ' + JSON.stringify(safeMysqlError(error)));
  process.exitCode = 1;
});
