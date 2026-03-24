const express = require("express");
const postRoutes = require("./post.routes");
const { sessionUser } = require("../middlewares/sessionUser");

const userRoutes = require("./user.routes");
const notificationRoutes = require("./notification.routes");
const router = express.Router();

router.get("/health", (req, res) =>
  res.json({ ok: true, message: "API is healthy" }),
);

// Posts
router.use("/posts", postRoutes);
router.use("/users", userRoutes);
router.use("/notifications", notificationRoutes);
router.get("/whoami", sessionUser, (req, res) => {
  res.json({
    ok: true,
    data: { userId: req.user.sub, username: req.user.username },
  });
});

module.exports = router;
