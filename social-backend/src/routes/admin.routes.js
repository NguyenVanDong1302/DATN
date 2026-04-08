const express = require("express");
const { auth } = require("../middlewares/auth");
const { requireAdmin } = require("../middlewares/requireAdmin");
const {
  getAccountStats,
  listPostsForAdmin,
  listReportedPosts,
  listViolations,
  updatePostModeration,
  updateUserModeration,
} = require("../controllers/admin.controller");

const router = express.Router();

router.use(auth, requireAdmin);

router.get("/accounts/stats", getAccountStats);
router.get("/posts", listPostsForAdmin);
router.get("/reports/posts", listReportedPosts);
router.get("/violations", listViolations);
router.patch("/posts/:id/moderation", updatePostModeration);
router.patch("/users/:id/moderation", updateUserModeration);

module.exports = router;
