const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cookieParser());

// API routes - /api/auth is unprotected (it's how you get a session in the
// first place); every other route requires one, enforced inside each router.
app.use('/api/auth', require('./routes/auth'));
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
