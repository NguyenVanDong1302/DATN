let ioRef = null;

function initSocket(io) {
  ioRef = io;

  io.on("connection", (socket) => {
    // client gửi username ngay khi connect
    const username = socket.handshake.auth?.username?.toString()?.trim();
    const userId = socket.handshake.auth?.userId?.toString()?.trim();

    // nếu client không gửi userId, backend vẫn cho join theo username (client sẽ gửi userId ở UI để chuẩn)
    if (userId) socket.join(`user:${userId}`);

    socket.on("joinPost", ({ postId }) => {
      if (!postId) return;
      socket.join(`post:${postId}`);
    });

    socket.on("leavePost", ({ postId }) => {
      if (!postId) return;
      socket.leave(`post:${postId}`);
    });
  });
}

function getIO() {
  if (!ioRef) throw new Error("Socket.io not initialized");
  return ioRef;
}

module.exports = { initSocket, getIO };
