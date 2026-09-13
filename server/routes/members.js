const express = require('express');
const db = require('../db');

const router = express.Router();

// GET /api/members - list all band members
router.get('/', (req, res) => {
  const members = db.prepare('SELECT * FROM members ORDER BY name').all();
  res.json(members);
});

// POST /api/members - add a new band member
router.post('/', (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'name is required' });
  }

  try {
    const result = db
      .prepare('INSERT INTO members (name) VALUES (?)')
      .run(name.trim());
    const member = db
      .prepare('SELECT * FROM members WHERE id = ?')
      .get(result.lastInsertRowid);
    res.status(201).json(member);
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'a member with that name already exists' });
    }
    throw err;
  }
});

// DELETE /api/members/:id - remove a band member (their votes go too, via cascade)
router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM members WHERE id = ?').run(req.params.id);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'member not found' });
  }
  res.status(204).end();
});

module.exports = router;
