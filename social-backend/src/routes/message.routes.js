const express = require("express");
const { sessionUser } = require("../middlewares/sessionUser");
const {
  searchMessageUsers,
  listFollowingUsers,
  createOrGetDirectConversation,
  getConversationList,
  getConversation,
  getConversationMessages,
  postConversationMessage,
  readConversation,
  unreadSummary,
} = require("../controllers/message.controller");

const router = express.Router();

router.use(sessionUser);

router.get("/search-users", searchMessageUsers);
router.get("/following-users", listFollowingUsers);
router.post("/conversations/direct", createOrGetDirectConversation);
router.get("/conversations", getConversationList);
router.get("/conversations/:conversationId", getConversation);
router.get("/conversations/:conversationId/messages", getConversationMessages);
router.post("/conversations/:conversationId/messages", postConversationMessage);
router.post("/conversations/:conversationId/read", readConversation);
router.get("/unread-summary", unreadSummary);

module.exports = router;
