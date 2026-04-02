const fs = require("fs");
const path = require("path");
const User = require("../models/User");
const Follow = require("../models/Follow");
const Notification = require("../models/Notification");
const Conversation = require("../models/Conversation");
const Message = require("../models/Message");
const ConversationMember = require("../models/ConversationMember");
const { AppError } = require("../utils/errors");
const { buildDirectKey } = require("../utils/buildDirectKey");
const { getPresence } = require("../utils/presenceStore");
const { getIO } = require("../realtime/socket");

async function resolveCurrentUserFromReq(req) {
  const rawUsername = (req.user?.username || req.headers["x-username"] || "").toString().trim();
  if (!rawUsername) {
    throw new AppError("Username required", 401, "USERNAME_REQUIRED");
  }
  const user = await User.findOne({ username: rawUsername }).select("_id username email avatarUrl bio");
  if (!user) {
    throw new AppError("Không tìm thấy người dùng hiện tại", 404, "CURRENT_USER_NOT_FOUND");
  }
  return user;
}

async function ensureConversationMembers(conversation, users) {
  await Promise.all(
    users.map((user) =>
      ConversationMember.updateOne(
        { conversationId: String(conversation._id), userId: String(user._id) },
        {
          $setOnInsert: {
            conversationId: String(conversation._id),
            userId: String(user._id),
            username: user.username,
            unreadCount: 0,
            peerNickname: "",
            blockedPeer: false,
            blockedAt: null,
          },
          $set: { username: user.username },
        },
        { upsert: true },
      ),
    ),
  );
}

function serializeUser(user) {
  return {
    id: String(user._id),
    username: user.username,
    email: user.email || "",
    bio: user.bio || "",
    avatarUrl: user.avatarUrl || "",
  };
}

function serializeConversation(row, currentUserId, currentUsername, peer, member) {
  const peerId = row.memberIds.find((id) => String(id) !== String(currentUserId)) || "";
  return {
    id: String(row._id),
    type: row.type,
    peer: peer
      ? {
          id: String(peer._id),
          username: peer.username,
          email: peer.email || "",
          bio: peer.bio || "",
          avatarUrl: peer.avatarUrl || "",
        }
      : {
          id: String(peerId),
          username: row.memberUsernames.find((u) => u !== currentUsername) || "Người dùng",
          email: "",
          bio: "",
          avatarUrl: "",
        },
    lastMessageText: row.lastMessageText || "",
    lastMessageAt: row.lastMessageAt,
    unreadCount: Number(member?.unreadCount || 0),
    nickname: member?.peerNickname || "",
    isBlocked: Boolean(member?.blockedPeer),
    blockedAt: member?.blockedAt || null,
  };
}

async function searchUsers({ currentUser, q = "", limit = 8 }) {
  const keyword = String(q || "").trim();
  const safeLimit = Math.max(1, Math.min(Number(limit) || 8, 20));

  const followRows = await Follow.find({ followerId: String(currentUser._id) }).select("followingId").lean();
  const followingIds = followRows.map((row) => String(row.followingId));

  const regex = keyword ? new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") : null;

  const followingFilter = {
    _id: { $in: followingIds },
    ...(regex ? { username: regex } : {}),
  };

  const suggestedFilter = {
    _id: { $nin: [String(currentUser._id), ...followingIds] },
    ...(regex ? { username: regex } : {}),
  };

  const [followingUsers, suggestedUsers] = await Promise.all([
    User.find(followingFilter).select("_id username email bio avatarUrl").sort({ username: 1 }).limit(safeLimit).lean(),
    User.find(suggestedFilter).select("_id username email bio avatarUrl").sort({ createdAt: -1 }).limit(safeLimit).lean(),
  ]);

  return {
    following: followingUsers.map((u) => ({ id: String(u._id), username: u.username, email: u.email || "", bio: u.bio || "", avatarUrl: u.avatarUrl || "" })),
    suggested: suggestedUsers.map((u) => ({ id: String(u._id), username: u.username, email: u.email || "", bio: u.bio || "", avatarUrl: u.avatarUrl || "" })),
  };
}

async function getOrCreateDirectConversation({ currentUser, targetUserId }) {
  const target = await User.findById(String(targetUserId)).select("_id username email bio avatarUrl");
  if (!target) {
    throw new AppError("Không tìm thấy người dùng cần nhắn", 404, "TARGET_USER_NOT_FOUND");
  }
  if (String(target._id) === String(currentUser._id)) {
    throw new AppError("Không thể tự tạo chat với chính mình", 400, "SELF_CHAT_NOT_ALLOWED");
  }

  const directKey = buildDirectKey(currentUser._id, target._id);
  let conversation = await Conversation.findOne({ directKey });

  if (!conversation) {
    conversation = await Conversation.create({
      type: "direct",
      memberIds: [String(currentUser._id), String(target._id)],
      memberUsernames: [currentUser.username, target.username],
      directKey,
      lastMessageText: "",
      lastMessageAt: null,
      lastMessageSenderId: "",
    });
  }

  await ensureConversationMembers(conversation, [currentUser, target]);
  const member = await ConversationMember.findOne({ conversationId: String(conversation._id), userId: String(currentUser._id) }).lean();

  return {
    conversation,
    peer: serializeUser(target),
    member,
  };
}

async function listConversations({ currentUser, limit = 30 }) {
  const rows = await Conversation.find({ memberIds: String(currentUser._id) })
    .sort({ lastMessageAt: -1, updatedAt: -1, createdAt: -1 })
    .limit(Math.max(1, Math.min(Number(limit) || 30, 100)))
    .lean();

  const memberRows = await ConversationMember.find({ userId: String(currentUser._id), conversationId: { $in: rows.map((r) => String(r._id)) } }).lean();
  const memberMap = new Map(memberRows.map((row) => [String(row.conversationId), row]));

  const peerIds = rows.map((row) => row.memberIds.find((id) => String(id) !== String(currentUser._id))).filter(Boolean);
  const peers = await User.find({ _id: { $in: peerIds } }).select("_id username email bio avatarUrl").lean();
  const peerMap = new Map(peers.map((u) => [String(u._id), u]));

  return rows.map((row) => {
    const peerId = row.memberIds.find((id) => String(id) !== String(currentUser._id)) || "";
    const peer = peerMap.get(String(peerId));
    const member = memberMap.get(String(row._id));
    return serializeConversation(row, currentUser._id, currentUser.username, peer, member);
  });
}

async function getConversationOrThrow({ currentUser, conversationId }) {
  const conversation = await Conversation.findById(String(conversationId));
  if (!conversation || !conversation.memberIds.includes(String(currentUser._id))) {
    throw new AppError("Không tìm thấy cuộc trò chuyện", 404, "CONVERSATION_NOT_FOUND");
  }
  return conversation;
}

async function getConversationDetail({ currentUser, conversationId }) {
  const conversation = await getConversationOrThrow({ currentUser, conversationId });
  const peerId = conversation.memberIds.find((id) => String(id) !== String(currentUser._id));
  const [peer, member] = await Promise.all([
    User.findById(peerId).select("_id username email bio avatarUrl").lean(),
    ConversationMember.findOne({ conversationId: String(conversation._id), userId: String(currentUser._id) }).lean(),
  ]);

  return serializeConversation(conversation, currentUser._id, currentUser.username, peer, member);
}

async function listMessages({ currentUser, conversationId, limit = 50 }) {
  await getConversationOrThrow({ currentUser, conversationId });
  const rows = await Message.find({ conversationId: String(conversationId) })
    .sort({ createdAt: 1 })
    .limit(Math.max(1, Math.min(Number(limit) || 50, 200)))
    .lean();

  return rows.map((row) => ({
    id: String(row._id),
    conversationId: String(row.conversationId),
    senderId: row.senderId,
    senderUsername: row.senderUsername,
    receiverId: row.receiverId,
    receiverUsername: row.receiverUsername,
    type: row.type,
    text: row.text || "",
    status: row.status,
    seenAt: row.seenAt,
    createdAt: row.createdAt,
  }));
}

function getSocketIOOrNull() {
  try {
    return getIO();
  } catch (_err) {
    return null;
  }
}

function emitToUser(io, userId, username, event, payload) {
  if (!io) return;
  if (userId) io.to(`user:${userId}`).emit(event, payload);
  if (username) io.to(`username:${username}`).emit(event, payload);
}

async function emitConversationSnapshot(io, conversationId, usernames) {
  if (!io) return;
  if (conversationId) io.to(`conversation:${conversationId}`).emit("conversation:updated", { conversationId });
  for (const name of usernames || []) {
    if (!name) continue;
    io.to(`username:${name}`).emit("inbox:refresh", { reason: "conversation-updated" });
  }
}

async function createMessageNotification({ recipient, sender, message }) {
  const doc = await Notification.create({
    recipientId: String(recipient._id),
    type: "message",
    targetType: "conversation",
    targetId: String(message._id),
    postId: "",
    actors: [String(sender._id)],
    actorUsernames: [sender.username],
    totalEvents: 1,
    previewText: message.text || "",
    isRead: false,
    readAt: null,
    lastEventAt: new Date(),
  });

  const io = getSocketIOOrNull();
  if (io) {
    const unreadCount = await Notification.countDocuments({ recipientId: String(recipient._id), isRead: false });
    emitToUser(io, String(recipient._id), recipient.username, "notification:new", {
      _id: String(doc._id),
      recipientId: String(recipient._id),
      type: "message",
      targetType: "conversation",
      targetId: String(message._id),
      postId: "",
      actors: [String(sender._id)],
      actorUsernames: [sender.username],
      totalEvents: 1,
      previewText: message.text || "",
      isRead: false,
      readAt: null,
      lastEventAt: doc.lastEventAt,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      conversationId: message.conversationId,
      messageId: String(message._id),
    });
    emitToUser(io, String(recipient._id), recipient.username, "notification:count", { unreadCount });
    emitToUser(io, String(recipient._id), recipient.username, "notify", {
      id: String(doc._id),
      type: "message",
      messageId: String(message._id),
      conversationId: message.conversationId,
      message: `${sender.username} đã gửi cho bạn một tin nhắn mới.`,
      createdAt: doc.createdAt,
    });
  }
}

async function getMemberState(conversationId, userId) {
  return ConversationMember.findOne({ conversationId: String(conversationId), userId: String(userId) }).lean();
}

async function sendMessage({ currentUser, conversationId, text }) {
  const trimmed = String(text || "").trim();
  if (!trimmed) {
    throw new AppError("Tin nhắn không được để trống", 400, "EMPTY_MESSAGE");
  }

  const conversation = await getConversationOrThrow({ currentUser, conversationId });
  const receiverId = conversation.memberIds.find((id) => String(id) !== String(currentUser._id));
  const receiverUsername = conversation.memberUsernames.find((u) => u !== currentUser.username) || "";
  const receiver = await User.findById(receiverId).select("_id username email bio avatarUrl");
  if (!receiver) {
    throw new AppError("Người nhận không tồn tại", 404, "RECEIVER_NOT_FOUND");
  }

  const [currentMember, receiverMember] = await Promise.all([
    getMemberState(conversation._id, currentUser._id),
    getMemberState(conversation._id, receiver._id),
  ]);
  if (currentMember?.blockedPeer) {
    throw new AppError("Bạn đã chặn người dùng này. Hãy bỏ chặn để tiếp tục nhắn tin.", 403, "YOU_BLOCKED_THIS_USER");
  }
  if (receiverMember?.blockedPeer) {
    throw new AppError("Bạn không thể nhắn tin cho người dùng này.", 403, "BLOCKED_BY_PEER");
  }

  const presence = getPresence(String(receiver._id));
  const isViewingSameConversation = presence?.screen === "messages" && String(presence?.activeConversationId || "") === String(conversation._id);
  const nextStatus = isViewingSameConversation ? "seen" : presence?.screen === "messages" ? "delivered" : "sent";

  const message = await Message.create({
    conversationId: String(conversation._id),
    senderId: String(currentUser._id),
    senderUsername: currentUser.username,
    receiverId: String(receiver._id),
    receiverUsername: receiver.username,
    type: "text",
    text: trimmed,
    status: nextStatus,
    seenAt: nextStatus === "seen" ? new Date() : null,
  });

  await Conversation.updateOne(
    { _id: conversation._id },
    {
      $set: {
        lastMessageText: trimmed,
        lastMessageAt: message.createdAt,
        lastMessageSenderId: String(currentUser._id),
        memberUsernames: [currentUser.username, receiver.username],
      },
    },
  );

  if (isViewingSameConversation) {
    await ConversationMember.updateOne(
      { conversationId: String(conversation._id), userId: String(receiver._id) },
      {
        $set: {
          unreadCount: 0,
          lastReadMessageId: String(message._id),
          lastReadAt: new Date(),
          username: receiver.username,
        },
      },
      { upsert: true },
    );
  } else {
    await ConversationMember.updateOne(
      { conversationId: String(conversation._id), userId: String(receiver._id) },
      { $inc: { unreadCount: 1 }, $set: { username: receiver.username } },
      { upsert: true },
    );
  }

  await ConversationMember.updateOne(
    { conversationId: String(conversation._id), userId: String(currentUser._id) },
    {
      $set: {
        unreadCount: 0,
        lastReadMessageId: String(message._id),
        lastReadAt: new Date(),
        username: currentUser.username,
      },
    },
    { upsert: true },
  );

  if (presence?.screen !== "messages") {
    await createMessageNotification({ recipient: receiver, sender: currentUser, message });
  }

  const payload = {
    id: String(message._id),
    conversationId: String(conversation._id),
    senderId: String(currentUser._id),
    senderUsername: currentUser.username,
    receiverId: String(receiver._id),
    receiverUsername: receiver.username,
    type: message.type,
    text: message.text,
    status: message.status,
    seenAt: message.seenAt,
    createdAt: message.createdAt,
  };

  const io = getSocketIOOrNull();
  if (io) {
    io.to(`conversation:${conversation._id}`).emit("message:new", payload);
    emitToUser(io, String(receiver._id), receiver.username, "inbox:update", {
      conversationId: String(conversation._id),
      unreadDelta: isViewingSameConversation ? 0 : 1,
      message: payload,
    });
    emitToUser(io, String(currentUser._id), currentUser.username, "inbox:update", {
      conversationId: String(conversation._id),
      unreadDelta: 0,
      message: payload,
    });
    await emitConversationSnapshot(io, String(conversation._id), [receiver.username, currentUser.username]);
  }

  return payload;
}

async function markConversationRead({ currentUser, conversationId }) {
  const conversation = await getConversationOrThrow({ currentUser, conversationId });
  const rows = await Message.find({
    conversationId: String(conversation._id),
    receiverId: String(currentUser._id),
    status: { $ne: "seen" },
  }).sort({ createdAt: 1 });

  const now = new Date();
  if (rows.length) {
    await Message.updateMany(
      {
        _id: { $in: rows.map((row) => row._id) },
      },
      {
        $set: {
          status: "seen",
          seenAt: now,
        },
      },
    );
  }

  const lastMessage = rows[rows.length - 1] || (await Message.findOne({ conversationId: String(conversation._id) }).sort({ createdAt: -1 }));

  await ConversationMember.updateOne(
    { conversationId: String(conversation._id), userId: String(currentUser._id) },
    {
      $set: {
        unreadCount: 0,
        lastReadAt: now,
        lastReadMessageId: lastMessage ? String(lastMessage._id) : "",
        username: currentUser.username,
      },
    },
    { upsert: true },
  );

  const io = getSocketIOOrNull();
  if (io) {
    io.to(`conversation:${conversation._id}`).emit("message:seen", {
      conversationId: String(conversation._id),
      userId: String(currentUser._id),
      username: currentUser.username,
      seenAt: now,
    });
    emitToUser(io, String(currentUser._id), currentUser.username, "inbox:refresh", { reason: "read" });
  }

  return { ok: true, seenAt: now };
}

async function getUnreadSummary({ currentUser }) {
  const rows = await ConversationMember.find({ userId: String(currentUser._id), unreadCount: { $gt: 0 } }).lean();
  return {
    totalUnreadMessages: rows.reduce((sum, row) => sum + Number(row.unreadCount || 0), 0),
    totalUnreadConversations: rows.length,
  };
}

async function getConversationSettings({ currentUser, conversationId }) {
  const conversation = await getConversationOrThrow({ currentUser, conversationId });
  const peerId = conversation.memberIds.find((id) => String(id) !== String(currentUser._id));
  const [member, peer] = await Promise.all([
    ConversationMember.findOne({ conversationId: String(conversation._id), userId: String(currentUser._id) }).lean(),
    User.findById(peerId).select("_id username avatarUrl bio").lean(),
  ]);

  return {
    conversationId: String(conversation._id),
    nickname: member?.peerNickname || "",
    isBlocked: Boolean(member?.blockedPeer),
    blockedAt: member?.blockedAt || null,
    peer: peer
      ? {
          id: String(peer._id),
          username: peer.username,
          avatarUrl: peer.avatarUrl || "",
          bio: peer.bio || "",
        }
      : null,
  };
}

async function updateConversationSettings({ currentUser, conversationId, nickname, isBlocked }) {
  const conversation = await getConversationOrThrow({ currentUser, conversationId });
  const update = { username: currentUser.username };
  if (typeof nickname !== "undefined") {
    update.peerNickname = String(nickname || "").trim().slice(0, 80);
  }
  if (typeof isBlocked === "boolean") {
    update.blockedPeer = isBlocked;
    update.blockedAt = isBlocked ? new Date() : null;
  }
  await ConversationMember.updateOne(
    { conversationId: String(conversation._id), userId: String(currentUser._id) },
    { $set: update },
    { upsert: true },
  );
  return getConversationSettings({ currentUser, conversationId });
}

function collectPossibleMediaPaths(messageDoc) {
  const values = [
    messageDoc?.mediaUrl,
    messageDoc?.fileUrl,
    messageDoc?.thumbnailUrl,
    messageDoc?.imageUrl,
    messageDoc?.videoUrl,
    messageDoc?.storyReply?.mediaUrl,
    messageDoc?.storyReply?.thumbnailUrl,
  ].filter(Boolean);
  return values.map((v) => String(v));
}

function resolveLocalPath(raw) {
  if (!raw) return null;
  const clean = String(raw).replace(/\\/g, "/").trim();
  if (!clean) return null;
  if (/^https?:\/\//i.test(clean) || /^data:/i.test(clean) || /^blob:/i.test(clean)) return null;
  const uploadsIndex = clean.toLowerCase().indexOf("/uploads/");
  const relative = uploadsIndex >= 0 ? clean.slice(uploadsIndex + 1) : clean.replace(/^\/+/, "");
  const candidate = path.join(process.cwd(), "public", relative.replace(/^uploads\//, "uploads/"));
  if (!candidate.includes(path.join(process.cwd(), "public"))) return null;
  return candidate;
}

async function safeUnlink(filePath) {
  if (!filePath) return;
  try {
    await fs.promises.unlink(filePath);
  } catch (_err) {}
}

async function clearConversationHistory({ currentUser, conversationId }) {
  const conversation = await getConversationOrThrow({ currentUser, conversationId });
  const messages = await Message.find({ conversationId: String(conversation._id) }).lean();
  const files = new Set();
  messages.forEach((message) => {
    collectPossibleMediaPaths(message).forEach((p) => {
      const resolved = resolveLocalPath(p);
      if (resolved) files.add(resolved);
    });
  });

  await Message.deleteMany({ conversationId: String(conversation._id) });
  await Notification.deleteMany({ type: "message", targetType: "conversation", conversationId: String(conversation._id) }).catch(() => {});
  await Conversation.updateOne(
    { _id: conversation._id },
    {
      $set: {
        lastMessageText: "",
        lastMessageAt: null,
        lastMessageSenderId: "",
      },
    },
  );
  await ConversationMember.updateMany(
    { conversationId: String(conversation._id) },
    {
      $set: {
        unreadCount: 0,
        lastReadMessageId: "",
      },
    },
  );
  await Promise.all(Array.from(files).map((p) => safeUnlink(p)));

  const io = getSocketIOOrNull();
  if (io) {
    io.to(`conversation:${conversation._id}`).emit("conversation:history-cleared", {
      conversationId: String(conversation._id),
      clearedBy: String(currentUser._id),
    });
    await emitConversationSnapshot(io, String(conversation._id), conversation.memberUsernames || []);
  }

  return { ok: true };
}

module.exports = {
  resolveCurrentUserFromReq,
  searchUsers,
  getOrCreateDirectConversation,
  listConversations,
  getConversationDetail,
  listMessages,
  sendMessage,
  markConversationRead,
  getUnreadSummary,
  getConversationSettings,
  updateConversationSettings,
  clearConversationHistory,
};
