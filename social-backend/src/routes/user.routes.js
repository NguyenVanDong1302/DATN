const express = require("express");
const { sessionUser } = require("../middlewares/sessionUser");
const {
  getProfile,
  getRelationship,
  followUser,
  unfollowUser,
  listFollowers,
  listFollowing,
} = require("../controllers/follow.controller");

const router = express.Router();
router.use(sessionUser);

// profile summary (counts + relationship)
router.get("/:username/profile", getProfile);

// relationship only
router.get("/:username/relationship", getRelationship);

// follow/unfollow
router.post("/:username/follow", followUser);
router.delete("/:username/follow", unfollowUser);

// lists
router.get("/:username/followers", listFollowers);
router.get("/:username/following", listFollowing);

module.exports = router;
