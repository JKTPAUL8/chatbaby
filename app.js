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

let app;
let auth;
let db;
let activeUser = null;
let unsubscribeMessages = null;
let oldestCursor = null;
let hasMoreMessages = true;
let loadingOlder = false;
let initialSnapshotHandled = false;
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
}

function formatMessageTime(date) {
  return new Intl.DateTimeFormat("ro-RO", {
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

  if (differenceInDays === 0) return "Astăzi";
  if (differenceInDays === 1) return "Ieri";

  return new Intl.DateTimeFormat("ro-RO", {
    day: "2-digit",
    month: "short",
    year: target.getFullYear() !== today.getFullYear() ? "numeric" : undefined
  }).format(target);
}

function timestampToDate(timestamp) {
  if (timestamp?.toDate) return timestamp.toDate();
  return new Date();
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

    const bubble = document.createElement("article");
    bubble.className = "message-bubble";

    const text = document.createElement("p");
    text.className = "message-text";
    text.textContent = message.text;

    const meta = document.createElement("div");
    meta.className = "message-meta";
    meta.textContent = formatMessageTime(messageDate);

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

      setConnectionMessage(snapshot.metadata.fromCache ? "Conexiune instabilă — se afișează datele disponibile local." : "");
      renderMessages({ forceBottom: firstLoad });
      updateLoadOlderVisibility();
    },
    (error) => {
      console.error(error);
      setConnectionMessage("Nu pot sincroniza mesajele. Verifică conexiunea și configurarea Firebase.");
    }
  );
}

async function loadOlderMessages() {
  if (!oldestCursor || !hasMoreMessages || loadingOlder) return;

  loadingOlder = true;
  loadOlderButton.disabled = true;
  loadOlderButton.textContent = "Se încarcă...";

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
    setConnectionMessage("Mesajele mai vechi nu au putut fi încărcate.");
  } finally {
    loadingOlder = false;
    loadOlderButton.disabled = false;
    loadOlderButton.textContent = "Mesaje mai vechi";
  }
}

async function handleLogin(event) {
  event.preventDefault();
  loginError.textContent = "";
  loginButton.disabled = true;
  loginButton.textContent = "Se conectează...";

  try {
    await signInWithEmailAndPassword(auth, emailInput.value.trim(), passwordInput.value);
    passwordInput.value = "";
  } catch (error) {
    console.error(error);
    loginError.textContent = "Email sau parolă incorectă.";
  } finally {
    loginButton.disabled = false;
    loginButton.textContent = "Intră";
  }
}

async function handleSendMessage(event) {
  event.preventDefault();

  const text = messageInput.value.trim();
  if (!text || !activeUser) return;

  if (text.length > chatConfig.maxMessageLength) {
    setConnectionMessage(`Mesajul poate avea maximum ${chatConfig.maxMessageLength} de caractere.`);
    return;
  }

  sendButton.disabled = true;

  try {
    await addDoc(collection(db, "messages"), {
      text,
      senderId: activeUser.uid,
      createdAt: serverTimestamp()
    });

    messageInput.value = "";
    autoResizeTextarea();
    setConnectionMessage("");
    requestAnimationFrame(() => {
      messagesScroller.scrollTop = messagesScroller.scrollHeight;
    });
  } catch (error) {
    console.error(error);
    setConnectionMessage("Mesajul nu a putut fi trimis. Încearcă din nou.");
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
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    if (typeof messageForm.requestSubmit === "function") {
      messageForm.requestSubmit();
    }
  }
}

async function handleAuthenticatedUser(user) {
  const allowedUser = getAllowedUser(user.uid);

  if (!allowedUser) {
    await signOut(auth);
    showLogin("Acest cont nu are acces la chat.");
    return;
  }

  activeUser = user;
  currentUserLabel.textContent = allowedUser.name;
  showChat();
  startRealtimeMessages();
  messageInput.focus();
}

async function initialize() {
  if (!configurationLooksComplete()) {
    showLogin("Site-ul nu este configurat încă. Completează firebase-config.js și UID-urile celor doi utilizatori.");
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
    console.warn("Persistența autentificării nu a putut fi setată:", error);
  }

  loginForm.addEventListener("submit", handleLogin);
  logoutButton.addEventListener("click", () => signOut(auth));
  messageForm.addEventListener("submit", handleSendMessage);
  loadOlderButton.addEventListener("click", loadOlderMessages);
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
  showLogin("A apărut o eroare la inițializarea aplicației.");
});
