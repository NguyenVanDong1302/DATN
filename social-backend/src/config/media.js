const path = require('path');

const mediaRoot = path.resolve(
  process.env.MEDIA_STORAGE_ROOT || path.join(__dirname, '..', '..', 'public', 'uploads'),
);
const postMediaDir = path.join(mediaRoot, 'posts');
const uploadsMountPath = '/uploads/posts';

module.exports = {
  mediaRoot,
  postMediaDir,
  uploadsMountPath,
};
