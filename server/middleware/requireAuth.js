const { getMemberForToken, COOKIE_NAME } = require('../lib/auth');

// Attaches req.member from the session cookie, or rejects with 401.
// Nothing downstream should ever trust a member id sent in a request body -
// this is the one source of truth for "who is making this request".
function requireAuth(req, res, next) {
  const token = req.cookies && req.cookies[COOKIE_NAME];
  const member = getMemberForToken(token);
  if (!member) {
    return res.status(401).json({ error: 'log in required' });
  }
  req.member = member;
  next();
}

module.exports = requireAuth;
