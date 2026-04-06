const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const Story = require('../models/Story');
const User = require('../models/User');
const { postMediaDir } = require('../config/media');
const { AppError } = require('../utils/errors');

const execFileAsync = promisify(execFile);
const MEDIA_PUBLIC_BASE_URL = (process.env.MEDIA_PUBLIC_BASE_URL || 'http://localhost:4000').replace(/\/$/, '');
const thumbnailDir = path.join(postMediaDir, 'thumbnails');
fs.mkdirSync(thumbnailDir, { recursive: true });

function normalizePublicMediaUrl(url = '') {
  const raw = String(url || '').trim().replace(/\\/g, '/');
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  const uploadsIndex = raw.toLowerCase().indexOf('/uploads/');
  if (uploadsIndex >= 0) return `${MEDIA_PUBLIC_BASE_URL}${raw.slice(uploadsIndex)}`;
  if (raw.toLowerCase().startsWith('uploads/')) return `${MEDIA_PUBLIC_BASE_URL}/${raw}`;
  return `${MEDIA_PUBLIC_BASE_URL}${raw.startsWith('/') ? raw : `/${raw}`}`;
}

function toLocalMediaPath(url = '') {
  const raw = String(url || '').trim().replace(/\\/g, '/');
  if (!raw) return '';
  const marker = '/uploads/posts/';
  const markerIndex = raw.toLowerCase().indexOf(marker);
  const relative = markerIndex >= 0 ? raw.slice(markerIndex + marker.length) : raw.toLowerCase().startsWith('uploads/posts/') ? raw.slice('uploads/posts/'.length) : '';
  if (!relative) return '';
  const absolute = path.resolve(postMediaDir, relative);
  const root = path.resolve(postMediaDir);
  return absolute.startsWith(root) ? absolute : '';
}

function safeUnlink(filePath = '') {
  if (!filePath) return;
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (_error) {
    // ignore remove failures
  }
}

async function getVideoDurationSeconds(filePath) {
  try {
    const { stdout } = await execFileAsync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', filePath]);
    const duration = Number.parseFloat(String(stdout || '').trim());
    return Number.isFinite(duration) && duration > 0 ? duration : 0;
  } catch (_error) {
    return 0;
  }
}

async function buildVideoThumbnail(filePath, fileBaseName) {
  const safeBase = path.basename(fileBaseName, path.extname(fileBaseName));
  const thumbnailFilename = `${safeBase}-thumb.jpg`;
  const thumbnailAbsolutePath = path.join(thumbnailDir, thumbnailFilename);
  const duration = await getVideoDurationSeconds(filePath);
  const seekSeconds = duration > 1 ? Math.max(0.7, Math.min(duration * 0.25, duration - 0.25)) : 0.4;
  try {
    await execFileAsync('ffmpeg', ['-y', '-ss', seekSeconds.toFixed(2), '-i', filePath, '-frames:v', '1', '-vf', 'thumbnail,scale=720:-1:force_original_aspect_ratio=decrease', '-q:v', '2', thumbnailAbsolutePath]);
    if (fs.existsSync(thumbnailAbsolutePath) && fs.statSync(thumbnailAbsolutePath).size > 0) {
      return normalizePublicMediaUrl(`/uploads/posts/thumbnails/${thumbnailFilename}`);
    }
  } catch (_err) {
    // ignore
  }
  return '';
}

function serializeStory(story, viewerId = '') {
  return {
    _id: String(story._id),
    id: String(story._id),
    authorId: String(story.authorId),
    authorUsername: story.authorUsername,
    mediaType: story.mediaType,
    mediaUrl: normalizePublicMediaUrl(story.mediaUrl),
    thumbnailUrl: normalizePublicMediaUrl(story.thumbnailUrl || story.mediaUrl),
    caption: story.caption || '',
    createdAt: story.createdAt,
    expiresAt: story.expiresAt,
    likesCount: Array.isArray(story.likes) ? story.likes.length : 0,
    likedByMe: Boolean(viewerId) && Array.isArray(story.likes) ? story.likes.includes(String(viewerId)) : false,
  };
}

async function resolveViewer(req) {
  const rawUsername = String(req.user?.username || req.headers['x-username'] || '').trim();
  if (!rawUsername) throw new AppError('Username required', 401, 'USERNAME_REQUIRED');
  const viewer = await User.findOne({ username: rawUsername }).select('_id username avatarUrl hiddenStoryAuthorIds');
  if (!viewer) throw new AppError('Viewer not found', 404, 'VIEWER_NOT_FOUND');
  return viewer;
}

async function listStories(req, res, next) {
  try {
    const viewer = await resolveViewer(req);
    await Story.deleteMany({ expiresAt: { $lte: new Date() } });
    const hiddenAuthorIds = new Set((viewer.hiddenStoryAuthorIds || []).map(String));
    const rows = await Story.find({ expiresAt: { $gt: new Date() } }).sort({ createdAt: -1 }).lean();
    const grouped = new Map();
    for (const row of rows) {
      const key = String(row.authorId);
      if (hiddenAuthorIds.has(key)) continue;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(row);
    }

    const ids = Array.from(grouped.keys());
    const users = await User.find({ _id: { $in: ids } }).select('_id username avatarUrl').lean();
    const userMap = new Map(users.map((u) => [String(u._id), u]));

    const items = ids
      .map((authorId) => {
        const stories = grouped.get(authorId) || [];
        const author = userMap.get(authorId);
        const latest = stories[0];
        return {
          id: authorId,
          authorId,
          username: author?.username || latest?.authorUsername || 'user',
          avatarUrl: author?.avatarUrl || '',
          hasUnseen: true,
          latestCreatedAt: latest?.createdAt,
          stories: stories.map((story) => serializeStory(story, String(viewer._id))),
        };
      })
      .sort((a, b) => new Date(b.latestCreatedAt || 0).getTime() - new Date(a.latestCreatedAt || 0).getTime());

    const myIndex = items.findIndex((entry) => entry.authorId === String(viewer._id));
    if (myIndex > 0) {
      const [mine] = items.splice(myIndex, 1);
      items.unshift(mine);
    }

    res.json({ ok: true, data: { items } });
  } catch (err) {
    next(err);
  }
}

async function createStory(req, res, next) {
  try {
    const viewer = await resolveViewer(req);
    const file = req.file;
    if (!file) throw new AppError('Story media is required', 400, 'STORY_MEDIA_REQUIRED');
    const isVideo = String(file.mimetype || '').startsWith('video/');
    const mediaUrl = normalizePublicMediaUrl(`/uploads/posts/stories/${path.basename(file.path)}`);
    const thumbnailUrl = isVideo ? await buildVideoThumbnail(file.path, path.basename(file.path)) : mediaUrl;

    const story = await Story.create({
      authorId: String(viewer._id),
      authorUsername: viewer.username,
      mediaType: isVideo ? 'video' : 'image',
      mediaUrl,
      thumbnailUrl,
      caption: String(req.body?.caption || '').trim(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    res.status(201).json({ ok: true, data: { item: serializeStory(story, String(viewer._id)) } });
  } catch (err) {
    next(err);
  }
}

async function toggleStoryLike(req, res, next) {
  try {
    const viewer = await resolveViewer(req);
    const story = await Story.findById(String(req.params.storyId));
    if (!story || story.expiresAt <= new Date()) throw new AppError('Story not found', 404, 'STORY_NOT_FOUND');
    const me = String(viewer._id);
    const idx = (story.likes || []).indexOf(me);
    let liked = false;
    if (idx >= 0) story.likes.splice(idx, 1);
    else {
      story.likes.push(me);
      liked = true;
    }
    await story.save();
    res.json({ ok: true, data: { liked, likesCount: story.likes.length } });
  } catch (err) {
    next(err);
  }
}

async function hideStory(req, res, next) {
  try {
    const viewer = await resolveViewer(req);
    const story = await Story.findById(String(req.params.storyId)).lean();
    if (!story || story.expiresAt <= new Date()) throw new AppError('Story not found', 404, 'STORY_NOT_FOUND');
    const authorId = String(story.authorId);
    const viewerId = String(viewer._id);
    if (authorId === viewerId) throw new AppError('Cannot hide your own story', 400, 'CANNOT_HIDE_OWN_STORY');

    const current = new Set((viewer.hiddenStoryAuthorIds || []).map(String));
    current.add(authorId);
    viewer.hiddenStoryAuthorIds = Array.from(current);
    await viewer.save();

    res.json({ ok: true, data: { hiddenAuthorId: authorId } });
  } catch (err) {
    next(err);
  }
}

async function deleteStory(req, res, next) {
  try {
    const viewer = await resolveViewer(req);
    const story = await Story.findById(String(req.params.storyId));
    if (!story || story.expiresAt <= new Date()) throw new AppError('Story not found', 404, 'STORY_NOT_FOUND');
    if (String(story.authorId) !== String(viewer._id)) throw new AppError('Forbidden', 403, 'FORBIDDEN');

    safeUnlink(toLocalMediaPath(story.mediaUrl));
    if (story.thumbnailUrl && story.thumbnailUrl !== story.mediaUrl) safeUnlink(toLocalMediaPath(story.thumbnailUrl));
    await story.deleteOne();

    res.json({ ok: true, data: { removedId: String(req.params.storyId) } });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listStories,
  createStory,
  toggleStoryLike,
  hideStory,
  deleteStory,
};
