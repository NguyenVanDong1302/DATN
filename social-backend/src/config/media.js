const path = require('path');

const mediaRoot = process.env.MEDIA_STORAGE_ROOT || 'D:\\Data';
const postMediaDir = path.join(mediaRoot, 'posts');
const uploadsMountPath = '/uploads/posts';

module.exports = {
  mediaRoot,
  postMediaDir,
  uploadsMountPath,
};
