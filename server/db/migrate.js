'use strict';

/**
 * Applies db/schema.sql to the configured database.
 *
 *   node db/migrate.js            # refuses to run if tables already exist
 *   node db/migrate.js --force    # DROPS all app tables, then recreates them
 */
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const config = require('../src/config');

async function main() {
  const force = process.argv.includes('--force');
  const sqlFile = path.join(__dirname, 'schema.sql');
  if (!fs.existsSync(sqlFile)) throw new Error('schema.sql not found next to this script.');

  const sql = fs.readFileSync(sqlFile, 'utf8');

  const conn = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
    multipleStatements: true,
  });

  try {
    const [rows] = await conn.query(
      `SELECT COUNT(*) AS c FROM information_schema.tables
        WHERE table_schema = ? AND table_name IN ('users','appointments','services')`,
      [config.db.database],
    );
    const existing = Number(rows[0].c);

    if (existing > 0 && !force) {
      console.error(
        '\n⚠  Tables already exist in this database.\n' +
          '   Re-run with --force to DROP and recreate everything (all data will be lost):\n\n' +
          '     npm run db:migrate -- --force\n',
      );
      process.exitCode = 1;
      return;
    }

    console.log(`[migrate] applying schema to ${config.db.database}...`);
    await conn.query(sql);
    console.log('[migrate] schema applied successfully.');
    console.log('[migrate] next: npm run db:seed');
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error('[migrate] failed:', err.message);
  if (/ECONNREFUSED/.test(err.message)) {
    console.error('          Is the database server running and are DB_HOST/DB_PORT correct?');
  }
  if (/ER_ACCESS_DENIED/.test(err.message)) {
    console.error('          Check DB_USER/DB_PASSWORD in server/.env.');
  }
  process.exit(1);
});
