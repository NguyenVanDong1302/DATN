const Notification = require('../models/Notification');
const { AppError } = require('../utils/errors');
const { emitUnreadCount, serializeNotification } = require('../services/notification.service');

async function listNotifications(req, res, next) {
  try {
    const onlyUnread = String(req.query.onlyUnread || '').trim() === 'true';
    const ownerId = req.user.sub;
    const query = { ownerId, ...(onlyUnread ? { isRead: false } : {}) };

    const items = await Notification.find(query).sort({ lastEventAt: -1, createdAt: -1 }).limit(100);
    const unreadCount = await Notification.countDocuments({ ownerId, isRead: false });

    res.json({
      ok: true,
      data: {
        items: items.map(serializeNotification),
        unreadCount,
      },
    });
  } catch (err) {
    next(err);
  }
}

async function markNotificationRead(req, res, next) {
  try {
    const item = await Notification.findOne({ _id: req.params.id, ownerId: req.user.sub });
    if (!item) throw new AppError('Notification not found', 404, 'NOT_FOUND');

    item.isRead = true;
    item.readAt = new Date();
    await item.save();
    await emitUnreadCount(req.user.sub);

    res.json({ ok: true, data: serializeNotification(item) });
  } catch (err) {
    next(err);
  }
}

async function markNotificationUnread(req, res, next) {
  try {
    const item = await Notification.findOne({ _id: req.params.id, ownerId: req.user.sub });
    if (!item) throw new AppError('Notification not found', 404, 'NOT_FOUND');

    item.isRead = false;
    item.readAt = null;
    await item.save();
    await emitUnreadCount(req.user.sub);

    res.json({ ok: true, data: serializeNotification(item) });
  } catch (err) {
    next(err);
  }
}

async function markAllNotificationsRead(req, res, next) {
  try {
    await Notification.updateMany(
      { ownerId: req.user.sub, isRead: false },
      { $set: { isRead: true, readAt: new Date() } }
    );

    await emitUnreadCount(req.user.sub);
    res.json({ ok: true, data: { success: true } });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listNotifications,
  markNotificationRead,
  markNotificationUnread,
  markAllNotificationsRead,
};
