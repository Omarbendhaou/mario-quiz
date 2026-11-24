# 🍄 Project Management Quiz Application: Chapter 8 — Closing Projects
**Interactive Classroom Presentation & Real-Time Multiplayer Quiz**

---

## 📋 Project Summary

This project is a real-time, interactive Kahoot-style classroom quiz platform designed to accompany the presentation of **Chapter 8: Closing Projects**. It features a retro **Super Mario World** visual theme, complete with animated stage transitions, pixel-art retro UI, Web Audio API sound effects, and full host pacing controls.

The application allows the presenter/teacher to project the **Host Dashboard** on the classroom screen with a live QR code, while students connect instantly using their smartphones or laptops without downloading any apps.

---

## ⚡ Quick Start for the Professor

### 1-Click Launch (Windows)
Double-click the **`run.bat`** file included in this folder.
- It will verify your Node.js installation.
- It will automatically install project dependencies (`npm install`) on first launch.
- It will automatically open your default browser to the **Projector Host View** (`http://localhost:3000/host`).

### Manual Launch (Cross-Platform)
If you prefer running from the terminal:
```bash
# 1. Install dependencies
npm install

# 2. Start the quiz server
npm start
```

### URLs & Credentials:
* **Host / Projector Screen:** `http://localhost:3000/host`
  * **Host Security PIN:** `1234`
* **Student / Player Screen:** `http://localhost:3000`
* **Local LAN Access:** When connected to classroom Wi-Fi, the server outputs your local IP (e.g. `http://192.168.x.x:3000`) and encodes it directly into the projector QR code for mobile scanning.

---

## 📚 Curriculum Content: Chapter 8 (8 Questions)

The quiz strictly evaluates understanding of project closing concepts and case studies:

| # | Topic | Question Summary | Correct Answer | Key Takeaway / Case Study |
|---|---|---|---|---|
| **1** | **Lessons-Learned Report** | Which of the 7 questions is "the most important one"? | **C. What will we do differently next time?** | Turns retrospective review into actionable improvements for future projects. |
| **2** | **Radès–La Goulette Bridge** | Which result best describes the Tunis bridge project? | **B. Took ~216% of planned time, cost close to plan** | Schedule extended from 56 to 121 months, budget stayed ~102%, traffic exceeded forecast (29,500 vs 24,400 vpd). |
| **3** | **Closing Procurements** | Which three core actions are involved? | **D. Complete deliverables, settle open items, archive records** | Contract closure requires delivery acceptance, final settlement, and archiving contract records. |
| **4** | **Energy Conservation Project** | Key takeaway from the Tunisia demonstration project (closed 1994 instead of 1990)? | **A. Evaluate, control, and transition before closing** | Uncontrolled late scope changes transfer unintended maintenance burdens to stakeholders. |
| **5** | **Settlements Ladder** | Which dispute method is the last resort involving court action? | **C. Litigation** | Negotiation ➔ Mediation ➔ Arbitration ➔ Litigation (highest cost, time, and conflict). |
| **6** | **ONAS Wastewater Project** | Lesson learned from the 96-month vs 60-month project? | **B. Run a market survey before setting cost estimates** | Avoid bundling disparate activities, conduct pre-tender market surveys, and define robust qualification criteria. |
| **7** | **Phosphate Sector (Gafsa)** | How were equipment disputes settled in CPG & GCT? | **A. By direct negotiation between buyer and suppliers** | Successfully settled amicably without mediation, arbitration, or lawsuits (e.g. supplier repaired chassis at own cost). |
| **8** | **NEMO Kantara Fisheries** | Which problem did evaluation find for "delivered, but never closed"? | **D. 63% of budget spent in the last 19 months** | Spending rush due to late delivery, lack of exit/sustainability strategy, leaving facilities abandoned. |

---

## 🛠️ Technical Architecture & Key Features

1. **Full-Duplex Real-Time Communication (`Socket.IO`):**
   * Real-time synchronization between host projector and hundreds of student mobile devices.
   * Server-authoritative timing: all countdowns and timestamps are calculated exclusively on the server to prevent client-side clock tampering.

2. **Speed-Based Scoring Engine:**
   * Kahoot-style formula: `Points = 500 + round(500 * remainingSeconds / 60)`.
   * Fast, correct answers earn up to 1,000 points; wrong answers receive 0.
   * Tie-breaker logic accounts for cumulative response times.

3. **Stage Transitions & Visual Storytelling:**
   * **Lobby Stage:** Retro pixel-art title banner, live QR code, joining team badges.
   * **Yoshi's House Stage Intro:** Animated video transition before each question with custom story messages.
   * **Host Pacing Control:** Dedicated `"START QUESTION [X] ⏩"` button allows the presenter to discuss slides without artificial countdown pressures.
   * **Live Stage:** Question screen featuring animated walking Mario sprite and 4 color/shape-coded options.
   * **Reveal & Analytics:** Displays the correct answer, hides wrong answers, renders dynamic vote distribution bar charts, and shows educational case study explanations.
   * **Leaderboard:** Live rank ordering with position shift indicators (`▲ +2`, `▼ -1`).
   * **Grand Finale Podium:** Princess Peach victory celebration on castle ramparts with twin fireworks, defeated Bowser, and a host-controlled **`🏆 REVEAL TOP 3 PODIUM 🏆`** button triggering a 3rd ➔ 2nd ➔ 1st place staggered reveal with confetti and 8-bit fanfare.

4. **Zero-Installation Mobile Client:**
   * Vanilla HTML5 / CSS3 / ES6.
   * Ultra-lightweight footprint (<50KB transferred).
   * Responsive touch buttons with instant lockout to prevent double submissions.
   * Automatic session recovery via `localStorage` in case of accidental refresh or connection drops.

5. **Built-in Web Audio API Synthesizer:**
   * Generates retro 8-bit coin sounds, timer ticks, correct chimes, buzzer sounds, and victory fanfares natively using pure oscillators (no external media dependencies).

---

## 🧪 Automated Test Suite

To verify all game mechanics, networking, reconnection flows, and scoring calculations:
```bash
npm test
```
Runs `test-game.js`, simulating a live host and 3 concurrent teams across 40 automated verification assertions.

---

## 📁 Package Contents

```
professor_submission/
├── public/                 # Web assets, CSS, client scripts, retro media
│   ├── assets/             # Super Mario backgrounds, animations, sprites
│   ├── css/style.css       # Retro Super Mario styling & responsive layout
│   ├── js/audio.js         # Web Audio API sound synthesizer
│   ├── js/confetti.js      # Pixel-art confetti particle system
│   ├── js/host.js          # Host dashboard controller
│   ├── js/player.js        # Mobile player client controller
│   ├── host.html           # Projector presentation screen
│   └── index.html          # Mobile player interface
├── questions.json          # Chapter 8 questions, options, answers & explanations
├── server.js               # Node.js + Express + Socket.IO core backend
├── test-game.js            # Automated 40-assertion multiplayer test suite
├── package.json            # Project manifest & dependencies
├── run.bat                 # Windows 1-click launcher
├── start.sh                # Mac/Linux launcher
└── PROFESSOR_README.md     # This documentation guide
```
