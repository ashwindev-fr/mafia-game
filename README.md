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
├── requirements.txt            # Python dependencies (Flask, pymongo, gunicorn)
├── Dockerfile                  # Container image for the Flask app
├── docker-compose.yml          # Orchestrates app + MongoDB + Nginx
├── .dockerignore               # Files excluded from Docker build
├── nginx/
│   └── nginx.conf              # Nginx reverse proxy configuration
├── static/
│   ├── style.css               # Full stylesheet – dark theme, glassmorphism
│   └── script.js               # Client-side JS – polling, voting, charts
└── templates/
    ├── index.html              # Home page – Join Room / Create Room
    ├── admin.html              # Admin dashboard – controls, results
    ├── player.html             # Player view – vote, wait, results
    └── past_games.html         # Past games browser
```

### File Details

| File                        | Description                                                                                                                            |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `app.py`                    | Flask app with 13+ API routes. In-memory dict for real-time gameplay, synced to MongoDB at key events. Reads `MONGO_URI` from env var. |
| `requirements.txt`          | `Flask`, `pymongo`, `gunicorn`                                                                                                         |
| `Dockerfile`                | Python 3.12 slim image, installs deps, runs gunicorn with 4 workers on port 5000                                                       |
| `docker-compose.yml`        | 3 services (app, mongo, nginx), auto-restart, persistent MongoDB volume                                                                |
| `nginx/nginx.conf`          | Reverse proxy: port 80 → Flask on port 5000, real IP headers, static file caching                                                      |
| `static/style.css`          | 850+ lines. Mobile-first dark theme, glassmorphism, animations, history modal, day banner                                              |
| `static/script.js`          | 600+ lines. AJAX polling, voting, timer, Chart.js charts, history, admin actions                                                       |
| `templates/index.html`      | Join Room (top) + Create Room (bottom) with Pathshala Club branding                                                                    |
| `templates/admin.html`      | Day banner, voting controls, progress bar, player list, results, post-voting actions                                                   |
| `templates/player.html`     | Day banner, voting/waiting/results states, eliminated spectating, history modal                                                        |
| `templates/past_games.html` | Lists saved games from MongoDB, click for full detail modal                                                                            |

---

## 🚀 Getting Started

### Option 1: Local Development

**Prerequisites:** Python 3.8+, MongoDB Cloud cluster

```bash
cd mafia-voting-app
pip install -r requirements.txt
export MONGO_URI="mongodb+srv://<user>:<password>@cluster.mongodb.net/mafia_games"
python app.py
```

The server starts at **http://127.0.0.1:5000**

### Option 2: Docker (Production)

**Prerequisites:** Docker and Docker Compose installed

```bash
cd mafia-voting-app
# Create a .env file with your MongoDB Cloud connection string
echo "MONGO_URI=mongodb+srv://<user>:<password>@cluster.mongodb.net/mafia_games" > .env
docker-compose up -d --build
```

That's it! The app is now running at **http://localhost** (port 80).

To stop:

```bash
docker-compose down
```

---

## 🐳 Docker Architecture

```
                 ┌─────────────────────────────────┐
Internet         │         Docker Compose           │
(port 80)        │                                  │
    │            │  ┌──────────┐    ┌──────────┐    │
    └───────────►│  │  Nginx   │───►│ Flask    │    │
                 │  │ :80      │    │ :5000    │    │
                 │  └──────────┘    └────┬─────┘    │
                 │                       │          │
                 │                  ┌────▼─────┐    │
                 │                  │ MongoDB  │    │
                 │                  │ Cloud    │    │
                 │                  └──────────┘    │
                 │                                  │
                 │                                  │
                 └─────────────────────────────────┘
```

### Services

| Service | Image               | Port               | Purpose                           |
| ------- | ------------------- | ------------------ | --------------------------------- |
| `nginx` | `nginx:alpine`      | `80 → app:5000`    | Reverse proxy, public entry point |
| `app`   | Custom (Dockerfile) | `5000` (internal)  | Flask + Gunicorn backend          |

All containers have `restart: always` — they automatically restart if the server
reboots.

---

## ☁️ Deploy on AWS EC2

### 1. Launch an EC2 instance

- **AMI:** Amazon Linux 2023 or Ubuntu 22.04
- **Instance type:** `t2.micro` (free tier) or `t3.small`
- **Security group:** Open port **80** (HTTP) and **22** (SSH)

### 2. SSH in and install Docker

```bash
# Amazon Linux 2023
sudo yum install -y docker git
sudo systemctl start docker && sudo systemctl enable docker
sudo usermod -aG docker $USER

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Log out and back in for docker group
exit
```

### 3. Clone and deploy

```bash
git clone https://github.com/ashwindev-fr/mafia-game.git
cd mafia-game
# Create a .env file with your MongoDB Cloud connection string
echo "MONGO_URI=mongodb+srv://<user>:<password>@cluster.mongodb.net/mafia_games" > .env
docker-compose up -d --build
```

The app is now live at `http://<your-ec2-public-ip>`

### 4. Verify

```bash
docker-compose ps        # Both containers should be "Up"
docker-compose logs -f   # Watch live logs
```

---

## 🚀 CI/CD Pipeline (Automated Deployment)

This project is configured with a automated CI/CD pipeline using **GitHub
Actions**, **Docker Hub**, and **AWS EC2**.

### Workflow Architecture

1. **GitHub Actions**: Triggered on push to `main`.
2. **Docker Build**: Builds the `mafia-app` image.
3. **Docker Hub**: Pushess the image to `${DOCKER_USER}/mafia-app:latest`.
4. **SSH Deploy**: Connects to EC2 and runs `deploy.sh`.
5. **Update**: EC2 pulls the new image and restarts containers.

### Setup Requirements

#### 1. GitHub Secrets

Add these to your repo settings (**Settings > Secrets > Actions**):

- `DOCKER_USER`: Your Docker Hub username.
- `DOCKER_PASS`: Your Docker Hub token/password.
- `EC2_HOST`: Your EC2 Public IP.
- `EC2_KEY`: Your `.pem` private key content.
- `MONGO_URI`: Your MongoDB Cloud connection string.

#### 2. EC2 Preparation

1. Clone the repo to `~/mafia-voting-app` on your EC2.
2. Make the script executable: `chmod +x ~/mafia-voting-app/deploy.sh`.

3. **Admin** opens the app → clicks **Create Room** → gets room code (e.g.
   `X7K2P`)
4. **Players** open on their phones → enter room code + name → click **Join
   Room**
5. Admin clicks **▶ Start Day Voting** → timer starts
6. Players vote anonymously by tapping a player's name
7. Admin clicks **⏹ End Voting** → results appear (chart + who voted for whom)
8. Admin can **eliminate** a player or trigger **🃏 Joker Wins**
9. Admin clicks **🔄 Reset Voting Round** → advances to next Day
10. Tap **📜 History** anytime to see all past days
11. Visit **Past Games** from the home page to review old game sessions

---

## 🗄 MongoDB

- **Database:** `mafia_games`
- **Collection:** `games`
- Synced on: room creation, player join, start/end voting, round reset,
  elimination, joker wins
- Each document: room code, players, votes, full day-by-day history,
  eliminations, timestamps
- **Connection:** reads `MONGO_URI` env var

---

## 📱 Mobile-First Design

- Large, tap-friendly buttons
- Responsive glassmorphism cards
- Dark theme optimized for OLED screens
- Smooth animations and micro-interactions
- Floating particle background

---

## 📄 License

This project is for educational and recreational use by **Pathshala Club**.
