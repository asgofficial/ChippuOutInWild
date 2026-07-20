// ══════════════════════════════════════════════════════════════════
// GAME ENGINE — Chippu Out in Wild (canvas, real sprites/sounds)
// ══════════════════════════════════════════════════════════════════
import { submitScoreIfBest } from "./leaderboard.js";
import { currentUser, forceLogin, onceAuthenticated } from "./auth.js";
import { playSfx, playMusic } from "./audio.js";
import { setLeaderboardVisible } from "./leaderboard.js";

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// MOBILE: the canvas element's width/height attributes (960x540) define the
// game's LOGIC resolution — every position/physics calc in this file is in
// those units. On phones/retina screens that backing store gets upscaled
// by the browser to fill the CSS box, which looks blurry. We fix that by
// rendering into a bigger backing store (scaled by devicePixelRatio) while
// keeping all game-logic constants (W, H, SCALE) untouched at 960x540.
const LOGIC_W = 960, LOGIC_H = 540;
const DPR = Math.min(window.devicePixelRatio || 1, 2.5);
canvas.width = LOGIC_W * DPR;
canvas.height = LOGIC_H * DPR;
ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

const W = LOGIC_W, H = LOGIC_H;
const GROUND_Y = Math.round(H * 0.82);
const SCALE = W / 960;

// MOBILE ONLY: on touch devices, keep the .game-frame element (which the
// canvas, HUD, overlays, and touch controls all sit inside) at exactly
// the 960:540 shape the game was built for, letterboxed to fit whatever
// the actual screen shape is. Desktop/PC (pointer: fine) is left alone —
// it keeps stretching to fill the whole stage edge-to-edge like before.
const stageEl = document.querySelector(".stage");
const gameFrameEl = document.querySelector(".game-frame");
const FRAME_ASPECT = LOGIC_W / LOGIC_H;
const coarsePointerMQ = window.matchMedia("(pointer: coarse)");

function isMobileLayout() {
  return coarsePointerMQ.matches;
}

function fitGameFrame() {
  if (!stageEl || !gameFrameEl) return;
  if (!isMobileLayout()) {
    // Desktop/PC: clear any inline size so the CSS full-bleed rule (100%/100%) applies.
    gameFrameEl.style.width = "";
    gameFrameEl.style.height = "";
    return;
  }
  const availW = stageEl.clientWidth;
  const availH = stageEl.clientHeight;
  if (!availW || !availH) return;
  let w = availW;
  let h = w / FRAME_ASPECT;
  if (h > availH) {
    h = availH;
    w = h * FRAME_ASPECT;
  }
  gameFrameEl.style.width = `${Math.round(w)}px`;
  gameFrameEl.style.height = `${Math.round(h)}px`;
}

fitGameFrame();
window.addEventListener("resize", fitGameFrame);
window.addEventListener("orientationchange", () => setTimeout(fitGameFrame, 60));
if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", fitGameFrame);
}
// Handles the rare case of a 2-in-1 laptop switching in/out of tablet mode.
if (coarsePointerMQ.addEventListener) {
  coarsePointerMQ.addEventListener("change", fitGameFrame);
} else if (coarsePointerMQ.addListener) {
  coarsePointerMQ.addListener(fitGameFrame); // older Safari
}

const hudScore        = document.getElementById("hudScore");
const startOverlay    = document.getElementById("startOverlay");
const pauseOverlay    = document.getElementById("pauseOverlay");
const gameOverOverlay = document.getElementById("gameOverOverlay");
const finalScoreMsg   = document.getElementById("finalScoreMsg");
const bestScoreMsg    = document.getElementById("bestScoreMsg");
const btnPause        = document.getElementById("btnPause");
const introOverlay    = document.getElementById("introOverlay");
const introVideo      = document.getElementById("introVideo");
const homeHint        = document.querySelector(".home-hint");
const statHighScore   = document.getElementById("statHighScore");
const statTotalCoins  = document.getElementById("statTotalCoins");
const statBossDefeats = document.getElementById("statBossDefeats");
let pendingStart = false;

// ── Zoom intro video to hide Gemini logo ──────────────────────────
if (introVideo) {
  introVideo.addEventListener('loadeddata', () => {
    introVideo.style.transform = 'scale(1.08)';
    introVideo.style.transformOrigin = 'center center';
  });
}

function skipIntro() {
  if (state !== "intro") return;
  introOverlay.classList.add("hidden");
  if (introVideo) introVideo.pause();
  state = "ready";
  onceAuthenticated((user) => {
    if (!user) forceLogin();
  });
}

if (introOverlay && introVideo) {
  introOverlay.addEventListener("click", skipIntro);
  introVideo.addEventListener("ended", skipIntro);
}

// ── Persistent Game State & Unlocks ────────────────────────────────
function getHighScore() { try { return Number(localStorage.getItem("chippuHighScore") || 0); } catch { return 0; } }
function saveHighScore(s) { try { localStorage.setItem("chippuHighScore", String(s)); } catch {} }
function getTotalCoins() { try { return Number(localStorage.getItem("chippuTotalCoins") || 0); } catch { return 0; } }
function saveTotalCoins(n) { try { localStorage.setItem("chippuTotalCoins", String(n)); } catch {} }
function getBossDefeats() { try { return Number(localStorage.getItem("chippuBossDefeats") || 0); } catch { return 0; } }
function saveBossDefeats(n) { try { localStorage.setItem("chippuBossDefeats", String(n)); } catch {} }

let totalCoinsCollected = getTotalCoins();
let bossDefeatCount = getBossDefeats();
let cachedHighScore = getHighScore();

function refreshProfileStatsUI() {
  if (statHighScore) statHighScore.textContent = String(getHighScore());
  if (statTotalCoins) statTotalCoins.textContent = String(totalCoinsCollected);
  if (statBossDefeats) statBossDefeats.textContent = String(bossDefeatCount);
}

// Unlocks System
let unlockedChars = JSON.parse(localStorage.getItem("chippuChars") || '["default"]');
let equippedChar = localStorage.getItem("chippuEquip") || "default";
let unlockedPowerups = JSON.parse(localStorage.getItem("chippuPowerups") || '["shield", "phaser"]');

const SHOP_CATALOG = {
  characters: [
    { id: "default", name: "Chippu", desc: "The original forest flyer.", cost: 0, icon: "bird_frames/bird_0.webp" },
    { id: "char2", name: "Crook", desc: "Rock hard mentality.", cost: 400, icon: "crook.webp" },
    { id: "char3", name: "Dory", desc: "Swift but elegant.", cost: 550, icon: "dory.webp" }
  ],
  powerups: [
    { id: "score-multiplier", name: "2x Multiplier", desc: "Doubles points for 12s.", cost: 100, icon: "2xMult.webp" },
    { id: "coin-magnet", name: "Coin Magnet", desc: "Pulls coins to you for 5s.", cost: 150, icon: "magnet.webp" },
    { id: "fire-ball", name: "Fireballs", desc: "Shoot obstacles for 3.5s.", cost: 9999999, icon: "fball.webp" }
  ]
};

// ── Asset loading ────────────────────────────────────────────────────
const IMG_DIR = "assets/img/";
function loadImage(path) {
  const img = new Image();
  img.src = IMG_DIR + path;
  return img;
}

const sprites = {
  bg:      loadImage("bg.webp"),
  log:     loadImage("log.webp"),
  logBase: loadImage("log_base.webp"),
  shield:  loadImage("shield.webp"),
  phaser:  loadImage("phaser_suit.webp"),
  coin:    loadImage("coin.webp"),
  fire:    loadImage("fire.webp"),
  "score-multiplier": loadImage("2xMult.webp"),
  "coin-magnet":      loadImage("magnet.webp"),
  "fire-ball":        loadImage("fball.webp")
};

// Character Frame dictionaries
const charFrames = {
  default: [],
  char2: [],
  char3: []
};
for (let i = 0; i < 10; i++) charFrames.default.push(loadImage(`bird_frames/bird_${i}.webp`));
for (let i = 0; i < 16; i++) charFrames.char2.push(loadImage(`crook_frames/crook_${i}.webp`));
for (let i = 0; i < 16; i++) charFrames.char3.push(loadImage(`dory_frames/dory_${i}.webp`));

function candidatePathsForBossFrame(i) {
  const padded2 = i.toString().padStart(2, '0');
  const padded3 = i.toString().padStart(3, '0');
  const bare = String(i);
  const names = [];
  for (const idx of [padded2, padded3, bare]) {
    for (const ext of ['webp', 'png']) names.push(`boss_frames/boss_frame_${idx}.${ext}`);
  }
  for (const idx of [padded2, padded3, bare]) {
    for (const ext of ['webp', 'png']) names.push(`boss_frames/boss_${idx}.${ext}`);
  }
  return names;
}

function loadImageWithFallbacks(paths, onFinalFailure) {
  const img = new Image();
  let attemptIdx = 0;
  function tryNext() {
    if (attemptIdx >= paths.length) {
      if (onFinalFailure) onFinalFailure(paths);
      return;
    }
    const path = paths[attemptIdx++];
    img.onerror = tryNext;
    img.src = IMG_DIR + path;
  }
  img.onload = () => { img.onerror = null; };
  tryNext();
  return img;
}

const bossFrames = [];
let bossFramesLoaded = false;
let bossLoadAttempts = 0;
let bossLoadFailures = 0;
for (let i = 0; i < 32; i++) {
  const paths = candidatePathsForBossFrame(i);
  const img = loadImageWithFallbacks(paths, (triedPaths) => {
    bossLoadAttempts++;
    bossLoadFailures++;
    if (bossLoadAttempts >= 32) bossFramesLoaded = bossLoadFailures === 0;
  });
  img.addEventListener("load", () => {
    bossLoadAttempts++;
    if (bossLoadAttempts >= 32) bossFramesLoaded = bossLoadFailures === 0;
  }, { once: true });
  bossFrames.push(img);
}
// Second fallback single image
const bossFallbackSingle = loadImage("boss.webp");

let logFlippedCanvas = null;
sprites.log.addEventListener("load", () => {
  logFlippedCanvas = document.createElement("canvas");
  logFlippedCanvas.width = sprites.log.width;
  logFlippedCanvas.height = sprites.log.height;
  const fctx = logFlippedCanvas.getContext("2d");
  fctx.translate(0, sprites.log.height);
  fctx.scale(1, -1);
  fctx.drawImage(sprites.log, 0, 0);
}, { once: true });

// ── Constants ────────────────────────────────────────────────────────
const GRAVITY          = 1024;
const FLAP_VELOCITY    = -256;
const BIRD_R           = 20;
const BIRD_HALF_W      = 17, BIRD_HALF_H = 12;
const PLAYER_VEL_X     = 224 * SCALE;
const PLAYER_DASH_MULT = 2;
const PIPE_W           = 65;
const PIPE_GAP_BASE    = 175;
const SPEED_BASE       = 128;
const SPEED_MAX        = 288;
const TRAP_GROWTH      = 224 * SCALE;
const TAR_LVL          = 10;

const POWERUP_DURATION = { shield: 5, phaser: 3.5, "score-multiplier": 12, "coin-magnet": 5, "fire-ball": 3.5 };

const BOSS_W = W * 0.145, BOSS_H = BOSS_W;
const ATTACK_GLOW = {
  missile: "#a5aac6", fire: "#ff5a00", net: "#8cdc8c", electric: "#00dcff",
};
const FALLBACK_TAUNTS = ["You cannot escape me!", "Predictable as ever!", "I know your every move!"];

let state = "intro";
let bird, pipes, powerups, coins, fireTrail, sparks, spikes, logs, windStreaks;
let playerProjectiles = [];
let activePowerup = null, powerupEndsAt = 0, shieldUsed = false, invulnerableUntil = 0;
let score, elapsed, powerupTimer, coinTimer, spikeTimer;
let coinCount = 0;
let rafId = null, lastTime = 0;
let bgScrollX = 0;
let shakeUntil = 0;
let diffBannerUntil = 0;
let bossDefeatedAt = null;
let boss = null, bossWarningStart = 0;
const BOSS_WARNING_DURATION = 3.5;
let stormActive = false, stormEndsAt = 0, nextStormAt = 0;
let playerProfile;
let nextLogAt = 0;
let deathAngle = 0;
let deathAlpha = 1;
let lastShootTime = 0;
let showShootPromptUntil = 0;

const keysHeld = { left: false, right: false, dash: false, shoot: false };

function randRange(a, b) { return a + Math.random() * (b - a); }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function currentSpeed()   { return Math.min(SPEED_MAX, SPEED_BASE + elapsed * 1.536 * SCALE); }
function currentGap()     { return PIPE_GAP_BASE; }

// ── Player behavior profile ────────────────────────────────────────
function makeProfile() { return { avgY: [], flapIntervals: [], lastFlapTime: 0, shieldUsedCount: 0 }; }
function recordFlap(p, t) {
  if (p.lastFlapTime > 0) { p.flapIntervals.push(t - p.lastFlapTime); if (p.flapIntervals.length > 20) p.flapIntervals.shift(); }
  p.lastFlapTime = t;
}
function recordPosition(p, y) { p.avgY.push(y); if (p.avgY.length > 120) p.avgY.shift(); }
function getAvgY(p) { return p.avgY.length ? p.avgY.reduce((a, b) => a + b, 0) / p.avgY.length : H / 2; }
function getAvgFlapInterval(p, n = 5) {
  if (!p.flapIntervals.length) return 9999;
  const r = p.flapIntervals.slice(-n);
  return r.reduce((a, b) => a + b, 0) / r.length;
}
function chooseAttack(p) {
  const w = { missile: 1, fire: 1, net: 1, electric: 1 };
  const ay = getAvgY(p), sc = p.shieldUsedCount, ai = getAvgFlapInterval(p);
  if (ay < H * 0.37) w.electric += 3;
  if (ay > H * 0.74) w.fire += 3;
  if (ay >= H * 0.37 && ay <= H * 0.74) w.missile += 2;
  if (sc >= 2) w.net += 4;
  if (ai < 600) w.missile += 3;
  if (ai > 1200) w.electric += 2;
  const pool = [];
  for (const [a, wt] of Object.entries(w)) for (let i = 0; i < wt; i++) pool.push(a);
  return pool[Math.floor(Math.random() * pool.length)];
}
function aimedSpawnY(p, bossY, bossHeight) {
  if (p.avgY.length) return clamp(getAvgY(p), 20, GROUND_Y - 20);
  return bossY + bossHeight / 2;
}

// ── GROQ API TAUNT ENGINE ──────────────────────────────────────────
async function fetchGroqTaunt(profile) {
  const ay = getAvgY(profile);
  const ai = getAvgFlapInterval(profile);
  const shields = profile.shieldUsedCount;
  
  let behavior = "flying average";
  if (ay < H * 0.35) behavior = "cowering near the ceiling";
  else if (ay > H * 0.65) behavior = "scraping the dirt at the bottom";

  if (ai < 400) behavior += ", flapping in a sheer panic";
  else if (ai > 1200) behavior += ", barely even trying to fly";

  if (shields >= 2) behavior += ", and hiding behind shields like a coward";

  const prompt = `You are 'Devastator', a giant, ruthless robot boss. The player is a tiny bird. The bird is currently ${behavior}. Give me ONE short, aggressive taunt to yell at the player. Under 10 words. No quotation marks.`;

  try {
    // Replace with your actual deployed Worker URL (shown after `wrangler deploy`)
    const response = await fetch("https://groq-taunt-proxy.chippu-dev.workers.dev", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ prompt })
    });
    if (!response.ok) throw new Error(`Proxy responded ${response.status}`);
    const data = await response.json();
    return data.choices[0].message.content.replace(/["']/g, '').trim();
  } catch (err) {
    console.error("Groq API Error:", err);
    return null;
  }
}

// ── Particle system ──────────────────────────────────────────────
function emitSparks(x, y, vxRange, vyRange, lifeRangeMs, color, count = 1, size = 3, gravity = 0.15) {
  for (let i = 0; i < count; i++) {
    sparks.push({
      x, y,
      vx: randRange(...vxRange) * 32 * SCALE, vy: randRange(...vyRange) * 32 * SCALE,
      life: randRange(...lifeRangeMs) / 1000, maxLife: 0, color, size, gravity: gravity * 32 * 32 * SCALE,
    });
    sparks[sparks.length - 1].maxLife = sparks[sparks.length - 1].life;
  }
}
function updateSparks(dt) {
  for (const p of sparks) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.gravity * dt; p.life -= dt; }
  sparks = sparks.filter(p => p.life > 0);
}
function drawSparks() {
  for (const p of sparks) {
    const frac = Math.max(0, p.life / p.maxLife);
    const r = Math.max(0.5, p.size * frac);
    ctx.globalAlpha = frac;
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }
}

// ── Player Fireball ───────────────────────────────────────────────
class PlayerFireball {
  constructor(x, y) {
    this.x = x; this.y = y; this.active = true;
    this.vx = 480 * SCALE;
  }
  update(dt) {
    this.x += this.vx * dt;
    if (this.x > W + 50) this.active = false;
  }
  draw() {
    ctx.fillStyle = "#ffaa00";
    ctx.beginPath(); ctx.arc(this.x, this.y, 8 * SCALE, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#fffff0";
    ctx.beginPath(); ctx.arc(this.x + 2 * SCALE, this.y, 4 * SCALE, 0, Math.PI * 2); ctx.fill();
  }
  rect() { return { x: this.x - 8 * SCALE, y: this.y - 8 * SCALE, w: 16 * SCALE, h: 16 * SCALE }; }
}

// ── Boss projectile ─────────────────────────────────────────────────
class BossProjectile {
  constructor(x, y, type) {
    this.x = x; this.y = y; this.type = type;
    this.active = true; this.deflected = false;
    this.seed = Math.random() * 999999;
    const S = SCALE;
    if (type === "missile") { this.vx = -256 * S; this.vy = 0; this.w = 48 * S; this.h = 20 * S; }
    else if (type === "fire") { this.vx = -352 * S; this.vy = randRange(-2, 2) * 32 * S; this.w = 32 * S; this.h = 32 * S; }
    else if (type === "net") { this.vx = -160 * S; this.vy = 0; this.w = 28 * S; this.h = 28 * S; }
    else if (type === "electric") { this.vx = -512 * S; this.vy = 0; this.w = 55 * S; this.h = 14 * S; }
  }
  update(dt) {
    this.x += this.vx * dt; this.y += this.vy * dt;
    if (this.type === "net") { this.w += 29 * SCALE * dt; this.h += 29 * SCALE * dt; this.y -= 14 * SCALE * dt; }
    if (this.type === "fire") { this.w += 16 * SCALE * dt; this.h += 16 * SCALE * dt; this.y -= 8 * SCALE * dt; }
    if (this.x < -140 || this.x > W + 140) this.active = false;
  }
  rect() { return { x: this.x, y: this.y, w: this.w, h: this.h }; }
  draw() {
    const t = performance.now();
    const cy = this.y + this.h / 2;
    if (this.type === "missile") {
      const body = this.deflected ? "#00dc00" : "#a5aab6";
      const dark = this.deflected ? "#009600" : "#6e7378";
      const nose = this.deflected ? "#00ff32" : "#d2d7e1";
      const exW = 16 * SCALE;
      const grad = ctx.createRadialGradient(this.x - exW, cy, 1, this.x - exW, cy, this.h / 2 + 4);
      grad.addColorStop(0, "rgba(255,140,0,0.7)"); grad.addColorStop(1, "rgba(255,140,0,0)");
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(this.x - exW, cy, this.h / 2 + 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#646973";
      ctx.beginPath(); ctx.moveTo(this.x, this.y); ctx.lineTo(this.x + this.h, this.y + this.h / 3); ctx.lineTo(this.x, cy); ctx.fill();
      ctx.beginPath(); ctx.moveTo(this.x, this.y + this.h); ctx.lineTo(this.x + this.h, this.y + this.h * 2 / 3); ctx.lineTo(this.x, cy); ctx.fill();
      ctx.fillStyle = body; ctx.fillRect(this.x, this.y + 3, this.w - 10, this.h - 6);
      ctx.fillStyle = dark; ctx.fillRect(this.x, this.y + 3, this.w - 10, 3);
      ctx.fillStyle = nose;
      ctx.beginPath(); ctx.moveTo(this.x + this.w - 10, this.y + 2); ctx.lineTo(this.x + this.w, cy); ctx.lineTo(this.x + this.w - 10, this.y + this.h - 2); ctx.fill();
    } else if (this.type === "fire") {
      const flicker = Math.abs(Math.sin(t / 55 + this.seed * 0.003)) * 0.35;
      const r = this.w / 2 + 4, cx = this.x + this.w / 2;
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      grad.addColorStop(0, `rgba(255,220,60,${0.9 * (1 - flicker * 0.3)})`);
      grad.addColorStop(0.5, `rgba(255,100,0,${0.55 * (1 - flicker * 0.3)})`);
      grad.addColorStop(1, "rgba(255,60,0,0)");
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    } else if (this.type === "net") {
      const spacing = Math.max(4, this.w / 6);
      ctx.strokeStyle = "rgba(180,240,180,0.8)"; ctx.lineWidth = 1;
      for (let ny = 0; ny < this.h; ny += spacing) { ctx.beginPath(); ctx.moveTo(this.x, this.y + ny); ctx.lineTo(this.x + this.w, this.y + ny); ctx.stroke(); }
      for (let nx = 0; nx < this.w; nx += spacing) { ctx.beginPath(); ctx.moveTo(this.x + nx, this.y); ctx.lineTo(this.x + nx, this.y + this.h); ctx.stroke(); }
      ctx.strokeStyle = "rgba(120,220,120,0.9)"; ctx.lineWidth = 2; ctx.strokeRect(this.x, this.y, this.w, this.h);
    } else if (this.type === "electric") {
      const nSeg = Math.max(5, Math.floor(this.w / 8));
      const segW = this.w / nSeg;
      const pts = [];
      for (let i = 0; i <= nSeg; i++) {
        const lx = this.x + i * segW;
        const ly = (i === 0 || i === nSeg) ? cy : cy + randRange(-this.h * 0.55, this.h * 0.55);
        pts.push([lx, ly]);
      }
      for (const [w2, col] of [[7, "rgba(0,180,255,0.3)"], [4, "rgba(100,230,255,0.5)"], [2, "rgba(220,255,255,0.85)"]]) {
        ctx.strokeStyle = col; ctx.lineWidth = w2;
        ctx.beginPath(); ctx.moveTo(...pts[0]);
        for (const p of pts.slice(1)) ctx.lineTo(...p);
        ctx.stroke();
      }
    }
  }
}

// ── Boss ─────────────────────────────────────────────────────────────
class Boss {
  constructor(profile) {
    this.x = W + BOSS_W * 0.6; this.entryX = W - BOSS_W - 25 * SCALE;
    this.y = GROUND_Y / 2 - BOSS_H / 2;
    this.width = BOSS_W; this.height = BOSS_H;
    this.health = 100; this.speed = 112 * SCALE;
    this.movingIn = true; this.timeAlive = 0; this.survivalTarget = 30;
    this.attackInterval = 2.5; this.attackTimer = 0;
    this.state = "idle"; this.stateTimer = 0;
    this.projectiles = [];
    this.exposedTimer = 0; this.isExposed = false;
    this.isShutdown = false; this.shutdownTimer = 0; this.justWokeUp = false;
    this.windUpActive = false; this.windUpTimer = 0;
    this.postFireFlash = 0; this.postFireCol = "#ffffff";
    this.nextAttackType = "missile"; this.justFired = false;
    this.profile = profile; this.tauntCooldown = 0;
    this.particles = []; this.entryParticles = [];
    this.bob = Math.random() * 100;
    this.taunt = ""; this.tauntUntil = 0;
  }
  emit(list, x, y, vxRange, vyRange, lifeMs, color, count, size, grav) {
    for (let i = 0; i < count; i++) {
      list.push({
        x, y, vx: randRange(...vxRange) * 32 * SCALE, vy: randRange(...vyRange) * 32 * SCALE,
        life: randRange(...lifeMs) / 1000, maxLife: 0, color, size, gravity: grav * 32 * 32 * SCALE,
      });
      list[list.length - 1].maxLife = list[list.length - 1].life;
    }
  }
  updateParticleList(list, dt) {
    for (const p of list) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.gravity * dt; p.life -= dt; }
    return list.filter(p => p.life > 0);
  }
  update(dt) {
    this.timeAlive += dt;
    if (this.isShutdown) {
      this.shutdownTimer -= dt;
      if (this.shutdownTimer <= 0) { this.isShutdown = false; this.justWokeUp = true; }
      this.particles = this.updateParticleList(this.particles, dt);
      this.entryParticles = this.updateParticleList(this.entryParticles, dt);
      return;
    }
    if (this.movingIn) {
      if (this.x > this.entryX) {
        this.x -= this.speed * dt;
        if (Math.random() < 0.7) this.emit(this.entryParticles, this.x, this.y + this.height / 2, [-8, 3], [-5, 5], [150, 380], "#ff5a00", 4, 6 * SCALE, 0.12);
      } else this.movingIn = false;
    } else {
      const t = this.timeAlive * 2.5;
      this.y = GROUND_Y / 2 - this.height / 2 + Math.sin(t) * 90 * SCALE;
      if (this.x > this.entryX) this.x = Math.max(this.entryX, this.x - 96 * SCALE * dt);

      this.attackTimer += dt;
      const remaining = this.attackInterval - this.attackTimer;
      if (remaining < 0.55 && !this.windUpActive) {
        this.windUpActive = true; this.windUpTimer = 0;
        this.nextAttackType = chooseAttack(this.profile);
      }
      if (this.windUpActive) {
        this.windUpTimer = Math.min(1, this.windUpTimer + dt / 0.55);
        const glow = ATTACK_GLOW[this.nextAttackType] || "#ffc800";
        const pulseR = Math.max(0, 90 + 30 * Math.sin(this.windUpTimer * Math.PI * 6));
        this.emit(this.particles, this.x + this.width / 2, this.y + this.height / 2,
          [-pulseR * 0.06, pulseR * 0.06], [-pulseR * 0.06, pulseR * 0.06], [80, 200], glow, 3, 4 * SCALE, 0);
      }
      if (this.attackTimer >= this.attackInterval) {
        this.triggerAttack();
        this.attackTimer = 0; this.windUpActive = false; this.windUpTimer = 0;
      }
      if (this.state !== "idle") {
        this.stateTimer -= dt;
        if (this.stateTimer <= 0) { this.state = "idle"; this.isExposed = true; this.exposedTimer = 3; }
      }
      if (this.isExposed) { this.exposedTimer -= dt; if (this.exposedTimer <= 0) this.isExposed = false; }
    }
    this.postFireFlash = Math.max(0, this.postFireFlash - dt);
    this.attackInterval = Math.max(1, 2.5 - (100 - this.health) * 0.015);
    for (const proj of this.projectiles) proj.update(dt);
    this.projectiles = this.projectiles.filter(p => p.active);
    if (this.tauntCooldown > 0) this.tauntCooldown -= dt;
    if (this.taunt && performance.now() / 1000 > this.tauntUntil) this.taunt = "";
    this.particles = this.updateParticleList(this.particles, dt);
    this.entryParticles = this.updateParticleList(this.entryParticles, dt);
  }
  takeHit(dmg) {
    this.health -= dmg;
    this.emit(this.particles, this.x + this.width / 2, this.y + this.height / 2, [-6, 6], [-7, 2], [200, 450], "#ffc800", 16, 6 * SCALE, 0.28);
  }
  
  triggerAttack() {
    this.x += 38 * SCALE;
    this.justFired = true;
    this.state = this.nextAttackType; this.stateTimer = 1;
    this.postFireFlash = 0.35; this.postFireCol = ATTACK_GLOW[this.state] || "#ffffff";
    const sx = this.x, sy = aimedSpawnY(this.profile, this.y, this.height);
    if (this.state === "missile") this.projectiles.push(new BossProjectile(sx, sy - 22 * SCALE, "missile"), new BossProjectile(sx, sy + 22 * SCALE, "missile"));
    else if (this.state === "fire") for (let i = 0; i < 8; i++) this.projectiles.push(new BossProjectile(sx, sy, "fire"));
    else if (this.state === "net") this.projectiles.push(new BossProjectile(sx, sy, "net"));
    else if (this.state === "electric") this.projectiles.push(new BossProjectile(sx, sy - 22 * SCALE, "electric"), new BossProjectile(sx, sy + 22 * SCALE, "electric"));

    if (this.tauntCooldown <= 0) {
      this.tauntCooldown = 6;
      this.taunt = "ANALYZING TARGET...";
      this.tauntUntil = performance.now() / 1000 + 3.5;
      
      fetchGroqTaunt(this.profile).then(aiTaunt => {
        if (aiTaunt) {
          this.taunt = aiTaunt;
        } else {
          this.taunt = FALLBACK_TAUNTS[Math.floor(Math.random() * FALLBACK_TAUNTS.length)];
        }
        this.tauntUntil = performance.now() / 1000 + 3.5; 
      });
    }
  }
  rect() { return { x: this.x + this.width * 0.1, y: this.y + this.height * 0.1, w: this.width * 0.8, h: this.height * 0.8 }; }
  isDefeated() { return this.timeAlive >= this.survivalTarget; }
  
  draw() {
    for (const p of this.entryParticles) drawParticle(p);
    for (const p of this.particles) drawParticle(p);

    const wu = this.windUpActive ? this.windUpTimer : 0;
    ctx.save();
    if (wu > 0.05) {
      const boost = 1 + 0.12 * Math.sin(wu * Math.PI * 5);
      const glow = ATTACK_GLOW[this.nextAttackType] || "#ffc800";
      const gr = (this.width / 2) * (1 + wu * 0.4);
      const grad = ctx.createRadialGradient(this.x + this.width / 2, this.y + this.height / 2, 0, this.x + this.width / 2, this.y + this.height / 2, gr);
      grad.addColorStop(0, glow + "cc"); grad.addColorStop(1, glow + "00");
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(this.x + this.width / 2, this.y + this.height / 2, gr, 0, Math.PI * 2); ctx.fill();
      this.drawBody(boost);
    } else if (this.postFireFlash > 0) {
      const frac = this.postFireFlash / 0.35;
      ctx.globalAlpha = 0.5 + 0.5 * (1 - frac);
      this.drawBody(1, this.postFireCol, frac);
      ctx.globalAlpha = 1;
    } else {
      this.drawBody(1);
    }
    ctx.restore();

    for (const proj of this.projectiles) proj.draw();

    ctx.fillStyle = "#c80000"; ctx.fillRect(this.x, this.y - 18 * SCALE, this.width, 10 * SCALE);
    ctx.fillStyle = "#00c800"; ctx.fillRect(this.x, this.y - 18 * SCALE, this.width * Math.max(0, this.health) / 100, 10 * SCALE);
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 1; ctx.strokeRect(this.x, this.y - 18 * SCALE, this.width, 10 * SCALE);

    if (this.isExposed) {
      if (Math.floor(performance.now() / 200) % 2 === 0) {
        ctx.font = `bold ${14 * SCALE}px monospace`; ctx.fillStyle = "#3f3";
        ctx.textAlign = "center";
        ctx.fillText("DASH TO ATTACK!", this.x + this.width / 2, this.y - 22 * SCALE);
      }
    }

    if (this.taunt) {
      ctx.font = `${18 * SCALE}px 'BossFont', monospace`;
      const tw = ctx.measureText(this.taunt).width;
      const tx = clamp(this.x - 20, 10, W - tw - 16);
      const ty = Math.max(30 * SCALE, this.y - 25 * SCALE);
      
      ctx.fillStyle = "rgba(0,0,0,0.85)"; 
      roundRect(tx - 8, ty - 20, tw + 16, 28, 6 * SCALE);
      ctx.fill();
      
      ctx.fillStyle = "#ff5050"; 
      ctx.textAlign = "left"; 
      ctx.fillText(this.taunt, tx, ty);
    }
  }
  
  drawBody(boost, tintCol, tintFrac) {
    const w = this.width * boost, h = this.height * boost;
    const x = this.x - (w - this.width) / 2, y = this.y - (h - this.height) / 2;
    const t = performance.now() / 400 + this.bob;
    
    const frameIdx = Math.floor((elapsed * 24) % bossFrames.length);
    const frame = bossFrames[frameIdx];
    const useFrame = !!(frame && frame.complete && frame.naturalWidth > 0);
    const useFallbackImg = !!(bossFallbackSingle && bossFallbackSingle.complete && bossFallbackSingle.naturalWidth > 0);

    if (useFrame) {
      ctx.save();
      ctx.drawImage(frame, x, y, w, h);
      if (tintCol && tintFrac > 0) {
        ctx.globalCompositeOperation = "source-atop";
        ctx.fillStyle = tintCol; ctx.globalAlpha = tintFrac * 0.6; ctx.fillRect(x, y, w, h);
      }
      ctx.restore();
      if (this.isExposed) {
        ctx.fillStyle = "#3f3";
        ctx.beginPath(); ctx.ellipse(x + w / 2, y + h * 0.28, w * 0.22, h * 0.09, 0, 0, Math.PI * 2); ctx.fill();
      }
      
    } else if (useFallbackImg) {
      ctx.save();
      const hoverY = y + Math.sin(elapsed * 2) * 10 * SCALE;
      const breathW = w * (1 + Math.sin(elapsed * 4) * 0.02);
      const breathH = h * (1 - Math.sin(elapsed * 4) * 0.02);
      const bx = x + (w - breathW) / 2;
      ctx.drawImage(bossFallbackSingle, bx, hoverY, breathW, breathH);

      if (tintCol && tintFrac > 0) {
        ctx.globalCompositeOperation = "source-atop";
        ctx.fillStyle = tintCol; ctx.globalAlpha = tintFrac * 0.6; ctx.fillRect(bx, hoverY, breathW, breathH);
      }
      ctx.restore();
      
      // Core glow pulsing Red (danger) or Green (vulnerable window)
      const coreCol = this.isExposed ? "#3f3" : "#ff3030";
      const coreX = bx + breathW / 2;
      const coreY = hoverY + breathH * 0.45; 
      const glowR = breathW * 0.15 * (1 + 0.1 * Math.sin(t * 5));
      
      const grad = ctx.createRadialGradient(coreX, coreY, 0, coreX, coreY, glowR * 2);
      grad.addColorStop(0, coreCol);
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(coreX, coreY, glowR * 2, 0, Math.PI*2); ctx.fill();

    } else {
      ctx.save();
      ctx.fillStyle = tintCol ? blendColor("#2a2f3a", tintCol, (tintFrac ?? 0) * 0.7) : "#2a2f3a";
      roundRect(x, y, w, h, 14 * SCALE);
      ctx.fill();
      ctx.strokeStyle = "#0d0f14"; ctx.lineWidth = 3 * SCALE; ctx.stroke();
      
      ctx.fillStyle = "#3a3f4a";
      roundRect(x - w*0.2, y + h*0.15, w*0.2, h*0.3, 6 * SCALE);
      ctx.fill();
      roundRect(x + w, y + h*0.15, w*0.2, h*0.3, 6 * SCALE);
      ctx.fill();
      
      const coreX = x + w / 2, coreY = y + h * 0.35, coreR = w * 0.18;
      ctx.fillStyle = "#111";
      ctx.beginPath(); ctx.ellipse(coreX, coreY, coreR*1.3, coreR*1.1, 0, 0, Math.PI*2); ctx.fill();
      
      // Fixed core colors
      const coreCol = this.isExposed ? "#3f3" : "#ff3030";
      ctx.fillStyle = coreCol;
      ctx.beginPath(); ctx.arc(coreX + coreR*0.3, coreY, coreR*0.45, 0, Math.PI*2); ctx.fill();
      
      const glowX = x + w/2, glowY = y + h*0.7, glowR = w*0.13;
      const grad = ctx.createRadialGradient(glowX, glowY, 0, glowX, glowY, glowR*2);
      grad.addColorStop(0, coreCol);
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(glowX, glowY, glowR*2, 0, Math.PI*2); ctx.fill();
      
      ctx.strokeStyle = "#0d0f14"; ctx.lineWidth = 2 * SCALE;
      for (let i = -1; i <= 1; i+=2) {
        ctx.beginPath();
        ctx.moveTo(x + w/2 + i*w*0.2, y + h*0.5);
        ctx.lineTo(x + w/2 + i*w*0.2, y + h*0.85);
        ctx.stroke();
      }
      ctx.restore();
    }
  }
}

function drawParticle(p) {
  const frac = Math.max(0, p.life / p.maxLife);
  ctx.globalAlpha = frac;
  ctx.fillStyle = p.color;
  ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0.5, p.size * frac), 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function blendColor(baseHex, tintHex, amt) {
  const b = hexToRgb(baseHex), t = hexToRgb(tintHex);
  const r = Math.round(b.r + (t.r - b.r) * amt), g = Math.round(b.g + (t.g - b.g) * amt), bl = Math.round(b.b + (t.b - b.b) * amt);
  return `rgb(${r},${g},${bl})`;
}

function hexToRgb(hex) {
  const n = parseInt(hex.replace("#", ""), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

// ── Pipes ────────────────────────────────────────────────────────────
function makePipe(startX) {
  const x = startX ?? (W + PIPE_W);
  if (score >= 2 && Math.random() > 0.7) {
    const isUp = Math.random() < 0.5;
    const h = randRange(130, 190) * SCALE;
    return { x, type: isUp ? "upper" : "lower", topH: isUp ? h : 0, botH: isUp ? 0 : h,
      targetTopH: isUp ? h : 0, targetBotH: isUp ? 0 : h, triggered: false, scored: false, destroyed: false };
  }
  const gap = currentGap();
  const gapY = randRange(80 + gap / 2, GROUND_Y - 80 - gap / 2);
  const topH = gapY - gap / 2, botH = GROUND_Y - (gapY + gap / 2);
  return { x, type: "pair", topH, botH, targetTopH: topH, targetBotH: botH, triggered: false, scored: false, destroyed: false };
}
function pipeHits(p) {
  if (p.destroyed) return false;
  const withinX = bird.x + BIRD_R > p.x && bird.x - BIRD_R < p.x + PIPE_W;
  if (!withinX) return false;
  if (p.topH > 0 && bird.y - BIRD_R < p.topH) return true;
  if (p.botH > 0 && bird.y + BIRD_R > GROUND_Y - p.botH) return true;
  return false;
}
function rectHitsPipe(r, p) {
  if (p.destroyed) return false;
  const withinX = r.x + r.w > p.x && r.x < p.x + PIPE_W;
  if (!withinX) return false;
  if (p.topH > 0 && r.y < p.topH) return true;
  if (p.botH > 0 && r.y + r.h > GROUND_Y - p.botH) return true;
  return false;
}

// ── Safe-x helper ──────────────────────────────────────────────────
function getSafeX(startX, itemWidth = 40, safeGap = 100) {
  let x = startX;
  for (let guard = 0; guard < 40; guard++) {
    let conflict = false;
    for (const p of pipes) {
      if (p.destroyed) continue;
      const l = p.x - safeGap, r = p.x + PIPE_W + safeGap;
      if (x <= r && x + itemWidth >= l) { x = r + 1; conflict = true; break; }
    }
    if (conflict) continue;
    for (const pu of powerups) {
      const l = pu.x - safeGap, r = pu.x + 40 + safeGap;
      if (x <= r && x + itemWidth >= l) { x = r + 1; conflict = true; break; }
    }
    if (conflict) continue;
    for (const c of coins) {
      const l = c.x - safeGap, r = c.x + 26 + safeGap;
      if (x <= r && x + itemWidth >= l) { x = r + 1; conflict = true; break; }
    }
    if (conflict) continue;
    for (const s of spikes) {
      const l = s.x - safeGap, r = s.x + 26 + safeGap;
      if (x <= r && x + itemWidth >= l) { x = r + 1; conflict = true; break; }
    }
    if (conflict) continue;
    return x;
  }
  return x;
}

// ── Reset ────────────────────────────────────────────────────────────
function resetGame() {
  bird = { x: W * 0.2, y: H * 0.45, vy: 0, angle: 0 };
  pipes = [makePipe(W + 10), makePipe(W + 10 + W / 2)];
  powerups = []; coins = []; fireTrail = []; sparks = []; spikes = []; logs = []; windStreaks = [];
  playerProjectiles = [];
  score = 0; elapsed = 0;
  powerupTimer = randRange(4, 7);
  coinTimer = randRange(2.5, 4.5);
  spikeTimer = Infinity;
  activePowerup = null; powerupEndsAt = 0; shieldUsed = false; invulnerableUntil = 0;
  coinCount = 0;
  bgScrollX = 0;
  shakeUntil = 0; diffBannerUntil = 0;
  bossDefeatedAt = null; boss = null;
  stormActive = false; stormEndsAt = 0; nextStormAt = randRange(15, 35);
  playerProfile = makeProfile();
  nextLogAt = 0;
  lastShootTime = 0;
  showShootPromptUntil = 0;
  cachedHighScore = getHighScore();
  hudScore.textContent = "0";
}

// ── Input ────────────────────────────────────────────────────────────
function flap() {
  if (state === "playing" || state === "bossWarning") {
    bird.vy = FLAP_VELOCITY;
    playSfx("svoosh");
    if (state === "playing") recordFlap(playerProfile, elapsed * 1000);
  }
}
canvas.addEventListener("mousedown", flap);
canvas.addEventListener("touchstart", (e) => { e.preventDefault(); flap(); }, { passive: false });
function isTypingInField(e) {
  const tag = e.target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || e.target.isContentEditable;
}

window.addEventListener("keydown", (e) => {
  if (isTypingInField(e)) return;
  if (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW") { e.preventDefault(); flap(); }
  if (e.code === "ArrowLeft" || e.code === "KeyA") keysHeld.left = true;
  if (e.code === "ArrowRight" || e.code === "KeyD") keysHeld.right = true;
  if (e.code === "ShiftLeft" || e.code === "ShiftRight" || e.code === "ControlRight") { e.preventDefault(); keysHeld.dash = true; }
  if (e.code === "ArrowDown" || e.code === "KeyS") { e.preventDefault(); keysHeld.shoot = true; }
  if (e.code === "Escape") togglePause();
});
window.addEventListener("keyup", (e) => {
  if (isTypingInField(e)) return;
  if (e.code === "ArrowLeft" || e.code === "KeyA") keysHeld.left = false;
  if (e.code === "ArrowRight" || e.code === "KeyD") keysHeld.right = false;
  if (e.code === "ShiftLeft" || e.code === "ShiftRight" || e.code === "ControlRight") keysHeld.dash = false;
  if (e.code === "ArrowDown" || e.code === "KeyS") keysHeld.shoot = false;
});

// ── Mobile touch controls (move / dash / shoot) ─────────────────────
// Mirrors the keyboard handlers above via the same keysHeld object, so
// every downstream mechanic (dash-to-defeat-boss, fireball shooting,
// left/right movement) works identically whether driven by keyboard or
// these on-screen buttons.
const touchControls = document.getElementById("touchControls");
function bindTouchBtn(id, onPress, onRelease) {
  const el = document.getElementById(id);
  if (!el) return;
  const press = (e) => { e.preventDefault(); el.classList.add("pressed"); onPress(); };
  const release = (e) => { if (e) e.preventDefault(); el.classList.remove("pressed"); onRelease(); };
  el.addEventListener("touchstart", press, { passive: false });
  el.addEventListener("touchend", release, { passive: false });
  el.addEventListener("touchcancel", release, { passive: false });
  // Fallback for touch-capable laptops / hybrid devices using mouse events
  el.addEventListener("mousedown", press);
  el.addEventListener("mouseup", release);
  el.addEventListener("mouseleave", release);
}
bindTouchBtn("btnTouchLeft", () => { keysHeld.left = true; }, () => { keysHeld.left = false; });
bindTouchBtn("btnTouchRight", () => { keysHeld.right = true; }, () => { keysHeld.right = false; });
bindTouchBtn("btnTouchDash", () => { keysHeld.dash = true; }, () => { keysHeld.dash = false; });
bindTouchBtn("btnTouchShoot", () => { keysHeld.shoot = true; }, () => { keysHeld.shoot = false; });

function setTouchControlsVisible(visible) {
  if (!touchControls) return;
  touchControls.classList.toggle("hidden", !visible);
}

document.getElementById("btnPlay").addEventListener("click", startGame);
document.getElementById("btnRetry").addEventListener("click", startGame);
document.getElementById("btnBackHome").addEventListener("click", backToMenu);
document.getElementById("btnPauseMenu").addEventListener("click", backToMenu);
btnPause.addEventListener("click", togglePause);
document.getElementById("btnResume").addEventListener("click", togglePause);

// ── Settings & Auth Handlers ───────────────────────────────────────
if (settingsBtnLogin) settingsBtnLogin.addEventListener("click", () => { document.getElementById("settingsBackdrop").classList.add("hidden"); forceLogin(); });
if (settingsBtnLogout) settingsBtnLogout.addEventListener("click", async () => {
  try {
    const { signOut } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js");
    const { auth } = await import("./firebase-config.js");
    await signOut(auth);
    document.getElementById("settingsBackdrop").classList.add("hidden");
  } catch (e) { console.error("Logout error:", e); }
});

document.addEventListener("chippu-auth-changed", (e) => {
  const user = e.detail;
  if (settingsBtnLogin) settingsBtnLogin.style.display = user ? "none" : "inline-block";
  if (settingsBtnLogout) settingsBtnLogout.style.display = user ? "inline-block" : "none";
  if (settingsAuthStatus) settingsAuthStatus.textContent = user ? `Logged in as ${user.username || "Player"}` : "Not logged in";
  if (homeHint) homeHint.textContent = user ? "Click, tap, or press Space to flap" : "Log in or sign up to play";

  const playBtn = document.getElementById("btnPlay");
  if (playBtn) {
    playBtn.classList.toggle("locked", !user);
    playBtn.title = user ? "" : "Sign up or log in to play";
  }

  // If the player tried to hit Play before logging in, resume straight
  // into the game the moment login/signup succeeds instead of making
  // them tap Play a second time.
  if (user && pendingStart) {
    pendingStart = false;
    startGame();
  }
});

// ── Game State Management ──────────────────────────────────────────
function startGame() {
  // Sign up/login is mandatory before playing, on every device — this runs
  // whether Play was clicked/tapped or triggered by keyboard/touch, since
  // it's the single entry point for starting a run.
  if (!currentUser) { pendingStart = true; forceLogin(); return; }
  pendingStart = false;
  resetGame();
  playSfx("start"); playMusic("game");
  startOverlay.classList.add("hidden"); gameOverOverlay.classList.add("hidden"); pauseOverlay.classList.add("hidden");
  btnPause.classList.remove("hidden");
  setLeaderboardVisible(false);
  state = "playing";
  setTouchControlsVisible(true);
  lastTime = performance.now();
  if (rafId) cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(loop);
}

function backToMenu() {
  cancelAnimationFrame(rafId);
  gameOverOverlay.classList.add("hidden"); pauseOverlay.classList.add("hidden"); startOverlay.classList.remove("hidden");
  btnPause.classList.add("hidden");
  setLeaderboardVisible(false);
  state = "ready";
  setTouchControlsVisible(false);
  playMusic("home");
  refreshProfileStatsUI();
  updateShopUI();
}

async function showGameOverScreen() {
  state = "dead";
  cancelAnimationFrame(rafId);
  btnPause.classList.add("hidden");
  setLeaderboardVisible(false);
  setTouchControlsVisible(false);
  
  if (score > cachedHighScore) { saveHighScore(score); refreshProfileStatsUI(); }
  
  // Save coins from this run to the persistent wallet
  if (coinCount > 0) {
    totalCoinsCollected += coinCount;
    saveTotalCoins(totalCoinsCollected);
    refreshProfileStatsUI();
  }

  finalScoreMsg.textContent = `${score}`;
  bestScoreMsg.textContent = currentUser ? "Saving your run…" : "Log in to save runs to the leaderboard.";
  gameOverOverlay.classList.remove("hidden");
  if (currentUser) {
    try {
      const best = await submitScoreIfBest(score);
      bestScoreMsg.textContent = `Personal best: ${best}`;
    } catch (e) {
      bestScoreMsg.textContent = "Couldn't reach the leaderboard.";
      console.error(e);
    }
  }
}

function togglePause() {
  if (state === "playing" || state === "bossWarning") {
    state = "paused";
    pauseOverlay.classList.remove("hidden");
    setLeaderboardVisible(false);
    setTouchControlsVisible(false);
  } else if (state === "paused") {
    state = "playing";
    pauseOverlay.classList.add("hidden");
    setLeaderboardVisible(false);
    setTouchControlsVisible(true);
    lastTime = performance.now();
    rafId = requestAnimationFrame(loop);
  }
}

function endGame() {
  if (state === "dying") return;
  state = "dying";
  deathAngle = bird.angle;
  deathAlpha = 1;
  playSfx("die");
  playMusic("home");
  btnPause.classList.add("hidden");
  setTouchControlsVisible(false);
}

function updateDying(dt) {
  deathAngle += 6.7 * dt;
  deathAlpha = Math.max(0, deathAlpha - 1.0 * dt);
  bird.vy += GRAVITY * dt;
  bird.y += bird.vy * dt;
  if (bird.y > GROUND_Y - BIRD_R) bird.y = GROUND_Y - BIRD_R;
  if (deathAlpha <= 0) showGameOverScreen();
}

function handleShieldHit() {
  if (activePowerup === "shield" && !shieldUsed) {
    shieldUsed = true; activePowerup = null; invulnerableUntil = elapsed + 1;
    playSfx("flap"); return true;
  }
  playSfx("die"); return false;
}

// ── Out-of-Game Shop Handlers ─────────────────────────────────────
const shopBackdrop = document.getElementById("shopBackdrop");
const btnShopHome = document.getElementById("btnShopHome");
const btnShopBack = document.getElementById("btnShopBack");
const shopClose = document.getElementById("shopClose");
const shopCoinBalance = document.getElementById("shopCoinBalance");
const shopCharactersGrid = document.getElementById("shopCharactersGrid");
const shopPowerupsGrid = document.getElementById("shopPowerupsGrid");

function openShop() {
  updateShopUI();
  shopBackdrop.classList.remove("hidden");
}
function closeShop() { shopBackdrop.classList.add("hidden"); }

btnShopHome.addEventListener("click", openShop);
btnShopBack.addEventListener("click", closeShop);
shopClose.addEventListener("click", closeShop);

function buyItem(itemType, id, cost) {
  if (totalCoinsCollected >= cost) {
    totalCoinsCollected -= cost;
    saveTotalCoins(totalCoinsCollected);
    
    if (itemType === "character") {
      unlockedChars.push(id);
      localStorage.setItem("chippuChars", JSON.stringify(unlockedChars));
      equippedChar = id;
      localStorage.setItem("chippuEquip", equippedChar);
    } else {
      unlockedPowerups.push(id);
      localStorage.setItem("chippuPowerups", JSON.stringify(unlockedPowerups));
    }
    
    playSfx("point");
    updateShopUI();
    refreshProfileStatsUI();
  } else {
    playSfx("die"); // Error sound
  }
}

function equipItem(id) {
  equippedChar = id;
  localStorage.setItem("chippuEquip", equippedChar);
  playSfx("svoosh");
  updateShopUI();
}

function updateShopUI() {
  shopCoinBalance.textContent = totalCoinsCollected;
  
  shopCharactersGrid.innerHTML = SHOP_CATALOG.characters.map(item => {
    const isUnlocked = unlockedChars.includes(item.id);
    const isEquipped = equippedChar === item.id;
    let btnHtml = "";
    if (isEquipped) {
      btnHtml = `<button class="cta-btn small ghost" disabled style="opacity:0.5;">Equipped</button>`;
    } else if (isUnlocked) {
      btnHtml = `<button class="cta-btn small" onclick="window.equipShopItem('${item.id}')">Equip</button>`;
    } else {
      const canAfford = totalCoinsCollected >= item.cost;
      btnHtml = `<button class="cta-btn small ${canAfford ? '' : 'ghost'}" ${canAfford ? '' : 'disabled'} 
                  onclick="window.buyShopItem('character', '${item.id}', ${item.cost})">Buy (${item.cost})</button>`;
    }
    return `
      <div class="shop-item ${isEquipped ? 'equipped' : ''}">
        <img src="assets/img/${item.icon}" class="shop-item-icon" />
        <div>
          <h4>${item.name}</h4>
          <p>${item.desc}</p>
        </div>
        ${btnHtml}
      </div>`;
  }).join("");

  shopPowerupsGrid.innerHTML = SHOP_CATALOG.powerups.map(item => {
    const isUnlocked = unlockedPowerups.includes(item.id);
    let btnHtml = "";
    if (isUnlocked) {
      btnHtml = `<button class="cta-btn small ghost" disabled style="opacity:0.5;">Unlocked</button>`;
    } else {
      const canAfford = totalCoinsCollected >= item.cost;
      btnHtml = `<button class="cta-btn small ${canAfford ? '' : 'ghost'}" ${canAfford ? '' : 'disabled'} 
                  onclick="window.buyShopItem('powerup', '${item.id}', ${item.cost})">Buy (${item.cost})</button>`;
    }
    return `
      <div class="shop-item ${isUnlocked ? 'equipped' : ''}">
        <img src="assets/img/${item.icon}" class="shop-item-icon" />
        <div>
          <h4>${item.name}</h4>
          <p>${item.desc}</p>
        </div>
        ${btnHtml}
      </div>`;
  }).join("");
}

// Expose functions to window for inline onclick HTML execution
window.buyShopItem = buyItem;
window.equipShopItem = equipItem;

// ── Update ───────────────────────────────────────────────────────────
function update(dt) {
  elapsed += dt;
  const speed = currentSpeed();
  bgScrollX -= speed * 0.35 * dt;

  let moveSpeed = PLAYER_VEL_X;
  if (keysHeld.dash) moveSpeed *= PLAYER_DASH_MULT;

  if (keysHeld.left) {
    bird.x = Math.max(0, bird.x - moveSpeed * dt);
  } else if (keysHeld.right) {
    bird.x = Math.min(W - 40, bird.x + moveSpeed * dt);
  } else if (keysHeld.dash) {
    bird.x = Math.min(W - 40, bird.x + moveSpeed * dt);
  } else {
    const targetX = W * 0.2;
    if (bird.x > targetX + 1) bird.x -= (PLAYER_VEL_X * 0.3) * dt;
    else if (bird.x < targetX - 1) bird.x += (PLAYER_VEL_X * 0.3) * dt;
  }

  bird.vy += GRAVITY * dt;
  bird.y  += bird.vy * dt;
  bird.angle = Math.max(-0.5, Math.min(1.1, bird.vy / 600));
  if (bird.y - BIRD_R < 0) { bird.y = BIRD_R; bird.vy = 0; }

  recordPosition(playerProfile, bird.y);
  
  // Powerup Mechanics Loop
  if (activePowerup && elapsed > powerupEndsAt) activePowerup = null;

  if (activePowerup === "coin-magnet") {
    for (const c of coins) {
      const dx = bird.x - c.x; const dy = bird.y - c.y;
      const dist = Math.sqrt(dx*dx + dy*dy);
      if (dist < 250 * SCALE) {
        c.x += (dx / dist) * 450 * SCALE * dt;
        c.y += (dy / dist) * 450 * SCALE * dt;
      }
    }
  }

  if (activePowerup === "fire-ball" && keysHeld.shoot && elapsed > lastShootTime + 1.0) {
    playerProjectiles.push(new PlayerFireball(bird.x + BIRD_R, bird.y));
    lastShootTime = elapsed;
    playSfx("flap");
  }

  for (const proj of playerProjectiles) {
    proj.update(dt);
    if (!proj.active) continue;
    
    let hitCount = 0;
    
    for (let p of pipes) {
      if (rectHitsPipe(proj.rect(), p)) { 
        p.destroyed = true; 
        hitCount++; 
        emitSparks(proj.x, proj.y, [-2, 2], [-2, 2], [100, 300], "#ffaa00", 5, 4 * SCALE, 0.1); 
      }
    }
    for (let s of spikes) {
      if (s.state !== "waiting" && rectsOverlap(proj.rect(), { x: s.x, y: s.y, w: 26*SCALE, h: 80*SCALE })) {
        s.y = H + 100; hitCount++; emitSparks(proj.x, proj.y, [-2, 2], [-2, 2], [100, 300], "#a0a0b4", 5, 4 * SCALE, 0.1);
      }
    }
    for (let l of logs) {
      if (rectsOverlap(proj.rect(), { x: l.x - 30*SCALE, y: l.y - 12*SCALE, w: 60*SCALE, h: 24*SCALE })) {
        l.x = -100; hitCount++; emitSparks(proj.x, proj.y, [-2, 2], [-2, 2], [100, 300], "#6B4226", 5, 4 * SCALE, 0.1);
      }
    }
    if (boss && !boss.isShutdown && rectsOverlap(proj.rect(), boss.rect())) {
      // Damages the boss for 3 health points. Total boss health is 100.
      boss.takeHit(3); hitCount++;
      if (boss.health <= 0) boss.timeAlive = boss.survivalTarget;
    }
    
    // Destroy fireball after it hits 2 targets
    if (hitCount >= 2) {
      proj.active = false;
    }
  }
  playerProjectiles = playerProjectiles.filter(p => p.active);

  // General Environment
  if (!boss) {
    if (!stormActive && elapsed >= nextStormAt) { stormActive = true; stormEndsAt = elapsed + 10; }
    if (stormActive) {
      if (elapsed < stormEndsAt) {
        bird.x = Math.max(0, bird.x - 6 * 32 * SCALE * dt);
        if (Math.random() < 0.45) {
          const life = randRange(280, 550) / 1000;
          windStreaks.push({ x: W + randRange(0, 50), y: randRange(0, GROUND_Y),
            vx: -randRange(11, 20) * 32 * SCALE, vy: randRange(-0.6, 0.6) * 32 * SCALE,
            life, maxLife: life, length: randRange(30, 80) });
        }
      } else { stormActive = false; windStreaks = []; nextStormAt = elapsed + randRange(20, 45); }
    }
  }
  for (const ws of windStreaks) { ws.x += ws.vx * dt; ws.y += ws.vy * dt; ws.life -= dt; }
  windStreaks = windStreaks.filter(w => w.life > 0 && w.x > -120);

  if (score > 0 && score % TAR_LVL === 0 && !boss && state === "playing" && (bossDefeatedAt === null || elapsed - bossDefeatedAt > 5)) {
    state = "bossWarning";
    bossWarningStart = elapsed;
    logs = []; spikes = []; stormActive = false; windStreaks = [];
    for (const p of pipes) { p.vy0 = randRange(-6, -2) * 32 * SCALE; p.yOffset = 0; }
    playMusic("boss");
    return;
  }

  if (boss) {
    boss.update(dt);
    if (boss.justWokeUp) { boss.justWokeUp = false; logs = []; stormActive = false; windStreaks = []; spikes = []; }
    if (boss.justFired) { shakeUntil = elapsed + 0.4; boss.justFired = false; }
    if (boss.isDefeated()) {
      boss = null;
      bossDefeatedAt = elapsed; score += 30; hudScore.textContent = String(score);
      bossDefeatCount += 1; saveBossDefeats(bossDefeatCount); refreshProfileStatsUI();
      spikeTimer = elapsed + randRange(10, 20);
      pipes = [makePipe(W + 10), makePipe(W + 10 + W / 2)];
      playSfx("point");
      playMusic("game");
      nextStormAt = elapsed + randRange(15, 35);
    }
  }

  if (!boss) {
    for (const p of pipes) {
      if (p.destroyed) continue;
      p.x -= speed * dt;
      if (score >= 2 && !p.triggered && p.x - bird.x < 170 * SCALE) {
        p.triggered = true;
        if (p.type === "pair") p.targetBotH += 65 * SCALE;
        else if (p.type === "upper") p.targetTopH += 90 * SCALE;
        else p.targetBotH += 90 * SCALE;
      }
      if (p.topH < p.targetTopH) p.topH = Math.min(p.targetTopH, p.topH + TRAP_GROWTH * dt);
      if (p.botH < p.targetBotH) p.botH = Math.min(p.targetBotH, p.botH + TRAP_GROWTH * dt);

      if (!p.scored && p.x + PIPE_W < bird.x - BIRD_R) {
        p.scored = true;
        score += (activePowerup === "score-multiplier" ? 2 : 1);
        hudScore.textContent = String(score);
        playSfx("point");
        if (score === 2) diffBannerUntil = elapsed + 2;
      }
    }
    if (pipes.length && pipes[0].x < -(PIPE_W + 2)) {
      pipes.shift();
      const safeX = getSafeX(W + 10, PIPE_W, 100);
      pipes.push(makePipe(safeX));
    }
    if (!(activePowerup === "phaser" || elapsed < invulnerableUntil)) {
      for (const p of pipes) {
        if (pipeHits(p)) {
          shakeUntil = elapsed + 0.4;
          if (!handleShieldHit()) return endGame();
        }
      }
    }
  }

  if (boss && boss.isShutdown) {
    if (elapsed > nextLogAt) {
      const types = ["linear", "wave", "drop", "gap", "chaser", "scatter", "pincer", "fakeout"];
      const tt = types[Math.floor(Math.random() * types.length)];
      const xb = W + 20;
      if (tt === "linear") logs.push({ x: xb, y: randRange(70, GROUND_Y - 70), vx: -randRange(5, 9) * 32 * SCALE, vy: 0, type: "linear" });
      else if (tt === "wave") { const y = randRange(120, GROUND_Y - 120); logs.push({ x: xb, y, baseY: y, vx: -160 * SCALE, vy: 0, type: "wave", tOff: Math.random() * 100 }); }
      else if (tt === "drop") logs.push({ x: xb, y: randRange(20, 80), vx: -128 * SCALE, vy: 0, type: "drop", triggered: false });
      else if (tt === "gap") { const gy = randRange(80, GROUND_Y - 180); for (let i = 10; i < GROUND_Y - 20; i += 50) if (!(i >= gy && i <= gy + 160)) logs.push({ x: xb, y: i, vx: -192 * SCALE, vy: 0, type: "linear" }); }
      else if (tt === "chaser") logs.push({ x: xb, y: randRange(70, GROUND_Y - 70), vx: -128 * SCALE, vy: 0, type: "chaser" });
      else if (tt === "scatter") { const n = 1 + Math.floor(Math.random() * 2); for (let i = 0; i < n; i++) logs.push({ x: xb + randRange(0, 80), y: randRange(60, GROUND_Y - 60), vx: -randRange(5, 9) * 32 * SCALE, vy: 0, type: "linear" }); }
      else if (tt === "pincer") logs.push({ x: xb, y: 10, vx: -192 * SCALE, vy: 64 * SCALE, type: "linear" }, { x: xb, y: GROUND_Y - 20, vx: -192 * SCALE, vy: -64 * SCALE, type: "linear" });
      else if (tt === "fakeout") logs.push({ x: xb, y: randRange(70, GROUND_Y - 70), vx: -256 * SCALE, vy: 0, type: "fakeout", timer: 0 });
      nextLogAt = elapsed + 1;
    }
    for (const p of logs) {
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.type === "wave") p.y = p.baseY + Math.sin((elapsed * 1000 + p.tOff) / 150) * 60 * SCALE;
      else if (p.type === "drop") { if (!p.triggered && p.x - bird.x < 150 * SCALE) { p.triggered = true; p.vy = randRange(7, 12) * 32 * SCALE; } }
      else if (p.type === "chaser") { if (p.x > bird.x) { if (p.y + 12 < bird.y) p.y += 64 * SCALE * dt; else if (p.y + 12 > bird.y) p.y -= 64 * SCALE * dt; } }
      else if (p.type === "fakeout") { p.timer += dt; if (p.timer > 0.3 && p.timer < 0.7) p.x -= p.vx * dt; else if (p.timer >= 0.7) p.vx = -480 * SCALE; }
    }
    logs = logs.filter(p => p.x > -100 && p.y < GROUND_Y + 50 && p.y > -50);
  }

  if (!boss && state === "playing" && elapsed > powerupTimer) {
    const safeX = getSafeX(W + 50, 40, 100);
    const pool = unlockedPowerups.length > 0 ? unlockedPowerups : ["shield"];
    powerups.push({ 
      x: safeX, y: randRange(100, GROUND_Y - 100), 
      type: pool[Math.floor(Math.random() * pool.length)],
      seed: Math.random() * 100 
    });
    powerupTimer = elapsed + randRange(4, 8);
  }
  for (const pu of powerups) {
    pu.x -= speed * dt;
    if (bird.x + 34 > pu.x && bird.x < pu.x + 40 && bird.y + 24 > pu.y && bird.y < pu.y + 40) {
      pu.collected = true;
      activePowerup = pu.type; shieldUsed = false;
      powerupEndsAt = elapsed + (POWERUP_DURATION[pu.type] || 7);
      if (pu.type === "fire-ball") {
        showShootPromptUntil = elapsed + 2.0;
      }
      playSfx("svoosh");
    }
  }
  powerups = powerups.filter(pu => pu.x > -50 && !pu.collected);

  if (!boss && state === "playing" && elapsed > coinTimer) {
    const sy = randRange(60, GROUND_Y - 80);
    const pat = ["line", "curve", "block"][Math.floor(Math.random() * 3)];
    if (pat === "line") { const n = 3 + Math.floor(Math.random() * 5); const sx = getSafeX(W + 50, n * 30, 120); for (let i = 0; i < n; i++) coins.push({ x: sx + i * 30, y: sy }); }
    else if (pat === "curve") { const n = 4 + Math.floor(Math.random() * 5); const sx = getSafeX(W + 50, n * 30, 120); for (let i = 0; i < n; i++) coins.push({ x: sx + i * 30, y: sy + Math.sin(i) * 40 }); }
    else { const sx = getSafeX(W + 50, 3 * 30, 120); for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) coins.push({ x: sx + i * 30, y: sy + j * 30 }); }
    coinTimer = elapsed + randRange(3, 5);
  }
  for (const c of coins) {
    c.x -= speed * dt;
    if (bird.x + 31 > c.x && bird.x + 3 < c.x + 26 && bird.y + 23 > c.y && bird.y + 3 < c.y + 26) {
      c.collected = true; coinCount += 1; playSfx("point");
    }
  }
  coins = coins.filter(c => c.x > -50 && !c.collected);

  if (!boss && state === "playing" && bossDefeatedAt !== null && elapsed > spikeTimer) {
    const n = 4 + Math.floor(Math.random() * 5);
    const sx = getSafeX(W + 80, n * 40, 120);
    const delays = [0, 150, 300, 450, 600, 800, 1000, 1200].sort(() => Math.random() - 0.5);
    for (let i = 0; i < n; i++) spikes.push({ x: sx + i * 40, y: 0, vy: 0, state: "waiting", delay: delays[i % delays.length] / 1000, dropAt: 0 });
    spikeTimer = elapsed + randRange(12, 25);
  }
  for (const s of spikes) {
    s.x -= speed * dt;
    if (s.state === "waiting" && s.x - bird.x < 150 * SCALE) { s.state = "triggered"; s.dropAt = elapsed + s.delay; }
    else if (s.state === "triggered" && elapsed >= s.dropAt) { s.state = "falling"; s.vy = randRange(12, 18) * 32 * SCALE; }
    else if (s.state === "falling") s.y += s.vy * dt;
    if (!(activePowerup === "phaser" || elapsed < invulnerableUntil)) {
      const hit = bird.x + BIRD_R > s.x + 6 && bird.x - BIRD_R < s.x + 20 && bird.y + BIRD_R > s.y && bird.y - BIRD_R < s.y + 70 * SCALE;
      if (hit) { shakeUntil = elapsed + 0.4; if (!handleShieldHit()) return endGame(); }
    }
  }
  spikes = spikes.filter(s => s.y < H + 50 && s.x > -100);

  const invulnerable = activePowerup === "phaser" || elapsed < invulnerableUntil;
  if (boss) {
    for (const proj of boss.projectiles) {
      if (!proj.deflected && rectHitsBird(proj.rect())) {
        if (activePowerup === "shield" && !shieldUsed) {
          proj.deflected = true; proj.vx = 512 * SCALE; proj.vy = 0;
          shieldUsed = true; activePowerup = null; invulnerableUntil = elapsed + 1;
          playSfx("flap"); playerProfile.shieldUsedCount += 1;
          shakeUntil = elapsed + 0.4;
        } else if (activePowerup !== "phaser") {
          if (!handleShieldHit()) return endGame();
        }
      }
      if (proj.deflected && rectsOverlap(boss.rect(), proj.rect())) {
        boss.takeHit(20); proj.active = false; playSfx("point");
        if (boss.health <= 0) boss.timeAlive = boss.survivalTarget;
      }
    }
    if (rectsOverlap(boss.rect(), birdRect())) {
      if (boss.isExposed && keysHeld.dash) {
        boss.takeHit(30); boss.isExposed = false;
        boss.isShutdown = true; boss.shutdownTimer = 6;
        playSfx("point");
        stormActive = true; stormEndsAt = elapsed + 6; logs = []; spikes = [];
        bird.x = Math.max(0, bird.x - 200 * SCALE); shakeUntil = elapsed + 0.4;
        nextLogAt = elapsed + 0.8;
        if (boss.health <= 0) boss.timeAlive = boss.survivalTarget;
      } else if (!invulnerable) {
        if (!handleShieldHit()) return endGame();
      }
    }
    if (boss.isShutdown && !invulnerable) {
      for (const p of logs) {
        if (bird.x + BIRD_R > p.x && bird.x - BIRD_R < p.x + 60 * SCALE && bird.y + BIRD_R > p.y && bird.y - BIRD_R < p.y + 24 * SCALE) {
          shakeUntil = elapsed + 0.4;
          if (!handleShieldHit()) return endGame();
        }
      }
    }
  }

  if (!invulnerable && bird.y + BIRD_R > GROUND_Y) {
    if (!handleShieldHit()) return endGame();
    bird.y = GROUND_Y - BIRD_R; bird.vy = 0;
  } else if (bird.y + BIRD_R > GROUND_Y) {
    bird.y = GROUND_Y - BIRD_R; bird.vy = 0;
  }

  if ((activePowerup === "phaser" || keysHeld.dash) && Math.random() < 0.6) {
    fireTrail.push({ x: bird.x - BIRD_R, y: bird.y + randRange(-6, 6), life: 0.35, age: 0 });
  }
  for (const pt of fireTrail) { pt.age += dt; pt.x -= speed * dt; }
  fireTrail = fireTrail.filter(pt => pt.age < pt.life);

  updateSparks(dt);
}

// ── Collision Helpers ───────────────────────────────────────────────
function birdRect() { return { x: bird.x - BIRD_HALF_W, y: bird.y - BIRD_HALF_H, w: BIRD_HALF_W * 2, h: BIRD_HALF_H * 2 }; }
function rectsOverlap(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }
function rectHitsBird(r) { return rectsOverlap(birdRect(), r); }

// ── Boss-warning cinematic update ──────────────────────────────────
function updateBossWarning(dt) {
  elapsed += dt;
  const progress = Math.min(1, (elapsed - bossWarningStart) / BOSS_WARNING_DURATION);

  let moveSpeed = PLAYER_VEL_X;
  if (keysHeld.dash) moveSpeed *= PLAYER_DASH_MULT;

  if (keysHeld.left) { bird.x = Math.max(0, bird.x - moveSpeed * dt); }
  else if (keysHeld.right) { bird.x = Math.min(W - 40, bird.x + moveSpeed * dt); }
  else if (keysHeld.dash) { bird.x = Math.min(W - 40, bird.x + moveSpeed * dt); }
  else {
    const targetX = W * 0.2;
    if (bird.x > targetX + 1) bird.x -= (PLAYER_VEL_X * 0.3) * dt;
    else if (bird.x < targetX - 1) bird.x += (PLAYER_VEL_X * 0.3) * dt;
  }
  
  bird.vy += GRAVITY * dt; bird.y += bird.vy * dt;
  bird.y = Math.min(bird.y, GROUND_Y - 25 * SCALE);
  bird.angle = Math.max(-0.5, Math.min(1.1, bird.vy / 600));

  bgScrollX -= currentSpeed() * 0.35 * dt;

  for (const p of pipes) {
    p.x -= currentSpeed() * dt;
    p.vy0 = (p.vy0 || 0) + 9.6 * SCALE * dt;
    p.yOffset = (p.yOffset || 0) + p.vy0 * dt;
  }
  pipes = pipes.filter(p => !((p.yOffset || 0) > H && p.x < -PIPE_W));

  if (Math.random() < 0.5) {
    emitSparks(randRange(0, W), Math.random() < 0.5 ? 0 : GROUND_Y, [-4, 4], [-6, 6], [200, 500], "#ff2800", 2, 5 * SCALE, 0.05);
  }
  updateSparks(dt);

  if (progress >= 1) {
    state = "playing";
    boss = new Boss(playerProfile);
    sparks = [];
    pipes = [];
  }
}

// ── Draw ─────────────────────────────────────────────────────────────
function drawBackground(shakeX = 0, shakeY = 0) {
  if (sprites.bg.complete && sprites.bg.naturalWidth) {
    const bw = sprites.bg.width, bh = sprites.bg.height;
    const scale = H / bh;
    const drawW = bw * scale;
    let x = bgScrollX % drawW;
    if (x > 0) x -= drawW;
    for (let dx = x; dx < W; dx += drawW) ctx.drawImage(sprites.bg, dx + shakeX, shakeY, drawW, H);
  } else {
    ctx.fillStyle = "#1F3A2C";
    ctx.fillRect(0, 0, W, H);
  }
  if (sprites.logBase.complete && sprites.logBase.naturalWidth) {
    const gh = GROUND_Y >= H ? 40 : (H - GROUND_Y);
    const ratio = sprites.logBase.height / sprites.logBase.width;
    const tileW = gh / ratio || 120;
    let x = bgScrollX % tileW;
    if (x > 0) x -= tileW;
    for (let dx = x; dx < W; dx += tileW) ctx.drawImage(sprites.logBase, dx + shakeX, GROUND_Y + shakeY, tileW + 1, gh);
  } else {
    ctx.fillStyle = "#46280F";
    ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);
  }
}

function drawPipe(p) {
  if (p.destroyed) return;
  if (p.topH > 0) drawLogColumn(p.x, 0, PIPE_W, p.topH, true);
  if (p.botH > 0) drawLogColumn(p.x, GROUND_Y - p.botH, PIPE_W, p.botH, false);
}

function drawLogColumn(x, y, w, h, hangingFromCeiling) {
  const img = hangingFromCeiling && logFlippedCanvas ? logFlippedCanvas : sprites.log;
  if (!img || !(img.naturalWidth || img.width)) {
    ctx.fillStyle = "#6B4226";
    ctx.fillRect(x, y, w, h);
    return;
  }
  const segH = (img.height || img.naturalHeight) * (w / (img.width || img.naturalWidth));
  if (hangingFromCeiling) {
    for (let dy = y; dy < y + h; dy += segH) {
      const remaining = Math.min(segH, y + h - dy);
      ctx.drawImage(img, 0, 0, img.width, (remaining / segH) * img.height, x, dy, w, remaining);
    }
  } else {
    for (let dy = y + h; dy > y; dy -= segH) {
      const remaining = Math.min(segH, dy - y);
      const srcH = (remaining / segH) * img.height;
      ctx.drawImage(img, 0, img.height - srcH, img.width, srcH, x, dy - remaining, w, remaining);
    }
  }
}

function drawBird() {
  ctx.save();
  ctx.translate(bird.x, bird.y);
  
  if (state === "dying") {
    ctx.rotate(deathAngle);
    ctx.globalAlpha = deathAlpha;
  } else {
    ctx.rotate(bird.angle);
  }

  if (activePowerup === "shield") {
    ctx.globalAlpha = 0.85;
    ctx.drawImage(sprites.shield, -BIRD_R - 12, -BIRD_R - 12, (BIRD_R + 12) * 2, (BIRD_R + 12) * 2);
    ctx.globalAlpha = state === "dying" ? deathAlpha : 1;
  }
  if (activePowerup === "phaser") {
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = "#B46EFF";
    ctx.beginPath(); ctx.arc(0, 0, BIRD_R + 10, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = state === "dying" ? deathAlpha : 1;
  }
  if (elapsed < invulnerableUntil && Math.floor(elapsed * 12) % 2 === 0) {
    ctx.globalAlpha = state === "dying" ? deathAlpha * 0.5 : 0.5;
  }

  const activeFrames = charFrames[equippedChar] && charFrames[equippedChar].length > 0 ? charFrames[equippedChar] : charFrames.default;
  const frameIdx = Math.floor((elapsed * 12) % activeFrames.length);
  const frame = activeFrames[frameIdx];
  if (frame && (frame.complete && frame.naturalWidth)) {
    ctx.drawImage(frame, -BIRD_R, -BIRD_R, BIRD_R * 2, BIRD_R * 2);
  } else {
    ctx.fillStyle = "#F2A93B";
    ctx.beginPath(); ctx.arc(0, 0, BIRD_R, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function drawPowerup(pu) {
  const img = sprites[pu.type];
  ctx.save();
  ctx.translate(pu.x, pu.y);
  
  const bob = Math.sin(elapsed * 4 + pu.seed) * 4;
  
  const glow = ctx.createRadialGradient(0, bob, 2, 0, bob, 22);
  glow.addColorStop(0, "rgba(255,255,255,0.55)");
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(0, bob, 22, 0, Math.PI * 2); ctx.fill();
  
  if (img && img.complete && img.naturalWidth) {
    ctx.drawImage(img, -16, bob - 16, 32, 32);
  } else {
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(0, bob, 12, 0, Math.PI*2); ctx.fill();
  }
  ctx.restore();
}

function drawCoin(c) {
  ctx.save();
  const spin = Math.abs(Math.cos(elapsed * 5 + c.x));
  ctx.translate(c.x, c.y);
  ctx.scale(Math.max(0.15, spin), 1);
  if (sprites.coin.complete && sprites.coin.naturalWidth) ctx.drawImage(sprites.coin, -13, -13, 26, 26);
  else { ctx.fillStyle = "#F2C94C"; ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
}

function drawFireTrail() {
  for (const pt of fireTrail) {
    const t = 1 - pt.age / pt.life;
    ctx.save();
    ctx.globalAlpha = t;
    if (sprites.fire.complete && sprites.fire.naturalWidth) ctx.drawImage(sprites.fire, pt.x - 10 * t, pt.y - 10 * t, 20 * t, 20 * t);
    ctx.restore();
  }
}

function drawSpikes() {
  for (const s of spikes) {
    const sx = s.x, sy = s.y;
    ctx.fillStyle = "#a0a0b4";
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + 26 * SCALE, sy); ctx.lineTo(sx + 13 * SCALE, sy + 80 * SCALE); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#5a5a6e";
    ctx.beginPath(); ctx.moveTo(sx + 13 * SCALE, sy); ctx.lineTo(sx + 26 * SCALE, sy); ctx.lineTo(sx + 13 * SCALE, sy + 80 * SCALE); ctx.closePath(); ctx.fill();
    if (s.state === "waiting") { ctx.fillStyle = "#323232"; ctx.fillRect(sx - 2, 0, 30 * SCALE, 8); }
  }
}

function drawLogs() {
  for (const p of logs) {
    ctx.save();
    ctx.translate(p.x + 30 * SCALE, p.y + 12 * SCALE);
    if (sprites.log.complete && sprites.log.naturalWidth) {
      ctx.rotate(Math.PI / 2);
      ctx.drawImage(sprites.log, -14 * SCALE, -30 * SCALE, 28 * SCALE, 60 * SCALE);
    } else {
      ctx.fillStyle = "#6B4226";
      ctx.fillRect(-30 * SCALE, -12 * SCALE, 60 * SCALE, 24 * SCALE);
    }
    ctx.restore();
  }
}

function drawWindStreaks() {
  for (const ws of windStreaks) {
    const alpha = Math.max(0, ws.life / ws.maxLife);
    ctx.fillStyle = `rgba(170,205,255,${0.8 * alpha})`;
    ctx.fillRect(ws.x, ws.y, ws.length, 3);
  }
  if (stormActive) {
    ctx.fillStyle = `rgba(70,90,170,${0.11 + 0.07 * Math.abs(Math.sin(elapsed * 2.2))})`;
    ctx.fillRect(0, 0, W, H);
    if (Math.floor(elapsed / 0.5) % 2 === 0) {
      ctx.font = `bold ${26 * SCALE}px monospace`; ctx.fillStyle = "#78a5ff"; ctx.textAlign = "center";
      ctx.fillText("STORM!", W / 2, 60 * SCALE);
    }
    ctx.font = `${16 * SCALE}px monospace`; ctx.fillStyle = "#a0c0ff"; ctx.textAlign = "center";
    ctx.fillText(`Wind ends: ${Math.max(0, Math.ceil(stormEndsAt - elapsed))}s`, W / 2, 88 * SCALE);
  }
}

function drawPowerupBanner() {
  if (!activePowerup) return;
  const remaining = Math.max(0, powerupEndsAt - elapsed);
  const img = sprites[activePowerup];
  
  if (img && img.complete && img.naturalWidth) {
    ctx.drawImage(img, 130 * SCALE, 14 * SCALE, 42 * SCALE, 42 * SCALE);
  }
  ctx.font = `bold ${16 * SCALE}px monospace`;
  ctx.fillStyle = "#FFF";
  ctx.textAlign = "left";
  ctx.fillText(`${remaining.toFixed(1)}s`, 176 * SCALE, 42 * SCALE);
}

function drawHud() {
  ctx.textAlign = "left";
  ctx.font = `${13 * SCALE}px monospace`;
  ctx.fillStyle = "#ffd700";
  if (sprites.coin.complete && sprites.coin.naturalWidth) ctx.drawImage(sprites.coin, W - 96, 8, 22, 22);
  ctx.fillText(`x${coinCount}`, W - 68, 24);
  
  ctx.fillStyle = "#8c8c50";
  ctx.fillText("[ESC] PAUSE", W - 100, 46);

  ctx.fillStyle = "#ffd700";
  ctx.font = `bold ${13 * SCALE}px monospace`;
  ctx.fillText(`High Score: ${cachedHighScore}`, 12, GROUND_Y + 26);

  if (diffBannerUntil > elapsed) {
    ctx.textAlign = "center"; ctx.font = `bold ${24 * SCALE}px monospace`; ctx.fillStyle = "#ff2020";
    ctx.fillText("TRAPS ACTIVE!!", W / 2, H / 2);
  }
  if (boss) {
    ctx.textAlign = "right"; ctx.font = `bold ${20 * SCALE}px monospace`; ctx.fillStyle = "#ff3c3c";
    ctx.fillText("DEVASTATOR", W - 8, H - 40);
  }
  
  if (elapsed < showShootPromptUntil) {
    ctx.textAlign = "center";
    ctx.font = `bold ${20 * SCALE}px monospace`;
    ctx.fillStyle = "#ffaa00";
    ctx.fillText("Hold 'S' or down arrow key to fire", W / 2, 50 * SCALE);
  }
}

function drawBossWarning(progress, shakeX, shakeY) {
  const flashAlpha = Math.min(0.85, 0.3 + 0.4 * Math.abs(Math.sin(elapsed * 5.5)) + 0.2 * progress);
  ctx.fillStyle = `rgba(160,0,0,${flashAlpha})`;
  ctx.fillRect(0, 0, W, H);
  if (Math.floor(elapsed / 0.3) % 2 === 0) {
    ctx.textAlign = "center";
    ctx.font = `bold ${26 * SCALE}px monospace`; ctx.fillStyle = "#ff3232";
    ctx.fillText("!! DEVASTATOR APPROACHING !!", W / 2, H / 3 + shakeY);
    ctx.font = `${16 * SCALE}px monospace`; ctx.fillStyle = "#ffc800";
    ctx.fillText("PREPARE FOR BATTLE", W / 2, H / 2 + shakeY);
  }
  const remain = Math.max(0, BOSS_WARNING_DURATION - (elapsed - bossWarningStart));
  const cnt = Math.ceil(remain);
  if (cnt > 0) {
    ctx.font = `bold ${34 * SCALE}px monospace`; ctx.fillStyle = "#fff"; ctx.textAlign = "center";
    ctx.fillText(String(cnt), W / 2, H * 2 / 3);
  }
}

function render() {
  const now = elapsed;
  let shakeX = 0, shakeY = 0;
  if (now < shakeUntil) {
    const mag = 15 * SCALE * (shakeUntil - now) / 0.4;
    shakeX = randRange(-mag, mag); shakeY = randRange(-mag, mag);
  }

  ctx.save();
  ctx.translate(shakeX, shakeY);
  drawBackground();
  if (!boss) for (const p of pipes) drawPipe(p);
  if (boss && boss.isShutdown) drawLogs();
  drawSpikes();
  for (const c of coins) drawCoin(c);
  for (const pu of powerups) drawPowerup(pu);
  for (const proj of playerProjectiles) proj.draw();
  drawFireTrail();
  drawSparks();
  drawWindStreaks();
  if (boss) boss.draw();
  drawBird();
  ctx.restore();

  drawPowerupBanner();
  drawHud();

  if (state === "bossWarning") {
    const progress = Math.min(1, (elapsed - bossWarningStart) / BOSS_WARNING_DURATION);
    drawBossWarning(progress, shakeX, shakeY);
  }
}

// ── Loop ─────────────────────────────────────────────────────────────
function loop(now) {
  const dt = Math.min(0.033, (now - lastTime) / 1000);
  lastTime = now;
  if (state === "playing") update(dt);
  else if (state === "bossWarning") updateBossWarning(dt);
  else if (state === "dying") updateDying(dt);
  
  if (state === "playing" || state === "paused" || state === "bossWarning" || state === "dying") render();
  
  if (state === "intro" || state === "playing" || state === "bossWarning" || state === "dying") {
    rafId = requestAnimationFrame(loop);
  }
}

resetGame();
refreshProfileStatsUI();
render();
if (state === "intro") {
  lastTime = performance.now();
  rafId = requestAnimationFrame(loop);
}