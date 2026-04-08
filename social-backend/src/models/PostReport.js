const mongoose = require("mongoose");

const postReportSchema = new mongoose.Schema(
  {
    postId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Post",
      required: true,
      index: true,
    },
    reporterId: { type: String, required: true, index: true },
    reporterUsername: { type: String, required: true, index: true },
    reason: { type: String, trim: true, maxlength: 500, default: "" },
    status: {
      type: String,
      enum: ["pending", "reviewed", "accepted", "rejected"],
      default: "pending",
      index: true,
    },
    reviewedAt: { type: Date, default: null },
    reviewedBy: { type: String, default: "" },
  },
  { timestamps: true },
);

postReportSchema.index({ postId: 1, createdAt: -1 });

module.exports = mongoose.model("PostReport", postReportSchema);
