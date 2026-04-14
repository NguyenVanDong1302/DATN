const crypto = require("crypto");
const { AppError } = require("../utils/errors");
const User = require("../models/User");
const { buildLockDetails } = require("../utils/accountModeration");

function toUserId(username) {
  return crypto
    .createHash("sha256")
    .update(String(username))
    .digest("hex")
    .slice(0, 16);
}

async function sessionUser(req, res, next) {
  const username = (req.headers["x-username"] || "").toString().trim();

  if (!username) {
    return next(new AppError("Username required", 401, "USERNAME_REQUIRED"));
  }

  req.user = {
    sub: toUserId(username),
    username,
  };

  try {
    const currentUser = await User.findOne({ username })
      .select(
        "_id username role avatarUrl isVerified moderationStatus accountLocked accountLockedAt accountLockedReason strikesCount restrictions",
      )
      .lean();

    req.currentUser = currentUser || null;

    if (currentUser?.accountLocked) {
      return next(
        new AppError("Tai khoan da bi khoa", 423, "ACCOUNT_LOCKED", buildLockDetails(currentUser)),
      );
    }

    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = { sessionUser };
