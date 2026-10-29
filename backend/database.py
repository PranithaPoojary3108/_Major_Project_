import os
import sqlite3
import json
from datetime import datetime
from contextlib import contextmanager

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "evoting.db")
TEMPLATES_JSON_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "templates_db.json")

DEFAULT_CANDIDATES = [
    (1, "Pranitha C Poojary (NNM23IS134)"),
    (2, "Srajan J Poojary (NNM22IS173)"),
    (3, "Aashna Mathias (NNM23IS001)"),
    (4, "Abhimanyu Rai B S (NNM23IS002)"),
    (5, "Pranjali N (NNM23IS135)"),
    (6, "Raksha S Suvarna (NNM23IS143)"),
    (7, "Nireeksha (NNM23IS111)"),
    (8, "H Nihal Shetty (NNM23IS074)"),
    (9, "Rishika Rajesh Kumar (NNM23IS147)"),
    (10, "Spoorthi (NNM23IS183)")
]

@contextmanager
def get_db_connection():
    """Context manager yielding SQLite connection and guaranteeing connection closure."""
    conn = sqlite3.connect(DB_PATH, timeout=10.0)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()

def init_db():
    """
    Initializes SQLite database schema for persistent election lifecycle,
    candidates, voter enrollments, and cast ballots.
    """
    with get_db_connection() as conn:
        cursor = conn.cursor()

        # 1. Election lifecycle singleton table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS election_lifecycle (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                contract_address TEXT,
                status INTEGER DEFAULT 0,
                status_label TEXT DEFAULT 'NotStarted',
                start_time INTEGER,
                end_time INTEGER,
                total_votes INTEGER DEFAULT 0,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Ensure singleton row exists
        cursor.execute("SELECT id FROM election_lifecycle WHERE id = 1")
        if not cursor.fetchone():
            cursor.execute("""
                INSERT INTO election_lifecycle (id, contract_address, status, status_label, start_time, end_time, total_votes)
                VALUES (1, NULL, 0, 'NotStarted', NULL, NULL, 0)
            """)

        # 2. Official candidates table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS candidates (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                vote_count INTEGER DEFAULT 0
            )
        """)

        # Seed default candidates if empty
        cursor.execute("SELECT COUNT(*) as cnt FROM candidates")
        if cursor.fetchone()["cnt"] == 0:
            cursor.executemany(
                "INSERT INTO candidates (id, name, vote_count) VALUES (?, ?, 0)",
                DEFAULT_CANDIDATES
            )

        # 3. Voter enrollments table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS voter_enrollments (
                voter_address TEXT PRIMARY KEY,
                checksum_address TEXT,
                biometric_hash TEXT NOT NULL,
                embedding_json TEXT NOT NULL,
                is_registered_onchain INTEGER DEFAULT 0,
                enrolled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # 4. Cast ballots table (Enforces 1 vote per voter in database)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS ballots_cast (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                voter_address TEXT UNIQUE NOT NULL,
                checksum_address TEXT NOT NULL,
                candidate_id INTEGER NOT NULL,
                biometric_hash TEXT NOT NULL,
                tx_hash TEXT,
                block_number INTEGER,
                voted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (candidate_id) REFERENCES candidates(id)
            )
        """)

        # 5. Security events & suspicious activity log table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS security_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_type TEXT NOT NULL,
                severity TEXT NOT NULL,
                voter_address TEXT,
                source_ip TEXT,
                endpoint TEXT,
                status TEXT NOT NULL,
                details TEXT,
                tx_hash TEXT,
                block_number INTEGER,
                is_reviewed INTEGER DEFAULT 0,
                reviewed_at TIMESTAMP,
                reviewed_by TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_sec_type ON security_events(event_type)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_sec_sev ON security_events(severity)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_sec_voter ON security_events(voter_address)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_sec_created ON security_events(created_at)")

        # 6. Role-Based Access Control: Users & Credentials table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                display_name TEXT NOT NULL,
                role TEXT NOT NULL,
                password_hash TEXT NOT NULL,
                salt TEXT NOT NULL,
                wallet_address TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)")

        # 7. Active User Sessions table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS user_sessions (
                token_hash TEXT PRIMARY KEY,
                username TEXT NOT NULL,
                role TEXT NOT NULL,
                expires_at INTEGER NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_sess_user ON user_sessions(username)")

        conn.commit()

    # Migrate any existing templates from fingerprint_db.json if database was empty
    _migrate_from_json_if_needed()

def _migrate_from_json_if_needed():
    """Migrates existing enrollments from fingerprint_db.json into SQLite if not present."""
    if not os.path.exists(TEMPLATES_JSON_PATH):
        return

    try:
        with open(TEMPLATES_JSON_PATH, "r") as f:
            data = json.load(f)
        if not isinstance(data, dict):
            return

        with get_db_connection() as conn:
            cursor = conn.cursor()
            for addr_lower, val in data.items():
                if not isinstance(val, dict):
                    continue
                bio_hash = val.get("biometric_hash")
                emb = val.get("embedding", [])
                if bio_hash and emb:
                    cursor.execute("""
                        INSERT OR IGNORE INTO voter_enrollments 
                        (voter_address, checksum_address, biometric_hash, embedding_json, is_registered_onchain)
                        VALUES (?, ?, ?, ?, 1)
                    """, (addr_lower.lower(), addr_lower, bio_hash, json.dumps(emb)))
            conn.commit()
    except Exception as e:
        print(f"[DB Migration Notice] {e}")

# ── Election Lifecycle Helpers ────────────────────────────────────────────────

def get_election_lifecycle():
    """Retrieves current persistent election state from SQLite."""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM election_lifecycle WHERE id = 1")
        row = cursor.fetchone()
        if row:
            return dict(row)
        return {
            "status": 0,
            "status_label": "NotStarted",
            "start_time": None,
            "end_time": None,
            "total_votes": 0,
            "contract_address": None
        }

def update_election_lifecycle(status=None, status_label=None, start_time=None, end_time=None, total_votes=None, contract_address=None):
    """Updates persistent election lifecycle fields in SQLite."""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        current = get_election_lifecycle()

        new_status = status if status is not None else current["status"]
        new_label = status_label if status_label is not None else current["status_label"]
        new_start = start_time if start_time is not None else current["start_time"]
        new_end = end_time if end_time is not None else current["end_time"]
        new_votes = total_votes if total_votes is not None else current["total_votes"]
        new_addr = contract_address if contract_address is not None else current["contract_address"]

        cursor.execute("""
            UPDATE election_lifecycle
            SET status = ?, status_label = ?, start_time = ?, end_time = ?, total_votes = ?, contract_address = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = 1
        """, (new_status, new_label, new_start, new_end, new_votes, new_addr))
        conn.commit()

# ── Voter Enrollment Helpers ──────────────────────────────────────────────────

def save_voter_enrollment(voter_address, checksum_address, biometric_hash, embedding, is_registered_onchain=True):
    """Saves voter enrollment to SQLite and mirrors to fingerprint_db.json."""
    addr_clean = voter_address.strip().lower()
    emb_json = json.dumps(embedding if isinstance(embedding, list) else embedding.tolist())

    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT OR REPLACE INTO voter_enrollments
            (voter_address, checksum_address, biometric_hash, embedding_json, is_registered_onchain, enrolled_at)
            VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        """, (addr_clean, checksum_address, biometric_hash, emb_json, 1 if is_registered_onchain else 0))
        conn.commit()

    # Mirror to JSON file for backward compatibility
    _sync_json_from_db()

def get_voter_status(voter_address):
    """
    Returns complete voter status from database:
    - is_enrolled_offchain
    - is_registered_onchain
    - has_voted
    - biometric_hash
    """
    addr_clean = voter_address.strip().lower()

    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM voter_enrollments WHERE voter_address = ?", (addr_clean,))
        voter = cursor.fetchone()

        cursor.execute("SELECT id, candidate_id, voted_at FROM ballots_cast WHERE voter_address = ?", (addr_clean,))
        ballot = cursor.fetchone()

        if not voter:
            return {
                "voter_address": voter_address,
                "is_enrolled_offchain": False,
                "is_registered_onchain": False,
                "has_voted": False,
                "biometric_hash_offchain": None,
                "ballot": None
            }

        return {
            "voter_address": voter["voter_address"],
            "checksum_address": voter["checksum_address"],
            "is_enrolled_offchain": True,
            "is_registered_onchain": bool(voter["is_registered_onchain"]),
            "has_voted": ballot is not None,
            "biometric_hash_offchain": voter["biometric_hash"],
            "ballot": dict(ballot) if ballot else None
        }

def get_all_enrolled_voters():
    """Returns list of all enrolled voters from database."""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT voter_address, checksum_address, biometric_hash, embedding_json, is_registered_onchain FROM voter_enrollments")
        rows = cursor.fetchall()
        result = []
        for r in rows:
            emb = []
            try:
                parsed = json.loads(r["embedding_json"])
                if isinstance(parsed, list):
                    emb = parsed
            except Exception:
                pass

            result.append({
                "voter_address": r["voter_address"],
                "checksum_address": r["checksum_address"],
                "biometric_hash": r["biometric_hash"],
                "embedding": emb,
                "is_registered_onchain": bool(r["is_registered_onchain"])
            })
        return result

def _sync_json_from_db():
    """Synchronizes fingerprint_db.json from voter_enrollments table."""
    try:
        voters = get_all_enrolled_voters()
        data = {}
        for v in voters:
            data[v["voter_address"]] = {
                "embedding": v["embedding"],
                "biometric_hash": v["biometric_hash"]
            }
        with open(TEMPLATES_JSON_PATH, "w") as f:
            json.dump(data, f, indent=2)
    except Exception as e:
        print(f"[Sync JSON Warning] {e}")

# ── Ballots & Candidates Helpers ──────────────────────────────────────────────

def record_ballot_cast(voter_address, checksum_address, candidate_id, biometric_hash, tx_hash=None, block_number=None):
    """
    Records cast ballot into SQLite:
    - Inserts into ballots_cast (unique voter_address)
    - Increments candidates.vote_count
    - Increments election_lifecycle.total_votes
    """
    addr_clean = voter_address.strip().lower()

    with get_db_connection() as conn:
        cursor = conn.cursor()

        # Check if already voted
        cursor.execute("SELECT id FROM ballots_cast WHERE voter_address = ?", (addr_clean,))
        if cursor.fetchone():
            raise ValueError("Double voting rejected: Voter has already cast a ballot in the database.")

        # Record ballot
        cursor.execute("""
            INSERT INTO ballots_cast 
            (voter_address, checksum_address, candidate_id, biometric_hash, tx_hash, block_number)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (addr_clean, checksum_address, candidate_id, biometric_hash, tx_hash, block_number))

        # Increment candidate votes
        cursor.execute("""
            UPDATE candidates 
            SET vote_count = vote_count + 1 
            WHERE id = ?
        """, (candidate_id,))

        # Update total votes in lifecycle table
        cursor.execute("""
            UPDATE election_lifecycle 
            SET total_votes = total_votes + 1, updated_at = CURRENT_TIMESTAMP 
            WHERE id = 1
        """)

        conn.commit()

def has_voter_voted(voter_address):
    """Returns True if voter_address has already cast a ballot."""
    addr_clean = voter_address.strip().lower()
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT 1 FROM ballots_cast WHERE voter_address = ?", (addr_clean,))
        return cursor.fetchone() is not None

def get_all_voted_addresses():
    """Returns set of lowercased voter addresses that have already cast ballots (batch query)."""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT voter_address FROM ballots_cast")
        return {r["voter_address"].lower() for r in cursor.fetchall()}

def get_candidates_results():
    """Returns list of candidates with vote counts and percentage tallies."""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, name, vote_count FROM candidates ORDER BY id ASC")
        rows = cursor.fetchall()
        
        cursor.execute("SELECT total_votes FROM election_lifecycle WHERE id = 1")
        total_row = cursor.fetchone()
        total_votes = total_row["total_votes"] if total_row else sum(r["vote_count"] for r in rows)

        candidates = []
        for r in rows:
            cnt = r["vote_count"]
            pct = round((cnt / total_votes * 100), 1) if total_votes > 0 else 0.0
            candidates.append({
                "id": r["id"],
                "name": r["name"],
                "vote_count": cnt,
                "percentage": pct
            })

        return {
            "candidates": candidates,
            "total_votes": total_votes
        }

def get_all_cast_ballots():
    """Returns all recorded ballots for audit purposes."""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT b.id, b.voter_address, b.checksum_address, b.candidate_id, c.name as candidate_name,
                   b.biometric_hash, b.tx_hash, b.block_number, b.voted_at
            FROM ballots_cast b
            JOIN candidates c ON b.candidate_id = c.id
            ORDER BY b.id ASC
        """)
        return [dict(r) for r in cursor.fetchall()]

# ── Factory Reset ─────────────────────────────────────────────────────────────

def factory_reset_db(new_contract_address=None):
    """
    Clears all votes, ballots, and enrolled voters.
    ONLY callable when user explicitly triggers Factory Reset!
    """
    with get_db_connection() as conn:
        cursor = conn.cursor()
        # 1. Clear ballots
        cursor.execute("DELETE FROM ballots_cast")
        # 2. Reset candidates
        cursor.execute("UPDATE candidates SET vote_count = 0")
        # 3. Clear enrollments
        cursor.execute("DELETE FROM voter_enrollments")
        # 4. Clear security logs
        cursor.execute("DELETE FROM security_events")
        # 5. Reset lifecycle
        cursor.execute("""
            UPDATE election_lifecycle
            SET status = 0, status_label = 'NotStarted', start_time = NULL, end_time = NULL,
                total_votes = 0, contract_address = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = 1
        """, (new_contract_address,))
        conn.commit()

    # Clear JSON file as well
    if os.path.exists(TEMPLATES_JSON_PATH):
        try:
            with open(TEMPLATES_JSON_PATH, "w") as f:
                json.dump({}, f)
        except Exception:
            pass

# Initialize database on module load
init_db()
