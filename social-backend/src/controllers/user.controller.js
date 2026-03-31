const User = require("../models/User");
const Follow = require("../models/Follow");
const { AppError } = require("../utils/errors");

function toUserId(user) {
  if (!user) return null;
  return String(user._id || user.id || user.userId || "");
}

async function getProfile(req, res, next) {
  try {
    const { username } = req.params;

    const user = await User.findOne({ username }).select("-passwordHash");
    if (!user) {
      throw new AppError("Không tìm thấy người dùng", 404, "USER_NOT_FOUND");
    }

    return res.json({
      ok: true,
      data: user,
    });
  } catch (err) {
    next(err);
  }
}

async function follow(req, res, next) {
  try {
    const followerId = req.user?.sub;
    const { followingId } = req.body;

    if (!followerId) {
      throw new AppError("Chưa xác thực người dùng", 401, "UNAUTHORIZED");
    }

    if (!followingId) {
      throw new AppError("Thiếu followingId", 400, "MISSING_FOLLOWING_ID");
    }

    if (String(followerId) === String(followingId)) {
      throw new AppError(
        "Không thể tự follow chính mình",
        400,
        "INVALID_FOLLOW",
      );
    }

    const existed = await Follow.findOne({
      followerId,
      followingId,
    });

    if (existed) {
      return res.json({
        ok: true,
        message: "Đã follow trước đó",
      });
    }

    await Follow.create({
      followerId,
      followingId,
    });

    return res.json({
      ok: true,
      message: "Follow thành công",
    });
  } catch (err) {
    next(err);
  }
}

async function unfollow(req, res, next) {
  try {
    const followerId = req.user?.sub;
    const { followingId } = req.body;

    if (!followerId) {
      throw new AppError("Chưa xác thực người dùng", 401, "UNAUTHORIZED");
    }

    if (!followingId) {
      throw new AppError("Thiếu followingId", 400, "MISSING_FOLLOWING_ID");
    }

    await Follow.findOneAndDelete({
      followerId,
      followingId,
    });

    return res.json({
      ok: true,
      message: "Bỏ follow thành công",
    });
  } catch (err) {
    next(err);
  }
}

async function listFollowers(req, res, next) {
  try {
    const { username } = req.params;

    const user = await User.findOne({ username });
    if (!user) {
      throw new AppError("Không tìm thấy người dùng", 404, "USER_NOT_FOUND");
    }

    const followers = await Follow.find({ followingId: user._id });
    const followerIds = followers.map((item) => item.followerId);

    const users = await User.find({ _id: { $in: followerIds } }).select(
      "-passwordHash",
    );

    return res.json({
      ok: true,
      data: users,
    });
  } catch (err) {
    next(err);
  }
}

async function listFollowing(req, res, next) {
  try {
    const { username } = req.params;

    const user = await User.findOne({ username });
    if (!user) {
      throw new AppError("Không tìm thấy người dùng", 404, "USER_NOT_FOUND");
    }

    const following = await Follow.find({ followerId: user._id });
    const followingIds = following.map((item) => item.followingId);

    const users = await User.find({ _id: { $in: followingIds } }).select(
      "-passwordHash",
    );

    return res.json({
      ok: true,
      data: users,
    });
  } catch (err) {
    next(err);
  }
}

async function listUsers(req, res, next) {
  try {
    const users = await User.find({})
      .select("_id username email bio avatarUrl createdAt")
      .sort({ createdAt: -1 });

    return res.json({
      ok: true,
      data: users.map((user) => ({
        id: String(user._id),
        username: user.username,
        email: user.email,
        bio: user.bio,
        avatarUrl: user.avatarUrl,
        createdAt: user.createdAt,
      })),
    });
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
  listUsers,
};
