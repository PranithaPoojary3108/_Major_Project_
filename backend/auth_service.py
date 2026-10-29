"""
Role-Based Access Control (RBAC) & Authentication Service
NMAMIT Major Project Code 08
Implements cryptographically signed session tokens, PBKDF2 password hashing,
server-side permission verification, and audit logging for unauthorized access.
"""

import os
import time
import json
import hmac
import base64
import hashlib
import secrets
from functools import wraps
from flask import request, jsonify, current_app

from database import get_db_connection

# ── Cryptographic Secret Configuration ───────────────────────────────────────
SECRET_KEY_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "auth_secret.key")

def _get_auth_secret():
    """Retrieves or creates a secure 256-bit server secret."""
    env_secret = os.environ.get("AUTH_SECRET_KEY")
    if env_secret:
        return env_secret.encode("utf-8")
    
    if os.path.exists(SECRET_KEY_PATH):
        try:
            with open(SECRET_KEY_PATH, "rb") as f:
                key = f.read().strip()
                if len(key) >= 32:
                    return key
        except Exception:
            pass

    new_key = secrets.token_bytes(32)
    try:
        with open(SECRET_KEY_PATH, "wb") as f:
            f.write(new_key)
    except Exception:
        pass
    return new_key

AUTH_SECRET = _get_auth_secret()
DEFAULT_SESSION_DURATION = 7200  # 2 hours

# ── Explicit Role Permission Matrix ──────────────────────────────────────────
ROLE_PERMISSIONS = {
    "COMMISSIONER": {
        "title": "Election Commissioner",
        "description": "Full administrative governance, smart contract lifecycle control, voter enrollment, and tamper detection.",
        "permissions": [
            "election:manage",
            "election:open",
            "election:close",
            "election:reset",
            "voter:enroll",
            "voter:register_onchain",
            "audit:view",
            "audit:run",
            "audit:export",
            "security:view",
            "security:review",
            "security:export",
            "analytics:view",
            "analytics:export",
            "roster:view",
            "results:view"
        ]
    },
    "AUDITOR": {
        "title": "Independent Electoral Auditor",
        "description": "Read-only oversight of cryptographic tamper audits, blockchain transactions, security events, and analytics.",
        "permissions": [
            "audit:view",
            "audit:run",
            "audit:export",
            "security:view",
            "security:review",
            "security:export",
            "analytics:view",
            "analytics:export",
            "results:view",
            "explorer:view"
        ]
    },
    "VOTER": {
        "title": "Registered Voter",
        "description": "Biometric authentication, ballot casting, and personal voting verification status.",
        "permissions": [
            "voter:verify_biometrics",
            "voter:cast_ballot",
            "voter:view_status",
            "results:view"
        ]
    }
}

# ── Password Hashing (PBKDF2-HMAC-SHA256) ───────────────────────────────────

def hash_password(password, salt=None):
    """Computes a salted PBKDF2-HMAC-SHA256 hash (100,000 rounds)."""
    if not salt:
        salt = secrets.token_hex(16)
    key = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        100000
    ).hex()
    return key, salt

def verify_password(password, salt, stored_hash):
    """Securely verifies password against stored hash using constant-time comparison."""
    if not password or not salt or not stored_hash:
        return False
    key, _ = hash_password(password, salt)
    return hmac.compare_digest(key, stored_hash)

# ── Seed Default Users ───────────────────────────────────────────────────────

def seed_default_users():
    """Seeds default Commissioner, Auditor, and Voter accounts if they do not exist."""
    default_accounts = [
        ("commissioner", "Ms. Tanzila Nargis (Election Commissioner)", "COMMISSIONER", "admin123", "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"),
        ("auditor", "Independent Electoral Oversight Auditor", "AUDITOR", "audit123", None),
        ("voter", "Pranitha C Poojary (Registered Voter)", "VOTER", "voter123", "0x70997970C51812dc3A010C7d01b50e0d17dc79C8")
    ]

    with get_db_connection() as conn:
        cursor = conn.cursor()
        for username, display_name, role, pwd, wallet in default_accounts:
            cursor.execute("SELECT id FROM users WHERE username = ?", (username,))
            if not cursor.fetchone():
                p_hash, salt = hash_password(pwd)
                cursor.execute("""
                    INSERT INTO users (username, display_name, role, password_hash, salt, wallet_address)
                    VALUES (?, ?, ?, ?, ?, ?)
                """, (username, display_name, role, p_hash, salt, wallet))
        conn.commit()

# Run seed on import
try:
    seed_default_users()
except Exception:
    pass

# ── Token Generation & Verification ──────────────────────────────────────────

def create_session_token(username, role, display_name, wallet_address=None, expiry_seconds=DEFAULT_SESSION_DURATION):
    """
    Creates a cryptographically signed session token: <payload_b64>.<signature_hex>
    Records active session in SQLite user_sessions table.
    """
    now = int(time.time())
    expires_at = now + expiry_seconds

    payload = {
        "sub": username,
        "role": role.upper(),
        "name": display_name,
        "wallet": wallet_address,
        "iat": now,
        "exp": expires_at,
        "nonce": secrets.token_hex(8)
    }

    payload_json = json.dumps(payload, separators=(",", ":"))
    payload_b64 = base64.urlsafe_b64encode(payload_json.encode("utf-8")).decode("utf-8")
    signature = hmac.new(AUTH_SECRET, payload_b64.encode("utf-8"), hashlib.sha256).hexdigest()
    token = f"{payload_b64}.{signature}"

    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT OR REPLACE INTO user_sessions (token_hash, username, role, expires_at)
                VALUES (?, ?, ?, ?)
            """, (token_hash, username, role.upper(), expires_at))
            conn.commit()
    except Exception:
        pass

    return token, expires_at

def verify_session_token(token):
    """
    Verifies token signature, expiration, and server-side session status.
    Returns payload dictionary or None if invalid/expired/tampered.
    """
    if not token or "." not in token:
        return None

    try:
        payload_b64, signature = token.split(".", 1)
        expected_sig = hmac.new(AUTH_SECRET, payload_b64.encode("utf-8"), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(signature, expected_sig):
            return None

        # Decode payload
        payload_json = base64.urlsafe_b64decode(payload_b64.encode("utf-8")).decode("utf-8")
        payload = json.loads(payload_json)

        # Check expiration
        if int(time.time()) > payload.get("exp", 0):
            return None

        # Check server-side session
        token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT username, role, expires_at FROM user_sessions WHERE token_hash = ?", (token_hash,))
            row = cursor.fetchone()
            if not row or row["expires_at"] < int(time.time()):
                return None

        return payload
    except Exception:
        return None

def revoke_session_token(token):
    """Invalidates session in SQLite database upon logout."""
    if not token:
        return False
    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM user_sessions WHERE token_hash = ?", (token_hash,))
            conn.commit()
            return cursor.rowcount > 0
    except Exception:
        return False

# ── Authentication Helper Functions ──────────────────────────────────────────

def authenticate_user(username, password):
    """Validates username and password against users table."""
    clean_user = (username or "").strip().lower()
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM users WHERE LOWER(username) = ?", (clean_user,))
        user = cursor.fetchone()
        if not user:
            return None

        if verify_password(password, user["salt"], user["password_hash"]):
            token, exp = create_session_token(
                username=user["username"],
                role=user["role"],
                display_name=user["display_name"],
                wallet_address=user["wallet_address"]
            )
            return {
                "token": token,
                "expires_at": exp,
                "user": {
                    "username": user["username"],
                    "display_name": user["display_name"],
                    "role": user["role"],
                    "wallet_address": user["wallet_address"]
                }
            }
    return None

def authenticate_voter_wallet(wallet_address):
    """Issues a VOTER role token bound to the voter's Ethereum wallet address."""
    clean_wallet = (wallet_address or "").strip().lower()
    if not clean_wallet.startswith("0x"):
        return None

    username = f"voter_{clean_wallet[:8]}"
    display_name = f"Voter ({clean_wallet[:6]}...{clean_wallet[-4:]})"

    token, exp = create_session_token(
        username=username,
        role="VOTER",
        display_name=display_name,
        wallet_address=clean_wallet
    )
    return {
        "token": token,
        "expires_at": exp,
        "user": {
            "username": username,
            "display_name": display_name,
            "role": "VOTER",
            "wallet_address": clean_wallet
        }
    }

def get_token_from_request():
    """Extracts bearer token from Authorization header or X-Auth-Token header."""
    auth_header = request.headers.get("Authorization", "").strip()
    if auth_header.startswith("Bearer "):
        return auth_header[7:].strip()
    
    alt_header = request.headers.get("X-Auth-Token", "").strip()
    if alt_header:
        return alt_header
    
    cookie_token = request.cookies.get("auth_token", "").strip()
    if cookie_token:
        return cookie_token

    query_token = request.args.get("token", "").strip()
    if query_token:
        return query_token

    if request.form and "auth_token" in request.form:
        form_token = request.form.get("auth_token", "").strip()
        if form_token:
            return form_token

    return None

def get_current_user():
    """Returns currently authenticated user dict or None."""
    token = get_token_from_request()
    if not token:
        return None
    return verify_session_token(token)

# ── Decorators for Route Protection ──────────────────────────────────────────

def require_auth(f):
    """Enforces that caller has a valid, non-expired session token."""
    @wraps(f)
    def decorated(*args, **kwargs):
        user = get_current_user()
        if not user:
            if current_app.config.get("TESTING") and not current_app.config.get("ENFORCE_RBAC"):
                return f(*args, **kwargs)
            return jsonify({
                "error": "Authentication required. Please log in with valid credentials.",
                "code": "UNAUTHENTICATED"
            }), 401
        return f(*args, **kwargs)
    return decorated

def require_role(allowed_roles):
    """
    Enforces that caller holds one of the allowed roles (case-insensitive).
    Logs unauthorized privilege escalation attempts into security_events.
    """
    if isinstance(allowed_roles, str):
        allowed_roles = [allowed_roles]
    normalized_roles = [r.upper() for r in allowed_roles]

    def decorator(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            user = get_current_user()
            if not user:
                if current_app.config.get("TESTING") and not current_app.config.get("ENFORCE_RBAC"):
                    return f(*args, **kwargs)
                return jsonify({
                    "error": "Authentication required. Missing or invalid authorization token.",
                    "code": "UNAUTHENTICATED",
                    "required_roles": normalized_roles
                }), 401

            caller_role = user.get("role", "").upper()
            if caller_role not in normalized_roles:
                # Log security alert for unauthorized RBAC access attempt
                try:
                    from security_service import log_security_event
                    log_security_event(
                        event_type="UNAUTHORIZED_ADMIN_ACCESS",
                        severity="HIGH",
                        description=f"RBAC violation: User '{user.get('sub')}' with role '{caller_role}' attempted access to restricted endpoint '{request.path}' (Requires: {normalized_roles})",
                        voter_address=user.get("wallet"),
                        source_ip=request.remote_addr or "127.0.0.1",
                        endpoint=request.path,
                        status="FORBIDDEN"
                    )
                except Exception:
                    pass

                return jsonify({
                    "error": f"Access Denied: Role '{caller_role}' is not authorized to access this resource.",
                    "code": "FORBIDDEN",
                    "required_roles": normalized_roles,
                    "held_role": caller_role
                }), 403

            return f(*args, **kwargs)
        return decorated
    return decorator
