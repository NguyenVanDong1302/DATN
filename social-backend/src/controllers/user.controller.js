const { z } = require("zod");
const crypto = require("crypto");
const User = require("../models/User");
const Follow = require("../models/Follow");
const { AppError } = require("../utils/errors");

// giống sessionUser.js
function toUserId(username) {
  return crypto
    .createHash("sha256")
    .update(String(username))
    .digest("hex")
    .slice(0, 16);
}

const followSchema = z.object({
  username: z.string().min(3).max(30),
});

async function getProfile(req, res, next) {
  try {
    const username = (req.params.username || "").trim();
    const user = await User.findOne({ username }).select(
      "_id username email bio avatarUrl createdAt",
    );
    // Với demo X-Username, profile vẫn ok kể cả chưa register user trong DB
    const userId = toUserId(username);

    const followersCount = await Follow.countDocuments({ followingId: userId });
    const followingCount = await Follow.countDocuments({ followerId: userId });

    // viewer follow?
    const viewerId = req.user?.sub;
    const followedByMe = viewerId
      ? !!(await Follow.findOne({ followerId: viewerId, followingId: userId }))
      : false;

    res.json({
      ok: true,
      data: {
        user: user
          ? {
              id: String(user._id),
              username: user.username,
              bio: user.bio,
              avatarUrl: user.avatarUrl,
              createdAt: user.createdAt,
            }
          : { username, bio: "", avatarUrl: "", createdAt: null },
        userId,
        followersCount,
        followingCount,
        followedByMe,
      },
    });
  } catch (err) {
    next(err);
  }
}

async function follow(req, res, next) {
  try {
    const body = followSchema.parse(req.body);
    const targetId = toUserId(body.username);
    const me = req.user.sub;

    if (me === targetId) throw new AppError("Cannot follow yourself", 400);

    try {
      await Follow.create({ followerId: me, followingId: targetId });
    } catch (e) {
      // đã follow rồi -> idempotent
      if (e && e.code === 11000) {
        return res.json({ ok: true, data: { followed: true } });
      }
      throw e;
    }

    return res.status(201).json({ ok: true, data: { followed: true } });
  } catch (err) {
    if (err?.name === "ZodError") {
      return next(
        new AppError(
          err.errors[0]?.message || "Invalid input",
          400,
          "VALIDATION_ERROR",
        ),
      );
    }
    next(err);
  }
}

async function unfollow(req, res, next) {
  try {
    const body = followSchema.parse(req.body);
    const targetId = toUserId(body.username);
    const me = req.user.sub;

    await Follow.deleteOne({ followerId: me, followingId: targetId });
    return res.json({ ok: true, data: { followed: false } });
  } catch (err) {
    if (err?.name === "ZodError") {
      return next(
        new AppError(
          err.errors[0]?.message || "Invalid input",
          400,
          "VALIDATION_ERROR",
        ),
      );
    }
    next(err);
  }
}

async function listFollowers(req, res, next) {
  try {
    const username = (req.params.username || "").trim();
    const userId = toUserId(username);

    const limit = Math.min(
      Math.max(parseInt(req.query.limit || "20", 10), 1),
      100,
    );
    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const skip = (page - 1) * limit;

    const items = await Follow.find({ followingId: userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.json({ ok: true, data: { items, page, limit } });
  } catch (err) {
    next(err);
  }
}

async function listFollowing(req, res, next) {
  try {
    const username = (req.params.username || "").trim();
    const userId = toUserId(username);

    const limit = Math.min(
      Math.max(parseInt(req.query.limit || "20", 10), 1),
      100,
    );
    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const skip = (page - 1) * limit;

    const items = await Follow.find({ followerId: userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.json({ ok: true, data: { items, page, limit } });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getProfile,
  follow,
  unfollow,
  listFollowers,
  listFollowing,
  toUserId,
};
