"""
Mafia Game Voting Web Application
Flask backend with in-memory storage + MongoDB persistence.
"""

import os
import random
import string
import time
import uuid
from datetime import datetime, timezone

from flask import Flask, render_template, request, jsonify, redirect, url_for, session, flash
from pymongo import MongoClient

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "mafia-secret-stable-key-123")

# ---------------------------------------------------------------------------
# MongoDB connection
# ---------------------------------------------------------------------------
mongo_client = MongoClient(os.environ.get("MONGO_URI", "mongodb://localhost:27017/"))
db = mongo_client["mafia_games"]
games_collection = db["games"]

# ---------------------------------------------------------------------------
# In-memory data store (fast real-time access)
# ---------------------------------------------------------------------------
rooms = {}


def _generate_code(length=5):
    """Generate a random room code like X7K2P."""
    chars = string.ascii_uppercase + string.digits
    code = "".join(random.choices(chars, k=length))
    while _get_room(code):
        code = "".join(random.choices(chars, k=length))
    return code


def _get_room(code):
    """
    Retrieve room state from MongoDB (always fresh).
    Never short-circuit from the in-memory cache so that all
    Gunicorn workers see the latest state.
    """
    if not code:
        return None
    
    # Normalize code
    code = code.strip().upper()
    
    # Always read from MongoDB for consistency across workers
    doc = games_collection.find_one({"room_code": code}, {"_id": 0})
    if doc:
        # Deserialize vote_tokens (list -> set)
        if "vote_tokens" in doc:
            doc["vote_tokens"] = set(doc["vote_tokens"])
        else:
            doc["vote_tokens"] = set()
            
        # Ensure other fields exist
        doc.setdefault("history", [])
        doc.setdefault("events", [])
        doc.setdefault("vote_times", {})
        doc.setdefault("votes", {})
        doc.setdefault("roles", {"mafia": "", "doctor": "", "detective": "", "joker": ""})
        doc.setdefault("eliminated", [])
        doc.setdefault("players", [])
        doc.setdefault("voting_open", False)
        doc.setdefault("voting_ended", False)
        doc.setdefault("day", 1)
        doc.setdefault("joker_message", False)
        doc.setdefault("voting_start_time", None)
        doc.setdefault("max_players", 10)
        doc.setdefault("status", "active")
        
        # Cache in local memory for this worker
        rooms[code] = doc
        return doc
        
    return None


def _sync_to_db(code):
    """Persist the current room state to MongoDB."""
    room = _get_room(code)
    if not room:
        return
    
    # Ensure room_code is in the room dict
    if "room_code" not in room:
        room["room_code"] = code
    
    # Create a serializable copy
    doc = room.copy()
    
    # Convert sets to lists for BSON serialization
    if "vote_tokens" in doc and isinstance(doc["vote_tokens"], set):
        doc["vote_tokens"] = list(doc["vote_tokens"])
        
    doc["updated_at"] = datetime.now(timezone.utc)
    
    games_collection.update_one(
        {"room_code": code},
        {"$set": doc},
        upsert=True,
    )


# ---------------------------------------------------------------------------
# Page routes
# ---------------------------------------------------------------------------

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/create_room", methods=["POST"])
def create_room():
    max_players = int(request.form.get("max_players", 10))
    custom_code = request.form.get("room_code", "").strip().upper()
    code = custom_code if custom_code and not _get_room(custom_code) else _generate_code()

    admin_token = uuid.uuid4().hex
    rooms[code] = {
        "room_code": code,
        "admin_token": admin_token,
        "players": [],
        "votes": {},
        "max_players": max_players,
        "voting_open": False,
        "voting_ended": False,
        "eliminated": [],
        "day": 1,
        "joker_message": False,
        "vote_tokens": set(),
        "voting_start_time": None,
        "vote_times": {},
        "history": [],
        "events": [], # Global event log
        "roles": {
            "mafia": "",
            "doctor": "",
            "detective": "",
            "joker": ""
        },
        "created_at": datetime.now(timezone.utc),
        "status": "active",
    }
    _sync_to_db(code)
    session[f"admin_{code}"] = admin_token
    return redirect(url_for("admin_page", code=code))


@app.route("/join_room", methods=["POST"])
def join_room():
    code = request.form.get("room_code", "").strip().upper()
    name = request.form.get("player_name", "").strip()

    if not code or not name:
        flash("Please enter both a room code and your name.")
        return redirect(url_for("index"))

    # Force a fresh read from MongoDB (bypass local cache)
    doc = games_collection.find_one({"room_code": code}, {"_id": 0})
    if doc:
        if "vote_tokens" in doc:
            doc["vote_tokens"] = set(doc["vote_tokens"])
        else:
            doc["vote_tokens"] = set()
        doc.setdefault("history", [])
        doc.setdefault("events", [])
        doc.setdefault("vote_times", {})
        doc.setdefault("votes", {})
        doc.setdefault("roles", {"mafia": "", "doctor": "", "detective": "", "joker": ""})
        doc.setdefault("eliminated", [])
        doc.setdefault("players", [])
        doc.setdefault("voting_open", False)
        doc.setdefault("voting_ended", False)
        doc.setdefault("day", 1)
        doc.setdefault("joker_message", False)
        doc.setdefault("voting_start_time", None)
        doc.setdefault("max_players", 10)
        doc.setdefault("status", "active")
        rooms[code] = doc

    room = rooms.get(code)
    if not room:
        flash("Room not found. Check the code and try again.")
        return redirect(url_for("index"))

    if len(room["players"]) >= room["max_players"]:
        flash("Room is full.")
        return redirect(url_for("index"))

    # Prevent duplicate names
    if any(p["name"].lower() == name.lower() for p in room["players"]):
        flash("That name is already taken. Use a different name.")
        return redirect(url_for("index"))

    player_id = len(room["players"]) + 1
    room["players"].append({"id": player_id, "name": name})



    _sync_to_db(code)
    return redirect(url_for("player_page", code=code, player_id=player_id))


@app.route("/admin/<code>")
def admin_page(code):
    room = _get_room(code)
    if not room:
        return redirect(url_for("index"))
    # Verify admin
    if session.get(f"admin_{code}") != room["admin_token"]:
        return redirect(url_for("index"))
    return render_template("admin.html", code=code, room=room)


@app.route("/player/<code>/<int:player_id>")
def player_page(code, player_id):
    room = _get_room(code)
    if not room:
        return redirect(url_for("index"))
    player = next((p for p in room["players"] if p["id"] == player_id), None)
    if not player:
        return redirect(url_for("index"))
    return render_template("player.html", code=code, player=player, room=room)


# ---------------------------------------------------------------------------
# Past Games page
# ---------------------------------------------------------------------------
@app.route("/past_games")
def past_games_page():
    return render_template("past_games.html")


@app.route("/api/past_games")
def api_past_games():
    """Return list of all saved games."""
    cursor = games_collection.find(
        {},
        {"_id": 0, "room_code": 1, "players": 1, "day": 1, "history": 1,
         "created_at": 1, "updated_at": 1, "status": 1, "eliminated": 1,
         "max_players": 1}
    ).sort("created_at", -1).limit(50)
    games = []
    for g in cursor:
        games.append({
            "room_code": g.get("room_code"),
            "players": g.get("players", []),
            "day": g.get("day", 1),
            "history": g.get("history", []),
            "created_at": g.get("created_at", "").isoformat() if g.get("created_at") else "",
            "status": g.get("status", "active"),
            "eliminated": g.get("eliminated", []),
            "max_players": g.get("max_players", 0),
            "total_players": len(g.get("players", [])),
            "total_days_played": len(g.get("history", [])),
        })
    return jsonify({"games": games})


@app.route("/api/past_game/<code>")
def api_past_game_detail(code):
    """Return full detail for a single game."""
    g = games_collection.find_one({"room_code": code}, {"_id": 0})
    if not g:
        return jsonify({"error": "Game not found"}), 404
    # Convert datetime to string
    if g.get("created_at"):
        g["created_at"] = g["created_at"].isoformat()
    if g.get("updated_at"):
        g["updated_at"] = g["updated_at"].isoformat()
    return jsonify(g)


# ---------------------------------------------------------------------------
# API routes (JSON)
# ---------------------------------------------------------------------------

@app.route("/api/room/<code>")
def api_room(code):
    """Polling endpoint — returns room state."""
    room = _get_room(code)
    if not room:
        return jsonify({"error": "Room not found"}), 404

    alive_players = [p for p in room["players"] if p["id"] not in room["eliminated"]]
    total_alive = len(alive_players)
    votes_cast = len(room["votes"])

    # Build vote results (only if voting ended)
    results = None
    vote_map = None
    if room["voting_ended"]:
        vote_map, results = _build_vote_results(room, alive_players)

    # Player voted status (for admin)
    player_status = []
    for p in alive_players:
        player_status.append({
            "id": p["id"],
            "name": p["name"],
            "voted": str(p["id"]) in room["votes"] or p["id"] in room["votes"],
        })

    return jsonify({
        "players": [{"id": p["id"], "name": p["name"]} for p in room["players"]],
        "alive_players": [{"id": p["id"], "name": p["name"]} for p in alive_players],
        "player_status": player_status,
        "votes_cast": votes_cast,
        "total_alive": total_alive,
        "voting_open": room["voting_open"],
        "voting_ended": room["voting_ended"],
        "day": room["day"],
        "joker_message": room["joker_message"],
        "results": results,
        "vote_map": vote_map,
        "eliminated": room["eliminated"],
        "max_players": room["max_players"],
        "voting_start_time": room["voting_start_time"],
    })


@app.route("/api/vote", methods=["POST"])
def api_vote():
    data = request.get_json()
    code = data.get("room_code")
    player_id = int(data.get("player_id"))
    target_id = int(data.get("target_id"))
    device_token = data.get("device_token", "")

    room = _get_room(code)
    if not room:
        return jsonify({"error": "Room not found"}), 404
    if not room["voting_open"]:
        return jsonify({"error": "Voting is not open"}), 400
    if room["voting_ended"]:
        return jsonify({"error": "Voting has ended"}), 400
    if player_id in room["eliminated"]:
        return jsonify({"error": "You have been eliminated"}), 400

    # Double-vote prevention (server-side)
    if str(player_id) in room["votes"]:
        return jsonify({"error": "You have already voted this round"}), 400



    room["votes"][str(player_id)] = target_id
    # Record time taken
    if room["voting_start_time"]:
        room["vote_times"][str(player_id)] = round(time.time() - room["voting_start_time"], 1)


    _sync_to_db(code)
    return jsonify({"success": True})


@app.route("/api/start_voting", methods=["POST"])
def api_start_voting():
    data = request.get_json()
    code = data.get("room_code")
    room = _get_room(code)
    if not room:
        return jsonify({"error": "Room not found"}), 404

    room["voting_open"] = True
    room["voting_ended"] = False
    room["joker_message"] = False
    room["voting_start_time"] = time.time()
    
    # Log event
    _add_event(room, f"Voting opened for Day {room['day']}")
    
    _sync_to_db(code)
    return jsonify({"success": True})


@app.route("/api/end_voting", methods=["POST"])
def api_end_voting():
    data = request.get_json()
    code = data.get("room_code")
    room = _get_room(code)
    if not room:
        return jsonify({"error": "Room not found"}), 404

    room["voting_open"] = False
    room["voting_ended"] = True

    # Save this day's results to history
    alive_players = [p for p in room["players"] if p["id"] not in room["eliminated"]]
    vote_map, results = _build_vote_results(room, alive_players)
    
    round_summary = {
        "day": room["day"],
        "vote_map": vote_map,
        "results": results,
        "total_votes": len(room["votes"]),
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
    room["history"].append(round_summary)
    
    _add_event(room, f"Voting closed for Day {room['day']}. {len(room['votes'])} votes cast.")

    _sync_to_db(code)
    return jsonify({"success": True})


@app.route("/api/reset_round", methods=["POST"])
def api_reset_round():
    data = request.get_json()
    code = data.get("room_code")
    room = _get_room(code)
    if not room:
        return jsonify({"error": "Room not found"}), 404

    room["votes"] = {}
    room["vote_tokens"] = set()
    room["vote_times"] = {}
    room["voting_open"] = False
    room["voting_ended"] = False
    room["joker_message"] = False
    room["voting_start_time"] = None
    room["day"] += 1
    _sync_to_db(code)
    return jsonify({"success": True})


@app.route("/api/eliminate", methods=["POST"])
def api_eliminate():
    data = request.get_json()
    code = data.get("room_code")
    player_id = int(data.get("player_id"))
    room = _get_room(code)
    if not room:
        return jsonify({"error": "Room not found"}), 404

    if player_id not in room["eliminated"]:
        room["eliminated"].append(player_id)
        player = next((p for p in room["players"] if p["id"] == player_id), None)
        if player:
            _add_event(room, f"Player #{player['id']} ({player['name']}) was eliminated in Day {room['day']}.")
            
    _sync_to_db(code)
    return jsonify({"success": True})


@app.route("/api/joker_wins", methods=["POST"])
def api_joker_wins():
    data = request.get_json()
    code = data.get("room_code")
    room = _get_room(code)
    if not room:
        return jsonify({"error": "Room not found"}), 404

    room["joker_message"] = True
    room["status"] = "finished"
    _add_event(room, "Game Ended: Joker wins!")
    _sync_to_db(code)
    return jsonify({"success": True})


@app.route("/api/save_roles", methods=["POST"])
def api_save_roles():
    data = request.get_json()
    code = data.get("room_code")
    roles = data.get("roles", {})
    
    room = _get_room(code)
    if not room:
        return jsonify({"error": "Room not found"}), 404
        
    # Verify admin
    if session.get(f"admin_{code}") != room["admin_token"]:
        return jsonify({"error": "Unauthorized"}), 403
        
    room["roles"] = {
        "mafia": roles.get("mafia", ""),
        "doctor": roles.get("doctor", ""),
        "detective": roles.get("detective", ""),
        "joker": roles.get("joker", "")
    }
    
    _sync_to_db(code)
    return jsonify({"success": True})


# ---------------------------------------------------------------------------
# Helper to build vote results from room state
# ---------------------------------------------------------------------------
def _build_vote_results(room, alive_players):
    vote_map = []
    for voter_id, target_id in room["votes"].items():
        voter = next((p for p in room["players"] if p["id"] == int(voter_id)), None)
        target = next((p for p in room["players"] if p["id"] == int(target_id)), None)
        if voter and target:
            secs = room["vote_times"].get(str(voter_id), 0)
            vote_map.append({
                "voter": voter["name"],
                "target": target["name"],
                "time_taken": secs,
            })

    tally = {}
    for p in alive_players:
        tally[p["name"]] = 0
    for target_id in room["votes"].values():
        target = next((p for p in room["players"] if p["id"] == int(target_id)), None)
        if target:
            tally[target["name"]] = tally.get(target["name"], 0) + 1
    results = sorted(tally.items(), key=lambda x: -x[1])
    return vote_map, results


def _add_event(room, message):
    """Utility to add a timestamped event message."""
    event = {
        "time": datetime.now(timezone.utc).isoformat(),
        "day": room.get("day", 1),
        "message": message
    }
    if "events" not in room:
        room["events"] = []
    room["events"].append(event)


@app.route("/api/history/<code>")
def api_history(code):
    room = _get_room(code)
    if not room:
        # History is already included in _get_room's MongoDB load,
        # but if we explicitly need to handle it separately:
        return jsonify({"error": "Room not found"}), 404
    return jsonify({"history": room.get("history", [])})


# ---------------------------------------------------------------------------
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True, use_reloader=False)

