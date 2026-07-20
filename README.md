# Chippu Out in Wild

An AI-powered, Flappy Bird-inspired browser game — flap, dash, and shoot your way through pipes, dodge bosses and storms, collect coins, and climb a live global leaderboard.

Built with vanilla JavaScript and HTML5 Canvas, backed by Firebase for accounts and real-time score tracking.

---

## Play

https://a2studios.xyz

👉 [Play Chippu Out in Wild](#)

---

## ✨ Features

- **Classic flap-based movement** with a modern twist — dash left/right, shoot fireballs, and dodge hazards
- **Boss battles** — dash into exposed bosses to defeat them
- **Dynamic weather** — random storm events change the pace mid-run
- **Power-ups**
  - 🔥 **Fireballs** — shoot obstacles out of your path
  - 🧲 **Coin Magnet** — pulls nearby coins toward you
  - ✖️2 **Score Multiplier** — doubles your points for a limited time
  - 🛡️ Shield & Phaser — survive hits and phase through danger
- **Unlockable characters** — Chippu, Crook, and Dory, each with their own vibe
- **AI-generated taunts** — dynamic in-game commentary powered by an AI backend
- **Accounts & persistence** — sign up / log in with email & password via Firebase Authentication
- **Live leaderboard** — top 10 scores update in real time via Firestore
- **Mobile-friendly** — on-screen touch controls mirror all keyboard actions

---

## 🕹️ Controls

| Action | Keyboard | Touch |
|---|---|---|
| Flap | `Space` / `↑` / `W` | Tap screen |
| Move Left | `←` / `A` | Left button |
| Move Right | `→` / `D` | Right button |
| Dash | `Shift` / right `Ctrl` | Dash button |
| Shoot (with Fireball power-up) | `↓` / `S` | Shoot button |
| Pause | `Esc` | — |

---

## 🛠️ Tech Stack

- **Rendering:** HTML5 Canvas, vanilla JavaScript
- **Auth:** Firebase Authentication (email/password)
- **Database:** Cloud Firestore (leaderboard + player profiles)
- **Hosting:** Firebase Hosting
- **AI taunts:** Cloudflare Worker proxying an LLM API

---

## 📁 Project Structure

```
├── index.html              # Main entry point
├── style.css                # Game & UI styling
├── game.js                  # Core game engine (physics, rendering, powerups, bosses)
├── auth.js                  # Firebase authentication & modal logic
├── leaderboard.js           # Real-time leaderboard (Firestore)
├── audio.js                 # Sound effect playback
├── firebase-config.js       # Firebase client config
├── firestore.rules          # Firestore security rules
├── firebase.json            # Firebase hosting/deploy config
├── assets/                  # Sprites, animations, sound files
├── cf-worker/                # Cloudflare Worker (AI taunt proxy)
└── site.webmanifest, favicons, robots.txt, sitemap.xml
```
---
