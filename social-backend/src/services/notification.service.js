const Notification = require('../models/Notification');
const { getIO } = require('../realtime/socket');

function buildKey({ ownerId, type, postId, commentId = null }) {
  return {
    ownerId,
    type,
    postId,
    commentId: commentId || null,
  };
}

function uniq(arr = []) {
  return [...new Set(arr.filter(Boolean))];
}

function serializeNotification(doc) {
  const obj = doc.toObject ? doc.toObject() : doc;
  return {
    ...obj,
    actorsCount: Array.isArray(obj.actors) ? obj.actors.length : 0,
  };
}

async function emitUnreadCount(ownerId) {
  if (!ownerId) return;
  const unreadCount = await Notification.countDocuments({ ownerId, isRead: false });
  try {
    const io = getIO();
    io.to(`user:${ownerId}`).emit('notification:count', { unreadCount });
  } catch (_err) {
    // ignore when socket not initialized
  }
}

async function createOrMergeNotification({ ownerId, type, postId, commentId = null, actorId, actorUsername, contentPreview = '' }) {
  if (!ownerId || !actorId || ownerId === actorId || !postId) return null;

  const key = buildKey({ ownerId, type, postId, commentId });
  let notification = await Notification.findOne(key);

  if (!notification) {
    notification = await Notification.create({
      ...key,
      actors: [actorId],
      actorUsernames: actorUsername ? [actorUsername] : [],
      totalEvents: 1,
      latestContentPreview: contentPreview || '',
      isRead: false,
      readAt: null,
      lastEventAt: new Date(),
    });
  } else {
    notification.actors = uniq([...(notification.actors || []), actorId]);
    notification.actorUsernames = uniq([...(notification.actorUsernames || []), actorUsername]);
    notification.totalEvents = (notification.totalEvents || 0) + 1;
    notification.latestContentPreview = contentPreview || notification.latestContentPreview || '';
    notification.lastEventAt = new Date();
    notification.isRead = false;
    notification.readAt = null;
    await notification.save();
  }

  await emitUnreadCount(ownerId);

  try {
    const io = getIO();
    io.to(`user:${ownerId}`).emit('notification:new', serializeNotification(notification));
  } catch (_err) {
    // ignore when socket not initialized
  }

  return notification;
}

async function removeActorFromNotification({ ownerId, type, postId, commentId = null, actorId }) {
  if (!ownerId || !actorId || !postId) return null;

  const key = buildKey({ ownerId, type, postId, commentId });
  const notification = await Notification.findOne(key);
  if (!notification) return null;

  notification.actors = (notification.actors || []).filter((id) => id !== actorId);
  if (!notification.actors.length) {
    await Notification.deleteOne({ _id: notification._id });
    await emitUnreadCount(ownerId);
    return null;
  }

  notification.totalEvents = Math.max((notification.totalEvents || 1) - 1, notification.actors.length);
  notification.isRead = false;
  notification.readAt = null;
  notification.lastEventAt = new Date();
  await notification.save();
  await emitUnreadCount(ownerId);
  return notification;
}

module.exports = {
  serializeNotification,
  emitUnreadCount,
  createOrMergeNotification,
  removeActorFromNotification,
};
