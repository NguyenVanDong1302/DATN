const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    conversationId: { type: String, required: true, index: true },
    senderId: { type: String, required: true, index: true },
    senderUsername: { type: String, required: true },
    receiverId: { type: String, required: true, index: true },
    receiverUsername: { type: String, required: true },
    type: {
      type: String,
      enum: ["text"],
      default: "text",
    },
    text: { type: String, default: "" },
    storyReply: {
      storyId: { type: String, default: '' },
      ownerUsername: { type: String, default: '' },
      mediaType: { type: String, enum: ['image','video',''], default: '' },
      mediaUrl: { type: String, default: '' },
      thumbnailUrl: { type: String, default: '' },
    },
    status: {
      type: String,
      enum: ["sent", "delivered", "seen"],
      default: "sent",
    },
    seenAt: { type: Date, default: null },
  },
  { timestamps: true },
);

messageSchema.index({ conversationId: 1, createdAt: -1 });
messageSchema.index({ receiverId: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model("Message", messageSchema);
