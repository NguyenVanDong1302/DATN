const express = require("express");
const { sessionUser } = require("../middlewares/sessionUser");
const { uploadMessageMedia } = require("../middlewares/uploadMessageMedia");
const {
  searchMessageUsers,
  createOrGetDirectConversation,
  getConversationList,
  getConversation,
  getConversationMessages,
  postConversationMessage,
  toggleMessageHeart,
  readConversation,
  unreadSummary,
  getSettings,
  patchSettings,
  deleteHistory,
} = require("../controllers/message.controller");

const router = express.Router();

router.use(sessionUser);

router.get("/search-users", searchMessageUsers);
router.post("/conversations/direct", createOrGetDirectConversation);
router.get("/conversations", getConversationList);
router.get("/conversations/:conversationId", getConversation);
router.get("/conversations/:conversationId/messages", getConversationMessages);
router.post("/conversations/:conversationId/messages", uploadMessageMedia.single("media"), postConversationMessage);
router.post("/conversations/:conversationId/messages/:messageId/heart", toggleMessageHeart);
router.delete("/conversations/:conversationId/messages/:messageId/heart", toggleMessageHeart);
router.post("/conversations/:conversationId/read", readConversation);
router.get("/conversations/:conversationId/settings", getSettings);
router.patch("/conversations/:conversationId/settings", patchSettings);
router.delete("/conversations/:conversationId/history", deleteHistory);
router.get("/unread-summary", unreadSummary);

module.exports = router;
