import os
import io
import csv
import json
import time
from datetime import datetime, timezone
from collections import defaultdict

from database import get_db_connection

# ── Configurable Detection Thresholds & Windows ──────────────────────────────
SECURITY_CONFIG = {
    # Repeated biometric failures threshold before triggering HIGH alert
    "biometric_failure_threshold": 3,
    "biometric_failure_window_sec": 300, # 5 minutes

    # Rate limiting: max requests within sliding window
    "rate_limit_max_requests": 6,
    "RATE_LIMIT_VERIFY_MAX_REQUESTS": 6,
    "RATE_LIMIT_VOTE_MAX_REQUESTS": 6,
    "rate_limit_window_sec": 30,         # 30 seconds
    "rate_limit_cooldown_sec": 30,       # cooldown wait duration

    # Rate limiting for voter enrollment
    "enrollment_rate_limit_max": 10,
    "enrollment_window_sec": 60
}

# ── In-Memory Sliding Window Trackers ──────────────────────────────────────────
# Maps identifier (IP/voter) -> list of failure timestamps
_biometric_failure_history = defaultdict(list)
_biometric_failure_tracker = _biometric_failure_history

# Maps key -> list of request timestamps
_rate_limit_history = defaultdict(list)
_rate_limit_buckets = _rate_limit_history

def sanitize_log_text(text, max_len=256):
    """Sanitizes user-supplied strings to prevent log injection and limit size."""
    if not text:
        return ""
    # Strip dangerous control characters and newlines
    cleaned = "".join(ch for ch in str(text) if ch.isprintable() and ch not in ("\r", "\n"))
    return cleaned[:max_len].strip()

def check_rate_limit(source_ip, endpoint=None, max_requests=None, window_sec=None, limit_type=None):
    """
    Evaluates sliding-window rate limit for a client IP and endpoint/limit_type.
    Returns:
        (is_allowed: bool, retry_after: int)
    """
    now = time.time()
    ep = endpoint or limit_type or "general"
    key = f"{ep}:{source_ip}" if isinstance(source_ip, str) and not source_ip.startswith(f"{ep}:") else source_ip

    if limit_type == "verification":
        max_reqs = max_requests or SECURITY_CONFIG.get("RATE_LIMIT_VERIFY_MAX_REQUESTS", 6)
    elif limit_type == "voting":
        max_reqs = max_requests or SECURITY_CONFIG.get("RATE_LIMIT_VOTE_MAX_REQUESTS", 6)
    else:
        max_reqs = max_requests or SECURITY_CONFIG["rate_limit_max_requests"]

    window = window_sec or SECURITY_CONFIG["rate_limit_window_sec"]

    # Filter out timestamps older than the sliding window
    _rate_limit_buckets[key] = [t for t in _rate_limit_buckets[key] if now - t < window]

    if len(_rate_limit_buckets[key]) >= max_reqs:
        oldest = _rate_limit_buckets[key][0]
        retry_after = max(1, int(window - (now - oldest)))
        return False, retry_after

    _rate_limit_buckets[key].append(now)
    return True, 0

def record_biometric_attempt(voter_address, source_ip="127.0.0.1", success=None, distance=None, threshold=None, is_match=None):
    """
    Records biometric authentication attempts and evaluates repeated failure rules.
    If >= biometric_failure_threshold failures occur within window, raises a HIGH alert.
    Returns the event_id of the generated security log (or escalated alert).
    """
    if is_match is not None:
        success = is_match
    if success is None:
        success = False

    now = time.time()
    clean_addr = (voter_address or "").strip().lower() or source_ip
    window = SECURITY_CONFIG["biometric_failure_window_sec"]
    thresh = SECURITY_CONFIG["biometric_failure_threshold"]

    if success:
        # Clear failure history on valid genuine verification
        _biometric_failure_history.pop(clean_addr, None)
        return log_security_event(
            event_type="FINGERPRINT_VERIFICATION_SUCCESS",
            severity="INFO",
            voter_address=clean_addr if clean_addr.startswith("0x") else None,
            source_ip=source_ip,
            endpoint="/api/verify-and-vote",
            status="SUCCESS",
            details=f"Biometric match verified with distance {distance:.4f}." if distance is not None else "Match verified."
        )

    # Track failure timestamp
    history = [t for t in _biometric_failure_history[clean_addr] if now - t < window]
    history.append(now)
    _biometric_failure_history[clean_addr] = history

    failure_count = len(history)

    # If repeated failures threshold was breached, escalate to HIGH alert
    if failure_count >= thresh:
        return log_security_event(
            event_type="REPEATED_BIOMETRIC_FAILURES",
            severity="HIGH",
            voter_address=clean_addr if clean_addr.startswith("0x") else None,
            source_ip=source_ip,
            endpoint="/api/verify-and-vote",
            status="ALERT",
            details=f"Suspicious activity alert: {failure_count} consecutive biometric verification failures within {window // 60} minutes (Repeated fingerprint mismatch alert: distance {distance:.4f} exceeds threshold)." if distance is not None else f"Suspicious activity alert: {failure_count} consecutive biometric failures."
        )

    # Individual biometric failure
    details = f"Biometric mismatch: probe distance {distance:.4f} exceeds threshold {threshold or 0.2385:.4f}." if distance is not None else "Fingerprint rejected."
    return log_security_event(
        event_type="FINGERPRINT_VERIFICATION_FAILURE",
        severity="LOW",
        voter_address=clean_addr if clean_addr.startswith("0x") else None,
        source_ip=source_ip,
        endpoint="/api/verify-and-vote",
        status="FAILED",
        details=details
    )

def log_security_event(
    event_type,
    severity,
    status="FAILURE",
    voter_address=None,
    source_ip=None,
    endpoint=None,
    details=None,
    description=None,
    tx_hash=None,
    block_number=None
):
    """
    Persists a sanitized security event into SQLite database.
    Never logs raw biometric embeddings, images, or secrets.
    """
    clean_addr = (voter_address or "").strip().lower() if voter_address else None
    clean_details = sanitize_log_text(details or description)
    clean_ip = sanitize_log_text(source_ip, 64)
    clean_ep = sanitize_log_text(endpoint, 128)

    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO security_events (
                event_type, severity, voter_address, source_ip, endpoint,
                status, details, tx_hash, block_number, is_reviewed
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
        """, (
            event_type,
            severity.upper(),
            clean_addr,
            clean_ip,
            clean_ep,
            status.upper(),
            clean_details,
            tx_hash,
            block_number
        ))
        conn.commit()
        return cursor.lastrowid

def get_security_summary():
    """Returns aggregated high-level security metrics for dashboard counters."""
    with get_db_connection() as conn:
        cursor = conn.cursor()

        cursor.execute("SELECT COUNT(*) as total FROM security_events")
        total = cursor.fetchone()["total"]

        cursor.execute("SELECT COUNT(*) as high_critical FROM security_events WHERE severity IN ('HIGH', 'CRITICAL')")
        high_crit = cursor.fetchone()["high_critical"]

        cursor.execute("SELECT COUNT(*) as bio_fails FROM security_events WHERE event_type IN ('BIOMETRIC_MISMATCH', 'REPEATED_BIOMETRIC_FAILURES')")
        bio_fails = cursor.fetchone()["bio_fails"]

        cursor.execute("SELECT COUNT(*) as dup_votes FROM security_events WHERE event_type = 'DUPLICATE_VOTING_ATTEMPT'")
        dup_votes = cursor.fetchone()["dup_votes"]

        cursor.execute("SELECT COUNT(*) as unauth_admin FROM security_events WHERE event_type = 'UNAUTHORIZED_ADMIN_ACCESS'")
        unauth_admin = cursor.fetchone()["unauth_admin"]

        cursor.execute("SELECT COUNT(*) as tx_fails FROM security_events WHERE event_type = 'BLOCKCHAIN_TRANSACTION_FAILURE'")
        tx_fails = cursor.fetchone()["tx_fails"]

        cursor.execute("SELECT COUNT(*) as unreviewed FROM security_events WHERE is_reviewed = 0")
        unreviewed = cursor.fetchone()["unreviewed"]

        # Recent 5 alert events
        cursor.execute("""
            SELECT id, event_type, severity, voter_address, endpoint, status, details, created_at, is_reviewed
            FROM security_events
            ORDER BY id DESC
            LIMIT 5
        """)
        recent = [dict(r) for r in cursor.fetchall()]

        return {
            "total_events": total,
            "high_critical_alerts": high_crit,
            "high_critical_count": high_crit,
            "failed_fingerprints": bio_fails,
            "biometric_failures_count": bio_fails,
            "duplicate_votes": dup_votes,
            "duplicate_voting_attempts": dup_votes,
            "unauthorized_access": unauth_admin,
            "unauthorized_admin_access_attempts": unauth_admin,
            "blockchain_errors": tx_fails,
            "blockchain_transaction_errors": tx_fails,
            "unreviewed_events": unreviewed,
            "unreviewed_count": unreviewed,
            "recent_events": recent,
            "security_config": SECURITY_CONFIG
        }

def get_security_events(
    page=1,
    per_page=50,
    limit=None,
    offset=None,
    severity=None,
    event_type=None,
    is_reviewed=None,
    reviewed=None,
    search=None
):
    """
    Returns filtered and paginated list of security events from database.
    """
    if limit is not None:
        per_page = max(1, min(1000, int(limit)))
    else:
        per_page = max(1, min(1000, int(per_page or 50)))

    if offset is not None:
        offset_val = max(0, int(offset))
    else:
        page_val = max(1, int(page or 1))
        offset_val = (page_val - 1) * per_page

    effective_reviewed = is_reviewed if is_reviewed is not None else reviewed

    query = "SELECT * FROM security_events WHERE 1=1"
    count_query = "SELECT COUNT(*) as total FROM security_events WHERE 1=1"
    params = []

    if severity:
        query += " AND severity = ?"
        count_query += " AND severity = ?"
        params.append(severity.upper())

    if event_type:
        query += " AND event_type = ?"
        count_query += " AND event_type = ?"
        params.append(event_type.upper())

    if effective_reviewed is not None:
        reviewed_int = 1 if effective_reviewed in (True, "1", 1, "true", "True") else 0
        query += " AND is_reviewed = ?"
        count_query += " AND is_reviewed = ?"
        params.append(reviewed_int)

    if search:
        search_pattern = f"%{search.strip()}%"
        query += " AND (voter_address LIKE ? OR details LIKE ? OR endpoint LIKE ?)"
        count_query += " AND (voter_address LIKE ? OR details LIKE ? OR endpoint LIKE ?)"
        params.extend([search_pattern, search_pattern, search_pattern])

    with get_db_connection() as conn:
        cursor = conn.cursor()

        # Count total matching
        cursor.execute(count_query, params)
        total_matching = cursor.fetchone()["total"]

        # Fetch page items
        query += " ORDER BY id DESC LIMIT ? OFFSET ?"
        page_params = params + [per_page, offset_val]
        cursor.execute(query, page_params)
        raw_rows = cursor.fetchall()
        rows = []
        for r in raw_rows:
            d = dict(r)
            d["description"] = d.get("details", "")
            d["reviewed"] = d.get("is_reviewed", 0)
            rows.append(d)

        total_pages = (total_matching + per_page - 1) // per_page if total_matching > 0 else 1

        return {
            "events": rows,
            "total_count": total_matching,
            "page": (offset_val // per_page) + 1,
            "per_page": per_page,
            "total_pages": total_pages
        }

def get_security_event_by_id(event_id):
    """Returns single security event details by ID."""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM security_events WHERE id = ?", (event_id,))
        row = cursor.fetchone()
        if not row:
            return None
        d = dict(row)
        d["description"] = d.get("details", "")
        d["reviewed"] = d.get("is_reviewed", 0)
        return d

def mark_event_reviewed(event_id, reviewed_by="Election Commissioner"):
    """Marks a security event as reviewed with timestamp and reviewer role."""
    clean_reviewer = sanitize_log_text(reviewed_by, 128)
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE security_events
            SET is_reviewed = 1, reviewed_at = CURRENT_TIMESTAMP, reviewed_by = ?
            WHERE id = ?
        """, (clean_reviewer, event_id))
        conn.commit()
        return cursor.rowcount > 0

def generate_security_csv(severity=None, event_type=None):
    """Generates an RFC-4180 compliant CSV export of filtered security events."""
    data = get_security_events(limit=1000, severity=severity, event_type=event_type)
    events = data["events"]

    output = io.StringIO()
    writer = csv.writer(output)

    writer.writerow([
        "id,event_type,severity,timestamp,voter_address,source_ip,endpoint,status,description,tx_hash,block_number,reviewed"
    ])

    for ev in events:
        writer.writerow([
            f'{ev.get("id")},{ev.get("event_type")},{ev.get("severity")},{ev.get("created_at")},{ev.get("voter_address") or ""},{ev.get("source_ip") or ""},{ev.get("endpoint") or ""},{ev.get("status")},"{ev.get("description") or ""}",{ev.get("tx_hash") or ""},{ev.get("block_number") or ""},{ev.get("reviewed")}'
        ])

    return output.getvalue()

def generate_security_json(severity=None, event_type=None):
    """Generates structured JSON export of filtered security events."""
    data = get_security_events(limit=1000, severity=severity, event_type=event_type)
    return {
        "status": "SUCCESS",
        "export_timestamp": datetime.now(timezone.utc).isoformat(),
        "total_records": data["total_count"],
        "total_events": data["total_count"],
        "events": data["events"],
        "security_config": SECURITY_CONFIG
    }
