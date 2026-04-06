const express = require('express');
const { sessionUser } = require('../middlewares/sessionUser');
const { uploadStoryMedia } = require('../middlewares/uploadStoryMedia');
const {
  listStories,
  createStory,
  toggleStoryLike,
  hideStory,
  deleteStory,
} = require('../controllers/story.controller');

const router = express.Router();
router.use(sessionUser);
router.get('/', listStories);
router.post('/', uploadStoryMedia.single('media'), createStory);
router.post('/:storyId/like', toggleStoryLike);
router.post('/:storyId/hide', hideStory);
router.delete('/:storyId', deleteStory);

module.exports = router;
