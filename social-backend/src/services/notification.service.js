const Notification = require('../models/Notification');
const Post = require('../models/Post');
const { getIO } = require('../realtime/socket');

let indexesEnsured = false;

async function ensureIndexes() {
  if (indexesEnsured) return;
  indexesEnsured = true;
  try {
    await Notification.collection.dropIndex('recipientId_1_type_1_targetType_1_targetId_1');
  } catch (_err) {
    // ignore if missing
  }
  try {
    await Notification.syncIndexes();
  } catch (err) {
    console.error('Notification syncIndexes failed:', err?.message || err);
  }
}

function buildNotifyMessage(notification) {
  const names = Array.isArray(notification.actorUsernames)
    ? notification.actorUsernames.filter(Boolean)
    : [];

  const first = names[0] || 'Ai đó';
  const others = Math.max((notification.totalEvents || names.length || 1) - 1, 0);

  if (notification.type === 'like') {
    return others > 0
      ? `${first} và ${others} người khác đã thích bài viết của bạn.`
      : `${first} đã thích bài viết của bạn.`;
  }

  return others > 0
    ? `${first} và ${others} người khác đã bình luận về bài viết của bạn.`
    : `${first} đã bình luận về bài viết của bạn.`;
}

async function emitNotification(recipientId, notification) {
  let io;
  try {
    io = getIO();
  } catch (_err) {
    return;
  }

  const unreadCount = await Notification.countDocuments({ recipientId, isRead: false });
  io.to(`user:${recipientId}`).emit('notification:new', notification);
  io.to(`user:${recipientId}`).emit('notification:count', { unreadCount });
  io.to(`user:${recipientId}`).emit('notify', {
    id: notification._id,
    type: notification.type,
    postId: notification.postId,
    message: buildNotifyMessage(notification),
    createdAt: notification.lastEventAt,
  });
}

async function upsertPostNotification({ type, postId, recipientId, actorId, actorUsername, previewText = '' }) {
  if (!recipientId || !postId || !type || !actorId) return null;
  if (String(recipientId) === String(actorId)) return null;

  await ensureIndexes();

  const now = new Date();
  try {
    await Notification.findOneAndUpdate(
      {
        recipientId,
        type,
        targetType: 'post',
        targetId: String(postId),
      },
      {
        $setOnInsert: {
          recipientId,
          type,
          targetType: 'post',
          targetId: String(postId),
          postId: String(postId),
        },
        $addToSet: {
          actors: String(actorId),
          actorUsernames: String(actorUsername || actorId),
        },
        $set: {
          previewText: previewText || '',
          isRead: false,
          readAt: null,
          lastEventAt: now,
        },
        $inc: { totalEvents: 1 },
      },
      { upsert: true, new: false },
    );
  } catch (error) {
    if (error?.code !== 11000) throw error;
  }

  const notification = await Notification.findOne({
    recipientId,
    type,
    targetType: 'post',
    targetId: String(postId),
  }).lean();

  if (notification) {
    await emitNotification(recipientId, notification);
  }

  return notification;
}

async function removePostLikeActor({ postId, recipientId, actorId, actorUsername }) {
  if (!recipientId || !postId || !actorId) return null;
  await ensureIndexes();

  const update = {
    $pull: {
      actors: String(actorId),
    },
    $inc: { totalEvents: -1 },
  };

  if (actorUsername) update.$pull.actorUsernames = String(actorUsername);

  const doc = await Notification.findOneAndUpdate(
    {
      recipientId,
      type: 'like',
      targetType: 'post',
      targetId: String(postId),
    },
    update,
    { new: true },
  );

  if (!doc) return null;

  doc.totalEvents = Math.max(0, doc.totalEvents || 0);
  if (!doc.actors?.length || doc.totalEvents <= 0) {
    await Notification.deleteOne({ _id: doc._id });
  } else {
    await doc.save();
    await emitNotification(recipientId, doc.toObject ? doc.toObject() : doc);
  }

  return doc;
}

async function notifyPostLike({ post, actorId, actorUsername }) {
  if (!post?.authorId) return null;
  return upsertPostNotification({
    type: 'like',
    postId: post._id,
    recipientId: post.authorId,
    actorId,
    actorUsername,
  });
}

async function notifyPostComment({ post, actorId, actorUsername, previewText }) {
  if (!post?.authorId) return null;
  return upsertPostNotification({
    type: 'comment',
    postId: post._id,
    recipientId: post.authorId,
    actorId,
    actorUsername,
    previewText,
  });
}

async function listNotifications({ userId, onlyUnread = false }) {
  await ensureIndexes();
  const filter = { recipientId: String(userId) };
  if (onlyUnread) filter.isRead = false;

  const [items, unreadCount] = await Promise.all([
    Notification.find(filter).sort({ lastEventAt: -1, createdAt: -1 }).limit(50).lean(),
    Notification.countDocuments({ recipientId: String(userId), isRead: false }),
  ]);

  return { items, unreadCount };
}

async function markRead({ userId, id, isRead }) {
  await ensureIndexes();
  const notification = await Notification.findOneAndUpdate(
    { _id: id, recipientId: String(userId) },
    {
      $set: {
        isRead: Boolean(isRead),
        readAt: isRead ? new Date() : null,
      },
    },
    { new: true },
  ).lean();

  if (notification) await emitNotification(String(userId), notification);
  return notification;
}

async function markAllRead({ userId }) {
  await ensureIndexes();
  await Notification.updateMany(
    { recipientId: String(userId), isRead: false },
    { $set: { isRead: true, readAt: new Date() } },
  );
  const unreadCount = await Notification.countDocuments({ recipientId: String(userId), isRead: false });
  let io;
  try {
    io = getIO();
    io.to(`user:${userId}`).emit('notification:count', { unreadCount });
  } catch (_err) {
    // ignore
  }
  return { unreadCount };
}

module.exports = {
  ensureIndexes,
  notifyPostLike,
  notifyPostComment,
  removePostLikeActor,
  listNotifications,
  markRead,
  markAllRead,
};
