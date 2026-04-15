/* =========================================
   PULSE MESSENGER - Frontend App
   ========================================= */

const API = "";
let socket = null;
let currentUser = null;
let activeConversation = null;
let typingTimeout = null;
let conversations = [];

// Avatar color palette
const AVATAR_COLORS = [
  ["#ffc6a5"], // peach
  ["#ffb3c1"], // rose pink
  ["#cdb4db"], // muted lavender
  ["#a8dadc"], // soft teal
  ["#bde0a8"], // pistachio
  ["#ffd166"], // warm honey
  ["#f4a261"], // caramel
  ["#90caf9"], // dusty blue
];

function getAvatarColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash += name.charCodeAt(i);
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function makeAvatar(el, name) {
  const [color] = getAvatarColor(name || "?");

  el.style.background = color;
  el.style.color = "#5a4a42"; // warm brown text
  el.style.fontWeight = "600";
  el.style.borderRadius = "50%";
  el.style.display = "flex";
  el.style.alignItems = "center";
  el.style.justifyContent = "center";

  el.textContent = (name || "?")[0].toUpperCase();
}

function formatTime(date) {
  return new Date(date).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(date) {
  const d = new Date(date);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function formatPreview(msg) {
  if (!msg) return "";
  const maxLen = 36;
  return msg.content.length > maxLen
    ? msg.content.slice(0, maxLen) + "…"
    : msg.content;
}

/* ===== TOKEN / AUTH STORAGE ===== */
function getToken() {
  return localStorage.getItem("pulse_token");
}
function setToken(t) {
  localStorage.setItem("pulse_token", t);
}
function clearToken() {
  localStorage.removeItem("pulse_token");
}

/* ===== API HELPERS ===== */
async function apiFetch(path, options = {}) {
  const token = getToken();
  const res = await fetch(API + path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

/* ===== SOCKET SETUP ===== */
function initSocket() {
  socket = io({ auth: { token: getToken() } });

  socket.on("connect", () => console.log("🔌 Socket connected"));
  socket.on("connect_error", (err) =>
    console.error("Socket error:", err.message),
  );

  socket.on("message:received", (message) => {
    const senderId = message.sender._id;
    const recipientId = message.recipient._id;
    const isFromMe = senderId === currentUser._id;
    const otherId = isFromMe ? recipientId : senderId;
    const otherUser = isFromMe ? message.recipient : message.sender;

    // If viewing the conversation, append
    if (activeConversation && activeConversation._id === otherId) {
      appendMessage(message);
      scrollToBottom();
      if (!isFromMe) {
        socket.emit("messages:read", { senderId: otherId });
      }
    }

    // Update conversation list
    updateConversationPreview(otherId, otherUser, message);
  });

  socket.on("user:status", ({ userId, status }) => {
    // Update conversation list status dots
    const convItem = document.querySelector(
      `.conversation-item[data-user-id="${userId}"]`,
    );
    if (convItem) {
      const dot = convItem.querySelector(".status-dot");
      if (dot) {
        dot.className = `status-dot ${status}`;
      }
    }
    // Update active chat header
    if (activeConversation && activeConversation._id === userId) {
      const chatStatus = document.getElementById("chat-status");
      chatStatus.textContent = status;
      chatStatus.className = `chat-status ${status}`;
      activeConversation.status = status;
    }
  });

  socket.on("typing:start", ({ userId, username }) => {
    if (activeConversation && activeConversation._id === userId) {
      document.getElementById("typing-indicator").classList.remove("hidden");
      scrollToBottom();
    }
  });

  socket.on("typing:stop", ({ userId }) => {
    if (activeConversation && activeConversation._id === userId) {
      document.getElementById("typing-indicator").classList.add("hidden");
    }
  });

  socket.on("messages:read", ({ by }) => {
    if (activeConversation && activeConversation._id === by) {
      // Mark outgoing messages as read
      document
        .querySelectorAll(".message.outgoing .message-read-indicator")
        .forEach((el) => {
          el.textContent = "✓✓";
        });
    }
  });

  socket.on("message:deleted", ({ messageId }) => {
    const msgEl = document.querySelector(`[data-message-id="${messageId}"]`);
    if (msgEl) {
      const bubble = msgEl.querySelector(".message-bubble");
      if (bubble) {
        bubble.textContent = "This message was deleted";
        msgEl.classList.add("deleted");
      }
    }
  });
}

/* ===== AUTH ===== */
function showAuthScreen() {
  document.getElementById("auth-screen").classList.add("active");
  document.getElementById("app-screen").classList.remove("active");
}

function showAppScreen() {
  document.getElementById("auth-screen").classList.remove("active");
  document.getElementById("app-screen").classList.add("active");
}

async function login(email, password) {
  const data = await apiFetch("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  setToken(data.token);
  currentUser = data.user;
  await bootstrap();
}

async function register(username, email, password) {
  const data = await apiFetch("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ username, email, password }),
  });
  setToken(data.token);
  currentUser = data.user;
  await bootstrap();
}

function logout() {
  if (socket) socket.disconnect();
  clearToken();
  currentUser = null;
  activeConversation = null;
  conversations = [];
  document.getElementById("conversations-list").innerHTML = `
    <div class="empty-state">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
      <p>No conversations yet.<br/>Search for users to start chatting.</p>
    </div>`;
  showAuthScreen();
}

async function bootstrap() {
  showAppScreen();
  // Set current user UI
  makeAvatar(document.getElementById("my-avatar"), currentUser.username);
  document.getElementById("my-username").textContent = currentUser.username;
  // Init socket
  initSocket();
  // Load conversations
  await loadConversations();
}

/* ===== CONVERSATIONS ===== */
async function loadConversations() {
  try {
    const data = await apiFetch("/api/messages/conversations");
    conversations = data.conversations;
    renderConversations();
  } catch (err) {
    console.error("Failed to load conversations:", err);
  }
}

function renderConversations() {
  const list = document.getElementById("conversations-list");
  if (!conversations.length) {
    list.innerHTML = `<div class="empty-state">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
      <p>No conversations yet.<br/>Search for users to start chatting.</p>
    </div>`;
    return;
  }

  list.innerHTML = conversations
    .map(
      (conv) => `
    <div class="conversation-item ${activeConversation && activeConversation._id === conv.user._id ? "active" : ""}"
         data-user-id="${conv.user._id}">
         <div class="conv-avatar-wrapper">
          <div class="avatar" data-avatar="${conv.user.username}"></div>
          <span class="status-dot ${conv.user.status}"></span> 
         </div>
      <div class="conv-info">
        <div class="conv-name">${escapeHtml(conv.user.username)}</div>
        <div class="conv-preview">${escapeHtml(formatPreview(conv.lastMessage))}</div>
      </div>
      <div class="conv-meta">
        <span class="conv-time">${formatTime(conv.lastMessage.createdAt)}</span>
        ${conv.unreadCount > 0 ? `<span class="unread-badge">${conv.unreadCount}</span>` : ""}
      </div>
    </div>
  `,
    )
    .join("");

  // Apply avatars
  list.querySelectorAll(".avatar[data-avatar]").forEach((el) => {
    makeAvatar(el, el.dataset.avatar);
  });

  // Click handlers
  list.querySelectorAll(".conversation-item").forEach((item) => {
    item.addEventListener("click", () => {
      const userId = item.dataset.userId;
      const conv = conversations.find((c) => c.user._id === userId);
      if (conv) openConversation(conv.user);
    });
  });
}

function updateConversationPreview(userId, user, message) {
  const existing = conversations.find((c) => c.user._id === userId);
  if (existing) {
    existing.lastMessage = message;
    if (
      message.sender !== currentUser._id &&
      activeConversation?._id !== userId
    ) {
      existing.unreadCount = (existing.unreadCount || 0) + 1;
    }
    // Move to top
    conversations = [
      existing,
      ...conversations.filter((c) => c.user._id !== userId),
    ];
  } else {
    conversations.unshift({
      user: { ...user },
      lastMessage: message,
      unreadCount: message.sender._id !== currentUser._id ? 1 : 0,
    });
  }
  renderConversations();
}

/* ===== OPEN CONVERSATION ===== */
async function openConversation(user) {
  activeConversation = user;

  // Update header
  const chatAvatar = document.getElementById("chat-avatar");
  makeAvatar(chatAvatar, user.username);
  document.getElementById("chat-username").textContent = user.username;
  const statusEl = document.getElementById("chat-status");
  statusEl.textContent = user.status || "offline";
  statusEl.className = `chat-status ${user.status === "online" ? "online" : ""}`;

  // Show chat panel
  document.getElementById("chat-empty").classList.add("hidden");
  document.getElementById("chat-active").classList.remove("hidden");

  // Highlight sidebar item
  document.querySelectorAll(".conversation-item").forEach((el) => {
    el.classList.toggle("active", el.dataset.userId === user._id);
    // Clear unread badge
    if (el.dataset.userId === user._id) {
      const badge = el.querySelector(".unread-badge");
      if (badge) badge.remove();
    }
  });

  // Clear unread in data
  const conv = conversations.find((c) => c.user._id === user._id);
  if (conv) conv.unreadCount = 0;

  // Load messages
  document.getElementById("messages-list").innerHTML = "";
  await loadMessages(user._id);

  // Mark as read
  socket.emit("messages:read", { senderId: user._id });

  // Focus input
  document.getElementById("message-input").focus();
}

async function loadMessages(userId) {
  try {
    const data = await apiFetch(`/api/messages/conversation/${userId}`);
    const list = document.getElementById("messages-list");
    list.innerHTML = "";

    let lastDate = null;
    data.messages.forEach((msg) => {
      const msgDate = formatDate(msg.createdAt);
      if (msgDate !== lastDate) {
        const divider = document.createElement("div");
        divider.className = "date-divider";
        divider.textContent = msgDate;
        list.appendChild(divider);
        lastDate = msgDate;
      }
      list.appendChild(createMessageEl(msg));
    });
    scrollToBottom();
  } catch (err) {
    console.error("Failed to load messages:", err);
  }
}

function createMessageEl(msg) {
  const isOutgoing =
    msg.sender._id === currentUser._id || msg.sender === currentUser._id;
  const senderName = isOutgoing
    ? currentUser.username
    : msg.sender.username || activeConversation?.username || "";

  const wrap = document.createElement("div");
  wrap.className = `message ${isOutgoing ? "outgoing" : "incoming"}${msg.deleted ? " deleted" : ""}`;
  wrap.dataset.messageId = msg._id;

  const avatarEl = document.createElement("div");
  avatarEl.className = "avatar";
  makeAvatar(avatarEl, senderName);

  wrap.innerHTML = `
    <div class="message-inner">
      <div class="message-bubble">${escapeHtml(msg.content)}</div>
      <div class="message-time">
        ${formatTime(msg.createdAt)}
        ${isOutgoing ? `<span class="message-read-indicator">${msg.read ? "✓✓" : "✓"}</span>` : ""}
      </div>
    </div>
  `;
  // wrap.insertBefore(avatarEl, wrap.firstChild);
  return wrap;
}

function appendMessage(msg) {
  const list = document.getElementById("messages-list");

  // Date divider if needed
  const lastDivider = list.querySelector(".date-divider:last-of-type");
  const today = formatDate(msg.createdAt);
  if (!lastDivider || lastDivider.textContent !== today) {
    const divider = document.createElement("div");
    divider.className = "date-divider";
    divider.textContent = today;
    list.appendChild(divider);
  }

  list.appendChild(createMessageEl(msg));
}

function scrollToBottom() {
  const container = document.getElementById("messages-container");
  container.scrollTop = container.scrollHeight;
}

/* ===== SEND MESSAGE ===== */
function sendMessage() {
  if (!activeConversation || !socket) return;
  const input = document.getElementById("message-input");
  const content = input.value.trim();
  if (!content) return;

  socket.emit("message:send", {
    recipientId: activeConversation._id,
    content,
  });

  socket.emit("typing:stop", { recipientId: activeConversation._id });
  input.value = "";
  input.style.height = "auto";
}

/* ===== USER SEARCH ===== */
let searchDebounce = null;

async function searchUsers(query) {
  if (!query || query.length < 2) {
    document.getElementById("search-results").innerHTML = "";
    return;
  }
  try {
    const data = await apiFetch(
      `/api/users/search?q=${encodeURIComponent(query)}`,
    );
    const results = document.getElementById("search-results");

    if (!data.users.length) {
      results.innerHTML = '<div class="no-results">No users found</div>';
      return;
    }

    results.innerHTML = data.users
      .map(
        (u) => `
      <div class="search-result-item" data-user-id="${u._id}" data-username="${escapeHtml(u.username)}">
        <div class="avatar" data-avatar="${u.username}"></div>
        <div>
          <div class="username">${escapeHtml(u.username)}</div>
          <div class="email">${escapeHtml(u.email)}</div>
        </div>
      </div>
    `,
      )
      .join("");

    results
      .querySelectorAll(".avatar[data-avatar]")
      .forEach((el) => makeAvatar(el, el.dataset.avatar));

    results.querySelectorAll(".search-result-item").forEach((item) => {
      item.addEventListener("click", () => {
        const user = data.users.find((u) => u._id === item.dataset.userId);
        if (user) {
          openConversation(user);
          closeSearchPanel();
        }
      });
    });
  } catch (err) {
    console.error("Search error:", err);
  }
}

function closeSearchPanel() {
  document.getElementById("search-panel").classList.add("hidden");
  document.getElementById("user-search").value = "";
  document.getElementById("search-results").innerHTML = "";
}

/* ===== UTILS ===== */
function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* ===== INIT ===== */
document.addEventListener("DOMContentLoaded", async () => {
  // Auth tab switching
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document
        .querySelectorAll(".tab-btn")
        .forEach((b) => b.classList.remove("active"));
      document
        .querySelectorAll(".auth-form")
        .forEach((f) => f.classList.remove("active"));
      btn.classList.add("active");
      document
        .getElementById(`${btn.dataset.tab}-form`)
        .classList.add("active");
    });
  });

  // Login
  document.getElementById("login-btn").addEventListener("click", async () => {
    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;
    const errorEl = document.getElementById("login-error");
    errorEl.textContent = "";
    try {
      await login(email, password);
    } catch (err) {
      errorEl.textContent = err.message;
    }
  });

  document.getElementById("login-password").addEventListener("keydown", (e) => {
    if (e.key === "Enter") document.getElementById("login-btn").click();
  });

  // Register
  document
    .getElementById("register-btn")
    .addEventListener("click", async () => {
      const username = document.getElementById("reg-username").value.trim();
      const email = document.getElementById("reg-email").value.trim();
      const password = document.getElementById("reg-password").value;
      const errorEl = document.getElementById("register-error");
      errorEl.textContent = "";
      try {
        await register(username, email, password);
      } catch (err) {
        errorEl.textContent = err.message;
      }
    });

  document.getElementById("reg-password").addEventListener("keydown", (e) => {
    if (e.key === "Enter") document.getElementById("register-btn").click();
  });

  // Logout
  document.getElementById("logout-btn").addEventListener("click", logout);

  // Search toggle
  document.getElementById("search-toggle-btn").addEventListener("click", () => {
    const panel = document.getElementById("search-panel");
    panel.classList.toggle("hidden");
    if (!panel.classList.contains("hidden")) {
      document.getElementById("user-search").focus();
    }
  });

  // User search input
  document.getElementById("user-search").addEventListener("input", (e) => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => searchUsers(e.target.value.trim()), 300);
  });

  // Close search on Escape
  document.getElementById("user-search").addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeSearchPanel();
  });

  // Send message
  document.getElementById("send-btn").addEventListener("click", sendMessage);

  const messageInput = document.getElementById("message-input");

  messageInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // Auto-resize textarea
  messageInput.addEventListener("input", () => {
    messageInput.style.height = "auto";
    messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + "px";

    // Typing indicator
    if (activeConversation && socket) {
      socket.emit("typing:start", { recipientId: activeConversation._id });
      clearTimeout(typingTimeout);
      typingTimeout = setTimeout(() => {
        socket.emit("typing:stop", { recipientId: activeConversation._id });
      }, 1500);
    }
  });

  // Auto-login if token exists
  const token = getToken();
  if (token) {
    try {
      const data = await apiFetch("/api/auth/me");
      currentUser = data.user;
      await bootstrap();
    } catch {
      clearToken();
      showAuthScreen();
    }
  } else {
    showAuthScreen();
  }

  /* ===== PROFILE POPUP ===== */

  const profileBtn = document.getElementById("profile-btn");
  const profilePopup = document.getElementById("profile-popup");

  if (profileBtn && profilePopup) {
    profileBtn.addEventListener("click", (e) => {
      e.stopPropagation();

      profilePopup.classList.toggle("show");

      // Sync username
      document.getElementById("popup-username").textContent =
        document.getElementById("my-username").textContent;

      // Copy avatar letter + color
      const avatar = document.getElementById("popup-avatar");
      const myAvatar = document.getElementById("my-avatar");

      avatar.textContent = myAvatar.textContent;
      avatar.style.background = myAvatar.style.background;
    });

    // Close when clicking outside
    document.addEventListener("click", () => {
      profilePopup.classList.remove("show");
    });
  }
});
