const { z } = require("zod");
const mongoose = require("mongoose");
const User = require("../models/User");
const Post = require("../models/Post");
const Comment = require("../models/Comment");
const LoginActivity = require("../models/LoginActivity");
const PostReport = require("../models/PostReport");
const { AppError } = require("../utils/errors");

const accountStatsQuerySchema = z.object({
  months: z.coerce.number().int().min(1).max(36).optional().default(12),
});

const adminPostsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  startDate: z.string().trim().optional(),
  endDate: z.string().trim().optional(),
  sort: z.enum(["engagement_desc", "engagement_asc"]).optional().default("engagement_desc"),
});

const reportedPostsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  status: z.enum(["all", "pending", "reviewed", "accepted", "rejected"]).optional().default("all"),
  startDate: z.string().trim().optional(),
  endDate: z.string().trim().optional(),
});

const moderationPostSchema = z.object({
  status: z.enum(["normal", "reported", "violating"]),
  reason: z.string().trim().max(500).optional().or(z.literal("")).default(""),
});

const moderationUserSchema = z.object({
  status: z.enum(["normal", "warning", "violating"]),
  reason: z.string().trim().max(500).optional().or(z.literal("")).default(""),
});

function monthKey(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function buildMonthlyBuckets(months) {
  const now = new Date();
  const firstOfCurrentMonthUtc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0),
  );
  const startDate = new Date(firstOfCurrentMonthUtc);
  startDate.setUTCMonth(startDate.getUTCMonth() - (months - 1));

  const buckets = [];
  for (let index = 0; index < months; index += 1) {
    const current = new Date(startDate);
    current.setUTCMonth(startDate.getUTCMonth() + index);
    buckets.push(monthKey(current));
  }

  return { startDate, buckets };
}

function parseDateInput(value, endOfDay = false) {
  if (!value) return null;
  const source = String(value).trim();
  if (!source) return null;
  const parsed = new Date(source);
  if (Number.isNaN(parsed.getTime())) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(source)) {
    if (endOfDay) {
      parsed.setHours(23, 59, 59, 999);
    } else {
      parsed.setHours(0, 0, 0, 0);
    }
  }

  return parsed;
}

function buildCreatedAtRange({ startDate, endDate }) {
  const start = parseDateInput(startDate);
  const end = parseDateInput(endDate, true);
  if ((startDate && !start) || (endDate && !end)) {
    throw new AppError("Invalid date filter", 400, "INVALID_DATE_FILTER");
  }
  if (start && end && start > end) {
    throw new AppError("startDate must be before endDate", 400, "INVALID_DATE_FILTER");
  }
  if (!start && !end) return null;
  return {
    ...(start ? { $gte: start } : {}),
    ...(end ? { $lte: end } : {}),
  };
}

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function toPostTitle(content = "") {
  const normalized = String(content || "").replace(/\s+/g, " ").trim();
  if (!normalized) return "(Không có tiêu đề)";
  if (normalized.length <= 50) return normalized;
  return `${normalized.slice(0, 50)}...`;
}

function resolvePostThumbnail(post = {}) {
  const media = Array.isArray(post.media) ? post.media : [];
  if (media.length > 0) {
    const firstMedia = media[0] || {};
    if (firstMedia.type === "video") {
      return String(firstMedia.thumbnailUrl || firstMedia.url || post.imageUrl || "");
    }
    return String(firstMedia.url || post.imageUrl || "");
  }
  return String(post.imageUrl || "");
}

function resolvePostMediaType(post = {}) {
  const media = Array.isArray(post.media) ? post.media : [];
  if (media.length > 0) {
    const firstType = String(media[0]?.type || "").toLowerCase();
    return firstType === "video" ? "video" : "image";
  }
  return post.imageUrl ? "image" : "text";
}

async function buildCommentCountMap(postIds = []) {
  if (!postIds.length) return new Map();
  const rows = await Comment.aggregate([
    { $match: { postId: { $in: postIds } } },
    { $group: { _id: "$postId", count: { $sum: 1 } } },
  ]);
  return new Map(rows.map((row) => [String(row._id), Number(row.count) || 0]));
}

async function getAccountStats(req, res, next) {
  try {
    const { months } = accountStatsQuerySchema.parse(req.query || {});
    const { startDate, buckets } = buildMonthlyBuckets(months);

    const [newUsersRaw, loginsRaw, totalAccounts, totalLoginsRaw, activeLast30Days, topLoginUsers] =
      await Promise.all([
        User.aggregate([
          { $match: { createdAt: { $gte: startDate } } },
          {
            $group: {
              _id: {
                year: { $year: "$createdAt" },
                month: { $month: "$createdAt" },
              },
              count: { $sum: 1 },
            },
          },
        ]),
        LoginActivity.aggregate([
          { $match: { loggedInAt: { $gte: startDate } } },
          {
            $group: {
              _id: {
                year: { $year: "$loggedInAt" },
                month: { $month: "$loggedInAt" },
              },
              count: { $sum: 1 },
            },
          },
        ]),
        User.countDocuments({}),
        User.aggregate([
          {
            $group: {
              _id: null,
              total: { $sum: { $ifNull: ["$loginCount", 0] } },
            },
          },
        ]),
        User.countDocuments({
          lastLoginAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        }),
        User.find({ loginCount: { $gt: 0 } })
          .select("username loginCount lastLoginAt role")
          .sort({ loginCount: -1, lastLoginAt: -1 })
          .limit(10)
          .lean(),
      ]);

    const monthlyNewUsersMap = new Map(
      newUsersRaw.map((row) => [
        `${String(row._id?.year || "").padStart(4, "0")}-${String(row._id?.month || "").padStart(2, "0")}`,
        Number(row.count) || 0,
      ]),
    );
    const monthlyLoginMap = new Map(
      loginsRaw.map((row) => [
        `${String(row._id?.year || "").padStart(4, "0")}-${String(row._id?.month || "").padStart(2, "0")}`,
        Number(row.count) || 0,
      ]),
    );

    const monthly = buckets.map((month) => ({
      month,
      newAccounts: monthlyNewUsersMap.get(month) || 0,
      loginCount: monthlyLoginMap.get(month) || 0,
    }));

    const totalLogins = Number(totalLoginsRaw?.[0]?.total) || 0;

    res.json({
      ok: true,
      data: {
        summary: {
          totalAccounts: Number(totalAccounts) || 0,
          totalLogins,
          activeLast30Days: Number(activeLast30Days) || 0,
        },
        monthly,
        topLoginUsers: topLoginUsers.map((item) => ({
          id: String(item._id),
          username: item.username || "",
          role: item.role || "user",
          loginCount: Number(item.loginCount) || 0,
          lastLoginAt: item.lastLoginAt || null,
        })),
      },
    });
  } catch (err) {
    if (err?.name === "ZodError") {
      return next(new AppError(err.issues?.[0]?.message || "Invalid query", 400, "VALIDATION_ERROR"));
    }
    next(err);
  }
}

async function listPostsForAdmin(req, res, next) {
  try {
    const { page, limit, startDate, endDate, sort } = adminPostsQuerySchema.parse(req.query || {});
    const skip = (page - 1) * limit;
    const createdAtRange = buildCreatedAtRange({ startDate, endDate });

    const match = {};
    if (createdAtRange) {
      match.createdAt = createdAtRange;
    }

    const sortDirection = sort === "engagement_asc" ? 1 : -1;
    const pipeline = [
      { $match: match },
      { $addFields: { likesCount: { $size: { $ifNull: ["$likes", []] } } } },
      {
        $lookup: {
          from: "comments",
          let: { postId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$postId", "$$postId"] },
              },
            },
            { $count: "count" },
          ],
          as: "commentStats",
        },
      },
      {
        $addFields: {
          commentsCount: { $ifNull: [{ $arrayElemAt: ["$commentStats.count", 0] }, 0] },
        },
      },
      {
        $addFields: {
          engagementCount: { $add: ["$likesCount", "$commentsCount"] },
        },
      },
      { $project: { commentStats: 0 } },
      {
        $sort: {
          engagementCount: sortDirection,
          createdAt: -1,
          _id: -1,
        },
      },
      { $skip: skip },
      { $limit: limit },
    ];

    const [rows, total] = await Promise.all([
      Post.aggregate(pipeline),
      Post.countDocuments(match),
    ]);

    const items = rows.map((post) => ({
      id: String(post._id),
      title: toPostTitle(post.content),
      fullTitle: String(post.content || "").replace(/\s+/g, " ").trim(),
      thumbnailUrl: resolvePostThumbnail(post),
      mediaType: resolvePostMediaType(post),
      authorUsername: post.authorUsername || "",
      createdAt: post.createdAt || null,
      likesCount: Number(post.likesCount) || 0,
      commentsCount: Number(post.commentsCount) || 0,
      engagementCount: Number(post.engagementCount) || 0,
      reportCount: Number(post.reportCount) || 0,
      moderationStatus: post.moderationStatus || "normal",
      moderationReason: post.moderationReason || "",
    }));

    res.json({
      ok: true,
      data: {
        items,
        page,
        limit,
        total,
        totalPages: Math.max(Math.ceil(total / limit), 1),
        filters: {
          startDate: startDate || "",
          endDate: endDate || "",
          sort,
        },
      },
    });
  } catch (err) {
    if (err?.name === "ZodError") {
      return next(new AppError(err.issues?.[0]?.message || "Invalid query", 400, "VALIDATION_ERROR"));
    }
    next(err);
  }
}

async function listReportedPosts(req, res, next) {
  try {
    const { page, limit, status, startDate, endDate } = reportedPostsQuerySchema.parse(req.query || {});
    const skip = (page - 1) * limit;
    const createdAtRange = buildCreatedAtRange({ startDate, endDate });

    const match = {};
    if (status !== "all") match.status = status;
    if (createdAtRange) match.createdAt = createdAtRange;

    const [grouped, totalRaw] = await Promise.all([
      PostReport.aggregate([
        { $match: match },
        { $sort: { createdAt: -1 } },
        {
          $group: {
            _id: "$postId",
            reportCount: { $sum: 1 },
            pendingCount: {
              $sum: {
                $cond: [{ $eq: ["$status", "pending"] }, 1, 0],
              },
            },
            lastReportedAt: { $first: "$createdAt" },
            latestReason: { $first: "$reason" },
            statuses: { $addToSet: "$status" },
          },
        },
        { $sort: { reportCount: -1, lastReportedAt: -1, _id: -1 } },
        { $skip: skip },
        { $limit: limit },
      ]),
      PostReport.aggregate([
        { $match: match },
        { $group: { _id: "$postId" } },
        { $count: "count" },
      ]),
    ]);

    const postIds = grouped.map((row) => row._id).filter(Boolean);
    const [posts, commentCountMap] = await Promise.all([
      Post.find({ _id: { $in: postIds } })
        .select("content media imageUrl authorUsername createdAt likes reportCount moderationStatus moderationReason")
        .lean(),
      buildCommentCountMap(postIds),
    ]);

    const postMap = new Map(posts.map((post) => [String(post._id), post]));

    const items = grouped.map((row) => {
      const post = postMap.get(String(row._id));
      const likesCount = Array.isArray(post?.likes) ? post.likes.length : 0;
      const commentsCount = commentCountMap.get(String(row._id)) || 0;

      return {
        id: String(row._id),
        title: toPostTitle(post?.content || ""),
        thumbnailUrl: resolvePostThumbnail(post || {}),
        mediaType: resolvePostMediaType(post || {}),
        authorUsername: post?.authorUsername || "(unknown)",
        createdAt: post?.createdAt || null,
        likesCount,
        commentsCount,
        engagementCount: likesCount + commentsCount,
        reportCount: Number(row.reportCount) || 0,
        pendingCount: Number(row.pendingCount) || 0,
        lastReportedAt: row.lastReportedAt || null,
        latestReason: row.latestReason || "",
        statuses: Array.isArray(row.statuses) ? row.statuses : [],
        moderationStatus: post?.moderationStatus || "normal",
        moderationReason: post?.moderationReason || "",
      };
    });

    const total = Number(totalRaw?.[0]?.count) || 0;

    res.json({
      ok: true,
      data: {
        items,
        page,
        limit,
        total,
        totalPages: Math.max(Math.ceil(total / limit), 1),
        filters: {
          status,
          startDate: startDate || "",
          endDate: endDate || "",
        },
      },
    });
  } catch (err) {
    if (err?.name === "ZodError") {
      return next(new AppError(err.issues?.[0]?.message || "Invalid query", 400, "VALIDATION_ERROR"));
    }
    next(err);
  }
}

async function listViolations(req, res, next) {
  try {
    const includeWarning = parseBoolean(req.query?.includeWarning, true);
    const userStatuses = includeWarning ? ["warning", "violating"] : ["violating"];

    const [users, posts] = await Promise.all([
      User.find({ moderationStatus: { $in: userStatuses } })
        .select("username email role moderationStatus moderationReason createdAt updatedAt loginCount lastLoginAt")
        .sort({ updatedAt: -1, createdAt: -1 })
        .lean(),
      Post.find({ moderationStatus: "violating" })
        .select("content media imageUrl authorUsername createdAt updatedAt likes reportCount moderationStatus moderationReason")
        .sort({ updatedAt: -1, createdAt: -1 })
        .lean(),
    ]);

    const postIds = posts.map((post) => post._id);
    const commentCountMap = await buildCommentCountMap(postIds);

    res.json({
      ok: true,
      data: {
        summary: {
          violatingAccounts: users.length,
          violatingPosts: posts.length,
        },
        accounts: users.map((user) => ({
          id: String(user._id),
          username: user.username || "",
          email: user.email || "",
          role: user.role || "user",
          moderationStatus: user.moderationStatus || "normal",
          moderationReason: user.moderationReason || "",
          loginCount: Number(user.loginCount) || 0,
          lastLoginAt: user.lastLoginAt || null,
          createdAt: user.createdAt || null,
          updatedAt: user.updatedAt || null,
        })),
        posts: posts.map((post) => {
          const likesCount = Array.isArray(post.likes) ? post.likes.length : 0;
          const commentsCount = commentCountMap.get(String(post._id)) || 0;
          return {
            id: String(post._id),
            title: toPostTitle(post.content),
            thumbnailUrl: resolvePostThumbnail(post),
            mediaType: resolvePostMediaType(post),
            authorUsername: post.authorUsername || "",
            moderationStatus: post.moderationStatus || "normal",
            moderationReason: post.moderationReason || "",
            reportCount: Number(post.reportCount) || 0,
            likesCount,
            commentsCount,
            engagementCount: likesCount + commentsCount,
            createdAt: post.createdAt || null,
            updatedAt: post.updatedAt || null,
          };
        }),
      },
    });
  } catch (err) {
    next(err);
  }
}

async function updatePostModeration(req, res, next) {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      throw new AppError("Invalid post id", 400, "INVALID_ID");
    }
    const body = moderationPostSchema.parse(req.body || {});
    const post = await Post.findById(req.params.id);
    if (!post) throw new AppError("Post not found", 404, "NOT_FOUND");

    const nextStatus = body.status;
    post.moderationStatus = nextStatus;
    post.moderationReason = body.reason || "";

    if (nextStatus === "normal") {
      post.reportCount = 0;
      post.lastReportedAt = null;
    } else if (nextStatus !== "normal" && !post.lastReportedAt && post.reportCount > 0) {
      post.lastReportedAt = new Date();
    }

    await post.save();

    if (nextStatus === "normal") {
      await PostReport.updateMany(
        { postId: post._id, status: "pending" },
        {
          $set: {
            status: "reviewed",
            reviewedAt: new Date(),
            reviewedBy: req.adminUser?.username || "admin",
          },
        },
      );
    } else if (nextStatus === "violating") {
      await PostReport.updateMany(
        { postId: post._id, status: "pending" },
        {
          $set: {
            status: "accepted",
            reviewedAt: new Date(),
            reviewedBy: req.adminUser?.username || "admin",
          },
        },
      );
    }

    res.json({
      ok: true,
      message: "Post moderation updated",
      data: {
        id: String(post._id),
        moderationStatus: post.moderationStatus,
        moderationReason: post.moderationReason || "",
        reportCount: Number(post.reportCount) || 0,
        lastReportedAt: post.lastReportedAt || null,
      },
    });
  } catch (err) {
    if (err?.name === "ZodError") {
      return next(new AppError(err.issues?.[0]?.message || "Invalid payload", 400, "VALIDATION_ERROR"));
    }
    next(err);
  }
}

async function updateUserModeration(req, res, next) {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      throw new AppError("Invalid user id", 400, "INVALID_ID");
    }
    const body = moderationUserSchema.parse(req.body || {});
    const user = await User.findById(req.params.id);
    if (!user) throw new AppError("User not found", 404, "NOT_FOUND");

    user.moderationStatus = body.status;
    user.moderationReason = body.reason || "";
    await user.save();

    res.json({
      ok: true,
      message: "User moderation updated",
      data: {
        id: String(user._id),
        username: user.username,
        moderationStatus: user.moderationStatus,
        moderationReason: user.moderationReason || "",
      },
    });
  } catch (err) {
    if (err?.name === "ZodError") {
      return next(new AppError(err.issues?.[0]?.message || "Invalid payload", 400, "VALIDATION_ERROR"));
    }
    next(err);
  }
}

module.exports = {
  getAccountStats,
  listPostsForAdmin,
  listReportedPosts,
  listViolations,
  updatePostModeration,
  updateUserModeration,
};
