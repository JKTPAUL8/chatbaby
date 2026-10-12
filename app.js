import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import {
  browserLocalPersistence,
  getAuth,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import {
  addDoc,
  collection,
  getDocs,
  getFirestore,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  startAfter
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { allowedUsers, chatConfig, firebaseConfig } from "./firebase-config.js";

const loginView = document.getElementById("loginView");
const chatView = document.getElementById("chatView");
const loginForm = document.getElementById("loginForm");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const loginButton = document.getElementById("loginButton");
const loginError = document.getElementById("loginError");
const logoutButton = document.getElementById("logoutButton");
const currentUserLabel = document.getElementById("currentUserLabel");
const messagesScroller = document.getElementById("messagesScroller");
const messagesElement = document.getElementById("messages");
const emptyState = document.getElementById("emptyState");
const loadOlderWrap = document.getElementById("loadOlderWrap");
const loadOlderButton = document.getElementById("loadOlderButton");
const messageForm = document.getElementById("messageForm");
const messageInput = document.getElementById("messageInput");
const sendButton = document.getElementById("sendButton");
const connectionBanner = document.getElementById("connectionBanner");
const replyComposer = document.getElementById("replyComposer");
const replyAuthor = document.getElementById("replyAuthor");
const replyPreviewText = document.getElementById("replyPreviewText");
const cancelReplyButton = document.getElementById("cancelReplyButton");
const themeButtons = [...document.querySelectorAll(".theme-toggle")];
const themeColorMeta = document.querySelector('meta[name="theme-color"]');

let app;
let auth;
let db;
let activeUser = null;
let unsubscribeMessages = null;
let oldestCursor = null;
let hasMoreMessages = true;
let loadingOlder = false;
let initialSnapshotHandled = false;
let selectedReply = null;
const messageCache = new Map();

function configurationLooksComplete() {
  const firebaseValues = Object.values(firebaseConfig);
  const firebaseReady = firebaseValues.every(
    (value) => typeof value === "string" && value.trim() && !value.includes("PASTE_")
  );

  const usersReady =
    allowedUsers.length === 2 &&
    allowedUsers.every(
      (user) =>
        typeof user.uid === "string" &&
        user.uid.trim() &&
        !user.uid.includes("PASTE_") &&
        typeof user.name === "string" &&
        user.name.trim()
    );

  return firebaseReady && usersReady;
}

function getAllowedUser(uid) {
  return allowedUsers.find((user) => user.uid === uid) ?? null;
}

function getDisplayName(uid) {
  return getAllowedUser(uid)?.name ?? "Unknown user";
}

function showLogin(message = "") {
  loginView.classList.remove("hidden");
  chatView.classList.add("hidden");
  loginError.textContent = message;
}

function showChat() {
  loginView.classList.add("hidden");
  chatView.classList.remove("hidden");
}

function setConnectionMessage(message = "") {
  connectionBanner.textContent = message;
  connectionBanner.classList.toggle("hidden", !message);
}

function resetReply() {
  selectedReply = null;
  replyComposer.classList.add("hidden");
  replyAuthor.textContent = "Replying to";
  replyPreviewText.textContent = "";
}

function setReplyTo(message) {
  selectedReply = {
    id: message.id,
    text: message.text,
    senderId: message.senderId
  };

  replyAuthor.textContent = `Replying to ${getDisplayName(message.senderId)}`;
  replyPreviewText.textContent = message.text;
  replyComposer.classList.remove("hidden");
  messageInput.focus();
}

function resetChatState() {
  if (unsubscribeMessages) {
    unsubscribeMessages();
    unsubscribeMessages = null;
  }

  messageCache.clear();
  messagesElement.replaceChildren();
  oldestCursor = null;
  hasMoreMessages = true;
  loadingOlder = false;
  initialSnapshotHandled = false;
  loadOlderWrap.classList.add("hidden");
  emptyState.classList.add("hidden");
  setConnectionMessage("");
  resetReply();
}

function formatMessageTime(date) {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function dateKey(date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function formatDayLabel(date) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const differenceInDays = Math.round((today - target) / 86400000);

  if (differenceInDays === 0) return "Today";
  if (differenceInDays === 1) return "Yesterday";

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: target.getFullYear() !== today.getFullYear() ? "numeric" : undefined
  }).format(target);
}

function timestampToDate(timestamp) {
  if (timestamp?.toDate) return timestamp.toDate();
  return new Date();
}

function scrollToRepliedMessage(messageId) {
  const target = messagesElement.querySelector(`[data-message-id="${CSS.escape(messageId)}"]`);
  if (!target) return;

  target.scrollIntoView({ behavior: "smooth", block: "center" });
  target.classList.remove("flash");
  requestAnimationFrame(() => target.classList.add("flash"));
  window.setTimeout(() => target.classList.remove("flash"), 1100);
}

function createReplyPreview(replyTo) {
  const preview = document.createElement("button");
  preview.className = "reply-preview";
  preview.type = "button";
  preview.title = "Jump to replied message";

  const author = document.createElement("span");
  author.className = "reply-preview-author";
  author.textContent = getDisplayName(replyTo.senderId);

  const text = document.createElement("span");
  text.className = "reply-preview-text";
  text.textContent = replyTo.text;

  preview.append(author, text);
  preview.addEventListener("click", () => scrollToRepliedMessage(replyTo.id));
  return preview;
}

function renderMessages({ preserveScroll = false, forceBottom = false } = {}) {
  const previousScrollHeight = messagesScroller.scrollHeight;
  const previousScrollTop = messagesScroller.scrollTop;
  const distanceFromBottom = previousScrollHeight - previousScrollTop - messagesScroller.clientHeight;
  const wasNearBottom = distanceFromBottom < 110;

  const sortedMessages = [...messageCache.values()].sort((a, b) => {
    const aMs = timestampToDate(a.createdAt).getTime();
    const bMs = timestampToDate(b.createdAt).getTime();
    if (aMs !== bMs) return aMs - bMs;
    return a.id.localeCompare(b.id);
  });

  const fragment = document.createDocumentFragment();
  let previousDateKey = null;

  for (const message of sortedMessages) {
    const messageDate = timestampToDate(message.createdAt);
    const currentDateKey = dateKey(messageDate);

    if (currentDateKey !== previousDateKey) {
      const divider = document.createElement("div");
      divider.className = "date-divider";
      const label = document.createElement("span");
      label.textContent = formatDayLabel(messageDate);
      divider.append(label);
      fragment.append(divider);
      previousDateKey = currentDateKey;
    }

    const row = document.createElement("div");
    row.className = `message-row${message.senderId === activeUser?.uid ? " own" : ""}`;
    row.dataset.messageId = message.id;

    const bubble = document.createElement("article");
    bubble.className = "message-bubble";

    if (message.replyTo?.id && message.replyTo?.text && message.replyTo?.senderId) {
      bubble.append(createReplyPreview(message.replyTo));
    }

    const text = document.createElement("p");
    text.className = "message-text";
    text.textContent = message.text;

    const meta = document.createElement("div");
    meta.className = "message-meta";

    const replyButton = document.createElement("button");
    replyButton.className = "reply-action";
    replyButton.type = "button";
    replyButton.textContent = "Reply";
    replyButton.setAttribute("aria-label", `Reply to message from ${getDisplayName(message.senderId)}`);
    replyButton.addEventListener("click", () => setReplyTo(message));

    const time = document.createElement("span");
    time.textContent = formatMessageTime(messageDate);

    meta.append(replyButton, time);
    bubble.append(text, meta);
    row.append(bubble);
    fragment.append(row);
  }

  messagesElement.replaceChildren(fragment);
  emptyState.classList.toggle("hidden", sortedMessages.length !== 0);

  if (preserveScroll) {
    const newScrollHeight = messagesScroller.scrollHeight;
    messagesScroller.scrollTop = newScrollHeight - previousScrollHeight + previousScrollTop;
  } else if (forceBottom || wasNearBottom) {
    requestAnimationFrame(() => {
      messagesScroller.scrollTop = messagesScroller.scrollHeight;
    });
  }
}

function updateLoadOlderVisibility() {
  loadOlderWrap.classList.toggle("hidden", !hasMoreMessages || messageCache.size === 0);
}

function readSnapshotData(docSnapshot) {
  return {
    id: docSnapshot.id,
    ...docSnapshot.data({ serverTimestamps: "estimate" })
  };
}

function startRealtimeMessages() {
  resetChatState();

  const messagesRef = collection(db, "messages");
  const latestMessagesQuery = query(
    messagesRef,
    orderBy("createdAt", "desc"),
    limit(chatConfig.pageSize)
  );

  unsubscribeMessages = onSnapshot(
    latestMessagesQuery,
    { includeMetadataChanges: true },
    (snapshot) => {
      const firstLoad = !initialSnapshotHandled;

      for (const docSnapshot of snapshot.docs) {
        messageCache.set(docSnapshot.id, readSnapshotData(docSnapshot));
      }

      if (firstLoad) {
        oldestCursor = snapshot.docs.at(-1) ?? null;
        hasMoreMessages = snapshot.docs.length === chatConfig.pageSize;
        initialSnapshotHandled = true;
      }

      setConnectionMessage(
        snapshot.metadata.fromCache
          ? "Connection is unstable — showing locally available data."
          : ""
      );
      renderMessages({ forceBottom: firstLoad });
      updateLoadOlderVisibility();
    },
    (error) => {
      console.error(error);
      setConnectionMessage("Messages could not be synchronized. Check your connection and Firebase configuration.");
    }
  );
}

async function loadOlderMessages() {
  if (!oldestCursor || !hasMoreMessages || loadingOlder) return;

  loadingOlder = true;
  loadOlderButton.disabled = true;
  loadOlderButton.textContent = "Loading...";

  try {
    const olderQuery = query(
      collection(db, "messages"),
      orderBy("createdAt", "desc"),
      startAfter(oldestCursor),
      limit(chatConfig.pageSize)
    );

    const snapshot = await getDocs(olderQuery);

    for (const docSnapshot of snapshot.docs) {
      messageCache.set(docSnapshot.id, readSnapshotData(docSnapshot));
    }

    if (snapshot.docs.length > 0) {
      oldestCursor = snapshot.docs.at(-1);
    }

    if (snapshot.docs.length < chatConfig.pageSize) {
      hasMoreMessages = false;
    }

    renderMessages({ preserveScroll: true });
    updateLoadOlderVisibility();
  } catch (error) {
    console.error(error);
    setConnectionMessage("Older messages could not be loaded.");
  } finally {
    loadingOlder = false;
    loadOlderButton.disabled = false;
    loadOlderButton.textContent = "Load older messages";
  }
}

async function handleLogin(event) {
  event.preventDefault();
  loginError.textContent = "";
  loginButton.disabled = true;
  loginButton.textContent = "Signing in...";

  try {
    await signInWithEmailAndPassword(auth, emailInput.value.trim(), passwordInput.value);
    passwordInput.value = "";
  } catch (error) {
    console.error(error);
    loginError.textContent = "Incorrect email or password.";
  } finally {
    loginButton.disabled = false;
    loginButton.textContent = "Sign in";
  }
}

async function handleSendMessage(event) {
  event.preventDefault();

  const text = messageInput.value.trim();
  if (!text || !activeUser) return;

  if (text.length > chatConfig.maxMessageLength) {
    setConnectionMessage(`A message can contain up to ${chatConfig.maxMessageLength} characters.`);
    return;
  }

  sendButton.disabled = true;

  try {
    const messageData = {
      text,
      senderId: activeUser.uid,
      createdAt: serverTimestamp()
    };

    if (selectedReply) {
      messageData.replyTo = {
        id: selectedReply.id,
        text: selectedReply.text,
        senderId: selectedReply.senderId
      };
    }

    await addDoc(collection(db, "messages"), messageData);

    messageInput.value = "";
    resetReply();
    autoResizeTextarea();
    setConnectionMessage("");
    requestAnimationFrame(() => {
      messagesScroller.scrollTop = messagesScroller.scrollHeight;
    });
  } catch (error) {
    console.error(error);
    setConnectionMessage("The message could not be sent. Please try again.");
  } finally {
    sendButton.disabled = false;
    messageInput.focus();
  }
}

function autoResizeTextarea() {
  messageInput.style.height = "auto";
  messageInput.style.height = `${Math.min(messageInput.scrollHeight, 140)}px`;
}

function handleMessageKeydown(event) {
  if (event.key === "Escape" && selectedReply) {
    event.preventDefault();
    resetReply();
    return;
  }

  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    if (typeof messageForm.requestSubmit === "function") {
      messageForm.requestSubmit();
    }
  }
}

function applyTheme(theme, save = true) {
  const nextTheme = theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = nextTheme;

  if (themeColorMeta) {
    themeColorMeta.setAttribute("content", nextTheme === "dark" ? "#0d0f12" : "#f3f3f1");
  }

  for (const button of themeButtons) {
    const label = button.querySelector(".theme-label");
    if (label) label.textContent = nextTheme === "dark" ? "Light" : "Dark";
    button.setAttribute(
      "aria-label",
      nextTheme === "dark" ? "Switch to light theme" : "Switch to dark theme"
    );
  }

  if (save) {
    try {
      localStorage.setItem("chat-theme", nextTheme);
    } catch (_) {
      // Theme still works for this session even if storage is unavailable.
    }
  }
}

function toggleTheme() {
  applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
}

async function handleAuthenticatedUser(user) {
  const allowedUser = getAllowedUser(user.uid);

  if (!allowedUser) {
    await signOut(auth);
    showLogin("This account does not have access to the chat.");
    return;
  }

  activeUser = user;
  currentUserLabel.textContent = allowedUser.name;
  showChat();
  startRealtimeMessages();
  messageInput.focus();
}

async function initialize() {
  applyTheme(document.documentElement.dataset.theme, false);
  themeButtons.forEach((button) => button.addEventListener("click", toggleTheme));

  if (!configurationLooksComplete()) {
    showLogin("The site is not configured yet. Complete firebase-config.js and both user UIDs.");
    loginForm.querySelectorAll("input, button").forEach((element) => {
      element.disabled = true;
    });
    return;
  }

  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);

  try {
    await setPersistence(auth, browserLocalPersistence);
  } catch (error) {
    console.warn("Authentication persistence could not be enabled:", error);
  }

  loginForm.addEventListener("submit", handleLogin);
  logoutButton.addEventListener("click", () => signOut(auth));
  messageForm.addEventListener("submit", handleSendMessage);
  loadOlderButton.addEventListener("click", loadOlderMessages);
  cancelReplyButton.addEventListener("click", resetReply);
  messageInput.addEventListener("input", autoResizeTextarea);
  messageInput.addEventListener("keydown", handleMessageKeydown);

  onAuthStateChanged(auth, (user) => {
    if (user) {
      handleAuthenticatedUser(user);
      return;
    }

    activeUser = null;
    resetChatState();
    showLogin();
  });
}

initialize().catch((error) => {
  console.error(error);
  showLogin("An error occurred while initializing the application.");
});
