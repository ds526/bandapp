const path = require('path');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// API routes
app.use('/api/members', require('./routes/members'));
app.use('/api/songs', require('./routes/songs'));
app.use('/api/votes', require('./routes/votes'));

// Serve the frontend
app.use(express.static(path.join(__dirname, '..', 'public')));

// Centralized error handler - keeps route files free of try/catch boilerplate
// for straightforward DB errors, and stops a stray bug from crashing the process.
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'something went wrong on the server' });
});

app.listen(PORT, () => {
  console.log(`BandList server listening on http://localhost:${PORT}`);
});
