const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../db');

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

function verifyPassword(password, hash) {
  if (!hash) return false;
  return bcrypt.compareSync(password, hash);
}

// Session tokens are opaque random values stored server-side in the
// sessions table - the cookie just carries a reference, not any signed or
// encoded state, so there's nothing to forge.
function createSession(memberId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  db.prepare('INSERT INTO sessions (token, member_id, expires_at) VALUES (?, ?, ?)')
    .run(token, memberId, expiresAt);
  return { token, expiresAt };
}

function getMemberForToken(token) {
  if (!token) return null;
  return db.prepare(`
    SELECT m.id, m.name
    FROM sessions s
    JOIN members m ON m.id = s.member_id
    WHERE s.token = ? AND s.expires_at > datetime('now')
  `).get(token) || null;
}

function destroySession(token) {
  if (!token) return;
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

module.exports = {
  hashPassword,
  verifyPassword,
  createSession,
  getMemberForToken,
  destroySession,
  SESSION_TTL_MS,
  COOKIE_NAME: 'session',
};
