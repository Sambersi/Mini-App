'use strict';

const Database = require('better-sqlite3');
const crypto = require('crypto');

const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const quote = value => '"' + value.replace(/"/g, '""') + '"';

// Tagged cells preserve SQLite storage types, signed 64-bit integers, REAL bits and blobs.
function encodeRow(values) {
  return JSON.stringify(values.map(value => {
    if (value === null || typeof value === 'string') return value;
    if (typeof value === 'bigint') return { i: value.toString() };
    if (Buffer.isBuffer(value)) return { b: value.toString('base64') };
    if (typeof value === 'number') {
      const bits = Buffer.alloc(8);
      bits.writeDoubleBE(value);
      return { f: bits.toString('hex') };
    }
    throw new Error('Unsupported SQLite value');
  }));
}

function decodeRow(payload) {
  return JSON.parse(payload).map(value => {
    if (value === null || typeof value === 'string') return value;
    if (Object.hasOwn(value, 'i')) return BigInt(value.i);
    if (Object.hasOwn(value, 'b')) return Buffer.from(value.b, 'base64');
    if (Object.hasOwn(value, 'f')) return Buffer.from(value.f, 'hex').readDoubleBE();
    throw new Error('Unknown archived SQLite cell');
  });
}

function openSource(file) {
  const db = new Database(file, { readonly: true, fileMustExist: true });
  try {
    db.pragma('query_only = ON');
    if (db.pragma('quick_check', { simple: true }) !== 'ok') throw new Error('Source SQLite integrity check failed');
    const schema = db.prepare("SELECT type, name, tbl_name, sql FROM sqlite_master ORDER BY type, name").all();
    const tables = schema.filter(x => x.type === 'table' && !x.name.startsWith('sqlite_')).map(table => {
      if (/CREATE VIRTUAL TABLE/i.test(table.sql)) throw new Error('Virtual tables require a dedicated importer');
      const columns = db.prepare('PRAGMA table_info(' + quote(table.name) + ')').all();
      const withoutRowid = /WITHOUT\s+ROWID/i.test(table.sql);
      const order = withoutRowid ? columns.filter(c => c.pk).sort((a, b) => a.pk - b.pk).map(c => quote(c.name)).join(', ') : 'rowid';
      const select = 'SELECT ' + (withoutRowid ? 'NULL' : 'rowid') + ', * FROM ' + quote(table.name) + ' ORDER BY ' + order;
      const metadata = { columns: ['__source_rowid', ...columns.map(c => c.name)], schema: table.sql, columnInfo: columns };
      return { name: table.name, metadata, rows: () => db.prepare(select).raw().safeIntegers().iterate() };
    });
    return { db, schema, tables, close: () => db.close() };
  } catch (error) {
    db.close();
    throw error;
  }
}

function fingerprint(table) {
  const hash = crypto.createHash('sha256');
  let count = 0;
  for (const row of table.rows()) { hash.update(encodeRow(row) + '\n'); count++; }
  return { count, hash: hash.digest('hex') };
}

module.exports = { sha, quote, encodeRow, decodeRow, openSource, fingerprint };
