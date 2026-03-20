const crypto = require("crypto");
const { AppError } = require("../utils/errors");

function toUserId(username) {
  return crypto
    .createHash("sha256")
    .update(String(username))
    .digest("hex")
    .slice(0, 16);
}

function sessionUser(req, res, next) {
  const username = (req.headers["x-username"] || "").toString().trim();

  if (!username) {
    return next(new AppError("Username required", 401, "USERNAME_REQUIRED"));
  }

  req.user = {
    sub: toUserId(username),
    username,
  };
  next();
}

module.exports = { sessionUser };
