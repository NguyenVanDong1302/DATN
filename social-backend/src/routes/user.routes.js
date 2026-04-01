const express = require("express");
const {
  getProfile,
  follow,
  unfollow,
  listFollowers,
  listFollowing,
  listUsers,
  updateMyProfile,
} = require("../controllers/user.controller");
const { sessionUser } = require("../middlewares/sessionUser");

const router = express.Router();

router.get("/", listUsers);

router.get("/:username", getProfile);
router.get("/:username/followers", listFollowers);
router.get("/:username/following", listFollowing);

router.patch("/me/profile", sessionUser, updateMyProfile);
router.post("/follow", sessionUser, follow);
router.delete("/follow", sessionUser, unfollow);

module.exports = router;
