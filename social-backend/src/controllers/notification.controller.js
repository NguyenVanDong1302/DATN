const User = require('../models/User');
const { AppError } = require('../utils/errors');
const notificationService = require('../services/notification.service');

async function resolveRecipientId(req) {
  const username = String(req.user?.username || req.headers['x-username'] || '').trim();
  if (!username) throw new AppError('Username required', 401, 'USERNAME_REQUIRED');
  const user = await User.findOne({ username }).select('_id');
  if (!user) throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  return String(user._id);
}

async function listNotifications(req, res, next) {
  try {
    const userId = await resolveRecipientId(req);
    const onlyUnread = ['1', 'true', 'yes'].includes(String(req.query.onlyUnread || '').toLowerCase());
    const data = await notificationService.listNotifications({ userId, onlyUnread });
    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
}

async function markNotificationRead(req, res, next) {
  try {
    const userId = await resolveRecipientId(req);
    const item = await notificationService.markRead({ userId, id: req.params.id, isRead: true });
    if (!item) throw new AppError('Notification not found', 404, 'NOT_FOUND');
    res.json({ ok: true, data: item });
  } catch (err) {
    next(err);
  }
}

async function markNotificationUnread(req, res, next) {
  try {
    const userId = await resolveRecipientId(req);
    const item = await notificationService.markRead({ userId, id: req.params.id, isRead: false });
    if (!item) throw new AppError('Notification not found', 404, 'NOT_FOUND');
    res.json({ ok: true, data: item });
  } catch (err) {
    next(err);
  }
}

async function markAllNotificationsRead(req, res, next) {
  try {
    const userId = await resolveRecipientId(req);
    const data = await notificationService.markAllRead({ userId });
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
