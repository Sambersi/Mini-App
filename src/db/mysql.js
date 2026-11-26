'use strict';

class MysqlConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'MysqlConfigError';
    this.code = 'MYSQL_CONFIG_INVALID';
  }
}

function readBoolean(value, name, defaultValue = false) {
  if (value === undefined || value === '') return defaultValue;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new MysqlConfigError(`${name} must be true or false`);
}

function readInteger(value, name, defaultValue, min, max) {
  const raw = value === undefined || value === '' ? String(defaultValue) : value;
  if (!/^\d+$/.test(raw) || Number(raw) < min || Number(raw) > max) {
    throw new MysqlConfigError(`${name} must be an integer from ${min} to ${max}`);
  }
  return Number(raw);
}

function readMysqlConfig(env = process.env) {
  const required = ['MYSQL_HOST', 'MYSQL_DATABASE', 'MYSQL_USER', 'MYSQL_PASSWORD'];
  const missing = required.filter(name => typeof env[name] !== 'string' || !env[name].trim());
  if (missing.length) throw new MysqlConfigError(`Missing environment variables: ${missing.join(', ')}`);
  if (env.MYSQL_HOST.includes('://') || /[\s/]/.test(env.MYSQL_HOST)) {
    throw new MysqlConfigError('MYSQL_HOST must be a hostname or IP, without protocol, path or port');
  }
  const config = {
    host: env.MYSQL_HOST,
    port: readInteger(env.MYSQL_PORT, 'MYSQL_PORT', 3306, 1, 65535),
    database: env.MYSQL_DATABASE,
    user: env.MYSQL_USER,
    password: env.MYSQL_PASSWORD,
    connectionLimit: readInteger(env.MYSQL_POOL_SIZE, 'MYSQL_POOL_SIZE', 2, 1, 10),
    connectTimeout: readInteger(env.MYSQL_CONNECT_TIMEOUT_MS, 'MYSQL_CONNECT_TIMEOUT_MS', 10000, 100, 60000),
    waitForConnections: true,
    queueLimit: 20,
    enableKeepAlive: true,
    charset: 'utf8mb4',
    timezone: 'Z',
    supportBigNumbers: true,
    bigNumberStrings: true,
    decimalNumbers: false,
    multipleStatements: false,
  };
  if (readBoolean(env.MYSQL_SSL, 'MYSQL_SSL')) config.ssl = { rejectUnauthorized: true };
  return config;
}

// Diagnostic SELECT only. No legacy db.js import, DDL, application data or writes.
async function checkMysqlConnection(env = process.env, createPool) {
  const config = readMysqlConfig(env);
  const pool = (createPool || require('mysql2/promise').createPool)(config);
  let connection;
  try {
    connection = await pool.getConnection();
    const [rows] = await connection.execute(
      'SELECT VERSION() AS server_version, DATABASE() AS database_name, @@character_set_database AS database_charset'
    );
    if (!rows[0]?.server_version || rows[0].database_name !== config.database) {
      const error = new Error('Unexpected database response');
      error.code = 'MYSQL_PROBE_INVALID_RESPONSE';
      throw error;
    }
    return {
      serverVersion: String(rows[0].server_version),
      databaseCharset: String(rows[0].database_charset),
      connectionLimit: config.connectionLimit,
      // Runtime services still use SQLite during stage 01.
      activeStorage: 'sqlite',
    };
  } finally {
    try {
      if (connection) connection.release();
    } finally {
      await pool.end();
    }
  }
}

function safeMysqlError(error) {
  // Driver messages may contain usernames or connection strings. Never log them.
  const code = typeof error?.code === 'string' && /^[A-Z0-9_]+$/.test(error.code)
    ? error.code : 'MYSQL_CHECK_FAILED';
  const hints = {
    MYSQL_CONFIG_INVALID: 'Check MYSQL_* settings in the host .env file.',
    ETIMEDOUT: 'Database address is unreachable; run this check inside the hosting container.',
    ECONNREFUSED: 'Check the database address, port and hosting network access.',
    EHOSTUNREACH: 'Database network is unreachable from this environment.',
    ENETUNREACH: 'Database network is unreachable from this environment.',
    ENOTFOUND: 'Check MYSQL_HOST.',
    ER_ACCESS_DENIED_ERROR: 'Check the database user, password and allowed source addresses.',
    ER_BAD_DB_ERROR: 'Check the complete database name assigned by the hosting panel.',
  };
  return { code, hint: hints[code] || 'Inspect database configuration and hosting availability.' };
}

module.exports = { readBoolean, readMysqlConfig, checkMysqlConnection, safeMysqlError };
