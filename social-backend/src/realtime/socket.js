const jwt = require("jsonwebtoken");
const User = require("../models/User");
const {
  sendMessage,
  markConversationRead,
} = require("../services/message.service");
const { setPresence, clearPresence } = require("../utils/presenceStore");

let ioRef = null;

async function resolveSocketUser(socket) {
  const auth = socket.handshake.auth || {};
  const token = String(auth.token || "").trim();
  const username = String(auth.username || "").trim();

  if (token) {
    try {
      const secret = process.env.JWT_SECRET || "dev_jwt_secret_change_me";
      const payload = jwt.verify(token, secret);
      const byId = payload?.sub ? await User.findById(String(payload.sub)).select("_id username") : null;
      if (byId) return byId;
    } catch (_err) {
      // ignore and fallback to username
    }
  }

  if (username) {
    const byUsername = await User.findOne({ username }).select("_id username");
    if (byUsername) return byUsername;
  }

  return null;
}

function initSocket(io) {
  ioRef = io;

  io.on("connection", async (socket) => {
    const me = await resolveSocketUser(socket);

    if (me) {
      socket.data.userId = String(me._id);
      socket.data.username = me.username;
      socket.join(`user:${me._id}`);
      socket.join(`username:${me.username}`);
      setPresence(String(me._id), { screen: "other", activeConversationId: "" });
    }

    socket.on("presence:update", (payload = {}) => {
      if (!socket.data.userId) return;
      setPresence(String(socket.data.userId), {
        screen: payload.screen || "other",
        activeConversationId: payload.activeConversationId || "",
      });
    });

    socket.on("conversation:join", ({ conversationId }) => {
      if (!conversationId) return;
      socket.join(`conversation:${conversationId}`);
      if (socket.data.userId) {
        setPresence(String(socket.data.userId), { screen: "messages", activeConversationId: String(conversationId) });
      }
    });

    socket.on("conversation:leave", ({ conversationId }) => {
      if (!conversationId) return;
      socket.leave(`conversation:${conversationId}`);
      if (socket.data.userId) {
        setPresence(String(socket.data.userId), { screen: "messages", activeConversationId: "" });
      }
    });

    socket.on("message:send", async (payload = {}, ack) => {
      try {
        if (!socket.data.username) throw new Error("UNAUTHORIZED");
        const currentUser = await User.findOne({ username: socket.data.username }).select("_id username email avatarUrl bio");
        if (!currentUser) throw new Error("CURRENT_USER_NOT_FOUND");
        const message = await sendMessage({
          currentUser,
          conversationId: payload.conversationId,
          text: payload.text,
        });
        if (typeof ack === "function") ack({ ok: true, data: { message } });
      } catch (err) {
        if (typeof ack === "function") ack({ ok: false, message: err?.message || "SEND_FAILED" });
      }
    });

    socket.on("message:read", async (payload = {}, ack) => {
      try {
        if (!socket.data.username) throw new Error("UNAUTHORIZED");
        const currentUser = await User.findOne({ username: socket.data.username }).select("_id username email avatarUrl bio");
        if (!currentUser) throw new Error("CURRENT_USER_NOT_FOUND");
        const data = await markConversationRead({
          currentUser,
          conversationId: payload.conversationId,
        });
        if (typeof ack === "function") ack({ ok: true, data });
      } catch (err) {
        if (typeof ack === "function") ack({ ok: false, message: err?.message || "READ_FAILED" });
      }
    });

    socket.on("disconnect", () => {
      if (socket.data.userId) clearPresence(String(socket.data.userId));
    });
  });
}

function getIO() {
  if (!ioRef) throw new Error("Socket.io not initialized");
  return ioRef;
}

module.exports = { initSocket, getIO };
