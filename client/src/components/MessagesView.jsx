import React, { useState, useEffect, useRef } from "react";
import {
  MessageSquare,
  Search,
  Plus,
  ArrowLeft,
  Send,
  UserX,
  X,
  Sparkles,
  Shield,
  Check,
  CheckCheck,
  AlertCircle,
  Clock
} from "lucide-react";
import { io } from "socket.io-client";
import { api, SERVER_ORIGIN, getToken } from "../services/api";
import { MessageInboxSkeleton, ConversationSkeleton } from "./Skeletons";

function getEntityId(entity) {
  if (!entity) return "";
  if (typeof entity === "string") return entity;
  return String(entity._id || entity.id || "");
}

function isMessageFromMe(msg, currentUser) {
  const currentUserId = getEntityId(currentUser);
  if (!currentUserId) return false;

  const senderId = getEntityId(msg?.senderId) || getEntityId(msg?.sender);
  if (senderId) {
    return senderId === currentUserId;
  }
  return false;
}

function formatMessageTime(dateString) {
  if (!dateString) return "";
  const d = new Date(dateString);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatInboxTime(dateString) {
  if (!dateString) return "";
  const d = new Date(dateString);
  const now = new Date();
  const diffSec = Math.floor((now - d) / 1000);

  if (diffSec < 60) return "Just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400 && d.getDate() === now.getDate()) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function formatMessageDateSeparator(dateString) {
  if (!dateString) return "";
  const date = new Date(dateString);
  const now = new Date();

  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();
  if (isToday) return "Today";

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear();
  if (isYesterday) return "Yesterday";

  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric"
  });
}

function isSameDay(d1String, d2String) {
  if (!d1String || !d2String) return false;
  const d1 = new Date(d1String);
  const d2 = new Date(d2String);
  return (
    d1.getDate() === d2.getDate() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getFullYear() === d2.getFullYear()
  );
}

export default function MessagesView({ currentUser, onBackToFeed, initialTargetUser = null }) {
  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadingInbox, setLoadingInbox] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Composer
  const [messageText, setMessageText] = useState("");
  const [sendError, setSendError] = useState("");

  // Typing state
  const [partnerTyping, setPartnerTyping] = useState(false);
  const typingTimeoutRef = useRef(null);

  // New message modal state
  const [showNewModal, setShowNewModal] = useState(false);
  const [userSearchTerm, setUserSearchTerm] = useState("");
  const [searchedUsers, setSearchedUsers] = useState([]);
  const [searchingUsers, setSearchingUsers] = useState(false);

  // Block modal state
  const [showBlockConfirm, setShowBlockConfirm] = useState(false);
  const [blocking, setBlocking] = useState(false);

  // Mobile navigation state
  const [mobileShowChat, setMobileShowChat] = useState(false);

  const chatScrollRef = useRef(null);
  const isNearBottomRef = useRef(true);
  const socketRef = useRef(null);
  const textareaRef = useRef(null);

  const activeConversationIdRef = useRef(activeConversationId);
  const currentUserRef = useRef(currentUser);
  const prevActiveConvRef = useRef(null);

  useEffect(() => {
    activeConversationIdRef.current = activeConversationId;
  }, [activeConversationId]);

  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  // Direct internal scroll without moving the window or parent layout
  const scrollToBottom = (behavior = "smooth") => {
    if (!chatScrollRef.current) return;
    chatScrollRef.current.scrollTo({
      top: chatScrollRef.current.scrollHeight,
      behavior: behavior
    });
  };

  const handleChatScroll = () => {
    if (!chatScrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = chatScrollRef.current;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    isNearBottomRef.current = distanceFromBottom < 120;
  };

  // 1. Initialize persistent Socket.IO connection
  useEffect(() => {
    const socketUrl = SERVER_ORIGIN || (typeof window !== "undefined" ? window.location.origin : "");
    const token = getToken();

    const socket = io(socketUrl, {
      auth: { token },
      withCredentials: true,
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 15,
      reconnectionDelay: 1000
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      // Re-join current active conversation room on connect / reconnect
      if (activeConversationIdRef.current) {
        socket.emit("join_conversation", activeConversationIdRef.current);
      }
    });

    socket.on("new_message", ({ conversationId, message }) => {
      const activeId = activeConversationIdRef.current;
      const isCurrentConv = activeId === conversationId;
      const senderId = getEntityId(message.senderId || message.sender);

      // 1. Update conversations list preview and elevate conversation to top
      setConversations((prev) => {
        const targetConv = prev.find((c) => c.id === conversationId);
        if (!targetConv) {
          loadConversations();
          return prev;
        }
        const updated = {
          ...targetConv,
          lastMessage: message.content,
          lastMessageAt: message.createdAt,
          lastMessageSenderId: senderId,
          unreadCount: isCurrentConv ? 0 : (targetConv.unreadCount || 0) + 1
        };
        return [updated, ...prev.filter((c) => c.id !== conversationId)];
      });

      // 2. If this conversation is currently open, append message
      if (isCurrentConv) {
        setMessages((prev) => {
          // If already present by real server id, return prev
          if (prev.some((m) => m.id === message.id)) return prev;

          // If this is our own message arriving via socket while optimistic send is in-flight, replace the temp message
          const myId = getEntityId(currentUserRef.current);
          if (senderId === myId) {
            const pendingIndex = prev.findIndex(
              (m) => (m.status === "sending" || m.clientTempId) && m.content === message.content
            );
            if (pendingIndex !== -1) {
              const updated = [...prev];
              updated[pendingIndex] = { ...message, status: "sent" };
              return updated;
            }
          }

          return [...prev, { ...message, status: "sent" }];
        });

        // Clear typing indicator for current conversation
        setPartnerTyping(false);

        // Only auto-scroll if user is near bottom
        if (isNearBottomRef.current) {
          setTimeout(() => scrollToBottom("smooth"), 40);
        }

        // Mark as read immediately on backend since conversation is open
        api(`/conversations/${conversationId}/read`, { method: "POST" }).catch(() => {});
      }
    });

    socket.on("inbox_update", ({ conversationId, message }) => {
      const activeId = activeConversationIdRef.current;
      if (activeId === conversationId) return; // Handled by new_message

      setConversations((prev) => {
        const targetConv = prev.find((c) => c.id === conversationId);
        if (!targetConv) {
          loadConversations();
          return prev;
        }
        const updated = {
          ...targetConv,
          lastMessage: message.content,
          lastMessageAt: message.createdAt,
          lastMessageSenderId: getEntityId(message.senderId || message.sender),
          unreadCount: (targetConv.unreadCount || 0) + 1
        };
        return [updated, ...prev.filter((c) => c.id !== conversationId)];
      });
    });

    socket.on("messages_read", ({ conversationId }) => {
      const activeId = activeConversationIdRef.current;
      if (activeId === conversationId) {
        // Mark all outgoing messages in active conversation as read
        setMessages((prev) =>
          prev.map((m) => (m.read ? m : { ...m, read: true }))
        );
      }
    });

    socket.on("user_typing", ({ conversationId, userId, isTyping }) => {
      const activeId = activeConversationIdRef.current;
      const myId = getEntityId(currentUserRef.current);
      if (activeId === conversationId && String(userId) !== myId) {
        setPartnerTyping(Boolean(isTyping));
      }
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

  // Manage room subscription when switching active conversation
  useEffect(() => {
    activeConversationIdRef.current = activeConversationId;
    setPartnerTyping(false);

    if (socketRef.current && socketRef.current.connected) {
      if (prevActiveConvRef.current && prevActiveConvRef.current !== activeConversationId) {
        socketRef.current.emit("leave_conversation", prevActiveConvRef.current);
      }
      if (activeConversationId) {
        socketRef.current.emit("join_conversation", activeConversationId);
      }
    }
    prevActiveConvRef.current = activeConversationId;
  }, [activeConversationId]);

  // 2. Load conversations list
  async function loadConversations() {
    setLoadingInbox(true);
    try {
      const res = await api("/conversations");
      const list = res?.data?.conversations || [];
      setConversations(list);

      // If initial target user was passed (e.g. from user profile), start/open conversation
      if (initialTargetUser) {
        openConversationWithUser(initialTargetUser.id);
      } else if (list.length > 0 && !activeConversationId && window.innerWidth > 768) {
        // Auto-select first conversation on desktop
        selectConversation(list[0].id);
      }
    } catch {
      // Handled
    } finally {
      setLoadingInbox(false);
    }
  }

  useEffect(() => {
    loadConversations();
  }, []);

  // 3. Select a conversation and load message history
  async function selectConversation(convId) {
    setActiveConversationId(convId);
    setMobileShowChat(true);
    setLoadingMessages(true);
    setSendError("");
    setPartnerTyping(false);

    // Join room via socket
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit("join_conversation", convId);
    }

    try {
      const res = await api(`/conversations/${convId}/messages`);
      const loadedMessages = (res?.data?.messages || []).map((m) => ({
        ...m,
        status: "sent"
      }));
      setMessages(loadedMessages);

      // Mark read on backend
      await api(`/conversations/${convId}/read`, { method: "POST" });
      setConversations((prev) =>
        prev.map((c) => (c.id === convId ? { ...c, unreadCount: 0 } : c))
      );
    } catch (err) {
      setSendError(err.message || "Failed to load messages.");
    } finally {
      setLoadingMessages(false);
      // Instant jump to bottom without smooth animation
      setTimeout(() => {
        scrollToBottom("auto");
        isNearBottomRef.current = true;
      }, 40);
    }
  }

  // 4. Send message with Optimistic UI & WhatsApp responsiveness
  async function handleSendMessage(e) {
    if (e) e.preventDefault();
    const text = messageText.trim();
    if (!text || !activeConversationId) return;

    const tempId = `temp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const currentUserId = getEntityId(currentUser);
    const nowIso = new Date().toISOString();

    const optimisticMsg = {
      id: tempId,
      clientTempId: tempId,
      conversationId: activeConversationId,
      content: text,
      senderId: currentUserId,
      sender: {
        id: currentUserId,
        username: currentUser?.username || "You",
        displayName: currentUser?.displayName || currentUser?.username || "You",
        avatar: currentUser?.avatar || { url: "", publicId: "" }
      },
      status: "sending",
      read: false,
      readAt: null,
      createdAt: nowIso
    };

    // 1. Immediately append optimistic message
    setMessages((prev) => [...prev, optimisticMsg]);
    setMessageText("");
    setSendError("");

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    // Stop typing indicator immediately
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit("typing", { conversationId: activeConversationId, isTyping: false });
    }

    // 2. Immediately update conversation preview in sidebar and move conversation to top
    setConversations((prev) => {
      const targetConv = prev.find((c) => c.id === activeConversationId);
      if (!targetConv) return prev;
      const updated = {
        ...targetConv,
        lastMessage: text,
        lastMessageAt: nowIso,
        lastMessageSenderId: currentUserId
      };
      return [updated, ...prev.filter((c) => c.id !== activeConversationId)];
    });

    // 3. Smooth scroll to bottom
    isNearBottomRef.current = true;
    setTimeout(() => scrollToBottom("smooth"), 20);

    // Keep focus without jumping the viewport
    if (textareaRef.current) {
      try {
        textareaRef.current.focus({ preventScroll: true });
      } catch {}
    }

    // 4. Send API request
    try {
      const res = await api(`/conversations/${activeConversationId}/messages`, {
        method: "POST",
        body: JSON.stringify({ content: text })
      });

      const serverMsg = res?.data?.message;
      if (serverMsg) {
        setMessages((prev) => {
          // If the socket event already added or updated this message with the real server id, remove duplicate temp
          if (prev.some((m) => m.id === serverMsg.id && m.id !== tempId)) {
            return prev.filter((m) => m.id !== tempId && m.clientTempId !== tempId);
          }
          return prev.map((m) =>
            m.id === tempId || m.clientTempId === tempId
              ? { ...serverMsg, status: "sent", clientTempId: tempId }
              : m
          );
        });
      }
    } catch (err) {
      // Mark optimistic message as failed with retry action
      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempId || m.clientTempId === tempId
            ? { ...m, status: "failed", error: err.message || "Failed to send" }
            : m
        )
      );
      setSendError(err.message || "Failed to send message. Click Retry to resend.");
    }
  }

  // Retry sending a failed message
  async function handleRetryMessage(failedMsg) {
    if (!failedMsg || !activeConversationId) return;

    setMessages((prev) =>
      prev.map((m) =>
        m.id === failedMsg.id ? { ...m, status: "sending", error: null } : m
      )
    );
    setSendError("");

    try {
      const res = await api(`/conversations/${activeConversationId}/messages`, {
        method: "POST",
        body: JSON.stringify({ content: failedMsg.content })
      });

      const serverMsg = res?.data?.message;
      if (serverMsg) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === failedMsg.id
              ? { ...serverMsg, status: "sent" }
              : m
          )
        );
      }
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === failedMsg.id
            ? { ...m, status: "failed", error: err.message || "Failed to send" }
            : m
        )
      );
      setSendError(err.message || "Failed to send message. Click Retry to resend.");
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  }

  const handleTextareaChange = (e) => {
    setMessageText(e.target.value);
    e.target.style.height = "auto";
    const nextHeight = Math.min(e.target.scrollHeight, 120);
    e.target.style.height = `${nextHeight}px`;

    // Emit typing event debounced
    if (socketRef.current && socketRef.current.connected && activeConversationId) {
      socketRef.current.emit("typing", { conversationId: activeConversationId, isTyping: true });
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        if (socketRef.current && socketRef.current.connected && activeConversationId) {
          socketRef.current.emit("typing", { conversationId: activeConversationId, isTyping: false });
        }
      }, 2000);
    }
  };

  // 5. Open/Create conversation with a specific user
  async function openConversationWithUser(targetUserId) {
    setShowNewModal(false);
    try {
      const res = await api("/conversations", {
        method: "POST",
        body: JSON.stringify({ targetUserId })
      });
      const conv = res?.data?.conversation;
      if (conv) {
        setConversations((prev) => {
          const exists = prev.find((c) => c.id === conv.id);
          if (exists) return prev;
          return [conv, ...prev];
        });
        selectConversation(conv.id);
      }
    } catch (err) {
      alert(err.message || "Could not open conversation.");
    }
  }

  // 6. Search users for "+ New Message"
  useEffect(() => {
    if (!userSearchTerm.trim() || userSearchTerm.trim().length < 2) {
      setSearchedUsers([]);
      return;
    }

    const timer = setTimeout(async () => {
      setSearchingUsers(true);
      try {
        const res = await api(`/auth/users/search?q=${encodeURIComponent(userSearchTerm.trim())}`);
        setSearchedUsers(res?.data?.users || []);
      } catch {
        setSearchedUsers([]);
      } finally {
        setSearchingUsers(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [userSearchTerm]);

  // 7. Block user in active conversation
  async function handleBlockParticipant() {
    if (!activeConv || !activeConv.otherParticipant?.id) return;
    setBlocking(true);
    try {
      await api(`/auth/block/${activeConv.otherParticipant.id}`, { method: "POST" });
      setShowBlockConfirm(false);
      // Remove conversation from active
      setConversations((prev) => prev.filter((c) => c.id !== activeConv.id));
      setActiveConversationId(null);
      setMobileShowChat(false);
      alert(`Blocked @${activeConv.otherParticipant.username}.`);
    } catch (e) {
      alert(e.message || "Failed to block user.");
    } finally {
      setBlocking(false);
    }
  }

  const activeConv = conversations.find((c) => c.id === activeConversationId);

  const filteredConversations = conversations.filter((c) => {
    if (!searchQuery.trim()) return true;
    const term = searchQuery.toLowerCase();
    const other = c.otherParticipant || {};
    return (
      (other.displayName && other.displayName.toLowerCase().includes(term)) ||
      (other.username && other.username.toLowerCase().includes(term)) ||
      (c.lastMessage && c.lastMessage.toLowerCase().includes(term))
    );
  });

  return (
    <div className="messages-layout-page">
      <div className={`messages-container ${mobileShowChat ? "mobile-show-chat" : "mobile-show-inbox"}`}>
        {/* ================================================================
            LEFT PANEL: INBOX & CONVERSATION LIST (INDEPENDENT SCROLL)
            ================================================================ */}
        <aside className="messages-inbox-panel">
          <div className="messages-inbox-header">
            <div className="d-flex align-items-center justify-content-between mb-3">
              <div className="d-flex align-items-center gap-2">
                <button
                  type="button"
                  className="btn-back-feed-icon d-md-none"
                  onClick={onBackToFeed}
                  title="Back to Feed"
                >
                  <ArrowLeft size={16} />
                </button>
                <h2 className="messages-heading">Messages</h2>
              </div>
              <button
                type="button"
                className="btn-new-message-action"
                onClick={() => {
                  setShowNewModal(true);
                  setUserSearchTerm("");
                  setSearchedUsers([]);
                }}
                title="Start a new message"
              >
                <Plus size={15} strokeWidth={2.4} />
                <span>New</span>
              </button>
            </div>

            {/* Search conversations */}
            <div className="messages-search-wrap">
              <Search size={14} className="search-icon" />
              <input
                type="text"
                className="messages-search-input"
                placeholder="Search conversations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button
                  type="button"
                  className="search-clear-btn"
                  onClick={() => setSearchQuery("")}
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>

          {/* Conversations scroll area (Strict independent scrolling) */}
          <div className="messages-inbox-list">
            {loadingInbox ? (
              <MessageInboxSkeleton />
            ) : filteredConversations.length === 0 ? (
              <div className="messages-empty-inbox text-center p-4">
                <div className="empty-icon-wrap mb-2">
                  <MessageSquare size={26} strokeWidth={1.8} />
                </div>
                <h5>No messages yet</h5>
                <p className="muted small">
                  {searchQuery ? "No conversations match your search." : "Start a private conversation with another Unfold member."}
                </p>
                {!searchQuery && (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm mt-2"
                    onClick={() => setShowNewModal(true)}
                  >
                    Start a Conversation
                  </button>
                )}
              </div>
            ) : (
              filteredConversations.map((conv) => {
                const other = conv.otherParticipant || {};
                const initial = (other.displayName || other.username || "U").slice(0, 1).toUpperCase();
                const isActive = conv.id === activeConversationId;
                const hasUnread = (conv.unreadCount || 0) > 0;

                return (
                  <button
                    key={conv.id}
                    type="button"
                    className={`conversation-item-btn ${isActive ? "active" : ""} ${hasUnread ? "has-unread" : ""}`}
                    onClick={() => selectConversation(conv.id)}
                  >
                    <div className="conv-avatar">
                      {initial}
                    </div>
                    <div className="conv-info">
                      <div className="conv-top-row">
                        <span className="conv-name">{other.displayName || other.username}</span>
                        <span className="conv-time">{formatInboxTime(conv.lastMessageAt)}</span>
                      </div>
                      <div className="conv-bottom-row">
                        <span className="conv-last-msg">
                          {getEntityId(conv.lastMessageSenderId) === getEntityId(currentUser) && "You: "}
                          {conv.lastMessage || <em className="muted">Conversation started</em>}
                        </span>
                        {hasUnread && (
                          <span className="unread-dot-badge">{conv.unreadCount}</span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* ================================================================
            RIGHT PANEL: ACTIVE CONVERSATION / CHAT
            ================================================================ */}
        <section className="messages-chat-panel">
          {activeConv ? (
            <div className="chat-viewport">
              {/* 1. FIXED CONVERSATION HEADER */}
              <header className="chat-header">
                <div className="d-flex align-items-center gap-2">
                  <button
                    type="button"
                    className="btn-back-inbox d-md-none"
                    onClick={() => setMobileShowChat(false)}
                    title="Back to inbox"
                  >
                    <ArrowLeft size={16} strokeWidth={2.2} />
                  </button>
                  <div className="chat-header-avatar">
                    {(activeConv.otherParticipant?.displayName || activeConv.otherParticipant?.username || "U").slice(0, 1).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="chat-header-name">
                      {activeConv.otherParticipant?.displayName || activeConv.otherParticipant?.username}
                    </h3>
                    <div className="chat-header-handle">
                      @{activeConv.otherParticipant?.username} · <span className="text-success">Active Member</span>
                    </div>
                  </div>
                </div>

                <div className="chat-header-actions">
                  <button
                    type="button"
                    className="btn-block-action"
                    onClick={() => setShowBlockConfirm(true)}
                    title="Block this user"
                  >
                    <UserX size={15} strokeWidth={2} />
                    <span className="d-none d-sm-inline">Block</span>
                  </button>
                </div>
              </header>

              {/* 2. INDEPENDENT MESSAGE HISTORY SCROLL AREA */}
              <div
                className="chat-messages-scroll"
                ref={chatScrollRef}
                onScroll={handleChatScroll}
              >
                {loadingMessages ? (
                  <ConversationSkeleton />
                ) : messages.length === 0 ? (
                  <div className="chat-empty-convo text-center p-4 my-auto">
                    <div className="empty-icon-wrap mb-2">
                      <Sparkles size={24} />
                    </div>
                    <h5>Say hello to {activeConv.otherParticipant?.displayName || activeConv.otherParticipant?.username}!</h5>
                    <p className="muted small">
                      This is the beginning of your private direct conversation on Unfold.
                    </p>
                  </div>
                ) : (
                  <div className="messages-list-flow">
                    {messages.map((msg, index) => {
                      const isMe = isMessageFromMe(msg, currentUser);
                      const prevMsg = index > 0 ? messages[index - 1] : null;
                      const showDateSep = !prevMsg || !isSameDay(prevMsg.createdAt, msg.createdAt);
                      const prevSenderId = getEntityId(prevMsg?.senderId || prevMsg?.sender);
                      const currentMsgSenderId = getEntityId(msg?.senderId || msg?.sender);
                      const isConsecutive =
                        prevMsg &&
                        !showDateSep &&
                        prevSenderId === currentMsgSenderId;

                      const isSending = msg.status === "sending";
                      const isFailed = msg.status === "failed";

                      return (
                        <React.Fragment key={msg.id || msg.clientTempId || index}>
                          {showDateSep && (
                            <div className="chat-date-separator">
                              <span>{formatMessageDateSeparator(msg.createdAt)}</span>
                            </div>
                          )}
                          <div
                            className={`chat-message-row ${isMe ? "me" : "them"} ${isConsecutive ? "consecutive" : ""} ${isFailed ? "failed" : ""}`}
                          >
                            {!isMe && !isConsecutive && (
                              <div className="chat-bubble-avatar">
                                {(msg.sender?.displayName || msg.sender?.username || "U").slice(0, 1).toUpperCase()}
                              </div>
                            )}
                            {!isMe && isConsecutive && (
                              <div className="chat-bubble-avatar-spacer" />
                            )}
                            <div className="chat-bubble-content">
                              <div className="chat-bubble-text">{msg.content}</div>
                              <div className="chat-bubble-footer">
                                <span className="msg-time">{formatMessageTime(msg.createdAt)}</span>
                                {isMe && (
                                  <span className="msg-status-indicator ms-1">
                                    {isSending && (
                                      <span title="Sending...">
                                        <Clock size={11} className="msg-status-icon msg-sending" />
                                      </span>
                                    )}
                                    {isFailed && (
                                      <button
                                        type="button"
                                        className="btn-retry-message"
                                        onClick={() => handleRetryMessage(msg)}
                                        title="Message failed to send. Click to retry."
                                      >
                                        <AlertCircle size={11} />
                                        <span>Retry</span>
                                      </button>
                                    )}
                                    {!isSending && !isFailed && (
                                      <span
                                        className="msg-status-checks"
                                        title={msg.read ? "Read" : "Sent"}
                                      >
                                        {msg.read ? (
                                          <CheckCheck size={12} className="msg-read-check" />
                                        ) : (
                                          <Check size={12} className="msg-sent-check" />
                                        )}
                                      </span>
                                    )}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </React.Fragment>
                      );
                    })}
                    {partnerTyping && (
                      <div className="chat-typing-row">
                        <div className="chat-typing-indicator">
                          <span className="typing-dot" />
                          <span className="typing-dot" />
                          <span className="typing-dot" />
                          <span className="typing-text ms-2">
                            {activeConv.otherParticipant?.displayName || activeConv.otherParticipant?.username || "User"} is typing...
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 3. ANCHORED COMPOSER AT BOTTOM (STABLE & NEVER SCROLLED) */}
              <footer className="chat-composer-box">
                {sendError && (
                  <div className="alert alert-danger py-1 px-2 mb-2 d-flex align-items-center justify-content-between small">
                    <span>{sendError}</span>
                    <button type="button" className="alert-close" onClick={() => setSendError("")}>
                      <X size={12} />
                    </button>
                  </div>
                )}
                <form onSubmit={handleSendMessage} className="chat-composer-form">
                  <textarea
                    ref={textareaRef}
                    className="chat-composer-textarea"
                    placeholder={`Message @${activeConv.otherParticipant?.username || "user"}... (Enter to send, Shift+Enter for newline)`}
                    rows={1}
                    value={messageText}
                    onChange={handleTextareaChange}
                    onKeyDown={handleKeyDown}
                  />
                  <button
                    type="submit"
                    className="btn-send-message"
                    disabled={!messageText.trim()}
                    title="Send message (Enter)"
                  >
                    <Send size={15} strokeWidth={2.4} />
                  </button>
                </form>
              </footer>
            </div>
          ) : (
            <div className="chat-no-selection text-center d-flex flex-column align-items-center justify-content-center h-100 p-4">
              <div className="empty-chat-icon-container mb-3">
                <MessageSquare size={36} strokeWidth={1.8} />
              </div>
              <h4>Your Direct Messages</h4>
              <p className="muted small max-w-360">
                Send private messages, share insights, and discuss ideas one-on-one with other Unfold members.
              </p>
              <button
                type="button"
                className="btn btn-primary btn-sm mt-3"
                onClick={() => setShowNewModal(true)}
              >
                <Plus size={14} strokeWidth={2.4} className="me-1" />
                <span>Start New Conversation</span>
              </button>
            </div>
          )}
        </section>
      </div>

      {/* ================================================================
          MODAL: NEW MESSAGE (USER SEARCH)
          ================================================================ */}
      {showNewModal && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="new-message-modal-card">
            <div className="modal-card-header d-flex align-items-center justify-content-between">
              <h4>New Message</h4>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setShowNewModal(false)}
              >
                <X size={16} />
              </button>
            </div>

            <div className="modal-card-body p-3">
              <div className="mb-3">
                <label className="form-label small font-weight-bold" htmlFor="user-search-input">
                  To:
                </label>
                <div className="input-group">
                  <span className="input-group-text"><Search size={14} /></span>
                  <input
                    id="user-search-input"
                    type="text"
                    className="form-control"
                    placeholder="Search by username or display name..."
                    value={userSearchTerm}
                    onChange={(e) => setUserSearchTerm(e.target.value)}
                    autoFocus
                  />
                </div>
              </div>

              <div className="user-search-results">
                {searchingUsers ? (
                  <div className="muted small py-3 text-center">Searching members...</div>
                ) : searchedUsers.length === 0 ? (
                  <div className="muted small py-3 text-center">
                    {userSearchTerm.trim().length >= 2
                      ? "No members found matching that search."
                      : "Type at least 2 characters to search for community members."}
                  </div>
                ) : (
                  <div className="d-flex flex-column gap-1">
                    {searchedUsers.map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        className="user-search-result-row d-flex align-items-center gap-3 p-2 rounded text-start"
                        onClick={() => openConversationWithUser(u.id)}
                      >
                        <div className="search-result-avatar">
                          {(u.displayName || u.username || "U").slice(0, 1).toUpperCase()}
                        </div>
                        <div className="flex-grow-1">
                          <div className="search-result-name font-weight-bold">
                            {u.displayName || u.username}
                          </div>
                          <div className="search-result-handle muted small">
                            @{u.username}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================
          MODAL: BLOCK CONFIRMATION
          ================================================================ */}
      {showBlockConfirm && activeConv && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="logout-confirm-card">
            <h4>Block @{activeConv.otherParticipant?.username}?</h4>
            <p className="muted small">
              This member will no longer be able to send you direct messages or interact with you. You can unblock them at any time in Account Settings.
            </p>
            <div className="d-flex justify-content-end gap-2 mt-4">
              <button
                type="button"
                className="btn btn-outline-secondary btn-sm"
                onClick={() => setShowBlockConfirm(false)}
                disabled={blocking}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger btn-sm"
                onClick={handleBlockParticipant}
                disabled={blocking}
              >
                {blocking ? "Blocking..." : "Block User"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
