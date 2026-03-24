const mongoose = require("mongoose");

const commentSchema = new mongoose.Schema(
  {
    postId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Post",
      required: true,
      index: true,
    },
    parentCommentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Comment",
      default: null,
      index: true,
    },
    authorId: { type: String, required: true, index: true },
    authorUsername: { type: String, required: true },
    content: { type: String, required: true, trim: true, maxlength: 1000 },
    likes: { type: [String], default: [] },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Comment", commentSchema);
