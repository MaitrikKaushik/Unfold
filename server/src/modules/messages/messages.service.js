import mongoose from "mongoose";
import Conversation from "../../models/Conversation.js";
import Message from "../../models/Message.js";
import User from "../../models/User.js";

export async function listConversations(userId) {
  const conversations = await Conversation.find({
    participants: userId
  })
    .sort({ lastMessageAt: -1 })
    .populate("participants", "username displayName avatar bio stats preferences blockedUsers")
    .lean();

  return conversations.map((conv) => {
    const otherParticipant = conv.participants.find(
      (p) => String(p._id) !== String(userId)
    ) || conv.participants[0] || {};

    const unread = (conv.unreadCounts && conv.unreadCounts[String(userId)]) || 0;

    return {
      id: String(conv._id),
      otherParticipant: {
        id: String(otherParticipant._id || ""),
        username: otherParticipant.username || "unknown",
        displayName: otherParticipant.displayName || otherParticipant.username || "Unknown Member",
        avatar: otherParticipant.avatar || { url: "", publicId: "" },
        bio: otherParticipant.bio || ""
      },
      lastMessage: conv.lastMessage?.content || "",
      lastMessageSenderId: conv.lastMessage?.senderId ? String(conv.lastMessage.senderId) : null,
      lastMessageAt: conv.lastMessageAt || conv.createdAt,
      unreadCount: unread,
      createdAt: conv.createdAt
    };
  });
}

export async function getOrCreateConversation(userId, targetUserId) {
  if (String(userId) === String(targetUserId)) {
    const error = new Error("You cannot start a conversation with yourself.");
    error.status = 400;
    error.code = "CANNOT_MESSAGE_SELF";
    throw error;
  }

  const target = await User.findById(targetUserId);
  if (!target || target.status !== "active") {
    const error = new Error("User not found or unavailable.");
    error.status = 404;
    error.code = "USER_NOT_FOUND";
    throw error;
  }

  // Safety & Privacy checks
  if (target.blockedUsers && target.blockedUsers.some((b) => String(b) === String(userId))) {
    const error = new Error("You cannot message this user.");
    error.status = 403;
    error.code = "BLOCKED_BY_USER";
    throw error;
  }

  if (target.preferences?.privacy?.directMessages === "none") {
    const error = new Error("This user does not accept direct messages.");
    error.status = 403;
    error.code = "DIRECT_MESSAGES_DISABLED";
    throw error;
  }

  const currentUser = await User.findById(userId);
  if (currentUser?.blockedUsers && currentUser.blockedUsers.some((b) => String(b) === String(targetUserId))) {
    const error = new Error("You have blocked this user. Unblock them first to send a message.");
    error.status = 403;
    error.code = "USER_BLOCKED";
    throw error;
  }

  let conversation = await Conversation.findOne({
    participants: { $all: [userId, targetUserId], $size: 2 }
  }).populate("participants", "username displayName avatar bio stats");

  if (!conversation) {
    conversation = await Conversation.create({
      participants: [userId, targetUserId],
      lastMessage: { content: "", senderId: userId, createdAt: new Date() },
      lastMessageAt: new Date(),
      unreadCounts: new Map()
    });
    conversation = await Conversation.findById(conversation._id).populate(
      "participants",
      "username displayName avatar bio stats"
    );
  }

  const otherParticipant = conversation.participants.find(
    (p) => String(p._id) !== String(userId)
  ) || conversation.participants[0] || {};

  return {
    id: String(conversation._id),
    otherParticipant: {
      id: String(otherParticipant._id),
      username: otherParticipant.username,
      displayName: otherParticipant.displayName || otherParticipant.username,
      avatar: otherParticipant.avatar || { url: "", publicId: "" },
      bio: otherParticipant.bio || ""
    },
    lastMessage: conversation.lastMessage?.content || "",
    lastMessageSenderId: conversation.lastMessage?.senderId ? String(conversation.lastMessage.senderId) : null,
    lastMessageAt: conversation.lastMessageAt,
    unreadCount: 0,
    createdAt: conversation.createdAt
  };
}

export async function getConversationMessages(conversationId, userId, { limit = 50, before } = {}) {
  const conversation = await Conversation.findById(conversationId);
  if (!conversation) {
    const error = new Error("Conversation not found.");
    error.status = 404;
    error.code = "CONVERSATION_NOT_FOUND";
    throw error;
  }

  const isParticipant = conversation.participants.some(
    (p) => String(p) === String(userId)
  );
  if (!isParticipant) {
    const error = new Error("You do not have permission to view this conversation.");
    error.status = 403;
    error.code = "FORBIDDEN";
    throw error;
  }

  const query = { conversationId };
  if (before) {
    query.createdAt = { $lt: new Date(before) };
  }

  const messages = await Message.find(query)
    .sort({ createdAt: -1 })
    .limit(Math.min(Number(limit) || 50, 100))
    .populate("senderId", "username displayName avatar")
    .lean();

  return messages.reverse().map((m) => ({
    id: String(m._id),
    conversationId: String(m.conversationId),
    sender: {
      id: String(m.senderId?._id || m.senderId),
      username: m.senderId?.username || "unknown",
      displayName: m.senderId?.displayName || m.senderId?.username || "User",
      avatar: m.senderId?.avatar || { url: "", publicId: "" }
    },
    content: m.content,
    isMine: String(m.senderId?._id || m.senderId) === String(userId),
    read: (m.readBy || []).some((r) => String(r) !== String(m.senderId?._id || m.senderId)),
    readAt: m.readAt || null,
    createdAt: m.createdAt
  }));
}

export async function sendMessage(conversationId, senderId, content) {
  const cleanContent = String(content || "").trim();
  if (!cleanContent) {
    const error = new Error("Message content cannot be empty.");
    error.status = 400;
    error.code = "EMPTY_MESSAGE";
    throw error;
  }

  if (cleanContent.length > 2000) {
    const error = new Error("Message cannot exceed 2000 characters.");
    error.status = 400;
    error.code = "MESSAGE_TOO_LONG";
    throw error;
  }

  const conversation = await Conversation.findById(conversationId);
  if (!conversation) {
    const error = new Error("Conversation not found.");
    error.status = 404;
    error.code = "CONVERSATION_NOT_FOUND";
    throw error;
  }

  const isParticipant = conversation.participants.some(
    (p) => String(p) === String(senderId)
  );
  if (!isParticipant) {
    const error = new Error("You are not a participant in this conversation.");
    error.status = 403;
    error.code = "FORBIDDEN";
    throw error;
  }

  const recipientId = conversation.participants.find(
    (p) => String(p) !== String(senderId)
  );

  if (recipientId) {
    const recipient = await User.findById(recipientId);
    if (recipient?.blockedUsers && recipient.blockedUsers.some((b) => String(b) === String(senderId))) {
      const error = new Error("You cannot send messages to this user.");
      error.status = 403;
      error.code = "BLOCKED_BY_USER";
      throw error;
    }
  }

  const message = await Message.create({
    conversationId,
    senderId,
    content: cleanContent,
    readBy: [senderId]
  });

  const now = message.createdAt || new Date();
  conversation.lastMessage = {
    content: cleanContent,
    senderId,
    createdAt: now
  };
  conversation.lastMessageAt = now;

  if (recipientId) {
    const currentUnread = Number(conversation.unreadCounts.get(String(recipientId)) || 0);
    conversation.unreadCounts.set(String(recipientId), currentUnread + 1);
  }

  await conversation.save();

  const sender = await User.findById(senderId, "username displayName avatar");

  return {
    message: {
      id: String(message._id),
      conversationId: String(message.conversationId),
      senderId: String(sender._id),
      sender: {
        id: String(sender._id),
        username: sender.username,
        displayName: sender.displayName || sender.username,
        avatar: sender.avatar || { url: "", publicId: "" }
      },
      content: message.content,
      read: false,
      readAt: null,
      createdAt: message.createdAt
    },
    recipientId: recipientId ? String(recipientId) : null
  };
}

export async function markConversationAsRead(conversationId, userId) {
  const conversation = await Conversation.findById(conversationId);
  if (!conversation) {
    const error = new Error("Conversation not found.");
    error.status = 404;
    error.code = "CONVERSATION_NOT_FOUND";
    throw error;
  }

  const isParticipant = conversation.participants.some(
    (p) => String(p) === String(userId)
  );
  if (!isParticipant) {
    const error = new Error("Forbidden.");
    error.status = 403;
    error.code = "FORBIDDEN";
    throw error;
  }

  conversation.unreadCounts.set(String(userId), 0);
  await conversation.save();

  await Message.updateMany(
    {
      conversationId,
      senderId: { $ne: userId },
      readBy: { $ne: userId }
    },
    {
      $addToSet: { readBy: userId },
      $set: { readAt: new Date() }
    }
  );

  return { success: true };
}

export async function getTotalUnreadCount(userId) {
  const conversations = await Conversation.find({
    participants: userId
  }).lean();

  let total = 0;
  for (const c of conversations) {
    if (c.unreadCounts && c.unreadCounts[String(userId)]) {
      total += Number(c.unreadCounts[String(userId)]);
    }
  }
  return total;
}
