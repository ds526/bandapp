const express = require('express');
const db = require('../db');

const router = express.Router();

// POST /api/votes - cast or update a vote.
// A member can only have one vote per song, so this "upserts": if they've
// already voted on this song, their score is replaced rather than duplicated.
router.post('/', (req, res) => {
  const { song_id, member_id, score } = req.body;

  if (!song_id || !member_id) {
    return res.status(400).json({ error: 'song_id and member_id are required' });
  }
  const numericScore = Number(score);
  if (!Number.isInteger(numericScore) || numericScore < 1 || numericScore > 5) {
    return res.status(400).json({ error: 'score must be an integer between 1 and 5' });
  }

  db.prepare(`
    INSERT INTO votes (song_id, member_id, score)
    VALUES (?, ?, ?)
    ON CONFLICT(song_id, member_id)
    DO UPDATE SET score = excluded.score, updated_at = datetime('now')
  `).run(song_id, member_id, numericScore);

  const vote = db.prepare(`
    SELECT v.*, m.name AS member_name
    FROM votes v JOIN members m ON m.id = v.member_id
    WHERE v.song_id = ? AND v.member_id = ?
  `).get(song_id, member_id);

  res.status(200).json(vote);
});

// DELETE /api/votes/:id - retract a vote
router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM votes WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'vote not found' });
  res.status(204).end();
});

module.exports = router;
