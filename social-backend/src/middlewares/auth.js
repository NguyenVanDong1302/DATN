const jwt = require("jsonwebtoken");
const { AppError } = require("../utils/errors");

function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return next(new AppError("Missing token", 401, "UNAUTHORIZED"));

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload; // { sub: userId }
    next();
  } catch (e) {
    return next(new AppError("Invalid/Expired token", 401, "UNAUTHORIZED"));
  }
}

module.exports = { auth };
