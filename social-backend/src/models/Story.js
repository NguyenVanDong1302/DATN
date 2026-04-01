const mongoose = require('mongoose');

const storySchema = new mongoose.Schema(
  {
    authorId: { type: String, required: true, index: true },
    authorUsername: { type: String, required: true, index: true },
    mediaType: { type: String, enum: ['image', 'video'], required: true },
    mediaUrl: { type: String, required: true },
    thumbnailUrl: { type: String, default: '' },
    caption: { type: String, default: '', trim: true, maxlength: 300 },
    likes: { type: [String], default: [] },
    expiresAt: { type: Date, required: true, index: true },
  },
  { timestamps: true },
);

storySchema.index({ authorId: 1, createdAt: -1 });

module.exports = mongoose.model('Story', storySchema);
