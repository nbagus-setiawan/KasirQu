function requireAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  return res.status(401).json({ error: 'Anda harus login sebagai kasir/admin.' });
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.user && req.session.user.role === 'admin') return next();
  return res.status(403).json({ error: 'Hanya admin yang boleh mengakses fitur ini.' });
}

module.exports = { requireAuth, requireAdmin };
