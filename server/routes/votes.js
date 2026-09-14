const express = require('express');
const db = require('../db');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();
router.use(requireAuth);

// POST /api/votes - cast or update YOUR vote (member_id always comes from
// the session, never the request body - this is what stops one member from
// ever overwriting another member's score, by accident or otherwise).
// A member can only have one vote per song, so this "upserts": voting again
// on a song you've already voted on replaces your score, not a duplicate.
router.post('/', (req, res) => {
  const { song_id, score } = req.body;
  const member_id = req.member.id;

  if (!song_id) {
    return res.status(400).json({ error: 'song_id is required' });
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

// DELETE /api/votes/:id - retract a vote. Only the member who cast it can.
router.delete('/:id', (req, res) => {
  const vote = db.prepare('SELECT * FROM votes WHERE id = ?').get(req.params.id);
  if (!vote) return res.status(404).json({ error: 'vote not found' });
  if (vote.member_id !== req.member.id) {
    return res.status(403).json({ error: "you can't delete someone else's vote" });
  }
  db.prepare('DELETE FROM votes WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

module.exports = router;
