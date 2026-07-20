// ══════════════════════════════════════════════════════════════════
// AUDIO MANAGER — music tracks + one-shot sound effects
// Browsers block autoplay with sound until a user gesture, so the
// home-screen music only starts after the first click/keypress.
// ══════════════════════════════════════════════════════════════════

const SFX_FILES = {
  flap:     "assets/sfx/flap.mp3",
  point:    "assets/sfx/point.mp3",
  die:      "assets/sfx/die.mp3",
  start:    "assets/sfx/start.mp3",
  svoosh:   "assets/sfx/svoosh.mp3",
  click:    "assets/sfx/btn_click.mp3",
};

const MUSIC_FILES = {
  home: "assets/sfx/game_bgm.mp3",
  game: "assets/sfx/chiptune_adv.mp3",
  boss: "assets/sfx/game.mp3"
};

let musicVolume = 0.4;
let sfxVolume = 0.7;
let muted = false;
let unlocked = false;

const sfxPool = {};
for (const [name, src] of Object.entries(SFX_FILES)) {
  sfxPool[name] = new Audio(src);
  sfxPool[name].preload = "auto";
}

const musicEls = {};
for (const [name, src] of Object.entries(MUSIC_FILES)) {
  const a = new Audio(src);
  a.loop = true;
  a.preload = "auto";
  musicEls[name] = a;
}

let currentMusic = null;

export function playSfx(name) {
  if (muted) return;
  const base = sfxPool[name];
  if (!base) return;
  // clone so overlapping plays (e.g. rapid flaps) don't cut each other off
  const node = base.cloneNode();
  node.volume = sfxVolume;
  node.play().catch(() => {});
}

export function playMusic(name) {
  if (currentMusic === name) return;
  for (const [key, el] of Object.entries(musicEls)) {
    if (key !== name) { el.pause(); el.currentTime = 0; }
  }
  currentMusic = name;
  const el = musicEls[name];
  if (!el) return;
  el.volume = muted ? 0 : musicVolume;
  if (unlocked) el.play().catch(() => {});
}

export function stopMusic() {
  if (currentMusic && musicEls[currentMusic]) {
    musicEls[currentMusic].pause();
  }
  currentMusic = null;
}

export function unlockAudio() {
  if (unlocked) return;
  unlocked = true;
  if (currentMusic && musicEls[currentMusic]) {
    musicEls[currentMusic].play().catch(() => {});
  }
}

export function setMusicVolume(v01) {
  musicVolume = v01;
  if (currentMusic && musicEls[currentMusic] && !muted) {
    musicEls[currentMusic].volume = musicVolume;
  }
}

export function setSfxVolume(v01) { sfxVolume = v01; }

export function toggleMute() {
  muted = !muted;
  if (currentMusic && musicEls[currentMusic]) {
    musicEls[currentMusic].volume = muted ? 0 : musicVolume;
  }
  return muted;
}

export function isMuted() { return muted; }

// ── Wire up global controls ─────────────────────────────────────────
const btnMute = document.getElementById("btnMute");
btnMute.addEventListener("click", () => {
  const m = toggleMute();
  btnMute.textContent = m ? "🔇" : "🔊";
});

const musicSlider = document.getElementById("musicVol");
const sfxSlider = document.getElementById("sfxVol");
musicSlider.addEventListener("input", (e) => setMusicVolume(Number(e.target.value) / 100));
sfxSlider.addEventListener("input", (e) => setSfxVolume(Number(e.target.value) / 100));
setMusicVolume(Number(musicSlider.value) / 100);
setSfxVolume(Number(sfxSlider.value) / 100);

// unlock audio on the first interaction anywhere on the page
["click", "keydown", "touchstart"].forEach(evt =>
  window.addEventListener(evt, unlockAudio, { once: true })
);

// click sound for every pixel/img button on the page
document.querySelectorAll(".pixel-btn, .img-btn").forEach(btn => {
  btn.addEventListener("click", () => playSfx("click"));
});

// start home music right away (will actually start playing once unlocked)
playMusic("home");