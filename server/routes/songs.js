const express = require('express');
const db = require('../db');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();
router.use(requireAuth);

const EDITABLE_FIELDS = [
  'title', 'artist', 'song_key', 'time_signature',
  'tempo_bpm', 'status', 'notes', 'date_learned',
];

// Shared query: every song plus its vote stats, freshest first for ties.
// AVG/COUNT over a LEFT JOIN so songs with zero votes still show up (avg = null).
const SONGS_WITH_VOTES_SQL = `
  SELECT
    s.*,
    m.name AS submitted_by_name,
    COUNT(v.id) AS vote_count,
    ROUND(AVG(v.score), 2) AS avg_score
  FROM songs s
  LEFT JOIN members m ON m.id = s.submitted_by
  LEFT JOIN votes v ON v.song_id = s.id
  GROUP BY s.id
`;

// GET /api/songs?status=proposed - list songs, ranked by average vote (desc)
// Songs with no votes yet sort to the bottom rather than the top.
router.get('/', (req, res) => {
  const { status } = req.query;
  let sql = SONGS_WITH_VOTES_SQL;
  const params = [];

  if (status) {
    sql = sql.replace('GROUP BY s.id', 'WHERE s.status = ? GROUP BY s.id');
    params.push(status);
  }

  sql += ' ORDER BY (avg_score IS NULL), avg_score DESC, vote_count DESC, s.date_added ASC';

  const songs = db.prepare(sql).all(...params);
  res.json(songs);
});

// GET /api/songs/:id - one song plus the individual votes behind it
router.get('/:id', (req, res) => {
  const song = db.prepare(SONGS_WITH_VOTES_SQL.replace('GROUP BY s.id', 'WHERE s.id = ? GROUP BY s.id')).get(req.params.id);
  if (!song) return res.status(404).json({ error: 'song not found' });

  const votes = db.prepare(`
    SELECT v.*, m.name AS member_name
    FROM votes v JOIN members m ON m.id = v.member_id
    WHERE v.song_id = ?
    ORDER BY m.name
  `).all(req.params.id);

  res.json({ ...song, votes });
});

// POST /api/songs - submit a new song for consideration.
// submitted_by always comes from the logged-in session, never the request
// body - otherwise anyone could submit a song under someone else's name.
router.post('/', (req, res) => {
  const { title, artist, song_key, time_signature, tempo_bpm, notes } = req.body;

  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'title is required' });
  }

  const result = db.prepare(`
    INSERT INTO songs (title, artist, song_key, time_signature, tempo_bpm, notes, submitted_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    title.trim(),
    artist || null,
    song_key || null,
    time_signature || null,
    tempo_bpm || null,
    notes || null,
    req.member.id,
  );

  const song = db.prepare('SELECT * FROM songs WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(song);
});

// PATCH /api/songs/:id - edit metadata and/or move it through its lifecycle.
// Setting status to "learned" without an explicit date_learned stamps it "now".
router.patch('/:id', (req, res) => {
  const song = db.prepare('SELECT * FROM songs WHERE id = ?').get(req.params.id);
  if (!song) return res.status(404).json({ error: 'song not found' });

  const updates = {};
  for (const field of EDITABLE_FIELDS) {
    if (field in req.body) updates[field] = req.body[field];
  }

  if (updates.status === 'learned' && !updates.date_learned && !song.date_learned) {
    updates.date_learned = new Date().toISOString();
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'no editable fields provided' });
  }

  const setClause = Object.keys(updates).map((f) => `${f} = ?`).join(', ');
  db.prepare(`UPDATE songs SET ${setClause}, updated_at = datetime('now') WHERE id = ?`)
    .run(...Object.values(updates), req.params.id);

  const updated = db.prepare('SELECT * FROM songs WHERE id = ?').get(req.params.id);
  res.json(updated);
});

// DELETE /api/songs/:id
router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM songs WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'song not found' });
  res.status(204).end();
});

module.exports = router;
