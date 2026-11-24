import express from "express";
import rateLimit from "express-rate-limit";
import { asyncRoute } from "../../utils/http.js";
import { requireAuth } from "../../middleware/auth.js";
import {
  listConversations,
  getOrCreateConversation,
  getConversationMessages,
  sendMessage,
  markConversationAsRead,
  getTotalUnreadCount
} from "./messages.service.js";
import { broadcastNewMessage } from "./messages.socket.js";

const router = express.Router();

const messageSendLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: "MESSAGE_RATE_LIMIT",
      message: "You are sending messages too quickly. Please pause a moment."
    }
  }
});

router.use(["/conversations", "/messages"], requireAuth);

router.get("/conversations", asyncRoute(async (req, res) => {
  const conversations = await listConversations(req.user.id);
  const unreadTotal = await getTotalUnreadCount(req.user.id);
  return res.json({
    success: true,
    data: {
      conversations,
      unreadTotal
    }
  });
}));

router.get("/conversations/unread", asyncRoute(async (req, res) => {
  const unreadTotal = await getTotalUnreadCount(req.user.id);
  return res.json({
    success: true,
    data: { unreadTotal }
  });
}));

router.post("/conversations", asyncRoute(async (req, res) => {
  const targetUserId = req.body?.userId || req.body?.targetUserId;
  if (!targetUserId) {
    return res.status(400).json({
      success: false,
      error: { code: "MISSING_USER_ID", message: "Target user ID is required." }
    });
  }

  const conversation = await getOrCreateConversation(req.user.id, targetUserId);
  return res.status(201).json({
    success: true,
    data: { conversation }
  });
}));

router.get("/conversations/:id/messages", asyncRoute(async (req, res) => {
  const { limit, before } = req.query;
  const messages = await getConversationMessages(req.params.id, req.user.id, { limit, before });
  return res.json({
    success: true,
    data: { messages }
  });
}));

router.post("/conversations/:id/messages", messageSendLimiter, asyncRoute(async (req, res) => {
  const content = req.body?.content;
  const result = await sendMessage(req.params.id, req.user.id, content);

  // Broadcast in real-time via Socket.IO
  broadcastNewMessage(result.recipientId, req.params.id, result.message);

  return res.status(201).json({
    success: true,
    data: { message: result.message }
  });
}));

router.post("/conversations/:id/read", asyncRoute(async (req, res) => {
  await markConversationAsRead(req.params.id, req.user.id);
  return res.json({
    success: true,
    message: "Conversation marked as read."
  });
}));

export default router;
