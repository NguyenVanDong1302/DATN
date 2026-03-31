const Notification = require('../models/Notification');
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

  if (notification.type === 'follow') {
    return others > 0
      ? `${first} và ${others} người khác đã theo dõi bạn.`
      : `${first} đã theo dõi bạn.`;
  }

  if (notification.type === 'like') {
    return others > 0
      ? `${first} và ${others} người khác đã thích bài viết của bạn.`
      : `${first} đã thích bài viết của bạn.`;
  }

  if (notification.type === 'comment') {
    return others > 0
      ? `${first} và ${others} người khác đã bình luận về bài viết của bạn.`
      : `${first} đã bình luận về bài viết của bạn.`;
  }

  return `${first} đã gửi cho bạn một tin nhắn mới.`;
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

async function upsertNotification({
  type,
  targetType,
  targetId,
  recipientId,
  actorId,
  actorUsername,
  postId = '',
  previewText = '',
}) {
  if (!recipientId || !targetId || !type || !actorId) return null;
  if (String(recipientId) === String(actorId)) return null;

  await ensureIndexes();

  const now = new Date();
  try {
    await Notification.findOneAndUpdate(
      {
        recipientId,
        type,
        targetType,
        targetId: String(targetId),
      },
      {
        $setOnInsert: {
          recipientId,
          type,
          targetType,
          targetId: String(targetId),
          postId: postId ? String(postId) : '',
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
    targetType,
    targetId: String(targetId),
  }).lean();

  if (notification) {
    await emitNotification(recipientId, notification);
  }

  return notification;
}

async function removeNotificationActor({ type, targetType, targetId, recipientId, actorId, actorUsername }) {
  if (!recipientId || !targetId || !actorId) return null;
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
      type,
      targetType,
      targetId: String(targetId),
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
  return upsertNotification({
    type: 'like',
    targetType: 'post',
    targetId: post._id,
    postId: post._id,
    recipientId: post.authorId,
    actorId,
    actorUsername,
  });
}

async function notifyPostComment({ post, actorId, actorUsername, previewText }) {
  if (!post?.authorId) return null;
  return upsertNotification({
    type: 'comment',
    targetType: 'post',
    targetId: post._id,
    postId: post._id,
    recipientId: post.authorId,
    actorId,
    actorUsername,
    previewText,
  });
}

async function notifyFollow({ recipientId, actorId, actorUsername }) {
  if (!recipientId || !actorId) return null;
  return upsertNotification({
    type: 'follow',
    targetType: 'user',
    targetId: recipientId,
    recipientId,
    actorId,
    actorUsername,
  });
}

async function removeFollowNotification({ recipientId, actorId, actorUsername }) {
  if (!recipientId || !actorId) return null;
  return removeNotificationActor({
    type: 'follow',
    targetType: 'user',
    targetId: recipientId,
    recipientId,
    actorId,
    actorUsername,
  });
}

function normalizeRecipientIds(userIds) {
  const list = Array.isArray(userIds) ? userIds : [userIds];
  return Array.from(new Set(list.map((item) => String(item || '').trim()).filter(Boolean)));
}

async function listNotifications({ userIds, userId, onlyUnread = false }) {
  await ensureIndexes();
  const recipientIds = normalizeRecipientIds(userIds || userId);
  const filter = recipientIds.length > 1 ? { recipientId: { $in: recipientIds } } : { recipientId: recipientIds[0] || '' };
  if (onlyUnread) filter.isRead = false;

  const [items, unreadCount] = await Promise.all([
    Notification.find(filter).sort({ lastEventAt: -1, createdAt: -1 }).limit(50).lean(),
    Notification.countDocuments({ recipientId: recipientIds.length > 1 ? { $in: recipientIds } : (recipientIds[0] || ''), isRead: false }),
  ]);

  return { items, unreadCount };
}

async function markRead({ userIds, userId, id, isRead }) {
  await ensureIndexes();
  const recipientIds = normalizeRecipientIds(userIds || userId);
  const notification = await Notification.findOneAndUpdate(
    { _id: id, recipientId: recipientIds.length > 1 ? { $in: recipientIds } : (recipientIds[0] || '') },
    {
      $set: {
        isRead: Boolean(isRead),
        readAt: isRead ? new Date() : null,
      },
    },
    { new: true },
  ).lean();

  if (notification) {
    const emitRecipientId = String(notification.recipientId || recipientIds[0] || '');
    await emitNotification(emitRecipientId, notification);
  }
  return notification;
}

async function markAllRead({ userIds, userId }) {
  await ensureIndexes();
  const recipientIds = normalizeRecipientIds(userIds || userId);
  await Notification.updateMany(
    { recipientId: recipientIds.length > 1 ? { $in: recipientIds } : (recipientIds[0] || ''), isRead: false },
    { $set: { isRead: true, readAt: new Date() } },
  );
  const unreadCount = await Notification.countDocuments({ recipientId: recipientIds.length > 1 ? { $in: recipientIds } : (recipientIds[0] || ''), isRead: false });
  let io;
  try {
    io = getIO();
    for (const recipientId of recipientIds) io.to(`user:${recipientId}`).emit('notification:count', { unreadCount });
  } catch (_err) {
    // ignore
  }
  return { unreadCount };
}

module.exports = {
  ensureIndexes,
  notifyPostLike,
  notifyPostComment,
  removeNotificationActor,
  removePostLikeActor: ({ postId, recipientId, actorId, actorUsername }) =>
    removeNotificationActor({ type: 'like', targetType: 'post', targetId: postId, recipientId, actorId, actorUsername }),
  notifyFollow,
  removeFollowNotification,
  listNotifications,
  markRead,
  markAllRead,
  buildNotifyMessage,
};
