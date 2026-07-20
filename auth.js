// ══════════════════════════════════════════════════════════════════
// AUTH — email/password signup & login via Firebase Authentication
// ══════════════════════════════════════════════════════════════════
import { auth, db } from "./firebase-config.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  doc, setDoc, getDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export let currentUser = null;
let mode = "login";

let authResolved = false;
let authWaiters = [];

export function forceLogin() {
  openModal("login");
}

export function onceAuthenticated(cb) {
  if (authResolved) cb(currentUser);
  else authWaiters.push(cb);
}

const backdrop      = document.getElementById("authBackdrop");
const authTitle     = document.getElementById("authTitle");
const authError     = document.getElementById("authError");
const usernameInput = document.getElementById("authUsername");
const usernameLabel = document.getElementById("usernameLabelWrap");
const emailInput    = document.getElementById("authEmail");
const passwordInput = document.getElementById("authPassword");
const authSubmit    = document.getElementById("authSubmit");
const switchPrompt  = document.getElementById("switchPrompt");
const switchModeBtn = document.getElementById("switchModeBtn");

const whoami     = document.getElementById("whoami");
const btnLogin   = document.getElementById("btnLogin");
const btnSignup  = document.getElementById("btnSignup");
const btnLogout  = document.getElementById("btnLogout");

// Settings auth elements
const settingsBtnLogin = document.getElementById("settingsBtnLogin");
const settingsBtnLogout = document.getElementById("settingsBtnLogout");
const settingsAuthStatus = document.getElementById("settingsAuthStatus");

function openModal(newMode) {
  mode = newMode;
  authError.textContent = "";
  authError.classList.remove("show");
  emailInput.value = "";
  passwordInput.value = "";
  usernameInput.value = "";
  if (mode === "signup") {
    authTitle.textContent = "SIGN UP";
    authSubmit.textContent = "Create Account";
    switchPrompt.textContent = "Already have an account?";
    switchModeBtn.textContent = "Log in";
    usernameInput.style.display = "block";
    usernameLabel.style.display = "block";
  } else {
    authTitle.textContent = "LOG IN";
    authSubmit.textContent = "Log In";
    switchPrompt.textContent = "Don't have an account?";
    switchModeBtn.textContent = "Sign up";
    usernameInput.style.display = "none";
    usernameLabel.style.display = "none";
  }
  backdrop.classList.remove("hidden");
}

function closeModal() { backdrop.classList.add("hidden"); }

function showError(msg) {
  authError.textContent = msg;
  authError.classList.add("show");
}

btnLogin.addEventListener("click", () => openModal("login"));
btnSignup.addEventListener("click", () => openModal("signup"));
document.getElementById("authClose").addEventListener("click", closeModal);
switchModeBtn.addEventListener("click", () => openModal(mode === "login" ? "signup" : "login"));

// ── How-to-play & settings modals ──
function wireSimpleModal(openBtnId, backdropId, closeIds) {
  const openBtn = document.getElementById(openBtnId);
  const backdrop = document.getElementById(backdropId);
  if (!openBtn || !backdrop) return;
  openBtn.addEventListener("click", () => backdrop.classList.remove("hidden"));
  closeIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("click", () => backdrop.classList.add("hidden"));
  });
}
wireSimpleModal("btnHowTo", "howToBackdrop", ["howToClose", "btnHowToBack"]);
wireSimpleModal("btnSettingsOpen", "settingsBackdrop", ["settingsClose", "btnSettingsBack"]);
wireSimpleModal("btnLeaderboardOpen", "leaderboardBackdrop", ["leaderboardClose", "btnLeaderboardBack"]);
wireSimpleModal("btnAboutDev", "aboutDevBackdrop", ["aboutDevClose", "btnAboutDevBack"]);

const footerLeaderboardLink = document.getElementById("footerLeaderboardLink");
if (footerLeaderboardLink) {
  footerLeaderboardLink.addEventListener("click", (e) => {
    e.preventDefault();
    const backdrop = document.getElementById("leaderboardBackdrop");
    if (backdrop) backdrop.classList.remove("hidden");
  });
}

btnLogout.addEventListener("click", () => signOut(auth));

authSubmit.addEventListener("click", async () => {
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  const username = usernameInput.value.trim();

  if (!email || !password) { showError("Enter an email and password."); return; }
  if (mode === "signup" && !username) { showError("Pick a kart name."); return; }

  authSubmit.disabled = true;
  try {
    if (mode === "signup") {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(cred.user, { displayName: username });
      await setDoc(doc(db, "players", cred.user.uid), {
        username,
        bestScore: 0,
        updatedAt: serverTimestamp()
      });
    } else {
      await signInWithEmailAndPassword(auth, email, password);
    }
    closeModal();
  } catch (err) {
    showError(friendlyError(err.code));
  } finally {
    authSubmit.disabled = false;
  }
});

function friendlyError(code) {
  switch (code) {
    case "auth/email-already-in-use": return "That email's already registered — try logging in.";
    case "auth/invalid-email":        return "That email doesn't look right.";
    case "auth/weak-password":        return "Password needs at least 6 characters.";
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":       return "Email or password doesn't match.";
    default:                          return "Something went wrong. Try again.";
  }
}

// Update settings UI when auth state changes
function updateSettingsAuthUI(user) {
  if (user) {
    if (settingsBtnLogin) settingsBtnLogin.style.display = "none";
    if (settingsBtnLogout) settingsBtnLogout.style.display = "inline-block";
    if (settingsAuthStatus) settingsAuthStatus.textContent = `Logged in as ${user.username || user.email || "Player"}`;
  } else {
    if (settingsBtnLogin) settingsBtnLogin.style.display = "inline-block";
    if (settingsBtnLogout) settingsBtnLogout.style.display = "none";
    if (settingsAuthStatus) settingsAuthStatus.textContent = "Not logged in";
  }
}

// Settings login button
if (settingsBtnLogin) {
  settingsBtnLogin.addEventListener("click", () => {
    document.getElementById("settingsBackdrop").classList.add("hidden");
    openModal("login");
  });
}

// Settings logout button
if (settingsBtnLogout) {
  settingsBtnLogout.addEventListener("click", async () => {
    try {
      await signOut(auth);
      document.getElementById("settingsBackdrop").classList.add("hidden");
    } catch (e) {
      console.error("Logout error:", e);
    }
  });
}

onAuthStateChanged(auth, async (user) => {
  if (user) {
    let username = user.displayName;
    let bestScore = 0;
    const snap = await getDoc(doc(db, "players", user.uid));
    if (snap.exists()) {
      username = snap.data().username || username;
      bestScore = snap.data().bestScore || 0;
    }
    username = username || "Player";
    currentUser = { uid: user.uid, username, bestScore };
    whoami.textContent = `Flying as ${username}`;
    btnLogin.style.display = "none";
    btnSignup.style.display = "none";
    btnLogout.style.display = "inline-block";

    updateSettingsAuthUI(currentUser);
    document.dispatchEvent(new CustomEvent("chippu-auth-changed", { detail: currentUser }));
    
  } else {
    currentUser = null;
    whoami.textContent = "";
    btnLogin.style.display = "inline-block";
    btnSignup.style.display = "inline-block";
    btnLogout.style.display = "none";
    
    updateSettingsAuthUI(null);
    document.dispatchEvent(new CustomEvent("chippu-auth-changed", { detail: null }));
  }
  
  if (!authResolved) {
    authResolved = true;
    authWaiters.forEach(cb => cb(currentUser));
    authWaiters = [];
  }
});