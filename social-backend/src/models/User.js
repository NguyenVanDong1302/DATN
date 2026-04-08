const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      minlength: 3,
      maxlength: 30,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    passwordHash: { type: String, required: true },
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
      index: true,
    },
    bio: { type: String, default: "" },
    avatarUrl: { type: String, default: "" },
    loginCount: { type: Number, default: 0, min: 0 },
    lastLoginAt: { type: Date, default: null },
    moderationStatus: {
      type: String,
      enum: ["normal", "warning", "violating"],
      default: "normal",
      index: true,
    },
    moderationReason: { type: String, default: "" },
    hiddenStoryAuthorIds: { type: [String], default: [] },
  },
  { timestamps: true },
);

module.exports = mongoose.model("User", userSchema);
