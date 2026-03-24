const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    ownerId: { type: String, required: true, index: true },
    type: { type: String, enum: ['like', 'comment', 'reply', 'comment_like'], required: true, index: true },
    postId: { type: mongoose.Schema.Types.ObjectId, ref: 'Post', required: true, index: true },
    commentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Comment', default: null, index: true },
    actors: { type: [String], default: [] },
    actorUsernames: { type: [String], default: [] },
    totalEvents: { type: Number, default: 0, min: 0 },
    latestContentPreview: { type: String, default: '' },
    isRead: { type: Boolean, default: false, index: true },
    readAt: { type: Date, default: null },
    lastEventAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

notificationSchema.index({ ownerId: 1, type: 1, postId: 1, commentId: 1 }, { unique: true });

module.exports = mongoose.model('Notification', notificationSchema);
