const { AppError } = require('../utils/errors');
const notificationService = require('../services/notification.service');

async function listNotifications(req, res, next) {
  try {
    const onlyUnread = ['1', 'true', 'yes'].includes(String(req.query.onlyUnread || '').toLowerCase());
    const data = await notificationService.listNotifications({ userId: req.user.sub, onlyUnread });
    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
}

async function markNotificationRead(req, res, next) {
  try {
    const item = await notificationService.markRead({ userId: req.user.sub, id: req.params.id, isRead: true });
    if (!item) throw new AppError('Notification not found', 404, 'NOT_FOUND');
    res.json({ ok: true, data: item });
  } catch (err) {
    next(err);
  }
}

async function markNotificationUnread(req, res, next) {
  try {
    const item = await notificationService.markRead({ userId: req.user.sub, id: req.params.id, isRead: false });
    if (!item) throw new AppError('Notification not found', 404, 'NOT_FOUND');
    res.json({ ok: true, data: item });
  } catch (err) {
    next(err);
  }
}

async function markAllNotificationsRead(req, res, next) {
  try {
    const data = await notificationService.markAllRead({ userId: req.user.sub });
    res.json({ ok: true, data });
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
