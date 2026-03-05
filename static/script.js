/* ==========================================================================
   Mafia Voting App – Client-side JavaScript
   AJAX polling, voting logic, Chart.js integration
   ========================================================================== */

let ROOM_CODE = "";
let PLAYER_ID = null;
let PLAYER_NAME = "";
let IS_ADMIN = false;
let POLL_INTERVAL = null;
let CHART_INSTANCE = null;
let PREVIOUS_STATE = null;
let TIMER_INTERVAL = null;
let VOTING_START_TIME = null;

// ---- Device token for double-vote prevention (localStorage) ----
function getDeviceToken(roomCode, round) {
    const key = `mafia_token_${roomCode}_${PLAYER_ID}_${round}`;
    let token = localStorage.getItem(key);
    if (!token) {
        token = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
        localStorage.setItem(key, token);
    }
    return token;
}

function hasVotedThisRound(roomCode, round) {
    return localStorage.getItem(`mafia_voted_${roomCode}_${PLAYER_ID}_${round}`) === "true";
}

function markVoted(roomCode, round) {
    localStorage.setItem(`mafia_voted_${roomCode}_${PLAYER_ID}_${round}`, "true");
}

// ---- Init functions (called from templates) ----
function initAdmin(code) {
    ROOM_CODE = code;
    IS_ADMIN = true;
    // Save admin session for reconnection
    localStorage.setItem("mafia_session", JSON.stringify({
        type: "admin", room_code: code, url: window.location.pathname
    }));
    startPolling();
}

function initPlayer(code, playerId, playerName) {
    ROOM_CODE = code;
    PLAYER_ID = playerId;
    PLAYER_NAME = playerName;
    IS_ADMIN = false;
    // Save player session for reconnection
    localStorage.setItem("mafia_session", JSON.stringify({
        type: "player", room_code: code, player_id: playerId,
        player_name: playerName, url: window.location.pathname
    }));
    startPolling();
}

// ---- Polling ----
function startPolling() {
    poll(); // immediate first call
    POLL_INTERVAL = setInterval(poll, 3000);
}

async function poll() {
    try {
        const res = await fetch(`/api/room/${ROOM_CODE}`);
        if (!res.ok) return;
        const data = await res.json();
        updateUI(data);
        PREVIOUS_STATE = data;
    } catch (e) {
        // silently continue polling
    }
}

// ---- UI Update ----
function updateUI(data) {
    // Day number
    const dayEl = document.getElementById("day-number");
    if (dayEl) dayEl.textContent = data.day;

    // Progress bar
    const pBar = document.getElementById("progress-bar");
    const vCast = document.getElementById("votes-cast");
    const tAlive = document.getElementById("total-alive");
    if (pBar && vCast && tAlive) {
        const pct = data.total_alive > 0 ? (data.votes_cast / data.total_alive) * 100 : 0;
        pBar.style.width = pct + "%";
        vCast.textContent = data.votes_cast;
        tAlive.textContent = data.total_alive;
    }

    // Joker banner
    const jokerBanner = document.getElementById("joker-banner");
    if (jokerBanner) {
        jokerBanner.classList.toggle("hidden", !data.joker_message);
    }

    // Voting timer
    const timerEl = document.getElementById("voting-timer");
    if (timerEl) {
        if (data.voting_open && data.voting_start_time) {
            timerEl.classList.remove("hidden");
            if (!VOTING_START_TIME) {
                VOTING_START_TIME = data.voting_start_time;
                startTimer();
            }
        } else {
            if (!data.voting_open && TIMER_INTERVAL) {
                clearInterval(TIMER_INTERVAL);
                TIMER_INTERVAL = null;
            }
            if (!data.voting_open && !data.voting_ended) {
                timerEl.classList.add("hidden");
                VOTING_START_TIME = null;
            }
            // Keep timer visible (frozen) when voting ended so they can see final time
        }
    }

    if (IS_ADMIN) {
        updateAdminUI(data);
    } else {
        updatePlayerUI(data);
    }
}

// ---- Admin UI ----
function updateAdminUI(data) {
    // Player list
    const list = document.getElementById("player-list");
    if (list) {
        list.innerHTML = "";
        for (const ps of data.player_status) {
            const eliminated = data.eliminated.includes(ps.id);
            const li = document.createElement("li");
            li.innerHTML = `
                <div class="player-info">
                    <span class="player-num">${ps.id}</span>
                    <span>${ps.name}</span>
                </div>
                ${eliminated
                    ? '<span class="badge badge-eliminated">Eliminated</span>'
                    : (ps.voted
                        ? '<span class="badge badge-voted">Voted ✓</span>'
                        : '<span class="badge badge-waiting">Waiting</span>'
                    )
                }
            `;
            if (eliminated) li.style.opacity = "0.4";
            list.appendChild(li);
        }
    }

    // Button states
    const btnStart = document.getElementById("btn-start-voting");
    const btnEnd = document.getElementById("btn-end-voting");
    const btnReset = document.getElementById("btn-reset-round");
    if (btnStart && btnEnd) {
        btnStart.disabled = data.voting_open;
        btnEnd.disabled = !data.voting_open;
    }

    // Results section
    const resultsSection = document.getElementById("results-section");
    const postSection = document.getElementById("post-voting-section");
    if (data.voting_ended && data.results) {
        resultsSection.classList.remove("hidden");
        postSection.classList.remove("hidden");
        renderVoteMap(data.vote_map);
        renderChart(data.results);
        populateEliminateSelect(data.alive_players);
    } else {
        resultsSection.classList.add("hidden");
        postSection.classList.add("hidden");
    }
}

// ---- Player UI ----
function updatePlayerUI(data) {
    const waitingSection = document.getElementById("waiting-section");
    const votingSection = document.getElementById("voting-section");
    const votedSection = document.getElementById("voted-section");
    const resultsSection = document.getElementById("results-section");
    const eliminatedBanner = document.getElementById("eliminated-banner");

    // Check if this player is eliminated
    const isEliminated = data.eliminated.includes(PLAYER_ID);
    if (eliminatedBanner) eliminatedBanner.classList.toggle("hidden", !isEliminated);

    if (isEliminated) {
        // Eliminated: no voting, but can see everything else
        if (votingSection) votingSection.classList.add("hidden");
        if (votedSection) votedSection.classList.add("hidden");

        if (data.voting_ended && data.results) {
            // Show results
            if (waitingSection) waitingSection.classList.add("hidden");
            resultsSection.classList.remove("hidden");
            renderVoteMap(data.vote_map);
            renderChart(data.results);
        } else if (data.voting_open) {
            // Show spectating message during voting
            if (waitingSection) {
                waitingSection.classList.remove("hidden");
                const waitMsg = waitingSection.querySelector("p");
                if (waitMsg) waitMsg.textContent = "Spectating... vote in progress";
            }
            if (resultsSection) resultsSection.classList.add("hidden");
        } else {
            // Idle — waiting for next day
            if (waitingSection) {
                waitingSection.classList.remove("hidden");
                const waitMsg = waitingSection.querySelector("p");
                if (waitMsg) waitMsg.textContent = "You are eliminated. Spectating the game...";
            }
            if (resultsSection) resultsSection.classList.add("hidden");
        }
        return;
    }

    const voted = hasVotedThisRound(ROOM_CODE, data.day);

    if (data.voting_ended && data.results) {
        // Show results
        if (waitingSection) waitingSection.classList.add("hidden");
        if (votingSection) votingSection.classList.add("hidden");
        if (votedSection) votedSection.classList.add("hidden");
        resultsSection.classList.remove("hidden");
        renderVoteMap(data.vote_map);
        renderChart(data.results);
    } else if (data.voting_open && voted) {
        // Already voted
        if (waitingSection) waitingSection.classList.add("hidden");
        if (votingSection) votingSection.classList.add("hidden");
        if (votedSection) votedSection.classList.remove("hidden");
        if (resultsSection) resultsSection.classList.add("hidden");
    } else if (data.voting_open && !voted) {
        // Show voting buttons
        if (waitingSection) waitingSection.classList.add("hidden");
        if (votingSection) votingSection.classList.remove("hidden");
        if (votedSection) votedSection.classList.add("hidden");
        if (resultsSection) resultsSection.classList.add("hidden");
        renderVoteButtons(data.alive_players);
    } else {
        // Waiting for voting to start
        if (waitingSection) waitingSection.classList.remove("hidden");
        if (votingSection) votingSection.classList.add("hidden");
        if (votedSection) votedSection.classList.add("hidden");
        if (resultsSection) resultsSection.classList.add("hidden");
    }
}

// ---- Render vote buttons ----
let voteButtonsRendered = false;
function renderVoteButtons(alivePlayers) {
    // Only re-render if players changed
    const container = document.getElementById("vote-buttons");
    if (!container) return;
    const key = alivePlayers.map(p => p.id).join(",");
    if (container.dataset.key === key) return;
    container.dataset.key = key;

    container.innerHTML = "";
    for (const p of alivePlayers) {
        const btn = document.createElement("button");
        btn.className = "vote-btn";
        btn.innerHTML = `<span class="vote-num">${p.id}</span> ${p.name}`;
        btn.addEventListener("click", () => submitVote(p.id));
        container.appendChild(btn);
    }
}

// ---- Submit vote ----
async function submitVote(targetId) {
    if (!PREVIOUS_STATE) return;
    const round = PREVIOUS_STATE.day;

    if (hasVotedThisRound(ROOM_CODE, round)) {
        return; // already voted
    }

    const token = getDeviceToken(ROOM_CODE, round);

    try {
        const res = await fetch("/api/vote", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                room_code: ROOM_CODE,
                player_id: PLAYER_ID,
                target_id: targetId,
                device_token: token,
            }),
        });
        const data = await res.json();
        if (data.success) {
            markVoted(ROOM_CODE, round);
            poll(); // refresh immediately
        } else {
            // If server says already voted, mark locally too
            if (data.error && data.error.includes("already voted")) {
                markVoted(ROOM_CODE, round);
                poll();
            }
        }
    } catch (e) {
        // ignore
    }
}

// ---- Timer ----
function startTimer() {
    if (TIMER_INTERVAL) clearInterval(TIMER_INTERVAL);
    updateTimerDisplay();
    TIMER_INTERVAL = setInterval(updateTimerDisplay, 1000);
}

function updateTimerDisplay() {
    const display = document.getElementById("timer-display");
    if (!display || !VOTING_START_TIME) return;
    const elapsed = Math.floor(Date.now() / 1000 - VOTING_START_TIME);
    const mins = String(Math.floor(elapsed / 60)).padStart(2, "0");
    const secs = String(elapsed % 60).padStart(2, "0");
    display.textContent = `${mins}:${secs}`;
}

function formatTimeTaken(seconds) {
    const s = Math.round(seconds);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${m}m ${rem}s`;
}

// ---- Render vote map (compact grid) ----
function renderVoteMap(voteMap) {
    const container = document.getElementById("vote-map");
    if (!container || !voteMap) return;
    container.innerHTML = "";
    for (const entry of voteMap) {
        const cell = document.createElement("div");
        cell.className = "vote-map-cell";
        cell.innerHTML = `
            <span class="vm-label">Voter</span>
            <span class="vm-voter">${entry.voter}</span>
            <span class="vm-label" style="margin-top:4px">Voted for</span>
            <span class="vm-target">${entry.target}</span>
            <span class="vm-time">⏱ ${formatTimeTaken(entry.time_taken)}</span>
        `;
        container.appendChild(cell);
    }
}

// ---- Render Chart.js bar chart ----
function renderChart(results) {
    const canvas = document.getElementById("results-chart");
    if (!canvas || !results) return;

    // Only show players with at least 1 vote
    const filtered = results.filter(r => r[1] >= 1);
    if (filtered.length === 0) return;

    const labels = filtered.map(r => r[0]);
    const values = filtered.map(r => r[1]);

    // Gradient color pairs [start, end]
    const gradientPairs = [
        ["#6c5ce7", "#a78bfa"],
        ["#00cec9", "#38d9a9"],
        ["#e84393", "#fd79a8"],
        ["#feca57", "#f0932b"],
        ["#ff6b6b", "#ee5a24"],
        ["#a78bfa", "#6c5ce7"],
        ["#38d9a9", "#00cec9"],
        ["#fd79a8", "#e84393"],
    ];

    // Build gradient fills
    const ctx = canvas.getContext("2d");
    const bgColors = labels.map((_, i) => {
        const pair = gradientPairs[i % gradientPairs.length];
        const grad = ctx.createLinearGradient(0, 0, 0, 260);
        grad.addColorStop(0, pair[0]);
        grad.addColorStop(1, pair[1] + "88");
        return grad;
    });

    const borderColors = labels.map((_, i) => gradientPairs[i % gradientPairs.length][0]);

    if (CHART_INSTANCE) {
        CHART_INSTANCE.data.labels = labels;
        CHART_INSTANCE.data.datasets[0].data = values;
        CHART_INSTANCE.data.datasets[0].backgroundColor = bgColors;
        CHART_INSTANCE.data.datasets[0].borderColor = borderColors;
        CHART_INSTANCE.update();
        return;
    }

    // Value labels plugin (shows vote count on top of each bar)
    const valueLabelsPlugin = {
        id: "valueLabels",
        afterDatasetsDraw(chart) {
            const { ctx: c, data, scales: { x, y } } = chart;
            c.save();
            c.font = "bold 14px Inter, sans-serif";
            c.textAlign = "center";
            c.fillStyle = "#eaf0ff";
            data.datasets[0].data.forEach((val, i) => {
                const xPos = x.getPixelForValue(i);
                const yPos = y.getPixelForValue(val);
                c.fillText(val, xPos, yPos - 8);
            });
            c.restore();
        }
    };

    CHART_INSTANCE = new Chart(canvas, {
        type: "bar",
        data: {
            labels: labels,
            datasets: [{
                label: "Votes",
                data: values,
                backgroundColor: bgColors,
                borderColor: borderColors,
                borderWidth: 2,
                borderRadius: 12,
                borderSkipped: false,
                barThickness: 44,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: { top: 24 } },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: "rgba(11,14,23,0.95)",
                    titleColor: "#eaf0ff",
                    bodyColor: "#eaf0ff",
                    padding: 14,
                    cornerRadius: 10,
                    titleFont: { family: "'Inter', sans-serif", weight: "bold" },
                    bodyFont: { family: "'Inter', sans-serif" },
                },
            },
            scales: {
                x: {
                    ticks: { color: "#8892a8", font: { family: "'Inter', sans-serif", weight: "bold", size: 13 } },
                    grid: { display: false },
                    border: { display: false },
                },
                y: {
                    beginAtZero: true,
                    ticks: {
                        color: "#555e73",
                        stepSize: 1,
                        font: { family: "'Inter', sans-serif", size: 11 },
                    },
                    grid: { color: "rgba(255,255,255,0.04)" },
                    border: { display: false },
                },
            },
            animation: {
                duration: 800,
                easing: "easeOutQuart",
            },
        },
        plugins: [valueLabelsPlugin],
    });
}

// ---- Admin Actions ----
async function startVoting() {
    await fetch("/api/start_voting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room_code: ROOM_CODE }),
    });
    poll();
}

async function endVoting() {
    await fetch("/api/end_voting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room_code: ROOM_CODE }),
    });
    poll();
}

async function resetRound() {
    // Destroy chart so it can be recreated fresh
    if (CHART_INSTANCE) {
        CHART_INSTANCE.destroy();
        CHART_INSTANCE = null;
    }
    // Reset timer
    if (TIMER_INTERVAL) {
        clearInterval(TIMER_INTERVAL);
        TIMER_INTERVAL = null;
    }
    VOTING_START_TIME = null;
    const display = document.getElementById("timer-display");
    if (display) display.textContent = "00:00";

    await fetch("/api/reset_round", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room_code: ROOM_CODE }),
    });
    poll();
}

async function eliminatePlayer() {
    const select = document.getElementById("eliminate-select");
    if (!select) return;
    const playerId = parseInt(select.value);
    if (!playerId) return;
    await fetch("/api/eliminate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room_code: ROOM_CODE, player_id: playerId }),
    });
    poll();
}

async function triggerJoker() {
    await fetch("/api/joker_wins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room_code: ROOM_CODE }),
    });
    poll();
}

// ---- Populate eliminate select ----
function populateEliminateSelect(alivePlayers) {
    const select = document.getElementById("eliminate-select");
    if (!select) return;
    const currentVal = select.value;
    const key = alivePlayers.map(p => p.id).join(",");
    if (select.dataset.key === key) return;
    select.dataset.key = key;

    select.innerHTML = '<option value="">-- Select Player --</option>';
    for (const p of alivePlayers) {
        const opt = document.createElement("option");
        opt.value = p.id;
        opt.textContent = `${p.id} – ${p.name}`;
        select.appendChild(opt);
    }
    if (currentVal) select.value = currentVal;
}

// ---- History ----
async function toggleHistory() {
    const overlay = document.getElementById("history-overlay");
    if (!overlay) return;
    if (overlay.classList.contains("hidden")) {
        // Fetch and show
        overlay.classList.remove("hidden");
        try {
            const res = await fetch(`/api/history/${ROOM_CODE}`);
            const data = await res.json();
            renderHistory(data.history || []);
        } catch (e) {
            // ignore
        }
    } else {
        overlay.classList.add("hidden");
    }
}

function renderHistory(history) {
    const container = document.getElementById("history-content");
    if (!container) return;

    if (history.length === 0) {
        container.innerHTML = '<p class="text-muted">No rounds played yet.</p>';
        return;
    }

    container.innerHTML = "";
    // Show most recent first
    for (const entry of [...history].reverse()) {
        const card = document.createElement("div");
        card.className = "history-day-card";

        // Day title
        let html = `<div class="history-day-title">\u2600 Day ${entry.day}</div>`;

        // Vote tally (only players with >= 1 vote)
        if (entry.results) {
            const filtered = entry.results.filter(r => r[1] >= 1);
            if (filtered.length > 0) {
                html += '<div class="history-tally">';
                for (const [name, count] of filtered) {
                    html += `<span class="history-tally-item">${name} <span class="history-tally-count">${count}</span></span>`;
                }
                html += '</div>';
            }
        }

        // Who voted for whom
        if (entry.vote_map && entry.vote_map.length > 0) {
            html += '<div class="history-votes-grid">';
            for (const v of entry.vote_map) {
                const timeStr = formatTimeTaken(v.time_taken);
                html += `<div class="history-vote-cell">
                    <span class="hv-voter">${v.voter}</span>
                    <span class="hv-arrow">→</span>
                    <span class="hv-target">${v.target}</span>
                    <span class="hv-time">\u23f1${timeStr}</span>
                </div>`;
            }
            html += '</div>';
        }

        card.innerHTML = html;
        container.appendChild(card);
    }
}
// ---- Roles (Admin Only) ----
async function saveRoles() {
    const roles = {
        mafia: document.getElementById("role-mafia")?.value || "",
        doctor: document.getElementById("role-doctor")?.value || "",
        detective: document.getElementById("role-detective")?.value || "",
        joker: document.getElementById("role-joker")?.value || ""
    };

    try {
        const res = await fetch("/api/save_roles", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ room_code: ROOM_CODE, roles: roles }),
        });
        const data = await res.json();
        if (data.success) {
            const btn = document.querySelector(".roles-card .btn");
            if (btn) {
                const original = btn.innerHTML;
                btn.innerHTML = "✅ Saved!";
                setTimeout(() => btn.innerHTML = original, 2000);
            }
        }
    } catch (e) {
        console.error("Save roles failed", e);
    }
}

// ---- Instructions Modal ----
function showInstructions() {
    const modal = document.getElementById("instructions-modal");
    if (modal) modal.classList.remove("hidden");
    document.body.style.overflow = "hidden"; // Prevent scroll
}

function hideInstructions() {
    const modal = document.getElementById("instructions-modal");
    if (modal) modal.classList.add("hidden");
    document.body.style.overflow = ""; // Restore scroll
}

// Close modals on Escape key
document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
        hideInstructions();
        const historyOverlay = document.getElementById("history-overlay");
        if (historyOverlay) historyOverlay.classList.add("hidden");
    }
});
