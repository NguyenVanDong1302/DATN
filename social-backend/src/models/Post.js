const mongoose = require("mongoose");

const postMediaSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["image", "video"], required: true },
    url: { type: String, required: true },
    filename: { type: String },
    mimeType: { type: String },
    size: { type: Number, min: 0 },
    width: { type: Number, min: 0 },
    height: { type: Number, min: 0 },
    duration: { type: Number, min: 0 },
    order: { type: Number, min: 0, default: 0 },
    altText: { type: String, trim: true, maxlength: 500 },
  },
  { _id: false },
);

const postSchema = new mongoose.Schema(
  {
    authorId: { type: String, required: true, index: true },
    authorUsername: { type: String, required: true, index: true },

    content: { type: String, trim: true, maxlength: 3000, default: "" },
    media: { type: [postMediaSchema], default: [] },

    // Backward compatibility fields for older frontend screens
    images: [{ type: String }],
    imageUrl: { type: String, default: "" },

    visibility: {
      type: String,
      enum: ["public", "friends", "private"],
      default: "public",
      index: true,
    },

    isAnonymous: { type: Boolean, default: false, index: true },
    allowComments: { type: Boolean, default: true },
    hideLikeCount: { type: Boolean, default: false },

    location: { type: String, trim: true, maxlength: 150 },
    collaborators: { type: [String], default: [] },
    tags: { type: [String], default: [] },

    mediaCount: { type: Number, default: 0, min: 0 },
    mediaType: {
      type: String,
      enum: ["text", "image", "video", "mixed"],
      default: "text",
      index: true,
    },

    viewsCount: { type: Number, default: 0, min: 0 },
    lastViewedAt: { type: Date, default: null },
    likes: { type: [String], default: [] },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Post", postSchema);
