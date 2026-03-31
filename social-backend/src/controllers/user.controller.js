const crypto = require("crypto");
const User = require("../models/User");
const Follow = require("../models/Follow");
const { AppError } = require("../utils/errors");
const notificationService = require('../services/notification.service');

function legacyUserId(username) {
  return crypto.createHash("sha256").update(String(username || "")).digest("hex").slice(0, 16);
}

async function resolveViewer(req) {
  const username = (req.headers["x-username"] || req.user?.username || "").toString().trim();
  if (!username) {
    return null;
  }

  const user = await User.findOne({ username }).select("_id username email bio avatarUrl createdAt").lean();
  if (!user) {
    return null;
  }

  return user;
}

function serializeUser(user) {
  const id = String(user._id);
  return {
    _id: id,
    id,
    username: user.username,
    email: user.email || "",
    bio: user.bio || "",
    avatarUrl: user.avatarUrl || "",
    createdAt: user.createdAt || null,
  };
}

async function getFollowDocsForTarget(user) {
  return Follow.find({
    $or: [{ followingId: String(user._id) }, { followingUsername: user.username }],
  })
    .select("followerId followerUsername")
    .lean();
}

async function getFollowingDocsForUser(user) {
  return Follow.find({
    $or: [
      { followerId: String(user._id) },
      { followerId: legacyUserId(user.username) },
      { followerUsername: user.username },
    ],
  })
    .select("followingId followingUsername")
    .lean();
}

async function hydrateUsersByRefs({ ids = [], usernames = [] }) {
  const or = [];
  if (ids.length) or.push({ _id: { $in: ids } });
  if (usernames.length) or.push({ username: { $in: usernames } });
  if (!or.length) return [];

  const users = await User.find({ $or: or })
    .select("_id username email bio avatarUrl createdAt")
    .sort({ username: 1 })
    .lean();

  const seen = new Set();
  return users.filter((user) => {
    const id = String(user._id);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

async function getCountsForUser(user) {
  try {
    const [followers, following] = await Promise.all([
      Follow.countDocuments({
        $or: [{ followingId: String(user._id) }, { followingUsername: user.username }],
      }),
      Follow.countDocuments({
        $or: [
          { followerId: String(user._id) },
          { followerId: legacyUserId(user.username) },
          { followerUsername: user.username },
        ],
      }),
    ]);

    return {
      followers: Number.isFinite(followers) ? followers : 0,
      following: Number.isFinite(following) ? following : 0,
    };
  } catch (err) {
    return { followers: 0, following: 0 };
  }
}

async function getRelationship(viewer, targetUser) {
  if (!viewer) {
    return { isMe: false, isFollowing: false, isFollowedBy: false };
  }

  if (String(viewer._id) === String(targetUser._id)) {
    return { isMe: true, isFollowing: false, isFollowedBy: false };
  }

  const viewerLegacyId = legacyUserId(viewer.username);
  const targetLegacyId = legacyUserId(targetUser.username);

  const [isFollowing, isFollowedBy] = await Promise.all([
    Follow.exists({
      $or: [
        {
          followerId: String(viewer._id),
          followingId: String(targetUser._id),
        },
        {
          followerId: viewerLegacyId,
          followingId: targetLegacyId,
        },
        {
          followerUsername: viewer.username,
          followingUsername: targetUser.username,
        },
        {
          followerId: String(viewer._id),
          followingUsername: targetUser.username,
        },
        {
          followerUsername: viewer.username,
          followingId: String(targetUser._id),
        },
      ],
    }),
    Follow.exists({
      $or: [
        {
          followerId: String(targetUser._id),
          followingId: String(viewer._id),
        },
        {
          followerId: targetLegacyId,
          followingId: viewerLegacyId,
        },
        {
          followerUsername: targetUser.username,
          followingUsername: viewer.username,
        },
        {
          followerId: String(targetUser._id),
          followingUsername: viewer.username,
        },
        {
          followerUsername: targetUser.username,
          followingId: String(viewer._id),
        },
      ],
    }),
  ]);

  return {
    isMe: false,
    isFollowing: Boolean(isFollowing),
    isFollowedBy: Boolean(isFollowedBy),
  };
}

async function getProfile(req, res, next) {
  try {
    const { username } = req.params;
    const [user, viewer] = await Promise.all([
      User.findOne({ username }).select("_id username email bio avatarUrl createdAt").lean(),
      resolveViewer(req),
    ]);

    if (!user) {
      throw new AppError("Không tìm thấy người dùng", 404, "USER_NOT_FOUND");
    }

    const [counts, relationship] = await Promise.all([
      getCountsForUser(user),
      getRelationship(viewer, user),
    ]);

    return res.json({
      ok: true,
      data: {
        ...serializeUser(user),
        counts,
        relationship,
      },
    });
  } catch (err) {
    next(err);
  }
}

async function follow(req, res, next) {
  try {
    const viewer = await resolveViewer(req);
    const followingId = String(req.body?.followingId || "").trim();
    const followingUsername = String(req.body?.username || req.body?.followingUsername || "").trim();

    if (!viewer) {
      throw new AppError("Chưa xác thực người dùng", 401, "UNAUTHORIZED");
    }

    if (!followingId && !followingUsername) {
      throw new AppError("Thiếu followingId hoặc username", 400, "MISSING_TARGET_USER");
    }

    const targetUser = await User.findOne({
      $or: [
        ...(followingId ? [{ _id: followingId }] : []),
        ...(followingUsername ? [{ username: followingUsername }] : []),
      ],
    })
      .select("_id username email bio avatarUrl createdAt")
      .lean();

    if (!targetUser) {
      throw new AppError("Không tìm thấy người dùng cần follow", 404, "TARGET_USER_NOT_FOUND");
    }

    if (String(viewer._id) === String(targetUser._id)) {
      throw new AppError("Không thể tự follow chính mình", 400, "INVALID_FOLLOW");
    }

    try {
      await Follow.create({
        followerId: String(viewer._id),
        followerUsername: viewer.username,
        followingId: String(targetUser._id),
        followingUsername: targetUser.username,
      });
    } catch (err) {
      if (err?.code !== 11000) throw err;
    }

    const counts = await getCountsForUser(targetUser);

    notificationService.notifyFollow({
      recipientId: String(targetUser._id),
      actorId: String(viewer._id),
      actorUsername: viewer.username,
    }).catch((error) => {
      console.error('notifyFollow failed:', error?.message || error);
    });

    return res.json({
      ok: true,
      message: "Follow thành công",
      data: {
        targetUser: serializeUser(targetUser),
        counts,
        relationship: {
          isMe: false,
          isFollowing: true,
          isFollowedBy: false,
        },
      },
    });
  } catch (err) {
    next(err);
  }
}

async function unfollow(req, res, next) {
  try {
    const viewer = await resolveViewer(req);
    const followingId = String(req.body?.followingId || "").trim();
    const followingUsername = String(req.body?.username || req.body?.followingUsername || "").trim();

    if (!viewer) {
      throw new AppError("Chưa xác thực người dùng", 401, "UNAUTHORIZED");
    }

    if (!followingId && !followingUsername) {
      throw new AppError("Thiếu followingId hoặc username", 400, "MISSING_TARGET_USER");
    }

    const targetUser = await User.findOne({
      $or: [
        ...(followingId ? [{ _id: followingId }] : []),
        ...(followingUsername ? [{ username: followingUsername }] : []),
      ],
    })
      .select("_id username email bio avatarUrl createdAt")
      .lean();

    if (!targetUser) {
      throw new AppError("Không tìm thấy người dùng cần unfollow", 404, "TARGET_USER_NOT_FOUND");
    }

    await Follow.deleteMany({
      $or: [
        {
          followerId: String(viewer._id),
          followingId: String(targetUser._id),
        },
        {
          followerId: legacyUserId(viewer.username),
          followingId: legacyUserId(targetUser.username),
        },
        {
          followerUsername: viewer.username,
          followingUsername: targetUser.username,
        },
        {
          followerId: String(viewer._id),
          followingUsername: targetUser.username,
        },
        {
          followerUsername: viewer.username,
          followingId: String(targetUser._id),
        },
      ],
    });

    const counts = await getCountsForUser(targetUser);

    notificationService.removeFollowNotification({
      recipientId: String(targetUser._id),
      actorId: String(viewer._id),
      actorUsername: viewer.username,
    }).catch((error) => {
      console.error('removeFollowNotification failed:', error?.message || error);
    });

    return res.json({
      ok: true,
      message: "Bỏ follow thành công",
      data: {
        targetUser: serializeUser(targetUser),
        counts,
        relationship: {
          isMe: false,
          isFollowing: false,
          isFollowedBy: false,
        },
      },
    });
  } catch (err) {
    next(err);
  }
}

async function listFollowers(req, res, next) {
  try {
    const { username } = req.params;
    const user = await User.findOne({ username }).select("_id username").lean();
    if (!user) {
      throw new AppError("Không tìm thấy người dùng", 404, "USER_NOT_FOUND");
    }

    const rows = await getFollowDocsForTarget(user);
    const users = await hydrateUsersByRefs({
      ids: rows.map((item) => String(item.followerId || "")).filter(Boolean),
      usernames: rows.map((item) => String(item.followerUsername || "")).filter(Boolean),
    });

    return res.json({
      ok: true,
      data: users.map(serializeUser),
    });
  } catch (err) {
    next(err);
  }
}

async function listFollowing(req, res, next) {
  try {
    const { username } = req.params;
    const user = await User.findOne({ username }).select("_id username").lean();
    if (!user) {
      throw new AppError("Không tìm thấy người dùng", 404, "USER_NOT_FOUND");
    }

    const rows = await getFollowingDocsForUser(user);
    const users = await hydrateUsersByRefs({
      ids: rows.map((item) => String(item.followingId || "")).filter(Boolean),
      usernames: rows.map((item) => String(item.followingUsername || "")).filter(Boolean),
    });

    return res.json({
      ok: true,
      data: users.map(serializeUser),
    });
  } catch (err) {
    next(err);
  }
}

async function listUsers(req, res, next) {
  try {
    const users = await User.find({})
      .select("_id username email bio avatarUrl createdAt")
      .sort({ createdAt: -1 })
      .lean();

    return res.json({
      ok: true,
      data: users.map(serializeUser),
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
  listUsers,
};
