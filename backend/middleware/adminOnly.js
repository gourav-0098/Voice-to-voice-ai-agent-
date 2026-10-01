export const adminOnly = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: "Authentication required." });
  }

  const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase());
  const isAdmin =
    req.user.role === "admin" ||
    adminEmails.includes(req.user.email?.toLowerCase());

  if (!isAdmin) {
    return res.status(403).json({
      error: "Access denied. Administrator privileges required.",
    });
  }

  next();
};

export default adminOnly;
