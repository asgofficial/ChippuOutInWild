// ══════════════════════════════════════════════════════════════════
// LEADERBOARD — top 10 by best score, live-updating via Firestore
// ══════════════════════════════════════════════════════════════════
import { db } from "./firebase-config.js";
import {
  collection, doc, setDoc, getDoc, onSnapshot,
  query, orderBy, limit, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { currentUser } from "./auth.js";

const listEl = document.getElementById("leaderboardList");
let leaderboardVisible = true;
let lastSnapshot = null;

export function setLeaderboardVisible(visible) {
  leaderboardVisible = visible;
  const backdrop = document.getElementById("leaderboardBackdrop");
  if (backdrop) {
    backdrop.classList.toggle("hidden", !visible);
  }
}

export async function submitScoreIfBest(score) {
  if (!currentUser) return;
  const ref = doc(db, "players", currentUser.uid);
  const snap = await getDoc(ref);
  const prevBest = snap.exists() ? (snap.data().bestScore || 0) : 0;
  if (score > prevBest) {
    await setDoc(ref, {
      username: currentUser.username,
      bestScore: score,
      updatedAt: serverTimestamp()
    }, { merge: true });
  }
  return Math.max(score, prevBest);
}

function renderLeaderboard(rows) {
  if (!rows.length) {
    listEl.innerHTML = `<li class="empty-msg">No runs yet — be the first!</li>`;
    return;
  }
  listEl.innerHTML = rows.map((r, i) => {
    const mine = currentUser && r.uid === currentUser.uid;
    return `<li class="${mine ? "me" : ""}">
      <span class="name"><span class="rank">#${i + 1}</span>${escapeHtml(r.username || "Player")}</span>
      <span class="score">${r.bestScore}</span>
    </li>`;
  }).join("");
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

const q = query(collection(db, "players"), orderBy("bestScore", "desc"), limit(10));
onSnapshot(q, (snapshot) => {
  lastSnapshot = snapshot;
  const rows = [];
  snapshot.forEach(d => rows.push({ uid: d.id, ...d.data() }));
  renderLeaderboard(rows);
}, (err) => {
  listEl.innerHTML = `<li class="empty-msg">Leaderboard unavailable — check your Firebase setup.</li>`;
  console.error("Leaderboard error:", err);
});

document.addEventListener("chippu-auth-changed", () => {
  if (lastSnapshot) {
    const rows = [];
    lastSnapshot.forEach(d => rows.push({ uid: d.id, ...d.data() }));
    renderLeaderboard(rows);
  }
});