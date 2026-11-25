import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import User from "../../models/User.js";
import Conversation from "../../models/Conversation.js";
import logger from "../../config/logger.js";

let ioInstance = null;

export function setupSocketIO(server, allowedOrigins) {
  const io = new Server(server, {
    cors: {
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin.replace(/\/+$/, ""))) return callback(null, true);
        return callback(new Error("CORS origin not allowed for socket"));
      },
      credentials: true
    }
  });

  io.use(async (socket, next) => {
    try {
      let token = socket.handshake.auth?.token;
      if (!token && socket.handshake.headers?.cookie) {
        const cookie = socket.handshake.headers.cookie
          .split(";")
          .map((part) => part.trim())
          .find((part) => part.startsWith("unfold_session="));
        if (cookie) {
          token = decodeURIComponent(cookie.slice("unfold_session=".length));
        }
      }

      if (!token) {
        return next(new Error("Authentication required for websocket connection."));
      }

      const payload = jwt.verify(token, process.env.JWT_SECRET, {
        issuer: "unfold-api",
        audience: "unfold-client"
      });

      const user = await User.findById(payload.sub);
      if (!user || user.status !== "active") {
        return next(new Error("User session invalid."));
      }

      socket.user = {
        id: String(user._id),
        username: user.username,
        displayName: user.displayName || user.username
      };
      return next();
    } catch (err) {
      return next(new Error("Socket authentication failed: " + err.message));
    }
  });

  io.on("connection", (socket) => {
    const userId = socket.user.id;
    // Join user's individual room for direct notifications
    socket.join(`user:${userId}`);
    logger.info(`Socket connected for user @${socket.user.username}`, { userId, socketId: socket.id });

    socket.on("join_conversation", async (conversationId, callback) => {
      try {
        const conversation = await Conversation.findById(conversationId);
        if (!conversation) {
          if (callback) callback({ error: "Conversation not found" });
          return;
        }
        const isParticipant = conversation.participants.some(
          (p) => String(p) === String(userId)
        );
        if (!isParticipant) {
          if (callback) callback({ error: "Unauthorized" });
          return;
        }
        socket.join(`conversation:${conversationId}`);
        if (callback) callback({ success: true });
      } catch (e) {
        if (callback) callback({ error: e.message });
      }
    });

    socket.on("leave_conversation", (conversationId) => {
      socket.leave(`conversation:${conversationId}`);
    });

    socket.on("join_project", (projectId) => {
      if (projectId) {
        socket.join(`project:${projectId}`);
      }
    });

    socket.on("leave_project", (projectId) => {
      if (projectId) {
        socket.leave(`project:${projectId}`);
      }
    });

    socket.on("typing", ({ conversationId, isTyping }) => {
      socket.to(`conversation:${conversationId}`).emit("user_typing", {
        conversationId,
        userId,
        username: socket.user.username,
        isTyping
      });
    });

    socket.on("disconnect", () => {
      logger.info(`Socket disconnected for user @${socket.user.username}`, { userId, socketId: socket.id });
    });
  });

  ioInstance = io;
  return io;
}

export function getIO() {
  return ioInstance;
}

export function broadcastNewMessage(recipientId, conversationId, message) {
  if (!ioInstance) return;
  // Send to the conversation room for active chat windows
  ioInstance.to(`conversation:${conversationId}`).emit("new_message", {
    conversationId,
    message
  });
  // Also send to the recipient's personal room for inbox notification & unread count badge
  if (recipientId) {
    ioInstance.to(`user:${recipientId}`).emit("inbox_update", {
      conversationId,
      message
    });
  }
}
