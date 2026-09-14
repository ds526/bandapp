const express = require('express');
const db = require('../db');
const {
  hashPassword, verifyPassword, createSession, destroySession,
  getMemberForToken, SESSION_TTL_MS, COOKIE_NAME,
} = require('../lib/auth');

const router = express.Router();

function cookieOpts() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    // Only require HTTPS for the cookie once you're actually serving over
    // HTTPS (see the Let's Encrypt step in the README) - in local dev over
    // plain http, "secure" cookies get silently dropped by the browser.
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_TTL_MS,
  };
}

// POST /api/auth/signup
// Creates a new account OR, if a member with this name already exists but
// has never set a password (e.g. was added back when the app had no auth),
// "claims" that existing name/history rather than rejecting it.
router.post('/signup', (req, res) => {
  const { name, password } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' });
  if (!password || password.length < 6) {
    return res.status(400).json({ error: 'password must be at least 6 characters' });
  }

  const trimmedName = name.trim();
  const existing = db.prepare('SELECT * FROM members WHERE name = ?').get(trimmedName);

  if (existing && existing.password_hash) {
    return res.status(409).json({ error: 'that name already has an account - log in instead' });
  }

  const passwordHash = hashPassword(password);
  let memberId;

  if (existing) {
    db.prepare('UPDATE members SET password_hash = ? WHERE id = ?').run(passwordHash, existing.id);
    memberId = existing.id;
  } else {
    const result = db.prepare('INSERT INTO members (name, password_hash) VALUES (?, ?)')
      .run(trimmedName, passwordHash);
    memberId = result.lastInsertRowid;
  }

  const { token } = createSession(memberId);
  res.cookie(COOKIE_NAME, token, cookieOpts());
  res.status(201).json({ id: memberId, name: trimmedName });
});

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { name, password } = req.body;
  if (!name || !password) return res.status(400).json({ error: 'name and password are required' });

  const member = db.prepare('SELECT * FROM members WHERE name = ?').get(name.trim());
  if (!member || !verifyPassword(password, member.password_hash)) {
    return res.status(401).json({ error: 'wrong name or password' });
  }

  const { token } = createSession(member.id);
  res.cookie(COOKIE_NAME, token, cookieOpts());
  res.json({ id: member.id, name: member.name });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  destroySession(req.cookies && req.cookies[COOKIE_NAME]);
  res.clearCookie(COOKIE_NAME);
  res.status(204).end();
});

// GET /api/auth/me - who does this session cookie belong to, if anyone
router.get('/me', (req, res) => {
  const member = getMemberForToken(req.cookies && req.cookies[COOKIE_NAME]);
  if (!member) return res.status(401).json({ error: 'not logged in' });
  res.json(member);
});

module.exports = router;
