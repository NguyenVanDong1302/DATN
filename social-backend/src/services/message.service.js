const User = require("../models/User");
const Follow = require("../models/Follow");
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
          },
        },
        { upsert: true },
      ),
    ),
  );
}

function serializeUser(user) {
  const id = String(user._id);
  return {
    _id: id,
    id,
    username: user.username,
    email: user.email || "",
    bio: user.bio || "",
    avatarUrl: user.avatarUrl || "",
  };
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function legacyUserId(username) {
  const crypto = require("crypto");
  return crypto
    .createHash("sha256")
    .update(String(username || ""))
    .digest("hex")
    .slice(0, 16);
}

function buildSearchScore(user, keyword, signals = {}) {
  const query = String(keyword || "").trim().toLowerCase();
  let score = 0;

  const username = String(user.username || "").toLowerCase();
  const email = String(user.email || "").toLowerCase();
  const bio = String(user.bio || "").toLowerCase();

  if (!query) {
    if (signals.isRecent) score += 120;
    if (signals.isFollowing) score += 80;
    return score;
  }

  if (username === query) score += 1000;
  if (email === query) score += 950;
  if (username.startsWith(query)) score += 700;
  if (email.startsWith(query)) score += 500;
  if (bio.startsWith(query)) score += 250;
  if (username.includes(query)) score += 300;
  if (email.includes(query)) score += 220;
  if (bio.includes(query)) score += 120;

  if (signals.isRecent) score += 140;
  if (signals.isFollowing) score += 110;
  if (signals.recentOrder >= 0) score += Math.max(0, 40 - signals.recentOrder);

  return score;
}

async function searchUsers({ currentUser, q = "", limit = 8 }) {
  const keyword = String(q || "").trim();
  const safeLimit = Math.max(1, Math.min(Number(limit) || 8, 20));
  const currentUserId = String(currentUser._id);
  const currentUsername = String(currentUser.username || "");

  const [followRows, recentConversations] = await Promise.all([
    Follow.find({
      $or: [{ followerId: currentUserId }, { followerUsername: currentUsername }],
    })
      .select("followingId followingUsername")
      .lean(),
    Conversation.find({
      $or: [{ memberIds: currentUserId }, { memberUsernames: currentUsername }],
    })
      .sort({ lastMessageAt: -1, updatedAt: -1, createdAt: -1 })
      .limit(20)
      .lean(),
  ]);

  const followingIdSet = new Set();
  const followingUsernameSet = new Set();
  for (const row of followRows) {
    if (row?.followingId) followingIdSet.add(String(row.followingId));
    if (row?.followingUsername) followingUsernameSet.add(String(row.followingUsername));
  }

  const recentIds = [];
  const recentOrderMap = new Map();
  for (const conversation of recentConversations) {
    const peerId = (conversation.memberIds || []).find((id) => String(id) !== currentUserId);
    const peerUsername = (conversation.memberUsernames || []).find((name) => String(name) !== currentUsername);
    const recentKey = String(peerId || peerUsername || "");
    if (!recentKey || recentOrderMap.has(recentKey)) continue;
    recentOrderMap.set(recentKey, recentIds.length);
    if (peerId) recentIds.push(String(peerId));
  }

  const regex = keyword ? new RegExp(escapeRegex(keyword), "i") : null;
  const baseMatch = regex
    ? {
        $or: [{ username: regex }, { email: regex }, { bio: regex }],
      }
    : {};

  const candidateLimit = Math.max(safeLimit * 5, 30);
  const candidates = await User.find({
    _id: { $nin: [currentUserId] },
    ...baseMatch,
  })
    .select("_id username email bio avatarUrl createdAt")
    .sort(regex ? { updatedAt: -1, createdAt: -1 } : { createdAt: -1 })
    .limit(candidateLimit)
    .lean();

  const candidateMap = new Map();
  for (const user of candidates) {
    candidateMap.set(String(user._id), user);
  }

  const missingRecentIds = recentIds.filter((id) => !candidateMap.has(String(id)));
  if (missingRecentIds.length) {
    const recentUsers = await User.find({ _id: { $in: missingRecentIds } })
      .select("_id username email bio avatarUrl createdAt")
      .lean();
    for (const user of recentUsers) {
      candidateMap.set(String(user._id), user);
    }
  }

  const allCandidates = Array.from(candidateMap.values())
    .filter((user) => String(user._id) !== currentUserId)
    .map((user) => {
      const id = String(user._id);
      const recentOrder = recentOrderMap.has(id)
        ? recentOrderMap.get(id)
        : recentOrderMap.has(String(user.username || ""))
          ? recentOrderMap.get(String(user.username || ""))
          : -1;
      const isRecent = recentOrder >= 0;
      const isFollowing = followingIdSet.has(id) || followingUsernameSet.has(String(user.username || ""));
      return {
        ...serializeUser(user),
        _score: buildSearchScore(user, keyword, { isRecent, isFollowing, recentOrder }),
        _isRecent: isRecent,
        _isFollowing: isFollowing,
        _recentOrder: recentOrder,
      };
    })
    .filter((user) => (keyword ? user._score > 0 : true))
    .sort((a, b) => {
      if (b._score !== a._score) return b._score - a._score;
      if (a._recentOrder !== b._recentOrder) {
        const av = a._recentOrder < 0 ? Number.MAX_SAFE_INTEGER : a._recentOrder;
        const bv = b._recentOrder < 0 ? Number.MAX_SAFE_INTEGER : b._recentOrder;
        if (av !== bv) return av - bv;
      }
      return a.username.localeCompare(b.username, "vi");
    });

  const takeUnique = (items) => {
    const seen = new Set();
    const out = [];
    for (const item of items) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      out.push({
        id: item.id,
        username: item.username,
        email: item.email || "",
        bio: item.bio || "",
        avatarUrl: item.avatarUrl || "",
      });
      if (out.length >= safeLimit) break;
    }
    return out;
  };

  return {
    recent: takeUnique(allCandidates.filter((user) => user._isRecent)),
    following: takeUnique(allCandidates.filter((user) => user._isFollowing)),
    suggested: takeUnique(allCandidates.filter((user) => !user._isRecent && !user._isFollowing)),
  };
}

async function listFollowingUsersForMessages({ currentUser }) {
  const currentUserId = String(currentUser._id);
  const currentUsername = String(currentUser.username || "");
  const followRows = await Follow.find({
    $or: [{ followerId: currentUserId }, { followerUsername: currentUsername }],
  })
    .select("followingId followingUsername")
    .lean();

  const followingIds = new Set();
  const followingUsernames = new Set();

  for (const row of followRows) {
    if (row?.followingId) followingIds.add(String(row.followingId));
    if (row?.followingUsername) followingUsernames.add(String(row.followingUsername));
  }

  if (!followingIds.size && !followingUsernames.size) {
    return [];
  }

  const users = await User.find({
    $or: [
      ...(followingIds.size ? [{ _id: { $in: Array.from(followingIds) } }] : []),
      ...(followingUsernames.size ? [{ username: { $in: Array.from(followingUsernames) } }] : []),
    ],
  })
    .select("_id username email bio avatarUrl createdAt")
    .sort({ username: 1 })
    .lean();

  const deduped = [];
  const seen = new Set();
  for (const user of users) {
    const id = String(user._id);
    if (id === currentUserId || seen.has(id)) continue;
    seen.add(id);
    deduped.push({
      ...serializeUser(user),
      createdAt: user.createdAt || null,
    });
  }

  return deduped;
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

  return {
    conversation,
    peer: serializeUser(target),
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
    return {
      id: String(row._id),
      type: row.type,
      peer: peer
        ? { id: String(peer._id), username: peer.username, email: peer.email || "", bio: peer.bio || "", avatarUrl: peer.avatarUrl || "" }
        : { id: String(peerId), username: row.memberUsernames.find((u) => u !== currentUser.username) || "Người dùng", email: "", bio: "", avatarUrl: "" },
      lastMessageText: row.lastMessageText || "",
      lastMessageAt: row.lastMessageAt,
      unreadCount: Number(member?.unreadCount || 0),
    };
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

  return {
    id: String(conversation._id),
    type: conversation.type,
    peer: peer ? { id: String(peer._id), username: peer.username, email: peer.email || "", bio: peer.bio || "", avatarUrl: peer.avatarUrl || "" } : null,
    lastMessageText: conversation.lastMessageText || "",
    lastMessageAt: conversation.lastMessageAt,
    unreadCount: Number(member?.unreadCount || 0),
  };
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
    storyReply: row.storyReply || null,
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

async function sendMessage({ currentUser, conversationId, text, storyReply }) {
  const trimmed = String(text || "").trim();
  const normalizedStoryReply = storyReply && storyReply.storyId ? {
    storyId: String(storyReply.storyId || ''),
    ownerUsername: String(storyReply.ownerUsername || ''),
    mediaType: ['image','video'].includes(String(storyReply.mediaType || '')) ? String(storyReply.mediaType) : '',
    mediaUrl: String(storyReply.mediaUrl || ''),
    thumbnailUrl: String(storyReply.thumbnailUrl || ''),
  } : null;
  if (!trimmed && !normalizedStoryReply) {
    throw new AppError("Tin nhắn không được để trống", 400, "EMPTY_MESSAGE");
  }

  const conversation = await getConversationOrThrow({ currentUser, conversationId });
  const receiverId = conversation.memberIds.find((id) => String(id) !== String(currentUser._id));
  const receiverUsername = conversation.memberUsernames.find((u) => u !== currentUser.username) || "";
  const receiver = await User.findById(receiverId).select("_id username email bio avatarUrl");
  if (!receiver) {
    throw new AppError("Người nhận không tồn tại", 404, "RECEIVER_NOT_FOUND");
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
    type: 'text',
    text: trimmed,
    storyReply: normalizedStoryReply || undefined,
    status: nextStatus,
    seenAt: nextStatus === "seen" ? new Date() : null,
  });

  await Conversation.updateOne(
    { _id: conversation._id },
    {
      $set: {
        lastMessageText: trimmed || `Đã trả lời tin của @${receiver.username}`,
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

  const payload = {
    id: String(message._id),
    conversationId: String(conversation._id),
    senderId: String(currentUser._id),
    senderUsername: currentUser.username,
    receiverId: String(receiver._id),
    receiverUsername: receiver.username,
    type: message.type,
    text: message.text,
    storyReply: message.storyReply || null,
    status: message.status,
    seenAt: message.seenAt,
    createdAt: message.createdAt,
  };

  const io = getSocketIOOrNull();
  if (io) {
    io.to(`conversation:${conversation._id}`).emit("message:new", payload);
    emitToUser(io, String(receiver._id), receiver.username, "message:new", payload);
    emitToUser(io, String(currentUser._id), currentUser.username, "message:new", payload);
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
    const otherUserId = conversation.memberIds.find((id) => String(id) !== String(currentUser._id));
    const otherUsername = conversation.memberUsernames.find((u) => u !== currentUser.username) || "";
    emitToUser(io, String(otherUserId || ""), otherUsername, "inbox:refresh", { reason: "peer-read", conversationId: String(conversation._id) });
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

module.exports = {
  resolveCurrentUserFromReq,
  searchUsers,
  listFollowingUsersForMessages,
  getOrCreateDirectConversation,
  listConversations,
  getConversationDetail,
  listMessages,
  sendMessage,
  markConversationRead,
  getUnreadSummary,
};
