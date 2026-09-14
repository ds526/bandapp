const express = require('express');
const db = require('../db');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();

// Every route below requires a valid session. Accounts are created via
// POST /api/auth/signup, not here - see server/routes/auth.js.
router.use(requireAuth);

// GET /api/members - roster (id/name/created_at only - never password_hash)
router.get('/', (req, res) => {
  const members = db.prepare('SELECT id, name, created_at FROM members ORDER BY name').all();
  res.json(members);
});

module.exports = router;
