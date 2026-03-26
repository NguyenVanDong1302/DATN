const crypto = require('crypto');

let ioRef = null;

function toUserId(username) {
  return crypto.createHash('sha256').update(String(username || '')).digest('hex').slice(0, 16);
}

function initSocket(io) {
  ioRef = io;

  io.on('connection', (socket) => {
    const username = socket.handshake.auth?.username?.toString()?.trim();
    const providedUserId = socket.handshake.auth?.userId?.toString()?.trim();
    const userId = providedUserId || (username ? toUserId(username) : '');

    if (userId) socket.join(`user:${userId}`);

    socket.on('joinPost', ({ postId }) => {
      if (!postId) return;
      socket.join(`post:${postId}`);
    });

    socket.on('leavePost', ({ postId }) => {
      if (!postId) return;
      socket.leave(`post:${postId}`);
    });
  });
}

function getIO() {
  if (!ioRef) throw new Error('Socket.io not initialized');
  return ioRef;
}

module.exports = { initSocket, getIO, toUserId };
