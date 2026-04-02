const {
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
} = require("../services/message.service");

async function searchMessageUsers(req, res, next) {
  try {
    const currentUser = await resolveCurrentUserFromReq(req);
    const data = await searchUsers({
      currentUser,
      q: req.query.q || "",
      limit: req.query.limit || 8,
    });
    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
}

async function createOrGetDirectConversation(req, res, next) {
  try {
    const currentUser = await resolveCurrentUserFromReq(req);
    const result = await getOrCreateDirectConversation({
      currentUser,
      targetUserId: req.body?.targetUserId,
    });
    res.json({
      ok: true,
      data: {
        conversation: {
          id: String(result.conversation._id),
          type: result.conversation.type,
          peer: result.peer,
          lastMessageText: result.conversation.lastMessageText || "",
          lastMessageAt: result.conversation.lastMessageAt,
          unreadCount: 0,
          nickname: result.member?.peerNickname || "",
          isBlocked: Boolean(result.member?.blockedPeer),
          blockedAt: result.member?.blockedAt || null,
        },
      },
    });
  } catch (err) {
    next(err);
  }
}

async function getConversationList(req, res, next) {
  try {
    const currentUser = await resolveCurrentUserFromReq(req);
    const items = await listConversations({ currentUser, limit: req.query.limit || 30 });
    res.json({ ok: true, data: { items } });
  } catch (err) {
    next(err);
  }
}

async function getConversation(req, res, next) {
  try {
    const currentUser = await resolveCurrentUserFromReq(req);
    const item = await getConversationDetail({ currentUser, conversationId: req.params.conversationId });
    res.json({ ok: true, data: item });
  } catch (err) {
    next(err);
  }
}

async function getConversationMessages(req, res, next) {
  try {
    const currentUser = await resolveCurrentUserFromReq(req);
    const items = await listMessages({
      currentUser,
      conversationId: req.params.conversationId,
      limit: req.query.limit || 50,
    });
    res.json({ ok: true, data: { items } });
  } catch (err) {
    next(err);
  }
}

async function postConversationMessage(req, res, next) {
  try {
    const currentUser = await resolveCurrentUserFromReq(req);
    const message = await sendMessage({
      currentUser,
      conversationId: req.params.conversationId,
      text: req.body?.text || "",
    });
    res.status(201).json({ ok: true, data: { message } });
  } catch (err) {
    next(err);
  }
}

async function readConversation(req, res, next) {
  try {
    const currentUser = await resolveCurrentUserFromReq(req);
    const data = await markConversationRead({ currentUser, conversationId: req.params.conversationId });
    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
}

async function unreadSummary(req, res, next) {
  try {
    const currentUser = await resolveCurrentUserFromReq(req);
    const data = await getUnreadSummary({ currentUser });
    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
}

async function getSettings(req, res, next) {
  try {
    const currentUser = await resolveCurrentUserFromReq(req);
    const data = await getConversationSettings({ currentUser, conversationId: req.params.conversationId });
    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
}

async function patchSettings(req, res, next) {
  try {
    const currentUser = await resolveCurrentUserFromReq(req);
    const data = await updateConversationSettings({
      currentUser,
      conversationId: req.params.conversationId,
      nickname: req.body?.nickname,
      isBlocked: typeof req.body?.isBlocked === 'boolean' ? req.body.isBlocked : undefined,
    });
    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
}

async function deleteHistory(req, res, next) {
  try {
    const currentUser = await resolveCurrentUserFromReq(req);
    const data = await clearConversationHistory({ currentUser, conversationId: req.params.conversationId });
    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  searchMessageUsers,
  createOrGetDirectConversation,
  getConversationList,
  getConversation,
  getConversationMessages,
  postConversationMessage,
  readConversation,
  unreadSummary,
  getSettings,
  patchSettings,
  deleteHistory,
};
