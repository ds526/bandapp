const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

// The DB file lives outside source control (see .gitignore) so each
// deployment keeps its own data.
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', '..', 'data', 'bandlist.db');

// Make sure the data directory exists before SQLite tries to open the file.
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL'); // better concurrent read/write behavior
db.pragma('foreign_keys = ON');

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

// --- lightweight migrations ---
// schema.sql only creates NEW tables (CREATE TABLE IF NOT EXISTS is a no-op
// on a table that already exists), so a column added to an existing table
// needs its own migration step like this one.
const memberColumns = db.prepare("PRAGMA table_info(members)").all().map((c) => c.name);
if (!memberColumns.includes('password_hash')) {
  db.exec('ALTER TABLE members ADD COLUMN password_hash TEXT');
}

module.exports = db;
