const fs = require("fs");
const path = require("path");
const { z } = require("zod");
const Post = require("../models/Post");
const { AppError } = require("../utils/errors");
const Comment = require("../models/Comment");
const { getIO } = require("../realtime/socket");
const { postMediaDir } = require("../config/media");
const {
  createOrMergeNotification,
  removeActorFromNotification,
} = require("../services/notification.service");

const visibilityEnum = ["public", "friends", "private"];
const MEDIA_PUBLIC_BASE_URL = (process.env.MEDIA_PUBLIC_BASE_URL || "http://localhost:4000").replace(/\/$/, "");

const createPostSchema = z
  .object({
    content: z.string().trim().max(3000).optional().default(""),
    visibility: z.enum(visibilityEnum).optional().default("public"),
    isAnonymous: z.union([z.boolean(), z.string()]).optional().default(false),
    allowComments: z.union([z.boolean(), z.string()]).optional().default(true),
    hideLikeCount: z.union([z.boolean(), z.string()]).optional().default(false),
    location: z.string().trim().max(150).optional().or(z.literal("")).default(""),
    collaborators: z.union([z.string(), z.array(z.string())]).optional(),
    tags: z.union([z.string(), z.array(z.string())]).optional(),
    altText: z.string().trim().max(500).optional().or(z.literal("")).default(""),
  })
  .transform((data) => ({
    ...data,
    isAnonymous: normalizeBoolean(data.isAnonymous, false),
    allowComments: normalizeBoolean(data.allowComments, true),
    hideLikeCount: normalizeBoolean(data.hideLikeCount, false),
    collaborators: normalizeStringList(data.collaborators),
    tags: normalizeStringList(data.tags),
  }));

const addCommentSchema = z.object({
  content: z.string().trim().min(1).max(1000),
  parentCommentId: z.string().trim().optional().nullable(),
});

const updatePostSchema = z
  .object({
    content: z.string().trim().max(3000).optional(),
    visibility: z.enum(visibilityEnum).optional(),
    isAnonymous: z.union([z.boolean(), z.string()]).optional(),
    allowComments: z.union([z.boolean(), z.string()]).optional(),
    hideLikeCount: z.union([z.boolean(), z.string()]).optional(),
    location: z.string().trim().max(150).optional().or(z.literal("")),
    collaborators: z.union([z.string(), z.array(z.string())]).optional(),
    tags: z.union([z.string(), z.array(z.string())]).optional(),
  })
  .transform((data) => ({
    ...data,
    ...(data.isAnonymous !== undefined
      ? { isAnonymous: normalizeBoolean(data.isAnonymous, false) }
      : {}),
    ...(data.allowComments !== undefined
      ? { allowComments: normalizeBoolean(data.allowComments, true) }
      : {}),
    ...(data.hideLikeCount !== undefined
      ? { hideLikeCount: normalizeBoolean(data.hideLikeCount, false) }
      : {}),
    ...(data.collaborators !== undefined
      ? { collaborators: normalizeStringList(data.collaborators) }
      : {}),
    ...(data.tags !== undefined ? { tags: normalizeStringList(data.tags) } : {}),
  }));

function normalizeBoolean(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) return true;
    if (["false", "0", "no", "off"].includes(normalized)) return false;
  }
  return fallback;
}

function normalizeStringList(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function cleanupUploadedFiles(files = []) {
  for (const file of files) {
    if (file?.path && fs.existsSync(file.path)) {
      try {
        fs.unlinkSync(file.path);
      } catch (_err) {}
    }
  }
}

function removePostMediaFiles(post) {
  for (const item of post?.media || []) {
    if (!item?.url) continue;
    const filename = path.basename(item.url);
    const absolutePath = path.join(postMediaDir, filename);
    if (fs.existsSync(absolutePath)) {
      try {
        fs.unlinkSync(absolutePath);
      } catch (_err) {}
    }
  }
}

function normalizePublicMediaUrl(url = "") {
  const raw = String(url || "").trim().replace(/\\/g, "/");
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  const uploadsIndex = raw.toLowerCase().indexOf("/uploads/");
  if (uploadsIndex >= 0) return `${MEDIA_PUBLIC_BASE_URL}${raw.slice(uploadsIndex)}`;
  if (raw.toLowerCase().startsWith("uploads/")) return `${MEDIA_PUBLIC_BASE_URL}/${raw}`;
  return `${MEDIA_PUBLIC_BASE_URL}${raw.startsWith("/") ? raw : `/${raw}`}`;
}

function buildMediaFromFiles(files = [], altText = "") {
  return files.map((file, index) => ({
    type: file.mimetype.startsWith("video/") ? "video" : "image",
    url: normalizePublicMediaUrl(`/uploads/posts/${path.basename(file.path)}`),
    filename: file.originalname,
    mimeType: file.mimetype,
    size: file.size,
    order: index,
    altText: altText || undefined,
  }));
}

function detectMediaType(media) {
  if (!media?.length) return "text";
  const types = new Set(media.map((item) => item.type));
  if (types.size > 1) return "mixed";
  return types.has("video") ? "video" : "image";
}

function serializeComment(comment, userId) {
  const obj = comment.toObject ? comment.toObject() : comment;
  const likes = Array.isArray(obj.likes) ? obj.likes : [];
  return {
    ...obj,
    likesCount: likes.length,
    likedByMe: userId ? likes.includes(userId) : false,
  };
}

function serializePost(post, userId, commentsCount = 0) {
  const obj = post.toObject ? post.toObject() : post;
  const likesArr = obj.likes || [];
  const media = (Array.isArray(obj.media) ? obj.media : []).map((item, index) => ({
    ...item,
    type: item.type === "video" || item.mimeType?.startsWith("video/") ? "video" : "image",
    url: normalizePublicMediaUrl(item.url),
    order: Number.isFinite(item.order) ? item.order : index,
  }));
  const imageUrls = media.filter((item) => item.type === "image").map((item) => item.url);
  const firstImageUrl = imageUrls[0] || normalizePublicMediaUrl(obj.imageUrl) || "";

  return {
    ...obj,
    imageUrl: firstImageUrl,
    authorUsername: obj.isAnonymous ? "anonymous" : obj.authorUsername,
    media,
    images: imageUrls,
    imageUrl: firstImageUrl,
    mediaCount: media.length,
    mediaType: detectMediaType(media),
    likesCount: likesArr.length,
    displayLikesCount: obj.hideLikeCount ? null : likesArr.length,
    likedByMe: userId ? likesArr.includes(userId) : false,
    commentsCount,
  };
}

async function getCommentsCountMap(postIds = []) {
  if (!postIds.length) return new Map();
  const counts = await Comment.aggregate([
    { $match: { postId: { $in: postIds } } },
    { $group: { _id: "$postId", count: { $sum: 1 } } },
  ]);
  return new Map(counts.map((x) => [String(x._id), x.count]));
}

async function createPost(req, res, next) {
  const uploadedFiles = req.files || [];
  try {
    const body = createPostSchema.parse(req.body || {});
    const media = buildMediaFromFiles(uploadedFiles, body.altText);

    if (!body.content && media.length === 0) {
      cleanupUploadedFiles(uploadedFiles);
      throw new AppError("Post must contain text, image, or video", 400, "EMPTY_POST");
    }

    const post = await Post.create({
      authorId: req.user.sub,
      authorUsername: req.user.username,
      content: body.content,
      visibility: body.visibility || "public",
      isAnonymous: body.isAnonymous,
      allowComments: body.allowComments,
      hideLikeCount: body.hideLikeCount,
      location: body.location || "",
      collaborators: body.collaborators,
      tags: body.tags,
      media,
      mediaCount: media.length,
      mediaType: detectMediaType(media),
      images: media.filter((item) => item.type === "image").map((item) => item.url),
      imageUrl: media.find((item) => item.type === "image")?.url || "",
    });

    res.status(201).json({ ok: true, message: "Post created successfully", data: serializePost(post, req.user.sub, 0) });
  } catch (err) {
    cleanupUploadedFiles(uploadedFiles);
    if (err?.name === "ZodError") {
      return next(new AppError(err.issues?.[0]?.message || err.errors?.[0]?.message || "Invalid input", 400, "VALIDATION_ERROR"));
    }
    next(err);
  }
}

async function listPosts(req, res, next) {
  try {
    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || "10", 10), 1), 50);
    const skip = (page - 1) * limit;

    const filters = {};
    const viewerId = req.user?.sub;
    const requestedVisibility = req.query.visibility;

    if (requestedVisibility && visibilityEnum.includes(requestedVisibility)) {
      filters.visibility = requestedVisibility;
    } else {
      filters.$or = [{ visibility: "public" }];
      if (viewerId) filters.$or.push({ authorId: viewerId });
    }

    const [items, total] = await Promise.all([
      Post.find(filters).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Post.countDocuments(filters),
    ]);

    const postIds = items.map((p) => p._id);
    const countMap = await getCommentsCountMap(postIds);
    const mapped = items.map((p) => serializePost(p, viewerId, countMap.get(String(p._id)) || 0));

    res.json({ ok: true, data: { items: mapped, page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (err) {
    next(err);
  }
}

async function getPost(req, res, next) {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) throw new AppError("Post not found", 404, "NOT_FOUND");
    if (post.visibility === "private" && post.authorId !== req.user?.sub) {
      throw new AppError("Forbidden", 403, "FORBIDDEN");
    }

    const comments = await Comment.find({ postId: post._id }).sort({ createdAt: -1 }).limit(100);

    res.json({
      ok: true,
      data: {
        post: serializePost(post, req.user?.sub, comments.length),
        comments: comments.map((comment) => serializeComment(comment, req.user?.sub)),
      },
    });
  } catch (err) {
    next(err);
  }
}

async function recordView(req, res, next) {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) throw new AppError("Post not found", 404, "NOT_FOUND");

    post.viewsCount = (post.viewsCount || 0) + 1;
    post.lastViewedAt = new Date();
    await post.save();

    const commentsCount = await Comment.countDocuments({ postId: post._id });
    res.json({ ok: true, data: { postId: post._id, viewsCount: post.viewsCount, lastViewedAt: post.lastViewedAt, post: serializePost(post, req.user?.sub, commentsCount) } });
  } catch (err) {
    next(err);
  }
}

async function updatePost(req, res, next) {
  try {
    const body = updatePostSchema.parse(req.body || {});
    const post = await Post.findById(req.params.id);
    if (!post) throw new AppError("Post not found", 404, "NOT_FOUND");
    if (post.authorId !== req.user.sub) throw new AppError("Forbidden", 403, "FORBIDDEN");

    if (body.content !== undefined) post.content = body.content;
    if (body.visibility !== undefined) post.visibility = body.visibility;
    if (body.isAnonymous !== undefined) post.isAnonymous = body.isAnonymous;
    if (body.allowComments !== undefined) post.allowComments = body.allowComments;
    if (body.hideLikeCount !== undefined) post.hideLikeCount = body.hideLikeCount;
    if (body.location !== undefined) post.location = body.location;
    if (body.collaborators !== undefined) post.collaborators = body.collaborators;
    if (body.tags !== undefined) post.tags = body.tags;

    if (!post.content && (!post.media || post.media.length === 0)) {
      throw new AppError("Post must contain text, image, or video", 400, "EMPTY_POST");
    }

    await post.save();
    const commentsCount = await Comment.countDocuments({ postId: post._id });
    res.json({ ok: true, data: serializePost(post, req.user.sub, commentsCount) });
  } catch (err) {
    if (err?.name === "ZodError") {
      return next(new AppError(err.issues?.[0]?.message || err.errors?.[0]?.message || "Invalid input", 400, "VALIDATION_ERROR"));
    }
    next(err);
  }
}

async function deletePost(req, res, next) {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) throw new AppError("Post not found", 404, "NOT_FOUND");
    if (post.authorId !== req.user.sub) throw new AppError("Forbidden", 403, "FORBIDDEN");

    removePostMediaFiles(post);
    await Post.deleteOne({ _id: post._id });
    await Comment.deleteMany({ postId: post._id });
    res.json({ ok: true, data: { id: post._id } });
  } catch (err) {
    next(err);
  }
}

async function toggleLike(req, res, next) {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) throw new AppError("Post not found", 404, "NOT_FOUND");

    const userId = req.user.sub;
    const idx = post.likes.indexOf(userId);
    const hasLiked = idx >= 0;
    if (hasLiked) {
      post.likes.splice(idx, 1);
    } else {
      post.likes.push(userId);
    }
    await post.save();

    const liked = !hasLiked;

    const io = getIO();
    io.to(`post:${post._id}`).emit("post:like", {
      postId: String(post._id),
      likesCount: post.likes.length,
      likedBy: req.user.username,
      liked,
      actorId: req.user.sub,
    });

    if (post.authorId !== req.user.sub) {
      if (liked) {
        const notification = await createOrMergeNotification({
          ownerId: post.authorId,
          type: 'like',
          postId: post._id,
          actorId: req.user.sub,
          actorUsername: req.user.username,
        });
        if (notification) {
          io.to(`user:${post.authorId}`).emit('notify', {
            type: 'like',
            postId: String(post._id),
            fromUsername: req.user.username,
            createdAt: new Date().toISOString(),
          });
        }
      } else {
        await removeActorFromNotification({
          ownerId: post.authorId,
          type: 'like',
          postId: post._id,
          actorId: req.user.sub,
        });
      }
    }

    res.json({ ok: true, data: { postId: post._id, liked, likesCount: post.likes.length, displayLikesCount: post.hideLikeCount ? null : post.likes.length } });
  } catch (err) {
    next(err);
  }
}

async function removeLike(req, res, next) {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) throw new AppError("Post not found", 404, "NOT_FOUND");

    const userId = req.user.sub;
    const before = post.likes.length;
    post.likes = (post.likes || []).filter((item) => item !== userId);
    await post.save();

    if (before !== post.likes.length && post.authorId !== req.user.sub) {
      await removeActorFromNotification({
        ownerId: post.authorId,
        type: 'like',
        postId: post._id,
        actorId: req.user.sub,
      });
    }

    res.json({ ok: true, data: { postId: post._id, liked: false, likesCount: post.likes.length, displayLikesCount: post.hideLikeCount ? null : post.likes.length } });
  } catch (err) {
    next(err);
  }
}

async function addComment(req, res, next) {
  try {
    const body = addCommentSchema.parse(req.body);
    const post = await Post.findById(req.params.id);
    if (!post) throw new AppError("Post not found", 404, "NOT_FOUND");
    if (!post.allowComments) throw new AppError("Comments are disabled for this post", 400, "COMMENTS_DISABLED");

    let parentComment = null;
    if (body.parentCommentId) {
      parentComment = await Comment.findById(body.parentCommentId);
      if (!parentComment || String(parentComment.postId) !== String(post._id)) {
        throw new AppError('Parent comment not found', 404, 'COMMENT_NOT_FOUND');
      }
    }

    const c = await Comment.create({
      postId: post._id,
      parentCommentId: parentComment?._id || null,
      authorId: req.user.sub,
      authorUsername: req.user.username,
      content: body.content,
      likes: [],
    });

    const io = getIO();
    io.to(`post:${post._id}`).emit("post:comment", {
      postId: String(post._id),
      comment: serializeComment(c, req.user.sub),
    });

    if (parentComment && parentComment.authorId !== req.user.sub) {
      await createOrMergeNotification({
        ownerId: parentComment.authorId,
        type: 'reply',
        postId: post._id,
        commentId: parentComment._id,
        actorId: req.user.sub,
        actorUsername: req.user.username,
        contentPreview: c.content.slice(0, 120),
      });
    } else if (post.authorId !== req.user.sub) {
      await createOrMergeNotification({
        ownerId: post.authorId,
        type: 'comment',
        postId: post._id,
        actorId: req.user.sub,
        actorUsername: req.user.username,
        contentPreview: c.content.slice(0, 120),
      });
    }

    res.status(201).json({ ok: true, data: serializeComment(c, req.user.sub) });
  } catch (err) {
    if (err?.name === "ZodError") {
      return next(new AppError(err.errors?.[0]?.message || "Invalid input", 400, "VALIDATION_ERROR"));
    }
    next(err);
  }
}

async function listComments(req, res, next) {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) throw new AppError("Post not found", 404, "NOT_FOUND");

    const items = await Comment.find({ postId: post._id }).sort({ createdAt: 1 });
    res.json({ ok: true, data: items.map((item) => serializeComment(item, req.user?.sub)) });
  } catch (err) {
    next(err);
  }
}

async function deleteComment(req, res, next) {
  try {
    const comment = await Comment.findById(req.params.commentId);
    if (!comment) throw new AppError("Comment not found", 404, "NOT_FOUND");
    const post = await Post.findById(comment.postId);
    const canDelete = comment.authorId === req.user.sub || post?.authorId === req.user.sub;
    if (!canDelete) throw new AppError("Forbidden", 403, "FORBIDDEN");

    const ids = [comment._id];
    const children = await Comment.find({ parentCommentId: comment._id }).select('_id');
    for (const child of children) ids.push(child._id);

    await Comment.deleteMany({ _id: { $in: ids } });
    res.json({ ok: true, data: { id: comment._id, deletedIds: ids.map(String) } });
  } catch (err) {
    next(err);
  }
}

async function toggleCommentLike(req, res, next) {
  try {
    const comment = await Comment.findById(req.params.commentId);
    if (!comment) throw new AppError('Comment not found', 404, 'NOT_FOUND');

    const userId = req.user.sub;
    const idx = (comment.likes || []).indexOf(userId);
    let liked = false;
    if (idx >= 0) {
      comment.likes.splice(idx, 1);
    } else {
      comment.likes.push(userId);
      liked = true;
    }
    await comment.save();

    if (comment.authorId !== req.user.sub) {
      if (liked) {
        await createOrMergeNotification({
          ownerId: comment.authorId,
          type: 'comment_like',
          postId: comment.postId,
          commentId: comment._id,
          actorId: req.user.sub,
          actorUsername: req.user.username,
        });
      } else {
        await removeActorFromNotification({
          ownerId: comment.authorId,
          type: 'comment_like',
          postId: comment.postId,
          commentId: comment._id,
          actorId: req.user.sub,
        });
      }
    }

    res.json({ ok: true, data: serializeComment(comment, req.user.sub) });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createPost,
  listPosts,
  getPost,
  recordView,
  updatePost,
  deletePost,
  toggleLike,
  removeLike,
  addComment,
  listComments,
  deleteComment,
  toggleCommentLike,
};
