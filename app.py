import requests
import sqlite3
from flask import Flask, render_template, request, current_app, url_for, jsonify, abort, session, redirect, g, flash, send_from_directory
from flask_wtf.csrf import CSRFProtect
import os
from pathlib import Path
from uuid import uuid4
from PIL import Image, UnidentifiedImageError
import re
import json
from werkzeug.utils import secure_filename
from werkzeug.security import generate_password_hash, check_password_hash
from functools import wraps
from dotenv import load_dotenv
from collections import Counter

load_dotenv()

# Initialization
app = Flask(__name__, static_folder=None)

csrf = CSRFProtect()
csrf.init_app(app)

app.secret_key = os.environ["SECRET_KEY"]

app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
app.config["SESSION_COOKIE_SECURE"] = (os.environ.get("APP_ENV") == "production")

app.config["MAX_CONTENT_LENGTH"] = 5 * 1024 * 1024

# Use persistent storage in production, or the existing local database during development
data_dir = Path(
    os.environ.get("DATA_DIR", str(Path(app.root_path).parent))
)

data_dir.mkdir(parents=True, exist_ok=True)

app.config["DATABASE"] = data_dir / "database.db"

# Local uploads remain inside static/.
# Production uploads use the persistent data directory.
if os.environ.get("DATA_DIR"):
    upload_root = data_dir / "uploads"
else:
    upload_root = Path(app.root_path) / "static" / "uploads"

app.config["UPLOAD_ROOT"] = upload_root
app.config["STATIC_ROOT"] = Path(app.root_path) / "static"

app.config["CHARACTER_UPLOAD_FOLDER"] = upload_root / "characters"
app.config["COLLECTION_UPLOAD_FOLDER"] = upload_root / "collections"
app.config["PROFILE_UPLOAD_FOLDER"] = upload_root / "profile_picture"

# Create the folders if they don't exist
for folder in (
    app.config["CHARACTER_UPLOAD_FOLDER"],
    app.config["COLLECTION_UPLOAD_FOLDER"],
    app.config["PROFILE_UPLOAD_FOLDER"],
):
    folder.mkdir(parents=True, exist_ok=True)

app.config["CHARACTER_UPLOAD_FOLDER"].mkdir(
    parents=True,
    exist_ok=True
)

app.config["COLLECTION_UPLOAD_FOLDER"].mkdir(
    parents=True,
    exist_ok=True
)

app.config["SESSION_COOKIE_SECURE"] = (
    os.environ.get("FLASK_ENVIRONMENT") == "production"
)

# =================================================================================================================================================

SEARCH_QUERY = """
query ($search: String, $type: MediaType) {
    Page(page:1, perPage: 10) {
        media(search: $search, type: $type) {
            id
            
            title {
                english
                romaji
            }
            
            coverImage {
                large
            }
            
            format
            episodes
            chapters
            
            startDate {
                year
            }
            
            status
            genres
        }
    }
}
"""


MEDIA_QUERY = """
query ($id: Int, $type: MediaType) {
    Media(id: $id, type: $type) {
        id
        
        title {
            english
            romaji
        }
        
        coverImage {
            extraLarge
        }
        
        bannerImage
        
        format
        status
        episodes
        chapters
        volumes
        duration
        
        startDate {
            year
            month
            day
        }
        
        endDate {
            year
            month
            day
        }
        
        genres
        description
        
        studios {
            nodes {
                name
            }
        }

        staff {
            edges {
                role
                
                node {
                    name {
                        full
                    }
                }
            }
        }
    }
}
"""


CHARACTER_SEARCH_QUERY = """
query ($search: String) {
    Page(page: 1, perPage: 10) {
        characters(search: $search) {
            id

            name {
                full
            }

            image {
                large
            }

            media(perPage: 10) {
                edges {
                    node {
                        id
                    
                        title {
                            english
                            romaji
                        }
                
                        type
                    }
                }
            }
        }
    }
}
"""


CHARACTER_QUERY = """
query ($id: Int) {
    Character(id: $id) {
        id
        
        name {
            full
        }
        
        image {
            large
        }
        
        media(perPage: 25) {
            edges {
                node {
                    id
                }
            }
        }
    }
}
"""

# ==========HELPER FUNCTIONS=======================================================================================================================================

# function for creating a new database connection each request
def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(app.config["DATABASE"])
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON;")

    return g.db

# function for closing the connection after each request
@app.teardown_appcontext
def close_db(error):
    db = g.pop("db", None)

    if db is not None:
        db.close()

# function for populating libraries with real database entries
def get_user_library(user_id, media_type):
    db = get_db()

    return db.execute("""
        SELECT
            series.id,
            series.title,
            series.cover_image,
            series.banner_image,
            series.format,
            series.total_progress,
            user_entries.status,
            user_entries.score,
            user_entries.progress,
            series_sources.anilist_id
        FROM user_entries
        JOIN series
            ON user_entries.series_id = series.id
        JOIN series_sources
            ON series.id = series_sources.series_id
        WHERE user_entries.user_id = ?
            AND series.media_type = ?
        ORDER BY series.title
    """, (user_id, media_type)).fetchall()


def get_user_characters(user_id):
    db = get_db()

    return db.execute("""
        SELECT
            characters.id,
            characters.anilist_id,
            characters.name,
            characters.image,
            user_characters.position,
            user_characters.notes,
            user_characters.custom_name,
            user_characters.custom_image
        FROM user_characters
        JOIN characters
            ON user_characters.character_id = characters.id
        WHERE user_characters.user_id = ?
        ORDER BY user_characters.position
    """, (user_id,)).fetchall()


def get_character_series(character_id):
    db = get_db()

    return db.execute("""
        SELECT
            series.id,
            series.title,
            series.media_type,
            series_sources.anilist_id
        FROM character_series
        JOIN series
            ON character_series.series_id = series.id
        JOIN series_sources
            ON series.id = series_sources.series_id
        WHERE character_series.character_id = ?
            AND series_sources.position = 1
        ORDER BY series.title
    """, (character_id,)).fetchall()


def get_character_library_series(user_id, character):
    media_ids = []

    for edge in character["media"]["edges"]:
        media_ids.append(edge["node"]["id"])

    if not media_ids:
        return []

    placeholders = ",".join("?" for media_id in media_ids)

    query = f"""
        SELECT DISTINCT
            series.id,
            series.title,
            series.media_type,
            series_sources.anilist_id
        FROM series
        JOIN series_sources
            ON series.id = series_sources.series_id
        JOIN user_entries
            ON series.id = user_entries.series_id
        WHERE user_entries.user_id = ?
            AND series_sources.anilist_id IN ({placeholders})
    """

    db = get_db()

    return db.execute(
        query,
        [user_id] + media_ids
    ).fetchall()

# function for validating image uploads
def allowed_uploaded_image(file):
    try:
        file.seek(0)

        with Image.open(file) as image:
            if image.format not in {"JPEG", "PNG", "WEBP"}:
                return False

            if image.width > 4096 or image.height > 4096:
                return False

            image.verify()

        return True

    except (UnidentifiedImageError, OSError, ValueError):
        return False

    finally:
        file.seek(0)

# function for safely deleting custom images when no longer used
def delete_uploaded_image(image_url, upload_folder):
    if not image_url:
        return

    filename = image_url.rsplit("/", 1)[-1]

    filepath = upload_folder / filename

    if not re.fullmatch(r"[0-9a-f]{32}\.webp", filename):
        return

    if not filepath.is_file():
        return

    filepath.unlink()


def save_uploaded_image(file, upload_folder):
    filename = f"{uuid4().hex}.webp"
    filepath = upload_folder / filename

    try:
        file.seek(0)

        with Image.open(file) as image:
            image.load()
            image.thumbnail((512, 512))

            if image.mode not in ("RGB", "RGBA"):
                image = image.convert("RGBA")

            image.save(
                filepath,
                format="WEBP",
                quality=90
            )

    except (OSError, ValueError):
        filepath.unlink(missing_ok=True)
        raise ValueError("Could not process image")

    return filename, filepath

# function for pulling user entry library into collections tab
def get_collection_library_entries(user_id, media_type):
    db = get_db()

    return db.execute("""
        SELECT
            ue.id AS user_entry_id,
            s.id AS series_id,
            s.title,
            s.cover_image,
            s.media_type,
            s.genres,
            ue.status,
            ue.score
            
        FROM user_entries AS ue
        
        JOIN series AS s
            ON ue.series_id = s.id
            
        WHERE ue.user_id = ?
            AND UPPER(s.media_type) = ?
            
        ORDER BY s.title COLLATE NOCASE
    """, (user_id, media_type)).fetchall()


def prepare_collection_entries(entries):
    prepared_entries = []

    for entry in entries:
        entry_data = dict(entry)

        entry_data["genres"] = json.loads(entry_data["genres"] or "[]")

        prepared_entries.append(entry_data)

    return prepared_entries


def get_collection_covers(collection_id):
    db = get_db()

    collection_covers = [
        row["cover_image"]
        for row in db.execute("""
            SELECT s.cover_image
            FROM collection_entries AS ce
            JOIN user_entries AS ue
                ON ce.user_entry_id = ue.id
            JOIN series AS s
                ON ue.series_id = s.id
            WHERE ce.collection_id = ?
                AND s.cover_image IS NOT NULL
            ORDER BY ce.position
            LIMIT 4
        """, (collection_id,)).fetchall()
    ]

    return collection_covers

# helper function to load the current user before each request
@app.before_request
def load_logged_in_user():
    user_id = session.get("user_id")

    g.user = None

    if user_id is None:
        return

    db = get_db()

    g.user = db.execute("""
        SELECT id, name, email
        FROM users
        WHERE id = ?
    """, (user_id,)).fetchone()

    if g.user is None:
        session.clear()

# function requires users to be logged in when any request is made
def login_required(view):
    @wraps(view)
    def wrapped_view(*args, **kwargs):
        if g.user is None:
            return redirect(url_for("login"))

        return view(*args, **kwargs)

    return wrapped_view

# function for setting the user theme upon login
@app.context_processor
def inject_user_theme():
    user_id = session.get("user_id")

    if user_id is None:
        return {"user_theme": "midnight"}

    db = get_db()

    user = db.execute("""
        SELECT theme
        FROM users
        WHERE id = ?
    """, (user_id,)).fetchone()

    if user is None:
        return {"user_theme": "midnight"}

    return {"user_theme": user["theme"]}

# ==========SERVE IMAGES FROM PERSISTENT STORAGE=======================================================================================================================================

@app.route("/static/uploads/<path:filename>")
def serve_uploaded_image(filename):
    return send_from_directory(app.config["UPLOAD_ROOT"], filename)


@app.route("/static/<path:filename>", endpoint="static")
def serve_static_file(filename):
    return send_from_directory(app.config["STATIC_ROOT"], filename)

# ==========ACCOUNT REGISTRATION/LOGIN=======================================================================================================================================

# route for registering user accounts
@app.route("/register", methods=['GET', 'POST'])
def register():
    if request.method == 'POST':
        name = request.form.get("name", "").strip()
        email = request.form.get("email", "").strip().lower()
        password = request.form.get("password", "")

        # Validate the submitted information
        if not name or not email or not password:
            return "All field are required", 400

        if len(password) < 8:
            return "Password must be at least 8 characters long", 400

        # Check whether email is already registered
        db = get_db()

        existing_user = db.execute("""
            SELECT id
            FROM users
            WHERE email = ?
        """, (email,)).fetchone()

        if existing_user:
            return "An account with this email already exists", 400

        # Hash ppassword before storing it
        password_hash = generate_password_hash(password)

        db.execute("""
            INSERT INTO users (name, email, password_hash)
            VALUES (?, ?, ?)
        """, (name, email, password_hash))

        db.commit()

        return redirect(url_for('login'))

    return render_template("register.html")

# route for logging in
@app.route("/login", methods=['GET', 'POST'])
def login():
    if request.method == "POST":
        email = request.form.get("email", "").strip().lower()
        password = request.form.get("password", "")

        if not email or not password:
            return "Email and password are required", 400

        # Find account associated with this email
        db = get_db()

        user = db.execute("""
            SELECT id, name, email, password_hash
            FROM users
            WHERE email = ?
        """, (email,)).fetchone()

        # Check that user exists and password is correct
        if user is None or not check_password_hash(
            user["password_hash"], password
        ):
            return "Invalid email or password", 401

        # Clear any previous session before loggin in
        session.clear()

        # Remember authenticated user
        session["user_id"] = user["id"]

        return redirect(url_for("index"))

    return render_template("login.html")

# route for logging out
@app.route("/logout", methods=['POST'])
def logout():
    session.clear()

    return redirect(url_for("login"))

# ==========THEMES=======================================================================================================================================

# route for saving user themes
@app.route("/settings/theme", methods=['POST'])
@login_required
def update_theme():
    data = request.get_json(silent=True) or {}
    theme = data.get("theme")

    allowed_themes = {"midnight", "sakura", "ocean", "forest", "ember"}

    if theme not in allowed_themes:
        return jsonify({"error": "Invalid theme"}), 400

    db = get_db()

    db.execute("""
        UPDATE users
        SET theme = ?
        WHERE id = ?
    """, (theme, g.user["id"]))

    db.commit()

    return jsonify({"success": True, "theme": theme})

# ==========LIBRARY PAGES=======================================================================================================================================

# main anime library page
@app.route("/")
@login_required
def index():
    library_entries = get_user_library(g.user["id"], "anime")

    return render_template("index.html", media_type="anime", library_entries=library_entries)

# main manga library page
@app.route("/manga")
@login_required
def manga():
    library_entries = get_user_library(g.user["id"], "manga")

    return render_template("index.html", media_type="manga", library_entries=library_entries)

# ==========MEDIA SEARCH PAGE=======================================================================================================================================

# anime/manga search page
@app.route("/search")
@login_required
def search():
    search_term = request.args.get('q', "")
    media_type = request.args.get('type', "anime")

    results = []

    if search_term:
        variables = {
            "search": search_term,
            "type": media_type.upper()
        }

        response = requests.post(
            "https://graphql.anilist.co",
            json={
                "query": SEARCH_QUERY,
                "variables": variables
            }
        )

        data = response.json()

        results = data["data"]["Page"]["media"]

    return render_template("search.html", search_term=search_term, media_type=media_type, results=results)

# ==========MEDIA PAGE=======================================================================================================================================

# anime/manga media info page
@app.route("/media/<media_type>/<int:anilist_id>")
@login_required
def media(media_type, anilist_id):

    variables = {
        "id": anilist_id,
        "type": media_type.upper()
    }

    response = requests.post(
        "https://graphql.anilist.co",
        json={
            "query": MEDIA_QUERY,
            "variables": variables
        }
    )

    data = response.json()

    media_data = data["data"]["Media"]

    db = get_db()

    user_entry = db.execute("""
        SELECT 
            user_entries.id,
            user_entries.status,
            user_entries.score,
            user_entries.progress,
            user_entries.notes
        FROM user_entries
        JOIN series
            ON user_entries.series_id = series.id
        JOIN series_sources
            ON series.id = series_sources.series_id
        WHERE user_entries.user_id = ?
            AND series_sources.anilist_id = ?
        """, (g.user["id"], anilist_id)).fetchone()

    has_user_entry = user_entry is not None

    creators = []

    if media_type == 'manga':
        for staff_member in media_data["staff"]["edges"]:
            role = staff_member["role"]

            if "Story" in role or "Art" in role:
                name = staff_member["node"]["name"]["full"]

                if name not in creators:
                    creators.append(name)

    return render_template("media.html", media=media_data, media_type=media_type, creators=creators, has_user_entry=has_user_entry, user_entry=user_entry)

# route for updating entries in the database
@app.route("/api/entries/<int:anilist_id>", methods=['PUT'])
@login_required
def update_entry(anilist_id):
    data = request.get_json()

    status = data["status"]
    score = data["score"]
    progress = data["progress"]

    valid_statuses = [
        "watching",
        "reading",
        "completed",
        "on-hold",
        "dropped",
        "plan-to-watch",
        "plan-to-read"
    ]

    if status not in valid_statuses:
        return {
            "success": False,
            "error": "Invalid status"
        }, 400

    if score is not None:
        if not isinstance(score, (int, float)) or score < 0 or score > 10:
            return {
                "success": False,
                "error": "Invalid score"
            }, 400

    if not isinstance(progress, (int, float)) or progress < 0:
        return {
            "success": False,
            "error": "Invalid progress"
        }, 400

    db = get_db()

    result = db.execute("""
        UPDATE user_entries
        SET
            status = ?,
            score = ?,
            progress = ?
        WHERE user_id = ?
            AND series_id = (
                SELECT series_id
                FROM series_sources
                WHERE anilist_id = ?
            )
    """, (
        status, score, progress, g.user["id"], anilist_id
    ))

    if result.rowcount == 0:
        return {
            "success": False,
            "error": "Entry not found"
        }, 404

    db.commit()

    return {"success": True}

# route for updating entry notes in the database
@app.route("/api/entries/<int:anilist_id>/notes", methods=['PATCH'])
@login_required
def update_entry_notes(anilist_id):
    data = request.get_json()

    notes = data.get("notes")

    if not isinstance(notes, str):
        return {
            "success": False,
            "error": "Invalid notes"
        }, 400

    db = get_db()

    result = db.execute("""
        UPDATE user_entries
        SET notes = ?
        WHERE user_id = ?
            AND series_id = (
                SELECT series_id
                FROM series_sources
                WHERE anilist_id = ?
            )
    """, (notes, g.user["id"], anilist_id
    ))

    if result.rowcount == 0:
        return {
            "success": False,
            "error": "Entry not found"
        }, 404

    db.commit()

    return {"success": True}

# route for adding new entries to library
@app.route("/api/entries/<int:anilist_id>", methods=['POST'])
@login_required
def create_entry(anilist_id):
    data = request.get_json()

    status = data["status"]
    score = data["score"]
    progress = data["progress"]
    media_type = data["media_type"]

    db = get_db()

    source = db.execute("""
        SELECT series_id
        FROM series_sources
        WHERE anilist_id = ?
    """, (anilist_id,)).fetchone()

    # Fetch media information from AniList
    variables = {
        "id": anilist_id,
        "type": media_type.upper()
    }

    response = requests.post(
        "https://graphql.anilist.co",
        json={
            "query": MEDIA_QUERY,
            "variables": variables
        }
    )

    anilist_data = response.json()
    media_data = anilist_data["data"]["Media"]

    if source:
        series_id = source["series_id"]

        # Populate genres if they're missing
        db.execute("""
            UPDATE series
            SET genres = ?
            WHERE id = ?
              AND genres IS NULL
        """, (
            json.dumps(media_data["genres"]),
            series_id
        ))

        # Populate release year if it's missing
        db.execute("""
            UPDATE series
            SET release_year = ?
            WHERE id = ?
                AND release_year IS NULL
        """, (
            media_data["startDate"]["year"],
            series_id
        ))

    else:
        print("Anilist title not yet in series_sources")

        series_id = db.execute("""
            INSERT INTO series (
                media_type,
                title,
                cover_image,
                banner_image,
                format,
                total_progress,
                genres,
                release_year
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            media_type,
            media_data["title"]["english"] or media_data["title"]["romaji"],
            media_data["coverImage"]["extraLarge"],
            media_data["bannerImage"],
            media_data["format"],
            media_data["episodes"] if media_type == "anime" else media_data["chapters"],
            json.dumps(media_data["genres"]),
            media_data["startDate"]["year"]
        )).lastrowid

        db.execute("""
            INSERT INTO series_sources (
                series_id,
                anilist_id,
                position
            )
            VALUES (?, ?, ?)
        """, (series_id, anilist_id, 1))

    db.execute("""
        INSERT INTO user_entries (
            user_id,
            series_id,
            status,
            score,
            progress,
            notes
        )
        VALUES (?, ?, ?, ?, ?, ?)
    """, (
        g.user["id"],
        series_id,
        status,
        score,
        progress,
        ""
    ))

    db.commit()

    return {"success": True}, 201

# route for removing entries from user
@app.route("/api/entries/<int:anilist_id>", methods=['DELETE'])
@login_required
def delete_entry(anilist_id):
    db = get_db()
    
    result = db.execute("""
        DELETE FROM user_entries
        WHERE user_id = ?
            AND series_id = (
                SELECT series_id
                FROM series_sources
                WHERE anilist_id = ?
            )
        """, (g.user["id"], anilist_id))

    if result.rowcount == 0:
        return {
            "success": False,
            "error": "Entry not found"
        }, 404

    db.commit()

    return {"success": True}

# ==========CHARACTERS PAGE=======================================================================================================================================

# route for character collection tab
@app.route("/characters")
@login_required
def characters():
    favorite_characters = get_user_characters(g.user["id"])

    character_results = []

    for character in favorite_characters:
        associated_series = get_character_series(
            character["id"]
        )

        character_results.append({
            "character": character,
            "series": associated_series
        })

    return render_template("characters.html", character_results=character_results)

# route for searching api for characters
@app.route("/character-search")
@login_required
def character_search():
    search_term = request.args.get("q", "")

    characters = []

    character_results = []

    db = get_db()

    result = db.execute("""
        SELECT characters.anilist_id
        FROM user_characters
        JOIN characters
            ON user_characters.character_id = characters.id
        WHERE user_characters.user_id = ?
    """, (g.user["id"],))

    favorite_ids = {
        row["anilist_id"]
        for row in result.fetchall()
    }

    if search_term:
        variables = {
            "search": search_term
        }
    

        response = requests.post(
            "https://graphql.anilist.co",
            json={
                "query": CHARACTER_SEARCH_QUERY,
                "variables": variables
            }
        )

        data = response.json()

        if "errors" in data:
            print(data["errors"])
            characters = []
        else:
            characters = data["data"]["Page"]["characters"]

            character_results = []

            for character in characters:
                library_series = get_character_library_series(
                    g.user["id"],
                    character
                )

                character_results.append({
                    "character": character,
                    "library_series": library_series,
                    "is_favorite": character["id"] in favorite_ids
                })

    return render_template("character-search.html", character_results=character_results, search_term=search_term)

# route for adding characters to favorites
@app.route("/api/characters/<int:anilist_id>", methods=['POST'])
@login_required
def add_character(anilist_id):
    response = requests.post(
        "https://graphql.anilist.co",
        json={
            "query": CHARACTER_QUERY,
            "variables": {
                "id": anilist_id
            }
        }
    )

    data = response.json()

    if "errors" in data:
        return {"success": False, "error": "Could not retrieve character"}, 400

    character = data["data"]["Character"]

    library_series = get_character_library_series(g.user["id"], character)

    if not library_series:
        return {"success": False, "error": "No matching series in library"}, 400

    db = get_db()

    existing_character = db.execute("""
        SELECT id
        FROM characters
        WHERE anilist_id = ?
    """, (anilist_id,)).fetchone()

    if existing_character:
        character_id = existing_character["id"]

    else:
        character_id = db.execute("""
            INSERT INTO characters (
                anilist_id,
                name,
                image
            )
            VALUES (?, ?, ?)
        """, (character["id"], character["name"]["full"], character["image"]["large"])).lastrowid

    existing_favorite = db.execute("""
        SELECT id
        FROM user_characters
        WHERE user_id = ? AND character_id = ?
    """, (g.user["id"], character_id)).fetchone()

    if existing_favorite:
        return jsonify({
            "success": True,
            "already_added": True,
            "message": "This character is already in your favorites."
        }), 200

    for series in library_series:
        db.execute("""
            INSERT OR IGNORE INTO character_series (
                character_id,
                series_id
            )
            VALUES (?, ?)
        """, (character_id, series["id"]))

    favorite_count = db.execute("""
        SELECT COUNT(*) AS count
        FROM user_characters
        WHERE user_id = ?
    """, (g.user["id"],)).fetchone()["count"]

    position = favorite_count + 1

    db.execute("""
        INSERT INTO user_characters (
            user_id,
            character_id,
            position
        )
        VALUES (?, ?, ?)
    """, (g.user["id"], character_id, position))

    db.commit()

    return {"success": True}

# route for removing character from favorites
@app.route("/api/characters/<int:character_id>", methods=['DELETE'])
@login_required
def remove_character(character_id):
    user_id = g.user["id"]

    # Check whether this character belongs to the user's favorites
    db = get_db()

    favorite = db.execute("""
        SELECT id, custom_image
        FROM user_characters
        WHERE user_id = ? AND character_id = ?
    """, (user_id, character_id)).fetchone()

    if not favorite:
        return jsonify({
            "success": False,
            "error": "Character not found in favorites."
        }), 404

    # Remove the character from this user's favorites
    db.execute("""
        DELETE FROM user_characters
        WHERE user_id = ? AND character_id = ?
    """, (user_id, character_id))

    # Retrieve the remaining characters in ranking order
    remaining_characters = db.execute("""
        SELECT character_id
        FROM user_characters
        WHERE user_id = ?
        ORDER BY position
    """, (user_id,)).fetchall()

    # Reassign consecutive rankings
    character_order = []

    for position, character in enumerate(remaining_characters, start=1):
        remaining_id = character["character_id"]

        db.execute("""
            UPDATE user_characters
            SET position = ?
            WHERE user_id = ? AND character_id = ?
        """, (position, user_id, remaining_id))

        character_order.append(remaining_id)

    db.commit()

    # Clean up any custom portrait belonging to this favorite
    delete_uploaded_image(favorite["custom_image"], app.config["CHARACTER_UPLOAD_FOLDER"])

    return jsonify({
        "success": True,
        "order": character_order
    })

# route for editing favorite character names
@app.route("/api/characters/<int:character_id>/name", methods=['PATCH'])
@login_required
def update_character_name(character_id):
    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return {
            "success": False,
            "error": "Invalid request"
        }, 400

    custom_name = data.get("custom_name")

    if not isinstance(custom_name, str):
        return {
            "success": False,
            "error": "Invalid character name"
        }, 400

    custom_name = custom_name.strip()

    if len(custom_name) > 100:
        return {
            "success": False,
            "error": "Custom name too long"
        }, 400

    if custom_name == "":
        custom_name = None

    db = get_db()

    result = db.execute("""
        UPDATE user_characters
        SET custom_name = ?
        WHERE user_id = ?
            AND character_id = ?
    """, (
        custom_name,
        g.user["id"],
        character_id
    ))

    if result.rowcount == 0:
        return {
            "success": False,
            "error": "Character not found in favorites"
        }, 404

    db.commit()

    return {"success": True, "custom_name": custom_name}

# route for editing favorite character rankings
@app.route("/api/characters/<int:character_id>/rank", methods=['PATCH'])
@login_required
def update_character_rank(character_id):
    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return {"error": "Invalid request"}, 400

    new_position = data.get("position")

    if type(new_position) is not int:
        return {"error": "Invalid position"}, 400

    db = get_db()

    result = db.execute("""
        SELECT character_id
        FROM user_characters
        WHERE user_id = ?
        ORDER BY position
    """, (g.user["id"],))

    character_ids = [
        row["character_id"]
        for row in result.fetchall()
    ]

    if character_id not in character_ids:
        return {"error": "Character not found in favorites"}, 404

    if new_position < 1 or new_position > len(character_ids):
        return {"error": "Position out of range"}, 400

    character_ids.remove(character_id)

    character_ids.insert(new_position - 1, character_id)

    for position, current_character_id in enumerate(character_ids, start=1):
        db.execute("""
            UPDATE user_characters
            SET position = ?
            WHERE user_id = ?
                AND character_id = ?
        """, (
            position,
            g.user["id"],
            current_character_id
        ))

    db.commit()

    return {
        "success": True, 
        "order": character_ids
    }

# route for uploading custom character images
@app.route("/api/characters/<int:character_id>/image", methods=['POST'])
@login_required
def upload_character_image(character_id):
    user_id = g.user["id"]

    db = get_db()

    character = db.execute("""
        SELECT id, custom_image
        FROM user_characters
        WHERE user_id = ?
            AND character_id = ?
    """, (user_id, character_id)).fetchone()

    if character is None:
        return {"error": "Character not found in favorites"}, 404

    old_image_url = character["custom_image"]

    if "image" not in request.files:
        return {"error": "No image provided"}, 400

    file = request.files["image"]

    if not file.filename:
        return {"error": "No file selected"}, 400

    if not allowed_uploaded_image(file):
        return {"error": "invalid image file"}, 400

    upload_folder = app.config["CHARACTER_UPLOAD_FOLDER"]

    try:
        filename, filepath = save_uploaded_image(file, upload_folder)

    except ValueError:
        return {"error": "Could not process image"}, 400

    image_url = url_for(
        "static",
        filename=f"uploads/characters/{filename}"
    )

    try:
        db.execute("""
            UPDATE user_characters
            SET custom_image = ?
            WHERE user_id = ?
                AND character_id = ?
        """, (image_url, user_id, character_id))

        db.commit()

        if old_image_url != image_url:
            delete_uploaded_image(old_image_url, app.config["CHARACTER_UPLOAD_FOLDER"])

    except Exception:
        db.rollback()
        filepath.unlink(missing_ok=True)
        raise

    return {
        "success": True,
        "custom_image": image_url
    } 

# route for restoring default character images
@app.route("/api/characters/<int:character_id>/image", methods=['DELETE'])
@login_required
def restore_character_image(character_id):
    user_id = g.user["id"]

    db = get_db()

    character = db.execute("""
        SELECT
            user_characters.custom_image,
            characters.image
        FROM user_characters
        JOIN characters
            ON user_characters.character_id = characters.id
        WHERE user_characters.user_id = ?
            AND user_characters.character_id = ?
    """, (user_id, character_id)).fetchone()

    if character is None:
        return {"error": "Character not found"}, 404

    db.execute("""
        UPDATE user_characters
        SET custom_image = NULL
        WHERE user_id = ?
            AND character_id = ?
    """, (user_id, character_id))

    db.commit()

    delete_uploaded_image(character["custom_image"], app.config["CHARACTER_UPLOAD_FOLDER"])

    return {
        "success": True,
        "image": character["image"]
    }

# ==========COLLECTIONS PAGE=======================================================================================================================================

# route for the collections page
@app.route("/collections")
@login_required
def collections():
    user_id = g.user["id"]

    db = get_db()

    user_collections = db.execute("""
        SELECT
            collections.id,
            collections.name,
            collections.media_type,
            collections.custom_image,
            COUNT(collection_entries.id) AS entry_count
        FROM collections
        LEFT JOIN collection_entries
            ON collection_entries.collection_id = collections.id
        WHERE collections.user_id = ?
        GROUP BY collections.id
        ORDER BY collections.id DESC
    """, (user_id,)).fetchall()

    anime_entries = get_collection_library_entries(user_id, 'ANIME')
    manga_entries = get_collection_library_entries(user_id, 'MANGA')

    return render_template(
        'collections.html', 
        collections=user_collections, 
        anime_entries=prepare_collection_entries(anime_entries),
        manga_entries=prepare_collection_entries(manga_entries)
        )

# route for creating a collection
@app.route("/api/collections", methods=['POST'])
@login_required
def create_collection():
    data = request.get_json(silent=True) or {}

    name = data.get("name", "")

    if not isinstance(name, str):
        return {"error": "Invalid collection name"}, 400

    name = name.strip()
    media_type = data.get("media_type")
    entry_ids = data.get("entry_ids")

    user_id = g.user["id"]

    if not name:
        return {"error": "Collection name is required"}, 400

    if media_type not in ("ANIME", "MANGA"):
        return {"error": "Invalid collection type"}, 400

    if not isinstance(entry_ids, list) or not entry_ids:
        return {"error": "Select at least one entry"}, 400

    if (
        any(type(entry_id) is not int for entry_id in entry_ids)
        or len(entry_ids) != len(set(entry_ids))
    ):
        return {"error": "Invalid collection entries"}, 400

    db = get_db()

    result = db.execute("""
        SELECT ue.id
        FROM user_entries AS ue
        JOIN series AS s 
            ON ue.series_id = s.id
        WHERE ue.user_id = ?
            AND UPPER(s.media_type) = ?
    """, (user_id, media_type))

    valid_entry_ids = {row["id"] for row in result.fetchall()}

    if not set(entry_ids).issubset(valid_entry_ids):
        return {"error": "Some entries are invalid for this collection"}, 400

    try:
        collection_id = db.execute("""
            INSERT into collections (user_id, name, media_type)
            VALUES (?, ?, ?)
        """, (user_id, name, media_type)).lastrowid

        for position, entry_id in enumerate(entry_ids):
            db.execute("""
                INSERT INTO collection_entries (
                    collection_id,
                    user_entry_id,
                    position
                )
                VALUES (?, ?, ?)
            """, (collection_id, entry_id, position))

        db.commit()

    except Exception:
        db.rollback()
        raise

    return {"success": True, "collection_id": collection_id}, 201

# route for viewing created collections
@app.route("/api/collections/<int:collection_id>", methods=['GET'])
@login_required
def get_collection(collection_id):
    user_id = g.user["id"]

    db = get_db()

    collection = db.execute("""
        SELECT id, name, media_type, custom_image
        FROM collections
        WHERE id = ?
            AND user_id = ?
    """, (collection_id, user_id)).fetchone()

    if collection is None:
        abort(404)

    result = db.execute("""
        SELECT
            ue.id AS user_entry_id,
            s.id AS series_id,
            s.media_type AS media_type,
            s.title,
            s.cover_image,
            ue.status,
            ue.score,
            ce.position,
            (
                SELECT series_sources.anilist_id
                FROM series_sources
                WHERE series_sources.series_id = s.id
                ORDER BY series_sources.position
                LIMIT 1
            ) AS anilist_id
        FROM collection_entries AS ce
        JOIN user_entries AS ue
            ON ce.user_entry_id = ue.id
        JOIN series AS s
            ON ue.series_id = s.id
        WHERE ce.collection_id = ?
            AND ue.user_id = ?
        ORDER BY ce.position
    """, (collection_id, user_id))

    entries = [dict(row) for row in result.fetchall()]

    return {
        "collection": dict(collection),
        "entries": [dict(entry) for entry in entries]
    }, 200

# route for uploading custom collection images
@app.route("/api/collections/<int:collection_id>/image", methods=['POST'])
@login_required
def upload_collection_image(collection_id):
    user_id = g.user["id"]

    db = get_db()

    collection = db.execute("""
        SELECT id, custom_image
        FROM collections
        WHERE id = ?
            AND user_id = ?
    """, (collection_id, user_id)).fetchone()

    if collection is None:
        return {"error": "Collection not found"}, 404

    old_image_url = collection["custom_image"]

    if "image" not in request.files:
        return {"error": "No image provided"}, 400

    file = request.files["image"]

    if not file.filename:
        return {"error": "No file selected"}, 400

    if not allowed_uploaded_image(file):
        return {"error": "Invalid image file"}, 400

    try:
        filename, filepath = save_uploaded_image(file, app.config["COLLECTION_UPLOAD_FOLDER"])

    except ValueError:
        return {"error": "Could not process image"}, 400

    image_url = url_for("static", filename=f"uploads/collections/{filename}")

    try:
        db.execute("""
            UPDATE collections
            SET custom_image = ?
            WHERE id = ?
              AND user_id = ?
        """, (image_url, collection_id, user_id))

        db.commit()

    except Exception:
        db.rollback()
        filepath.unlink(missing_ok=True)
        raise

    if old_image_url != image_url:
        delete_uploaded_image(old_image_url, app.config["COLLECTION_UPLOAD_FOLDER"])

    return {"success": True, "custom_image": image_url}, 200

# route for deleting collections
@app.route("/api/collections/<int:collection_id>", methods=['DELETE'])
@login_required
def delete_collection(collection_id):
    user_id = g.user["id"]

    db = get_db()

    collection = db.execute("""
        SELECT id, custom_image
        FROM collections
        WHERE id = ?
            AND user_id = ?
    """, (collection_id, user_id)).fetchone()

    if collection is None:
        return {"error": "Collection not found"}, 404

    old_image_url = collection["custom_image"]

    try:
        db.execute("""
            DELETE FROM collection_entries
            WHERE collection_id = ?
        """, (collection_id,))

        db.execute("""
            DELETE FROM collections
            WHERE id = ?
                AND user_id = ?
        """, (collection_id, user_id))

        db.commit()

    except Exception:
        db.rollback()
        raise

    delete_uploaded_image(old_image_url, app.config["COLLECTION_UPLOAD_FOLDER"])

    return {"success": True}, 200

# route for updating an exising collection
@app.route("/api/collections/<int:collection_id>", methods=['PUT'])
@login_required
def update_collection(collection_id):
    user_id = g.user["id"]

    data = request.get_json(silent=True) or {}

    name = str(data.get("name", "").strip())

    if not isinstance(name, str):
        return {"error": "Invalid collection name"}, 400
    
    name = name.strip()
    media_type = data.get("media_type")
    entry_ids = data.get("entry_ids", [])

    # Validate the submitted format
    if not name:
        return {"error": "Collection name is required"}, 400

    if media_type not in ("ANIME", "MANGA"):
        return {"error": "Invalid collection type"}, 400

    if not isinstance(entry_ids, list) or not entry_ids:
        return {"error": "Select at least one entry"}, 400

    if (
        any(type(entry_id) is not int for entry_id in entry_ids)
        or len(entry_ids) != len(set(entry_ids))
    ):
        return {"error": "Invalid collection entries"}, 400

    # Make sure collection belongs to user
    db = get_db()

    collection = db.execute("""
        SELECT id, media_type
        FROM collections
        WHERE id = ?
            AND user_id = ?
    """, (collection_id, user_id)).fetchone()

    if collection is None:
        return {"error": "Collection not found"}, 404

    # Make sure all selected entries belong to user, match collection's media type
    placeholders = ",".join("?" for _ in entry_ids)

    valid_entries = db.execute(f"""
        SELECT user_entries.id
        FROM user_entries
        JOIN series
            ON series.id = user_entries.series_id
        WHERE user_entries.user_id = ?
            AND UPPER(series.media_type) = ?
            AND user_entries.id IN ({placeholders})
    """, (user_id, media_type, *entry_ids)).fetchall()

    if len(valid_entries) != len(entry_ids):
        return {"error": "One or more selected entries are invalid"}, 400

    try:
        # Update collection information
        db.execute("""
            UPDATE collections
            SET name = ?, media_type = ?
            WHERE id = ?
                AND user_id = ?
        """, (name, media_type, collection_id, user_id))

        # Replace collection's existing entries
        db.execute("""
            DELETE FROM collection_entries
            WHERE collection_id = ?
        """, (collection_id,))

        for position, entry_id in enumerate(entry_ids):
            db.execute("""
                INSERT INTO collection_entries
                    (collection_id, user_entry_id, position)
                VALUES (?, ?, ?)
            """, (collection_id, entry_id, position))

        db.commit()

    except Exception:
        db.rollback()
        raise

    return {"success": True, "collection_id": collection_id}, 200

# ==========STATS PAGE=======================================================================================================================================

# route for the stats page
@app.route("/stats")
@login_required
def stats():
    db = get_db()

    anime_status_rows = db.execute("""
        SELECT
            user_entries.status,
            COUNT(*) AS total
        FROM user_entries
        JOIN series
            ON user_entries.series_id = series.id
        WHERE user_entries.user_id = ?
            AND series.media_type = 'anime'
        GROUP BY user_entries.status
    """, (g.user["id"],)).fetchall()

    anime_status_counts = {
        row["status"]: row["total"]
        for row in anime_status_rows
    }

    manga_status_rows = db.execute("""
            SELECT
                user_entries.status,
                COUNT(*) AS total
            FROM user_entries
            JOIN series
                ON user_entries.series_id = series.id
            WHERE user_entries.user_id = ?
                AND series.media_type = 'manga'
            GROUP BY user_entries.status
        """, (g.user["id"],)).fetchall()
    
    manga_status_counts = {
        row["status"]: row["total"]
        for row in manga_status_rows
    }

    score_rows = db.execute("""
        SELECT
            series.media_type,
            user_entries.score,
            COUNT(*) AS total
        FROM user_entries
        JOIN series
            ON user_entries.series_id = series.id
        WHERE user_entries.user_id = ?
            AND user_entries.score IS NOT NULL
        GROUP BY
            series.media_type,
            user_entries.score
        ORDER BY user_entries.score
    """, (g.user["id"],)).fetchall()

    score_distribution = {
        "anime": {},
        "manga": {}
    }

    for row in score_rows:
        media_type = row["media_type"]
        score = row["score"]
        total = row["total"]

        if media_type in score_distribution:
            score_distribution[media_type][score] = total

    genre_rows = db.execute("""
        SELECT
            series.media_type,
            series.genres
        FROM user_entries
        JOIN series
            ON user_entries.series_id = series.id
        WHERE user_entries.user_id = ?
    """, (g.user["id"],)).fetchall()

    genre_counts = {
        "anime": Counter(),
        "manga": Counter()
    }

    for row in genre_rows:
        media_type = row["media_type"]

        if media_type not in genre_counts:
            continue

        genres = json.loads(row["genres"] or "[]")

        # Count each genre only once per series
        genre_counts[media_type].update(set(genres))

    popular_genres = {
        media_type: dict(counts.most_common(10))
        for media_type, counts in genre_counts.items()
    }

    yearly_rate_rows = db.execute("""
        SELECT
            series.media_type,
            series.release_year,
            series.title,
            user_entries.score
        FROM user_entries
        JOIN series
            ON user_entries.series_id = series.id
        WHERE user_entries.user_id = ?
            AND user_entries.score IS NOT NULL
            AND series.release_year IS NOT NULL
        ORDER BY
            series.media_type,
            series.release_year,
            user_entries.score DESC,
            series.title
    """, (g.user["id"],)).fetchall()

    highest_rated_by_year = {
        "anime": {},
        "manga": {}
    }

    for row in yearly_rate_rows:
        media_type = row["media_type"]
        year = row["release_year"]
        title = row["title"]
        score = row["score"]

        if media_type not in highest_rated_by_year:
            continue

        yearly_data = highest_rated_by_year[media_type]

        if year not in yearly_data:
            yearly_data[year] = {
                "score": score,
                "titles": [title]
            }

        elif score == yearly_data[year]["score"]:
            yearly_data[year]["titles"].append(title)

    progress_rows = db.execute("""
        SELECT
            series.media_type,
            COALESCE(SUM(user_entries.progress), 0) AS total
        FROM user_entries
        JOIN series
            ON user_entries.series_id = series.id
        WHERE user_entries.user_id = ?
        GROUP BY series.media_type
    """, (g.user["id"],)).fetchall()

    total_progress = {
        "anime": 0,
        "manga": 0
    }

    for row in progress_rows:
        if row["media_type"] in total_progress:
            total_progress[row["media_type"]] = row["total"]

    top_rated_rows = db.execute("""
        SELECT
            series.id,
            series.media_type,
            series.title,
            series.cover_image,
            user_entries.score,
            series_sources.anilist_id
        FROM user_entries
        JOIN series
            ON user_entries.series_id = series.id
        JOIN series_sources
            ON series.id = series_sources.series_id
            AND series_sources.position = 1
        WHERE user_entries.user_id = ?
            AND user_entries.score IS NOT NULL
        ORDER BY
            series.media_type,
            user_entries.score DESC,
            series.title ASC
    """, (g.user["id"],)).fetchall()

    top_rated = {
        "anime": [],
        "manga": []
    }

    for row in top_rated_rows:
        media_type = row["media_type"]

        if media_type not in top_rated:
            continue

        if len(top_rated[media_type]) >= 10:
            continue

        top_rated[media_type].append({
            "title": row["title"],
            "cover_image": row["cover_image"],
            "score": row["score"],
            "anilist_id": row["anilist_id"]
        })

    decade_rows = db.execute("""
        SELECT
            series.media_type,
            (series.release_year / 10) * 10 AS decade,
            COUNT(*) AS total
        FROM user_entries
        JOIN series
            ON user_entries.series_id = series.id
        WHERE user_entries.user_id = ?
            AND series.release_year IS NOT NULL
        GROUP BY
            series.media_type,
            decade
        ORDER BY decade
    """, (g.user["id"],)).fetchall()

    release_decades = {
        "anime": {},
        "manga": {}
    }

    for row in decade_rows:
        media_type = row["media_type"]
        decade = row["decade"]

        if media_type in release_decades:
            release_decades[media_type][decade] = row["total"]

    average_score_rows = db.execute("""
        SELECT
            series.media_type,
            ROUND(AVG(user_entries.score), 2) AS average_score
        FROM user_entries
        JOIN series
            ON user_entries.series_id = series.id
        WHERE user_entries.user_id = ?
            AND user_entries.score IS NOT NULL
        GROUP BY series.media_type
    """, (g.user["id"],)).fetchall()

    average_scores = {
        "anime": None,
        "manga": None
    }

    for row in average_score_rows:
        media_type = row["media_type"]

        if media_type in average_scores:
            average_scores[media_type] = row["average_score"]

    profile = db.execute("""
        SELECT
            users.name,
            user_profiles.profile_image,
            user_profiles.favorite_anime_id,
            user_profiles.favorite_manga_id,
            user_profiles.favorite_character_id
        FROM users
        LEFT JOIN user_profiles
            ON users.id = user_profiles.user_id
        WHERE users.id = ?
    """, (g.user["id"],)).fetchone()

    favorite_anime = None

    if profile["favorite_anime_id"]:
        favorite_anime = db.execute("""
            SELECT id, title, cover_image
            FROM series
            WHERE id = ?
                AND media_type = 'anime'
        """, (profile["favorite_anime_id"],)).fetchone()

    favorite_manga = None

    if profile["favorite_manga_id"]:
        favorite_manga = db.execute("""
            SELECT id, title, cover_image
            FROM series
            WHERE id = ?
                AND media_type = 'manga'
        """, (profile["favorite_manga_id"],)).fetchone()

    favorite_character = None

    if profile["favorite_character_id"]:
        favorite_character = db.execute("""
            SELECT
                characters.id,
                COALESCE(
                    NULLIF(user_characters.custom_name, ''),
                    characters.name
                ) AS display_name,
                COALESCE(
                    NULLIF(user_characters.custom_image, ''),
                    characters.image
                ) AS display_image
            FROM characters
            JOIN user_characters
                ON characters.id = user_characters.character_id
            WHERE characters.id = ?
                AND user_characters.user_id = ?
        """, (
            profile["favorite_character_id"],
            g.user["id"]
        )).fetchone()

    favorite_options_rows = db.execute("""
        SELECT
            series.id,
            series.media_type,
            series.title
        FROM user_entries
        JOIN series
            ON user_entries.series_id = series.id
        WHERE user_entries.user_id = ?
            AND series.media_type IN ('anime', 'manga')
        ORDER BY series.title COLLATE NOCASE
    """, (g.user["id"],)).fetchall()

    favorite_options = {
        "anime": [],
        "manga": []
    }

    for row in favorite_options_rows:
        favorite_options[row["media_type"]].append({
            "id": row["id"],
            "title": row["title"]
        })

    favorite_character_options = db.execute("""
        SELECT
            characters.id,
            COALESCE(
                NULLIF(user_characters.custom_name, ''),
                characters.name
            ) AS name
        FROM user_characters
        JOIN characters
            ON user_characters.character_id = characters.id
        WHERE user_characters.user_id = ?
        ORDER BY name COLLATE NOCASE
    """, (g.user["id"],)).fetchall()

    saved_dashboard_cards = db.execute("""
        SELECT card_id, position, visible
        FROM user_dashboard_cards
        WHERE user_id = ?
        ORDER BY position
    """, (g.user["id"],)).fetchall()

    default_card_order = [
        "profile",
        "anime-status",
        "manga-status",
        "score-distribution",
        "popular-genres",
        "yearly-rating",
        "total-progress",
        "top-rated",
        "release-decades",
        "average-scores"
    ]

    for position, card_id in enumerate(default_card_order):
        db.execute("""
            INSERT OR IGNORE INTO user_dashboard_cards
                (user_id, card_id, position, visible)
            VALUES (?, ?, ?, 1)
        """, (g.user["id"], card_id, position))

    db.commit()

    card_order = [
        row["card_id"]
        for row in saved_dashboard_cards
    ]

    hidden_cards = [
        row["card_id"]
        for row in saved_dashboard_cards
        if not row["visible"]
    ]

    return render_template(
        "stats.html", 
        anime_status_counts=anime_status_counts, 
        manga_status_counts=manga_status_counts,
        score_distribution=score_distribution,
        popular_genres=popular_genres,
        highest_rated_by_year=highest_rated_by_year,
        total_progress=total_progress,
        top_rated=top_rated,
        release_decades=release_decades,
        average_scores=average_scores,
        profile=profile,
        favorite_anime=favorite_anime,
        favorite_manga=favorite_manga,
        favorite_character=favorite_character,
        favorite_options=favorite_options,
        favorite_character_options=favorite_character_options,
        card_order=card_order,
        hidden_cards=hidden_cards
    )

# route for uploading user profile_pictures
@app.route("/profile_upload-picture", methods=['POST'])
@login_required
def upload_profile_picture():
    uploaded_file = request.files.get("profile_picture")

    if not uploaded_file or not uploaded_file.filename:
        flash("Please select an image.")
        return redirect(url_for("stats"))

    if not allowed_uploaded_image(uploaded_file):
        flash("Please upload a valid JPEG, PNG, or WebP image.")
        return redirect(url_for("stats"))

    upload_folder = app.config["PROFILE_UPLOAD_FOLDER"]

    try:
        filename, filepath = save_uploaded_image(
            uploaded_file,
            upload_folder
        )
    except ValueError:
        flash("Could not process the selected image.")
        return redirect(url_for("stats"))

    image_url = url_for(
        "static",
        filename=f"uploads/profile_picture/{filename}"
    )

    db = get_db()

    # Retrieve the user's previous profile picture
    previous_profile = db.execute("""
        SELECT profile_image
        FROM user_profiles
        WHERE user_id = ?
    """, (g.user["id"],)).fetchone()

    previous_image = (
        previous_profile["profile_image"]
        if previous_profile else None
    )

    try:
        db.execute("""
            INSERT INTO user_profiles (user_id, profile_image)
            VALUES (?, ?)
            ON CONFLICT(user_id)
            DO UPDATE SET profile_image = excluded.profile_image
        """, (g.user["id"], image_url))

        db.commit()

    except Exception:
        db.rollback()
        filepath.unlink(missing_ok=True)
        raise

    # Delete the old picture only after the database update succeeds
    if previous_image:
        delete_uploaded_image(previous_image, upload_folder)

    flash("Profile picture updated!")
    return redirect(url_for("stats"))

# route for updating user profile favorites
@app.route("/profile/update-favorites", methods=['POST'])
@login_required
def update_profile_favorites():
    db = get_db()

    favorite_anime_id = request.form.get("favorite_anime_id")
    favorite_manga_id = request.form.get("favorite_manga_id")
    favorite_character_id = request.form.get("favorite_character_id")

    def parse_id(value):
        if value is None or value == "":
            return None

        try:
            parsed = int(value)
        except ValueError:
            raise ValueError("Invalid favorite ID")

        if parsed <= 0:
            raise ValueError("Invalid favorite ID")

        return parsed

    favorite_anime_id = parse_id(favorite_anime_id)
    favorite_manga_id = parse_id(favorite_manga_id)
    favorite_character_id = parse_id(favorite_character_id)

    # Validate anime and manga selections
    for media_type, series_id in (
        ("anime", favorite_anime_id),
        ("manga", favorite_manga_id)
    ):
        if series_id is None:
            continue

        valid_entry = db.execute("""
            SELECT 1
                FROM user_entries
                JOIN series
                    ON user_entries.series_id = series.id
                WHERE user_entries.user_id = ?
                    AND series.id = ?
                    AND series.media_type = ?
            """, (g.user["id"], series_id, media_type)).fetchone()

        if not valid_entry:
            flash("Invalid favorite series selection.")
            return redirect(url_for('stats'))

    # Validate the character selection
    if favorite_character_id is not None:
        valid_character = db.execute("""
            SELECT 1
            FROM user_characters
            WHERE user_id = ?
                AND character_id = ?
        """, (g.user["id"], favorite_character_id)).fetchone()

        if not valid_character:
            flash("Invalid favorite character selection.")
            return redirect(url_for("stats"))

    db.execute("""
        INSERT INTO user_profiles (
            user_id,
            favorite_anime_id,
            favorite_manga_id,
            favorite_character_id
        )
        VALUES (?, ?, ?, ?)
        ON CONFLICT(user_id)
        DO UPDATE SET
            favorite_anime_id = excluded.favorite_anime_id,
            favorite_manga_id = excluded.favorite_manga_id,
            favorite_character_id = excluded.favorite_character_id
    """, (
        g.user["id"],
        favorite_anime_id,
        favorite_manga_id,
        favorite_character_id
    ))

    db.commit()

    flash("Favorites updated successfully!")
    return redirect(url_for('stats'))

# route for saving user stats card layout
@app.route("/api/stats/card-order", methods=['POST'])
@login_required
def update_stats_card_order():
    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return {"error": "Invalid request"}, 400

    card_order = data.get("card_order")

    valid_cards = {
        "profile",
        "anime-status",
        "manga-status",
        "score-distribution",
        "popular-genres",
        "yearly-rating",
        "total-progress",
        "top-rated",
        "release-decades",
        "average-scores"
    }

    if (
        not isinstance(card_order, list)
        or len(card_order) != len(valid_cards)
        or len(set(str(card) for card in card_order)) != len(valid_cards)
        or any (
            not isinstance(card, str) or card not in valid_cards
            for card in card_order
        )
    ):
        return {"error": "Invalid card order"}, 400

    db = get_db()

    for position, card_id in enumerate(card_order):
        db.execute("""
            INSERT INTO user_dashboard_cards
                (user_id, card_id, position, visible)
            VALUES (?, ?, ?, 1)
            ON CONFLICT(user_id, card_id)
            DO UPDATE SET
                position = excluded.position
        """, (g.user["id"], card_id, position))

    db.commit()

    return {"success": True}

# route for saving stat card visibility settings
@app.route("/api/stats/card-visibility", methods=['POST'])
@login_required
def update_stats_card_visibility():
    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return {"error": "Invalid request"}, 400

    card_id = data.get("card_id")
    visible = data.get("visible")

    valid_cards = {
        "profile",
        "anime-status",
        "manga-status",
        "score-distribution",
        "popular-genres",
        "yearly-rating",
        "total-progress",
        "top-rated",
        "release-decades",
        "average-scores"
    }

    if card_id not in valid_cards or not isinstance(visible, bool):
        return {"error": "Invalid card visibility data"}, 400

    db = get_db()

    existing_card = db.execute("""
        SELECT position
        FROM user_dashboard_cards
        WHERE user_id = ? AND card_id = ?
    """, (g.user["id"], card_id)).fetchone()

    if existing_card is None:
        return {"error": "Dashboard layout not initialized"}, 409

    db.execute("""
        UPDATE user_dashboard_cards
        SET visible = ?
        WHERE user_id = ? AND card_id = ?
    """, (int(visible), g.user["id"], card_id))

    db.commit()

    return {"success": True}

# ==========SQLITE TABLES=======================================================================================================================================
with app.app_context():
    db = get_db()

    # users table
    db.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            theme TEXT NOT NULL DEFAULT 'midnight'
        )
    """)

    # series table
    db.execute("""
        CREATE TABLE IF NOT EXISTS series (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            media_type TEXT NOT NULL,
            title TEXT NOT NULL,
            cover_image TEXT,
            banner_image TEXT,
            format TEXT,
            total_progress INTEGER,
            genres TEXT,
            release_year INTEGER
        )
    """)

    # series sources table
    db.execute("""
        CREATE TABLE IF NOT EXISTS series_sources (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            series_id INTEGER NOT NULL,
            anilist_id INTEGER NOT NULL,
            position INTEGER NOT NULL,
    
            FOREIGN KEY (series_id) REFERENCES series(id),
    
            UNIQUE(anilist_id)
        )
    """)

    # user entries table
    db.execute("""
        CREATE TABLE IF NOT EXISTS user_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            series_id INTEGER NOT NULL,
            status TEXT NOT NULL,
            score REAL,
            progress INTEGER NOT NULL DEFAULT 0,
            notes TEXT,
    
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (series_id) REFERENCES series(id),
    
            UNIQUE(user_id, series_id)
        )
    """)



    # user profiles table
    db.execute("""
        CREATE TABLE IF NOT EXISTS user_profiles (
            user_id INTEGER PRIMARY KEY,
            profile_image TEXT,
            favorite_anime_id INTEGER,
            favorite_manga_id INTEGER,
            favorite_character_id INTEGER,
            
            FOREIGN KEY (user_id)
                REFERENCES users(id)
                ON DELETE CASCADE,
                
            FOREIGN KEY (favorite_anime_id)
                REFERENCES series(id)
                ON DELETE SET NULL,
            
            FOREIGN KEY (favorite_manga_id)
                REFERENCES series(id)
                ON DELETE SET NULL,
                
            FOREIGN KEY (favorite_character_id)
                REFERENCES characters(id)
                ON DELETE SET NULL
        )
    """)

    # user_dashboard_cards table
    db.execute("""
        CREATE TABLE IF NOT EXISTS user_dashboard_cards (
            user_id INTEGER NOT NULL,
            card_id TEXT NOT NULL,
            position INTEGER NOT NULL,
            visible INTEGER NOT NULL DEFAULT 1,
            
            PRIMARY KEY (user_id, card_id),
            
            FOREIGN KEY (user_id)
                REFERENCES users(id)
                ON DELETE CASCADE,
                
            CHECK (visible IN (0, 1))
        )
    """)



    # characters table
    db.execute("""
        CREATE TABLE IF NOT EXISTS characters (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            anilist_id INTEGER UNIQUE NOT NULL,
            name TEXT NOT NULL,
            image TEXT
        )
    """)

    # character series table
    db.execute("""
        CREATE TABLE IF NOT EXISTS character_series (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            character_id INTEGER NOT NULL,
            series_id INTEGER NOT NULL,
        
            FOREIGN KEY (character_id)
                REFERENCES characters(id),
            
            FOREIGN KEY (series_id)
                REFERENCES series(id),
            
            UNIQUE(character_id, series_id)
        )
    """)

    # user characters table
    db.execute("""
        CREATE TABLE IF NOT EXISTS user_characters (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            character_id INTEGER NOT NULL,
            position INTEGER NOT NULL,
            custom_name TEXT,
            custom_image TEXT,
            notes TEXT,
        
            FOREIGN KEY (user_id)
                REFERENCES users(id),
            
            FOREIGN KEY (character_id)
                REFERENCES characters(id),
            
            UNIQUE(user_id, character_id)
        )
    """)



    # collections table
    db.execute("""
        CREATE TABLE IF NOT EXISTS collections (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            media_type TEXT NOT NULL
                CHECK (media_type IN ('ANIME', 'MANGA')),
            custom_image TEXT,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    """)

    # collection entries table
    db.execute("""
    CREATE TABLE IF NOT EXISTS collection_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        collection_id INTEGER NOT NULL,
        user_entry_id INTEGER NOT NULL,
        position INTEGER NOT NULL,
        
        FOREIGN KEY (collection_id)
            REFERENCES collections(id)
            ON DELETE CASCADE,
            
        FOREIGN KEY (user_entry_id)
            REFERENCES user_entries(id)
            ON DELETE CASCADE,
            
        UNIQUE (collection_id, user_entry_id)
    )
""")




    db.commit()




# =================================================================================================================================================



if __name__ == '__main__':
    app.run(debug=True)