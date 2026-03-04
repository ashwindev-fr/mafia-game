# 🎭 Mafia Game – Voting Web Application

**Welcome to Mafia · The Ultimate Party Game · Powered by Pathshala Club**

A real-time web-based voting system for the classic Mafia party game. Players
join a room on their phones, vote anonymously during daytime rounds, and see
beautiful results with charts and timers. All game data is persisted to MongoDB
for later review.

> **Note:** This app only handles the **voting** part of Mafia. Players already
> know their roles from physical cards. The app never stores or reveals roles.

---

## ✨ Features

- **Room System** – Admin creates a room with a unique code; players join via
  code + name
- **Anonymous Voting** – Votes are secret until the admin ends the round
- **Double-Vote Prevention** – Server-side + localStorage token checks
- **Live Timer** – Count-up timer during voting; per-voter time tracked
- **Beautiful Charts** – Gradient bar charts (Chart.js) with vote counts on top
- **Compact Vote Map** – 2-column grid showing who voted for whom with time
  taken
- **Day System** – Rounds labeled as "Day 1, Day 2..." with a glowing banner
- **Game History** – In-game history panel (📜 button) showing all past days
- **Eliminated Players** – Can spectate voting and see results but cannot vote
- **MongoDB Persistence** – Every game saved for later review
- **Past Games Page** – Browse and drill into completed game sessions
- **Joker Wins** – Admin can trigger a Joker Wins announcement
- **Mobile-First UI** – Dark theme, glassmorphism, floating particles, smooth
  animations

---

## 🛠 Tech Stack

| Layer    | Technology            |
| -------- | --------------------- |
| Backend  | Python Flask          |
| Frontend | HTML, CSS, JavaScript |
| Charts   | Chart.js (CDN)        |
| Database | MongoDB (pymongo)     |
| Font     | Inter (Google Fonts)  |

---

## 📁 Project Structure

```
mafia-voting-app/
├── app.py                      # Flask backend – routes, API, MongoDB sync
├── requirements.txt            # Python dependencies (Flask, pymongo)
├── static/
│   ├── style.css               # Full stylesheet – dark theme, glassmorphism, animations
│   └── script.js               # Client-side JS – polling, voting, timer, charts, history
└── templates/
    ├── index.html              # Home page – Join Room / Create Room
    ├── admin.html              # Admin dashboard – controls, player list, results
    ├── player.html             # Player view – vote, wait, see results
    └── past_games.html         # Past games browser – list + detail modal
```

### File Details

| File                        | Description                                                                                                                                                                                                                                                                        |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app.py`                    | Flask application with 13+ API routes. In-memory dict for real-time gameplay, synced to MongoDB at key events (room creation, player join, voting end, elimination, round reset, joker). Includes `_build_vote_results()` helper and `_sync_to_db()` persistence layer.            |
| `requirements.txt`          | `Flask` and `pymongo`                                                                                                                                                                                                                                                              |
| `static/style.css`          | 850+ lines. Mobile-first dark theme with CSS variables, glassmorphism cards, gradient buttons, floating particle animations, voting timer styles, compact vote map grid, Chart.js container glow, history modal (slide-up panel), day banner with animated sun, past games styles. |
| `static/script.js`          | 600+ lines. AJAX polling (3s interval), anonymous vote submission, double-vote prevention (localStorage), live count-up timer, Chart.js bar chart with gradient fills and value labels plugin, compact vote map renderer, history toggle/fetch/render, admin action handlers.      |
| `templates/index.html`      | Home page with Join Room (top) and Create Room (bottom) glassmorphism cards. Links to Past Games in footer.                                                                                                                                                                        |
| `templates/admin.html`      | Admin dashboard: Day banner, voting controls (start/end/reset), vote progress bar with timer, player list with voted/waiting badges, results section (chart + vote map), post-voting actions (eliminate, joker), history modal.                                                    |
| `templates/player.html`     | Player view: Day banner, waiting/voting/voted states, vote progress with timer, results section, eliminated banner with spectating messages, history modal.                                                                                                                        |
| `templates/past_games.html` | Lists all saved games from MongoDB as clickable cards (room code, player count, days played, date). Click opens a slide-up modal with full game details: player list and day-by-day history.                                                                                       |

---

## 🚀 Getting Started

### Prerequisites

- **Python 3.8+**
- **MongoDB** running locally on `mongodb://localhost:27017`

### Installation

```bash
cd mafia-voting-app
pip install -r requirements.txt
python app.py
```

The server starts at **http://127.0.0.1:5000**

### How to Play

1. **Admin** opens the app → clicks **Create Room** → gets a room code (e.g.
   `X7K2P`)
2. **Players** open the app on their phones → enter room code + name → click
   **Join Room**
3. Admin clicks **▶ Start Day Voting** → timer starts counting
4. Players vote anonymously by tapping a player's name
5. Admin clicks **⏹ End Voting** → results appear (chart + who voted for whom +
   time taken)
6. Admin can **eliminate** a player or trigger **🃏 Joker Wins**
7. Admin clicks **🔄 Reset Voting Round** → advances to next Day
8. Tap **📜 History** anytime to see all past days
9. Visit **Past Games** from the home page to review any previous game session

---

## 🗄 MongoDB

- **Database:** `mafia_games`
- **Collection:** `games`
- Game state is synced to MongoDB on: room creation, player join, start/end
  voting, round reset, elimination, and joker wins
- Each document contains: room code, players, votes, history (all days),
  eliminations, timestamps

---

## 📱 Mobile-First Design

The entire UI is designed for mobile access:

- Large, tap-friendly buttons
- Responsive glassmorphism cards
- Dark theme optimized for OLED screens
- Smooth animations and micro-interactions
- Floating particle background

---

## 📄 License

This project is for educational and recreational use by **Pathshala Club**.
