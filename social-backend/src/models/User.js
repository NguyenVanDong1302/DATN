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
    bio: { type: String, default: "", maxlength: 150 },
    avatarUrl: { type: String, default: "" },
    website: { type: String, default: "" },
    fullName: { type: String, default: "", maxlength: 80 },
    gender: { type: String, default: "" },
    showThreadsBadge: { type: Boolean, default: false },
    showSuggestedAccountsOnProfile: { type: Boolean, default: true },
  },
  { timestamps: true },
);

module.exports = mongoose.model("User", userSchema);
