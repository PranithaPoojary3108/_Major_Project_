"""
Election Analytics and Results Dashboard Service
NMAMIT Major Project Code 08
Provides authoritative election turnout, candidate rankings with tie detection,
temporal voting trends, biometric verification correlation, and forensic report exports.
"""

import os
import io
import csv
import json
import time
from datetime import datetime, timezone
from web3 import Web3

from web3_service import (
    w3,
    is_connected,
    get_contract,
    get_deployed_address,
    get_election_info,
    BlockchainUnavailableError
)
from database import get_db_connection

def calculate_turnout(votes_cast, registered_voters):
    """
    Computes voter turnout percentage safely handling zero registered voters.
    Turnout (%) = (votes_cast / registered_voters) * 100
    """
    if not registered_voters or registered_voters <= 0:
        return 0.0
    return round((float(votes_cast) / float(registered_voters)) * 100.0, 2)

def determine_election_status(lifecycle_info):
    """
    Evaluates real election status based on on-chain state and current time.
    Returns: 'Not Started' | 'Scheduled' | 'Active' | 'Completed'
    """
    status_code = lifecycle_info.get("status", 0)
    start_time = lifecycle_info.get("start_time")
    end_time = lifecycle_info.get("end_time")
    voting_now = lifecycle_info.get("voting_now", False)
    now_ts = int(time.time())

    if status_code == 0:
        return "Not Started"
    elif status_code == 2:
        return "Completed"
    elif status_code == 1:
        if voting_now:
            return "Active"
        if start_time and now_ts < start_time:
            return "Scheduled"
        if end_time and now_ts > end_time:
            return "Completed"
        return "Active"
    return "Not Started"

def rank_candidates(candidates):
    """
    Sorts candidates descending by vote count, handles ties correctly,
    and returns ranked candidates with percentage share and leader status.
    """
    if not candidates:
        return [], None, False, []

    # Sort descending by on-chain vote count, then by candidate ID
    sorted_cands = sorted(candidates, key=lambda c: (c["onchain_votes"], -c["id"]), reverse=True)
    total_votes = sum(c["onchain_votes"] for c in sorted_cands)

    ranked = []
    current_rank = 1
    for idx, c in enumerate(sorted_cands):
        # Competition ranking (1, 1, 3...)
        if idx > 0 and c["onchain_votes"] < sorted_cands[idx - 1]["onchain_votes"]:
            current_rank = idx + 1

        pct = round((c["onchain_votes"] / total_votes * 100.0), 2) if total_votes > 0 else 0.0
        c_entry = {
            **c,
            "rank": current_rank,
            "percentage": pct,
            "is_tied": False,
            "standing_label": f"Rank #{current_rank}"
        }
        ranked.append(c_entry)

    # Detect top leader or tie for 1st place
    leader = None
    has_tie = False
    tied_candidates = []

    if total_votes > 0:
        top_votes = ranked[0]["onchain_votes"]
        top_cands = [c for c in ranked if c["onchain_votes"] == top_votes]

        if len(top_cands) > 1:
            has_tie = True
            tied_candidates = top_cands
            for c in ranked:
                if c["onchain_votes"] == top_votes:
                    c["is_tied"] = True
                    c["standing_label"] = "Tied for 1st Place"
        else:
            leader = ranked[0]
            ranked[0]["standing_label"] = "Projected Winner"

    return ranked, leader, has_tie, tied_candidates

def get_election_analytics(start_date=None, end_date=None, candidate_id=None):
    """
    Generates comprehensive election analytics:
    - Authoritative on-chain counts vs off-chain database counts
    - Turnout metrics and remaining eligible voter calculations
    - Ranked candidate results with transparent tie handling
    - Hourly/daily voting activity with date filtering
    - Biometric verification & security correlation
    - Cross-verification discrepancy warnings
    """
    connected = is_connected()
    contract_addr = get_deployed_address()
    now_utc = datetime.now(timezone.utc).isoformat()

    # 1. Fetch on-chain election info and candidate tallies
    lifecycle_info = {
        "status": 0,
        "status_label": "NotStarted",
        "start_time": None,
        "end_time": None,
        "total_votes": 0,
        "voting_now": False
    }
    raw_onchain_candidates = []
    blockchain_error = None

    if connected:
        try:
            lifecycle_info = get_election_info()
            contract = get_contract()
            cand_count = contract.functions.candidatesCount().call()
            for i in range(1, cand_count + 1):
                c_id, name, v_count = contract.functions.getCandidate(i).call()
                raw_onchain_candidates.append({
                    "id": c_id,
                    "name": name,
                    "onchain_votes": v_count
                })
        except Exception as e:
            blockchain_error = str(e)
            connected = False

    # 2. Fetch off-chain database counts and voter registrations
    db_candidates = {}
    registered_voters = 0
    db_total_votes = 0

    with get_db_connection() as conn:
        cursor = conn.cursor()

        # Enrolled voters count
        cursor.execute("SELECT COUNT(*) as total FROM voter_enrollments")
        registered_voters = cursor.fetchone()["total"]

        # Ballots cast count
        cursor.execute("SELECT COUNT(*) as total FROM ballots_cast")
        db_total_votes = cursor.fetchone()["total"]

        # Candidate vote breakdown in SQLite
        cursor.execute("SELECT candidate_id, COUNT(*) as cnt FROM ballots_cast GROUP BY candidate_id")
        for row in cursor.fetchall():
            db_candidates[row["candidate_id"]] = row["cnt"]

        # Fallback candidate list if blockchain was unreachable
        if not raw_onchain_candidates:
            cursor.execute("SELECT id, name FROM candidates ORDER BY id")
            for row in cursor.fetchall():
                raw_onchain_candidates.append({
                    "id": row["id"],
                    "name": row["name"],
                    "onchain_votes": db_candidates.get(row["id"], 0)
                })

    # 3. Discrepancy cross-check (Authoritative smart contract vs SQLite)
    discrepancies = []
    candidates_combined = []

    for c in raw_onchain_candidates:
        cid = c["id"]
        onchain_v = c["onchain_votes"]
        db_v = db_candidates.get(cid, 0)
        has_diff = (onchain_v != db_v)

        if has_diff:
            diff = db_v - onchain_v
            discrepancies.append({
                "candidate_id": cid,
                "candidate_name": c["name"],
                "onchain_votes": onchain_v,
                "db_votes": db_v,
                "delta": diff,
                "message": f"Discrepancy: Smart contract reports {onchain_v} votes, but off-chain database records {db_v} votes (Delta: {diff:+d})."
            })

        candidates_combined.append({
            "id": cid,
            "name": c["name"],
            "onchain_votes": onchain_v,
            "db_votes": db_v,
            "has_discrepancy": has_diff
        })

    # 4. Turnout and voter metrics
    authoritative_votes_cast = lifecycle_info.get("total_votes", 0) if connected else db_total_votes
    remaining_voters = max(0, registered_voters - authoritative_votes_cast)
    turnout_pct = calculate_turnout(authoritative_votes_cast, registered_voters)
    election_status = determine_election_status(lifecycle_info)

    # 5. Candidate rankings & tie detection
    ranked_cands, leader, has_tie, tied_cands = rank_candidates(candidates_combined)

    # Apply candidate filter if provided
    if candidate_id is not None:
        try:
            target_cid = int(candidate_id)
            ranked_cands = [c for c in ranked_cands if c["id"] == target_cid]
        except (ValueError, TypeError):
            pass

    # 6. Voting activity over time (Querying real timestamps in ballots_cast)
    temporal_activity = []
    with get_db_connection() as conn:
        cursor = conn.cursor()
        query = """
            SELECT 
                strftime('%Y-%m-%d %H:00', voted_at) as hour_bucket,
                COUNT(*) as ballots_count
            FROM ballots_cast
            WHERE 1=1
        """
        params = []
        if start_date:
            query += " AND voted_at >= ?"
            params.append(start_date)
        if end_date:
            query += " AND voted_at <= ?"
            params.append(end_date)
        if candidate_id:
            query += " AND candidate_id = ?"
            params.append(int(candidate_id))

        query += " GROUP BY hour_bucket ORDER BY hour_bucket ASC"
        cursor.execute(query, params)
        for row in cursor.fetchall():
            temporal_activity.append({
                "time_bucket": row["hour_bucket"] or "Current Session",
                "ballots_count": row["ballots_count"]
            })

    # 7. Biometric verification & Security Monitoring correlation
    security_stats = {
        "biometric_successes": 0,
        "biometric_failures": 0,
        "duplicate_voting_attempts": 0,
        "unauthorized_admin_attempts": 0,
        "blockchain_tx_failures": 0,
        "verification_success_rate": 0.0
    }
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT 
                SUM(CASE WHEN event_type = 'FINGERPRINT_VERIFICATION_SUCCESS' THEN 1 ELSE 0 END) as bio_ok,
                SUM(CASE WHEN event_type IN ('FINGERPRINT_VERIFICATION_FAILURE', 'BIOMETRIC_MISMATCH', 'REPEATED_BIOMETRIC_FAILURES') THEN 1 ELSE 0 END) as bio_fail,
                SUM(CASE WHEN event_type = 'DUPLICATE_VOTING_ATTEMPT' THEN 1 ELSE 0 END) as dup_votes,
                SUM(CASE WHEN event_type = 'UNAUTHORIZED_ADMIN_ACCESS' THEN 1 ELSE 0 END) as unauth_admin,
                SUM(CASE WHEN event_type = 'BLOCKCHAIN_TRANSACTION_FAILURE' THEN 1 ELSE 0 END) as tx_errs
            FROM security_events
        """)
        row = cursor.fetchone()
        if row:
            bio_ok = row["bio_ok"] or 0
            bio_fail = row["bio_fail"] or 0
            security_stats["biometric_successes"] = bio_ok
            security_stats["biometric_failures"] = bio_fail
            security_stats["duplicate_voting_attempts"] = row["dup_votes"] or 0
            security_stats["unauthorized_admin_attempts"] = row["unauth_admin"] or 0
            security_stats["blockchain_tx_failures"] = row["tx_errs"] or 0
            total_bio_attempts = bio_ok + bio_fail
            if total_bio_attempts > 0:
                security_stats["verification_success_rate"] = round((bio_ok / total_bio_attempts) * 100.0, 1)

    return {
        "overview": {
            "election_status": election_status,
            "status_code": lifecycle_info.get("status", 0),
            "total_registered_voters": registered_voters,
            "total_votes_cast": authoritative_votes_cast,
            "db_total_votes": db_total_votes,
            "remaining_eligible_voters": remaining_voters,
            "turnout_percentage": turnout_pct,
            "candidate_count": len(candidates_combined),
            "start_time": lifecycle_info.get("start_time"),
            "end_time": lifecycle_info.get("end_time"),
            "voting_now": lifecycle_info.get("voting_now", False)
        },
        "standings": {
            "candidates": ranked_cands,
            "leader": leader,
            "has_tie": has_tie,
            "tied_candidates": [c["name"] for c in tied_cands],
            "total_valid_votes": authoritative_votes_cast
        },
        "integrity": {
            "contract_address": contract_addr,
            "blockchain_connected": connected,
            "blockchain_error": blockchain_error,
            "network": "Hardhat Local Testnet (Development / Demo)",
            "authoritative_source": "Ethereum Smart Contract (Voting.sol)",
            "data_freshness": "Live (On-Chain)" if connected else "Cached (Off-Chain)",
            "has_discrepancy": len(discrepancies) > 0,
            "discrepancies": discrepancies,
            "audit_notice": "Discrepancy detected between blockchain and database. Consult Tamper Audit tab." if len(discrepancies) > 0 else "All records cryptographically synchronized."
        },
        "temporal_activity": temporal_activity,
        "security_correlation": security_stats,
        "metadata": {
            "generated_at": now_utc,
            "query_filters": {
                "start_date": start_date,
                "end_date": end_date,
                "candidate_id": candidate_id
            }
        }
    }

def generate_analytics_csv(start_date=None, end_date=None, candidate_id=None):
    """
    Generates an RFC-4180 compliant CSV export of complete election analytics.
    """
    data = get_election_analytics(start_date, end_date, candidate_id)
    ov = data["overview"]
    integ = data["integrity"]

    output = io.StringIO()
    writer = csv.writer(output)

    writer.writerow(["=========================================================================="])
    writer.writerow(["SECURE E-VOTING SYSTEM - COMPREHENSIVE ELECTION ANALYTICS REPORT"])
    writer.writerow(["NMAMIT Department of Information Science & Engineering (Project Code 08)"])
    writer.writerow(["=========================================================================="])
    writer.writerow([])
    writer.writerow(["Report Generated (UTC)", data["metadata"]["generated_at"]])
    writer.writerow(["Blockchain Network", integ["network"]])
    writer.writerow(["Contract Address", integ["contract_address"]])
    writer.writerow(["Authoritative Source", integ["authoritative_source"]])
    writer.writerow(["Verification Integrity", "VERIFIED (SYNCED)" if not integ["has_discrepancy"] else "WARNING (DISCREPANCY DETECTED)"])
    writer.writerow([])

    # Overview Section
    writer.writerow(["--- SECTION 1: TURNOUT & LIFECYCLE OVERVIEW ---"])
    writer.writerow(["Metric", "Value"])
    writer.writerow(["Election Status", ov["election_status"]])
    writer.writerow(["Total Registered Voters", ov["total_registered_voters"]])
    writer.writerow(["Total Ballots Cast (On-Chain)", ov["total_votes_cast"]])
    writer.writerow(["Total Ballots Cast (Database)", ov["db_total_votes"]])
    writer.writerow(["Remaining Eligible Voters", ov["remaining_eligible_voters"]])
    writer.writerow(["Voter Turnout (%)", f"{ov['turnout_percentage']}%"])
    writer.writerow(["Contesting Candidates", ov["candidate_count"]])
    writer.writerow([])

    # Candidates Standings Section
    writer.writerow(["--- SECTION 2: CANDIDATE RESULTS & RANKINGS ---"])
    writer.writerow(["Rank", "Candidate ID", "Candidate Name", "On-Chain Votes", "DB Votes", "Vote Share (%)", "Standing / Status", "Discrepancy"])
    for c in data["standings"]["candidates"]:
        writer.writerow([
            c.get("rank"),
            c.get("id"),
            c.get("name"),
            c.get("onchain_votes"),
            c.get("db_votes"),
            f"{c.get('percentage')}%",
            c.get("standing_label"),
            "YES (MISMATCH)" if c.get("has_discrepancy") else "NO (SYNCED)"
        ])
    writer.writerow([])

    # Temporal Activity Section
    writer.writerow(["--- SECTION 3: VOTING ACTIVITY OVER TIME ---"])
    writer.writerow(["Time Bucket (UTC)", "Ballots Submitted"])
    if data["temporal_activity"]:
        for t in data["temporal_activity"]:
            writer.writerow([t["time_bucket"], t["ballots_count"]])
    else:
        writer.writerow(["No voting activity recorded in selected timeframe", 0])
    writer.writerow([])

    # Security & Biometrics Section
    writer.writerow(["--- SECTION 4: SECURITY & OPERATIONAL MONITORING ---"])
    sec = data["security_correlation"]
    writer.writerow(["Biometric Verifications (Success)", sec["biometric_successes"]])
    writer.writerow(["Biometric Verifications (Failure)", sec["biometric_failures"]])
    writer.writerow(["Biometric Verification Success Rate", f"{sec['verification_success_rate']}%"])
    writer.writerow(["Duplicate Voting Attempts Blocked", sec["duplicate_voting_attempts"]])
    writer.writerow(["Unauthorized Admin Access Denied", sec["unauthorized_admin_attempts"]])
    writer.writerow(["Blockchain Transaction Reverts/Errors", sec["blockchain_tx_failures"]])

    return output.getvalue()

def generate_analytics_json(start_date=None, end_date=None, candidate_id=None):
    """Generates structured JSON representation of election analytics."""
    return get_election_analytics(start_date, end_date, candidate_id)
