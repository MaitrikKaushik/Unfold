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
  AlertCircle
} from "lucide-react";
import { io } from "socket.io-client";
import { api } from "../services/api";
import { MessageInboxSkeleton, ConversationSkeleton } from "./Skeletons";

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
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");

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

  // 1. Initialize Socket.IO connection
  useEffect(() => {
    const socketUrl = import.meta.env.VITE_API_URL
      ? import.meta.env.VITE_API_URL.replace(/\/api.*$/, "")
      : "http://localhost:4000";

    const socket = io(socketUrl, {
      withCredentials: true,
      transports: ["websocket", "polling"]
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      // Connected
    });

    socket.on("new_message", ({ conversationId, message }) => {
      setConversations((prev) =>
        prev.map((c) =>
          c.id === conversationId
            ? {
                ...c,
                lastMessage: message.content,
                lastMessageAt: message.createdAt,
                lastMessageSenderId: message.sender?.id
              }
            : c
        )
      );

      if (conversationId === activeConversationId) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === message.id)) return prev;
          return [...prev, message];
        });

        // Only auto-scroll if user is near bottom
        if (isNearBottomRef.current) {
          setTimeout(() => scrollToBottom("smooth"), 40);
        }

        // Mark as read immediately since conversation is open
        api(`/conversations/${conversationId}/read`, { method: "POST" }).catch(() => {});
      }
    });

    socket.on("inbox_update", ({ conversationId, message }) => {
      setConversations((prev) => {
        const exists = prev.some((c) => c.id === conversationId);
        if (exists) {
          return prev.map((c) => {
            if (c.id === conversationId) {
              const inc = activeConversationId === conversationId ? 0 : 1;
              return {
                ...c,
                lastMessage: message.content,
                lastMessageAt: message.createdAt,
                lastMessageSenderId: message.sender?.id,
                unreadCount: (c.unreadCount || 0) + inc
              };
            }
            return c;
          });
        }
        // If brand new conversation initiated by someone else, reload inbox
        loadConversations();
        return prev;
      });
    });

    return () => {
      socket.disconnect();
    };
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

    // Join room via socket
    if (socketRef.current) {
      socketRef.current.emit("join_conversation", convId);
    }

    try {
      const res = await api(`/conversations/${convId}/messages`);
      setMessages(res?.data?.messages || []);
      // Mark read
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

  // 4. Send message
  async function handleSendMessage(e) {
    if (e) e.preventDefault();
    const text = messageText.trim();
    if (!text || sending || !activeConversationId) return;

    setSending(true);
    setSendError("");

    try {
      const res = await api(`/conversations/${activeConversationId}/messages`, {
        method: "POST",
        body: JSON.stringify({ content: text })
      });

      const sentMsg = res?.data?.message;
      if (sentMsg) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === sentMsg.id)) return prev;
          return [...prev, sentMsg];
        });
        setMessageText("");
        setConversations((prev) =>
          prev.map((c) =>
            c.id === activeConversationId
              ? {
                  ...c,
                  lastMessage: text,
                  lastMessageAt: new Date().toISOString(),
                  lastMessageSenderId: currentUser.id
                }
              : c
          )
        );
        // Scroll strictly inside chat container smoothly
        isNearBottomRef.current = true;
        setTimeout(() => scrollToBottom("smooth"), 20);

        // Keep focus without scrolling the window
        if (textareaRef.current) {
          try {
            textareaRef.current.focus({ preventScroll: true });
          } catch {
            // Fallback for older browsers
          }
        }
      }
    } catch (err) {
      setSendError(err.message || "Failed to send message.");
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  }

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
                          {conv.lastMessageSenderId === currentUser.id && "You: "}
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
                      const isMe = msg.isMine || msg.sender?.id === currentUser.id;
                      const prevMsg = index > 0 ? messages[index - 1] : null;
                      const showDateSep = !prevMsg || !isSameDay(prevMsg.createdAt, msg.createdAt);
                      const isConsecutive =
                        prevMsg &&
                        !showDateSep &&
                        (prevMsg.sender?.id || prevMsg.sender) === (msg.sender?.id || msg.sender);

                      return (
                        <React.Fragment key={msg.id}>
                          {showDateSep && (
                            <div className="chat-date-separator">
                              <span>{formatMessageDateSeparator(msg.createdAt)}</span>
                            </div>
                          )}
                          <div className={`chat-message-row ${isMe ? "me" : "them"} ${isConsecutive ? "consecutive" : ""}`}>
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
                                  <span className="msg-read-status ms-1" title={msg.read ? "Read" : "Delivered"}>
                                    {msg.read ? <CheckCheck size={12} /> : <Check size={12} />}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </React.Fragment>
                      );
                    })}
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
                    placeholder={`Message @${activeConv.otherParticipant?.username}... (Enter to send, Shift+Enter for newline)`}
                    rows={1}
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={sending}
                  />
                  <button
                    type="submit"
                    className="btn-send-message"
                    disabled={!messageText.trim() || sending}
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
