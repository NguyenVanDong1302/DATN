const express = require("express");
const {
  getProfile,
  follow,
  unfollow,
  listFollowers,
  listFollowing,
  listUsers,
} = require("../controllers/user.controller");
const { sessionUser } = require("../middlewares/sessionUser");

const router = express.Router();

router.get("/", listUsers);

router.get("/:username", getProfile);
router.get("/:username/followers", listFollowers);
router.get("/:username/following", listFollowing);

router.post("/follow", sessionUser, follow);
router.delete("/follow", sessionUser, unfollow);

module.exports = router;
