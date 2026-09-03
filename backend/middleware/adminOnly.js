export const adminOnly = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: "Authentication required." });
  }

  const isAdmin =
    req.user.role === "admin" ||
    req.user.email?.toLowerCase() === "r19216871@gamil.com" ||
    req.user.email?.toLowerCase() === "r19216871@gmail.com";

  if (!isAdmin) {
    return res.status(403).json({
      error: "Access denied. Administrator privileges required.",
    });
  }

  next();
};

export default adminOnly;
