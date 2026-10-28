'use strict';

const mysql = require('mysql2/promise');
const config = require('./config');

const pool = mysql.createPool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  waitForConnections: true,
  connectionLimit: config.db.poolSize,
  queueLimit: 0,
  charset: 'utf8mb4_unicode_ci',
  dateStrings: true, // keep DATE/DATETIME as strings -> predictable JSON
  timezone: '+08:00',
  supportBigNumbers: true,
  bigNumberStrings: false,
});

/** Run a query and return rows. */
async function query(sql, params = []) {
  const expected = (String(sql).match(/\?/g) || []).length;
  if (expected !== params.length) {
    // A mismatch crashes some MySQL/MariaDB builds at the protocol level, so
    // fail loudly here instead of taking the database server down.
    throw new Error(
      `SQL parameter mismatch: ${expected} placeholder(s) but ${params.length} value(s).\n${String(sql).slice(0, 300)}`,
    );
  }
  const [rows] = await pool.execute(sql, params);
  return rows;
}

/** Return the first row or null. */
async function one(sql, params = []) {
  const rows = await query(sql, params);
  return rows.length ? rows[0] : null;
}

/** Return a single scalar value from the first column of the first row. */
async function scalar(sql, params = []) {
  const row = await one(sql, params);
  if (!row) return null;
  return row[Object.keys(row)[0]];
}

/** Execute inside a transaction. */
async function transaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    try {
      await conn.rollback();
    } catch {
      /* ignore rollback failure */
    }
    throw err;
  } finally {
    conn.release();
  }
}

/** Small helper so callers can use the same API on a transaction connection. */
function tquery(conn, sql, params = []) {
  return conn.execute(sql, params).then(([rows]) => rows);
}

module.exports = { pool, query, one, scalar, transaction, tquery };
