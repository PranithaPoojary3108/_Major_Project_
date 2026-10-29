import os
import io
import csv
import json
from flask import Flask, request, jsonify, send_from_directory, Response
from flask_cors import CORS
from datetime import datetime, timezone
from web3 import Web3
from evaluation_service import (
    run_biometric_evaluation,
    get_latest_evaluation_summary
)
from audit_service import (
    run_blockchain_audit,
    get_latest_audit,
    generate_audit_csv
)
from security_service import (
    check_rate_limit,
    record_biometric_attempt,
    log_security_event,
    get_security_summary,
    get_security_events,
    get_security_event_by_id,
    mark_event_reviewed,
    generate_security_csv,
    generate_security_json,
    SECURITY_CONFIG
)
from analytics_service import (
    get_election_analytics,
    generate_analytics_csv,
    generate_analytics_json
)
from auth_service import (
    authenticate_user,
    authenticate_voter_wallet,
    revoke_session_token,
    get_current_user,
    get_token_from_request,
    require_auth,
    require_role,
    ROLE_PERMISSIONS
)
from biometric_service import (
    extract_embedding, 
    hash_biometric_vector, 
    verify_fingerprints, 
    get_curated_samples,
    DATASET_DIR,
    VERIFICATION_THRESHOLD
)
from web3_service import (
    BlockchainUnavailableError,
    VoterAccountUnavailableError,
    ensure_voter_account_available,
    get_contract,
    get_accounts,
    get_voter_onchain_status,
    get_audit_trail,
    get_deployed_address,
    get_election_info,
    deploy_fresh_contract,
    is_connected,
    w3,
)
from database import (
    init_db,
    save_voter_enrollment,
    get_voter_status as db_get_voter_status,
    record_ballot_cast,
    has_voter_voted,
    get_all_voted_addresses,
    get_all_enrolled_voters,
    get_candidates_results,
    get_all_cast_ballots,
    get_election_lifecycle,
    update_election_lifecycle,
    factory_reset_db
)

app = Flask(__name__)
CORS(app)

DB_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "templates_db.json")

def load_db():
    """Loads enrolled biometric templates from persistent SQLite database with file fallback."""
    try:
        voters = get_all_enrolled_voters()
        db = {}
        for v in voters:
            if v.get("embedding") and isinstance(v["embedding"], list) and len(v["embedding"]) == 128:
                db[v["voter_address"]] = {
                    "embedding": v["embedding"],
                    "biometric_hash": v["biometric_hash"]
                }
        if db:
            return db
    except Exception:
        pass

    if os.path.exists(DB_FILE):
        try:
            with open(DB_FILE, "r") as f:
                data = json.load(f)
                cleaned = {}
                for k, val in data.items():
                    if isinstance(val, dict) and "embedding" in val and isinstance(val["embedding"], list) and len(val["embedding"]) == 128:
                        cleaned[k] = val
                return cleaned
        except Exception:
            return {}
    return {}

def save_db(data):
    """Persists biometric templates to local JSON file."""
    with open(DB_FILE, "w") as f:
        json.dump(data, f, indent=2)

@app.route("/", methods=["GET"])
def index():
    """Root route providing API status and endpoint directory."""
    return jsonify({
        "project": "Secure E-Voting System API (NMAMIT Project Code 08)",
        "status": "online",
        "model": "Residual Biometric Siamese CNN",
        "blockchain": "Ethereum Smart Contract (Voting.sol)",
        "available_routes": {
            "root": "GET /",
            "health_status": "GET /api/status",
            "accounts": "GET /api/accounts",
            "sample_fingerprints": "GET /api/sample-fingerprints",
            "sample_image": "GET /api/sample-fingerprints/<filename>",
            "voter_status": "GET /api/voter-status/<address>",
            "candidates": "GET /api/candidates",
            "audit_trail": "GET /api/audit-trail",
            "register_voter_offchain": "POST /api/register-voter",
            "register_voter_onchain": "POST /api/register-onchain",
            "enroll_voter": "POST /api/enroll-voter",
            "verify_voter": "POST /api/verify-and-vote",
            "cast_vote": "POST /api/cast-vote",
            "run_simulation": "POST /api/simulate/run-scenario",
            # ── Election Lifecycle ──────────────────────────────
            "election_info": "GET /api/election-info",
            "open_election": "POST /api/open-election",
            "close_election": "POST /api/close-election",
            "factory_reset": "POST /api/reset-all",
            # ── Biometric Evaluation Performance Dashboard ──────
            "biometric_evaluate": "POST /api/biometrics/evaluate",
            "biometric_evaluation_summary": "GET /api/biometrics/evaluation-summary",
            "biometric_export_csv": "GET /api/biometrics/export/csv",
            "biometric_export_json": "GET /api/biometrics/export/json",
            # ── Security Monitoring & Tamper Detection ───────────
            "security_summary": "GET /api/security/summary",
            "security_events": "GET /api/security/events",
            "security_event_detail": "GET /api/security/events/<id>",
            "security_event_review": "POST /api/security/events/<id>/review",
            "security_export_csv": "GET /api/security/export/csv",
            "security_export_json": "GET /api/security/export/json",
            # ── Election Analytics & Results Dashboard ───────────
            "analytics_overview": "GET /api/analytics/overview",
            "analytics_export_csv": "GET /api/analytics/export/csv",
            "analytics_export_json": "GET /api/analytics/export/json"
        }
    }), 200

@app.route("/api/status", methods=["GET"])
def status():
    """Checks local server health, blockchain node connection, and operational threshold."""
    blockchain_connected = is_connected()
    account_count = len(w3.eth.accounts) if blockchain_connected else 0
    contract_addr = get_deployed_address()

    return jsonify({
        "status": "healthy" if blockchain_connected else "degraded",
        "blockchain_connected": blockchain_connected,
        "operational_threshold": VERIFICATION_THRESHOLD,
        "contract_address": contract_addr,
        "available_accounts_count": account_count,
        "templates_count": len(load_db())
    }), 200 if blockchain_connected else 503

STUDENTS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "students_roster.json")

def load_students_roster():
    if os.path.exists(STUDENTS_FILE):
        try:
            with open(STUDENTS_FILE, "r") as f:
                return json.load(f)
        except Exception:
            return []
    return []

@app.route("/api/students", methods=["GET"])
def list_students():
    """Returns official 7th semester ISE student electoral roll (235 students)."""
    search_query = request.args.get("search", "").strip().lower()
    section_filter = request.args.get("section", "").strip().upper()

    students = load_students_roster()
    db = load_db()

    results = []
    for s in students:
        if section_filter and s.get("section", "").upper() != section_filter:
            continue
        if search_query:
            if search_query not in s.get("name", "").lower() and search_query not in s.get("usn", "").lower():
                continue

        assigned_addr = s.get("assigned_wallet", "").lower()
        s_copy = dict(s)
        s_copy["is_enrolled_offchain"] = assigned_addr in db
        s_copy["has_voted"] = has_voter_voted(assigned_addr)
        results.append(s_copy)

    return jsonify({
        "total_count": len(students),
        "filtered_count": len(results),
        "students": results
    }), 200

@app.route("/api/accounts", methods=["GET"])
def list_accounts():
    """Lists available unlocked Hardhat test accounts with roles and balances."""
    accounts = get_accounts()
    db = load_db()
    voted_set = get_all_voted_addresses()

    # Enrich with enrollment & voting status
    enriched = []
    for acc in accounts:
        addr_lower = acc["address"].lower()
        onchain = get_voter_onchain_status(acc["address"])
        enriched.append({
            **acc,
            "is_enrolled_offchain": addr_lower in db,
            "is_registered_onchain": onchain.get("isRegistered", False),
            "has_voted": (addr_lower in voted_set) or onchain.get("hasVoted", False)
        })

    return jsonify({"accounts": enriched}), 200

@app.route("/api/sample-fingerprints", methods=["GET"])
def list_sample_fingerprints():
    """Returns curated genuine voter and impostor sample fingerprints from dataset/Real."""
    samples = get_curated_samples()
    for s in samples:
        s["preview_url"] = f"/api/sample-fingerprints/{s['filename']}"
    return jsonify({"samples": samples}), 200

@app.route("/api/sample-fingerprints/<filename>", methods=["GET"])
def serve_sample_fingerprint(filename):
    """Serves sample fingerprint bitmap for live UI thumbnail preview."""
    safe_name = os.path.basename(filename)
    if not os.path.exists(os.path.join(DATASET_DIR, safe_name)):
        return jsonify({"error": "Sample file not found."}), 404
    return send_from_directory(DATASET_DIR, safe_name, mimetype="image/bmp")

@app.route("/api/voter-status/<address>", methods=["GET"])
def voter_status(address):
    """Comprehensive status check across persistent SQLite database and smart contract."""
    clean_addr = address.strip().lower()
    db_info = db_get_voter_status(clean_addr)

    onchain = {}
    try:
        onchain = get_voter_onchain_status(clean_addr)
    except Exception:
        pass

    # A voter has voted if marked in persistent SQLite database OR on-chain
    has_voted = db_info["has_voted"] or onchain.get("hasVoted", False)
    is_enrolled = db_info["is_enrolled_offchain"]
    is_registered = db_info["is_registered_onchain"] or onchain.get("isRegistered", False)

    return jsonify({
        "voter_address": address,
        "is_enrolled_offchain": is_enrolled,
        "biometric_hash_offchain": db_info.get("biometric_hash_offchain"),
        "is_registered_onchain": is_registered,
        "has_voted": has_voted,
        "biometric_hash_onchain": onchain.get("biometricHash")
    }), 200

@app.route("/api/register-voter", methods=["POST"])
def register_voter():
    """
    Step 1: Enrolls a voter in the persistent database.
    Receives fingerprint image and wallet address, extracts 128-d embedding,
    computes SHA-256 hash, and saves to persistent SQLite database.
    """
    if "voter_address" not in request.form or "fingerprint" not in request.files:
        return jsonify({"error": "Fields 'voter_address' and 'fingerprint' are required."}), 400

    voter_addr = request.form["voter_address"].strip().lower()
    img_bytes = request.files["fingerprint"].read()

    try:
        embedding = extract_embedding(img_bytes)
        bio_hash = hash_biometric_vector(embedding)
        checksum = Web3.to_checksum_address(voter_addr)

        save_voter_enrollment(voter_addr, checksum, bio_hash, embedding, is_registered_onchain=False)

        return jsonify({
            "success": True,
            "voter_address": voter_addr,
            "biometric_hash": bio_hash,
            "embedding_preview": [round(float(x), 4) for x in embedding[:8].tolist()],
            "message": "Biometric template stored in persistent database. Ready for smart contract registration."
        }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/register-onchain", methods=["POST"])
@require_role(["COMMISSIONER"])
def register_onchain():
    """
    Step 2: Registers voter on Ethereum smart contract.
    Executed by the election commissioner account (Account 0).
    Gracefully handles already-registered accounts without reverting.
    """
    data = request.get_json()
    if not data or "voter_address" not in data or "biometric_hash" not in data:
        return jsonify({"error": "Fields 'voter_address' and 'biometric_hash' are required in JSON body."}), 400

    try:
        contract = get_contract()
        voter_addr = Web3.to_checksum_address(data["voter_address"])
        bio_hash = bytes.fromhex(data["biometric_hash"].replace("0x", ""))

        # Check if already registered on-chain first
        is_reg, has_voted, existing_hash = contract.functions.voters(voter_addr).call()
        if is_reg:
            return jsonify({
                "success": True,
                "already_registered": True,
                "tx_hash": None,
                "block_number": w3.eth.block_number,
                "gas_used": 0,
                "message": "Voter is already registered on Ethereum smart contract."
            }), 200

        commissioner = w3.eth.accounts[0]
        tx_hash = contract.functions.registerVoter(voter_addr, bio_hash).transact({"from": commissioner})
        receipt = w3.eth.wait_for_transaction_receipt(tx_hash)

        return jsonify({
            "success": True,
            "already_registered": False,
            "tx_hash": receipt.transactionHash.hex(),
            "block_number": receipt.blockNumber,
            "gas_used": receipt.gasUsed,
            "message": "Voter successfully registered on Ethereum smart contract."
        }), 200
    except BlockchainUnavailableError as e:
        return jsonify({"error": str(e), "code": "BLOCKCHAIN_UNAVAILABLE"}), 503
    except Exception as e:
        err_msg = str(e)
        if "already registered" in err_msg.lower():
            return jsonify({
                "success": True,
                "already_registered": True,
                "tx_hash": None,
                "message": "Voter is already registered on Ethereum smart contract."
            }), 200
        return jsonify({"error": err_msg}), 500

@app.route("/api/enroll-voter", methods=["POST"])
@require_role(["COMMISSIONER"])
def enroll_voter():
    """
    Unified 1-Step Biometric Enrollment:
    1. Extracts 128-d embedding & SHA-256 hash via Siamese CNN.
    2. Persists biometric template in off-chain database.
    3. Commits biometric hash to Ethereum smart contract via Election Commissioner.
    Handles already-registered accounts gracefully.
    """
    if "voter_address" not in request.form or "fingerprint" not in request.files:
        return jsonify({"error": "Fields 'voter_address' and 'fingerprint' are required."}), 400

    raw_addr = request.form["voter_address"].strip()
    img_bytes = request.files["fingerprint"].read()

    try:
        voter_checksum = Web3.to_checksum_address(raw_addr)
    except Exception as e:
        return jsonify({"error": f"Invalid Ethereum address format: {str(e)}"}), 400

    voter_lower = raw_addr.lower()

    try:
        embedding = extract_embedding(img_bytes)
        bio_hash = hash_biometric_vector(embedding)

        # 1. Save in persistent SQLite database (and mirror to templates_db.json)
        save_voter_enrollment(voter_lower, voter_checksum, bio_hash, embedding, is_registered_onchain=True)

        # 2. Register on-chain if blockchain is connected
        onchain_tx = None
        onchain_block = None
        onchain_gas = None
        already_registered = False

        if is_connected():
            try:
                contract = get_contract()
                is_reg, has_voted, existing_hash = contract.functions.voters(voter_checksum).call()
                if is_reg:
                    already_registered = True
                    onchain_block = w3.eth.block_number
                else:
                    commissioner = w3.eth.accounts[0]
                    bio_hash_bytes = bytes.fromhex(bio_hash.replace("0x", ""))
                    tx_hash = contract.functions.registerVoter(voter_checksum, bio_hash_bytes).transact({"from": commissioner})
                    receipt = w3.eth.wait_for_transaction_receipt(tx_hash)
                    onchain_tx = receipt.transactionHash.hex()
                    onchain_block = receipt.blockNumber
                    onchain_gas = receipt.gasUsed
            except Exception as onchain_err:
                err_text = str(onchain_err).lower()
                if "already registered" in err_text:
                    already_registered = True
                else:
                    print(f"[OnChain Registration Warning] {onchain_err}")

        msg = "Voter biometric template saved and registered on Ethereum ledger."
        if already_registered:
            msg = "Biometric template updated off-chain. Voter was already registered on Ethereum smart contract."

        return jsonify({
            "success": True,
            "voter_address": raw_addr,
            "checksum_address": voter_checksum,
            "biometric_hash": bio_hash,
            "embedding_preview": [round(float(x), 4) for x in embedding[:8].tolist()],
            "is_enrolled_offchain": True,
            "is_registered_onchain": True,
            "already_registered": already_registered,
            "tx_hash": onchain_tx,
            "block_number": onchain_block,
            "gas_used": onchain_gas,
            "message": msg
        }), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/verify-and-vote", methods=["POST"])
def verify_and_vote():
    """
    Step 3: Biometric authentication gate.
    Compares live fingerprint scan against enrolled embedding using Euclidean distance.
    Applies sliding-window rate limiting and automated suspicious activity logging.
    """
    client_ip = request.remote_addr or "127.0.0.1"
    
    # 1. Rate limiting check
    allowed, retry_after = check_rate_limit(client_ip, limit_type="verification")
    if not allowed:
        log_security_event(
            event_type="RATE_LIMIT_EXCEEDED",
            severity="LOW",
            description=f"Rate limit exceeded on biometric verification endpoint (Retry-After: {retry_after}s)",
            voter_address=request.form.get("voter_address", "").strip() or None,
            source_ip=client_ip,
            status="BLOCKED"
        )
        return jsonify({
            "error": "Rate limit exceeded. Too many verification requests. Please slow down.",
            "retry_after": retry_after
        }), 429

    # 2. Malformed request detection
    if "voter_address" not in request.form or "fingerprint" not in request.files:
        log_security_event(
            event_type="MALFORMED_REQUEST",
            severity="LOW",
            description="Malformed biometric verification request: missing voter_address or fingerprint file",
            source_ip=client_ip,
            status="REJECTED"
        )
        return jsonify({"error": "Fields 'voter_address' and 'fingerprint' are required."}), 400

    voter_addr = request.form["voter_address"].strip().lower()
    img_bytes = request.files["fingerprint"].read()

    db = load_db()
    # 3. Unregistered voter detection
    if voter_addr not in db:
        log_security_event(
            event_type="UNREGISTERED_VOTER_ATTEMPT",
            severity="MEDIUM",
            description=f"Unregistered voter address {voter_addr} attempted biometric verification",
            voter_address=voter_addr,
            source_ip=client_ip,
            status="FAILED"
        )
        return jsonify({
            "success": False,
            "verified": False,
            "error": "Voter address not enrolled in biometric database. Please complete enrollment first."
        }), 404

    try:
        stored_embedding = db[voter_addr]["embedding"]
        live_embedding = extract_embedding(img_bytes)
        is_match, distance, similarity_pct = verify_fingerprints(stored_embedding, live_embedding)

        # 4. Biometric attempt evaluation (escalates to HIGH alert upon >= 3 failures in window)
        record_biometric_attempt(voter_addr, is_match=is_match, distance=distance, source_ip=client_ip)

        if not is_match:
            return jsonify({
                "success": False,
                "verified": False,
                "distance": round(distance, 4),
                "threshold": VERIFICATION_THRESHOLD,
                "similarity_pct": similarity_pct,
                "message": f"Biometric mismatch: Euclidean distance {round(distance, 4)} exceeds threshold {VERIFICATION_THRESHOLD}."
            }), 401

        return jsonify({
            "success": True,
            "verified": True,
            "distance": round(distance, 4),
            "threshold": VERIFICATION_THRESHOLD,
            "similarity_pct": similarity_pct,
            "biometric_hash": db[voter_addr]["biometric_hash"],
            "message": f"Biometric match verified ({similarity_pct}% similarity). Voter authorized to cast ballot."
        }), 200
    except BlockchainUnavailableError as e:
        return jsonify({"error": str(e), "code": "BLOCKCHAIN_UNAVAILABLE"}), 503
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/cast-vote", methods=["POST"])
def cast_vote():
    """
    Step 4: Submits ballot to the smart contract and persists in SQLite database.
    Broadcasts the castVote transaction using the voter's address and biometric hash.
    Monitors double voting and blockchain transaction failures.
    """
    client_ip = request.remote_addr or "127.0.0.1"

    # 1. Rate limiting check
    allowed, retry_after = check_rate_limit(client_ip, limit_type="voting")
    if not allowed:
        log_security_event(
            event_type="RATE_LIMIT_EXCEEDED",
            severity="LOW",
            description=f"Rate limit exceeded on ballot casting endpoint (Retry-After: {retry_after}s)",
            source_ip=client_ip,
            status="BLOCKED"
        )
        return jsonify({
            "error": "Rate limit exceeded. Too many vote submissions. Please slow down.",
            "retry_after": retry_after
        }), 429

    data = request.get_json(silent=True)
    if not data or "voter_address" not in data or "candidate_id" not in data or "biometric_hash" not in data:
        log_security_event(
            event_type="MALFORMED_REQUEST",
            severity="LOW",
            description="Malformed ballot cast payload: missing required fields",
            source_ip=client_ip,
            status="REJECTED"
        )
        return jsonify({"error": "voter_address, candidate_id, and biometric_hash are required."}), 400

    voter_addr_input = data["voter_address"]

    # 2. Prevent double voting from persistent database
    if has_voter_voted(voter_addr_input):
        log_security_event(
            event_type="DUPLICATE_VOTING_ATTEMPT",
            severity="HIGH",
            description=f"Duplicate voting attempt blocked: voter {voter_addr_input} already voted in off-chain database",
            voter_address=voter_addr_input,
            source_ip=client_ip,
            status="REJECTED"
        )
        return jsonify({"error": "Double Voting Prevented: You have already cast your ballot."}), 400

    try:
        contract = get_contract()
        voter_addr = ensure_voter_account_available(voter_addr_input)
        candidate_id = int(data["candidate_id"])
        bio_hash = bytes.fromhex(data["biometric_hash"].replace("0x", ""))

        tx_hash = contract.functions.castVote(candidate_id, bio_hash).transact({"from": voter_addr})
        receipt = w3.eth.wait_for_transaction_receipt(tx_hash)

        # Record ballot into persistent SQLite database
        try:
            record_ballot_cast(
                voter_addr_input,
                voter_addr,
                candidate_id,
                data["biometric_hash"],
                receipt.transactionHash.hex(),
                receipt.blockNumber
            )
        except Exception as db_err:
            print(f"[DB Record Ballot Warning] {db_err}")

        # 3. Log successful ballot cast event
        log_security_event(
            event_type="BALLOT_CAST_SUCCESS",
            severity="INFO",
            description=f"Ballot successfully confirmed on blockchain ledger for candidate {candidate_id}",
            voter_address=voter_addr_input,
            tx_hash=receipt.transactionHash.hex(),
            block_number=receipt.blockNumber,
            source_ip=client_ip,
            status="CONFIRMED"
        )

        return jsonify({
            "success": True,
            "tx_hash": receipt.transactionHash.hex(),
            "block_number": receipt.blockNumber,
            "gas_used": receipt.gasUsed,
            "candidate_id": candidate_id,
            "message": "Vote successfully cast and permanently recorded on blockchain ledger and database."
        }), 200
    except BlockchainUnavailableError as e:
        log_security_event(
            event_type="BLOCKCHAIN_TRANSACTION_FAILURE",
            severity="HIGH",
            description=f"Blockchain connection unavailable during vote cast: {str(e)}",
            voter_address=voter_addr_input,
            source_ip=client_ip,
            status="ERROR"
        )
        return jsonify({"error": str(e), "code": "BLOCKCHAIN_UNAVAILABLE"}), 503
    except VoterAccountUnavailableError as e:
        log_security_event(
            event_type="UNREGISTERED_VOTER_ATTEMPT",
            severity="MEDIUM",
            description=f"Voter wallet not available on connected node: {str(e)}",
            voter_address=voter_addr_input,
            source_ip=client_ip,
            status="REJECTED"
        )
        return jsonify({"error": str(e), "code": "VOTER_ACCOUNT_UNAVAILABLE"}), 400
    except Exception as e:
        err_msg = str(e)
        is_revert = "revert" in err_msg.lower()
        is_double_vote = "already cast your ballot" in err_msg.lower()

        if is_double_vote:
            log_security_event(
                event_type="DUPLICATE_VOTING_ATTEMPT",
                severity="HIGH",
                description=f"Smart contract reverted castVote: voter {voter_addr_input} already voted on-chain",
                voter_address=voter_addr_input,
                source_ip=client_ip,
                status="REJECTED"
            )
        elif is_revert or "error" in err_msg.lower():
            log_security_event(
                event_type="BLOCKCHAIN_TRANSACTION_FAILURE",
                severity="HIGH",
                description=f"Smart contract castVote execution failure: {err_msg[:200]}",
                voter_address=voter_addr_input,
                source_ip=client_ip,
                status="ERROR"
            )

        if is_revert:
            # Election lifecycle errors
            if "not currently open" in err_msg:
                err_msg = "Election Error: The election is not currently open for voting."
            elif "has not started yet" in err_msg:
                err_msg = "Timing Error: The election has not started yet. Please wait for the voting window to begin."
            elif "voting period has ended" in err_msg:
                err_msg = "Timing Error: The election voting period has ended. No further ballots are accepted."
            # Voter eligibility errors
            elif "already cast your ballot" in err_msg:
                err_msg = "Double Voting Prevented: You have already cast your ballot."
            elif "not registered to vote" in err_msg:
                err_msg = "Eligibility Error: You are not registered to vote on-chain."
            elif "Biometric hash mismatch" in err_msg:
                err_msg = "Security Error: Biometric hash does not match on-chain record."
            elif "Invalid candidate selected" in err_msg:
                err_msg = "Invalid Candidate: The selected candidate ID does not exist."
        return jsonify({"error": err_msg}), 400

@app.route("/api/candidates", methods=["GET"])
def get_candidates():
    """Queries candidate entries and live vote counts from smart contract with SQLite fallback."""
    try:
        contract = get_contract()
        total_candidates = contract.functions.candidatesCount().call()
        candidates = []
        total_votes = 0

        for i in range(1, total_candidates + 1):
            c_id, name, vote_count = contract.functions.getCandidate(i).call()
            total_votes += vote_count
            candidates.append({
                "id": c_id,
                "name": name,
                "vote_count": vote_count
            })

        # Calculate percentages
        for c in candidates:
            c["percentage"] = round((c["vote_count"] / total_votes * 100), 1) if total_votes > 0 else 0.0

        return jsonify({
            "candidates": candidates,
            "total_votes": total_votes,
            "contract_address": get_deployed_address()
        }), 200
    except Exception:
        # Fallback to persistent SQLite database
        db_results = get_candidates_results()
        return jsonify({
            "candidates": db_results["candidates"],
            "total_votes": db_results["total_votes"],
            "contract_address": get_deployed_address()
        }), 200

@app.route("/api/audit-trail", methods=["GET"])
def audit_trail():
    """Returns verified ledger events, transactions, and block audit trail."""
    try:
        trail = get_audit_trail()
        return jsonify(trail), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/simulate/run-scenario", methods=["POST"])
def run_simulation_scenario():
    """
    Executes an automated test scenario for demonstration and evaluation:
    - legitimate_vote: Enrolls Voter, registers on-chain, verifies biometrics, casts ballot.
    - impostor_attack: Uses different finger/person to verify CNN barrier stops impostor.
    - double_vote: Attempts second ballot from already-voted account to verify contract revert.
    - unregistered_vote: Attempts ballot from unregistered address.
    """
    data = request.get_json() or {}
    scenario = data.get("scenario", "legitimate_vote")

    if not is_connected():
        return jsonify({"error": "Blockchain node must be running to execute simulation scenarios."}), 503

    accounts = w3.eth.accounts
    if len(accounts) < 4:
        return jsonify({"error": "Insufficient unlocked accounts on blockchain node."}), 500

    logs = []
    
    try:
        if scenario == "legitimate_vote":
            # Use Account 3 as simulated test voter
            voter = accounts[3]
            sample_file = os.path.join(DATASET_DIR, "100__M_Left_index_finger.BMP")
            logs.append(f"[Step 1] Loading genuine enrollment fingerprint for voter: {voter}")
            
            with open(sample_file, "rb") as f:
                img_bytes = f.read()
            emb = extract_embedding(img_bytes)
            bio_hash = hash_biometric_vector(emb)

            db = load_db()
            db[voter.lower()] = {"embedding": emb.tolist(), "biometric_hash": bio_hash}
            save_db(db)
            logs.append(f"[Step 1 Result] Biometric vector extracted (128-d) and SHA-256 hashed: {bio_hash[:18]}...")

            logs.append("[Step 2] Checking election lifecycle status on-chain...")
            contract = get_contract()
            status, start_time, end_time, total_votes, voting_now = contract.functions.getElectionInfo().call()
            if status == 0:
                # If election is not started yet, automatically open it for the simulation session
                latest_block = w3.eth.get_block("latest")
                now_ts = latest_block.timestamp
                tx_open = contract.functions.openElection(now_ts, now_ts + 86400).transact({"from": accounts[0]})
                w3.eth.wait_for_transaction_receipt(tx_open)
                logs.append("[Step 2 Result] Election was in NotStarted state; opened for simulation.")

            checksum_voter = Web3.to_checksum_address(voter)
            onchain_status = contract.functions.voters(checksum_voter).call()
            if not onchain_status[0]: # Not yet registered
                tx_reg = contract.functions.registerVoter(
                    checksum_voter, 
                    bytes.fromhex(bio_hash.replace("0x", ""))
                ).transact({"from": accounts[0]})
                r_reg = w3.eth.wait_for_transaction_receipt(tx_reg)
                logs.append(f"[Step 2 Result] On-chain registration confirmed! Tx: {r_reg.transactionHash.hex()[:18]}...")
            else:
                logs.append("[Step 2 Info] Voter was already registered on-chain.")

            logs.append("[Step 3] Simulating live fingerprint presentation at polling booth...")
            is_match, distance, similarity = verify_fingerprints(emb, emb)
            logs.append(f"[Step 3 Result] Biometric match confirmed! Distance: {distance:.4f} <= {VERIFICATION_THRESHOLD} ({similarity}% similarity).")

            logs.append("[Step 4] Submitting ballot for Candidate 1 (Alice)...")
            tx_vote = contract.functions.castVote(
                1, 
                bytes.fromhex(bio_hash.replace("0x", ""))
            ).transact({"from": checksum_voter})
            r_vote = w3.eth.wait_for_transaction_receipt(tx_vote)
            logs.append(f"[Step 4 Result] Ballot cast successfully! Tx: {r_vote.transactionHash.hex()[:18]}... Block: #{r_vote.blockNumber}")

            return jsonify({
                "scenario": scenario,
                "status": "PASSED",
                "logs": logs,
                "summary": "Legitimate voter enrolled, authenticated via CNN biometrics, and cast ballot on Ethereum ledger."
            }), 200

        elif scenario == "impostor_attack":
            # Simulate impostor trying to vote as Account 3
            voter = accounts[3]
            impostor_file = os.path.join(DATASET_DIR, "101__M_Left_index_finger.BMP")
            logs.append(f"[Attack Simulation] Impostor presenting foreign biometric scan for target wallet: {voter}")
            
            db = load_db()
            if voter.lower() not in db:
                return jsonify({"error": "Run legitimate_vote first so target account is enrolled."}), 400

            stored_emb = db[voter.lower()]["embedding"]
            with open(impostor_file, "rb") as f:
                impostor_bytes = f.read()
            impostor_emb = extract_embedding(impostor_bytes)

            logs.append("[Siamese CNN Inference] Comparing live impostor embedding with enrolled citizen template...")
            is_match, distance, similarity = verify_fingerprints(stored_emb, impostor_emb)
            logs.append(f"[Evaluation] Euclidean Distance: {distance:.4f} | Security Threshold: {VERIFICATION_THRESHOLD}")

            if not is_match:
                logs.append("[DEFENSE SUCCESS] Biometric Authentication Gate REJECTED the impostor!")
                logs.append("Smart contract transaction was BLOCKED before entering the blockchain mempool.")
                return jsonify({
                    "scenario": scenario,
                    "status": "PASSED (ATTACK BLOCKED)",
                    "logs": logs,
                    "distance": round(distance, 4),
                    "threshold": VERIFICATION_THRESHOLD,
                    "summary": f"Impostor scan blocked by CNN model. Distance ({distance:.4f}) exceeded security threshold ({VERIFICATION_THRESHOLD})."
                }), 200
            else:
                logs.append("[DEFENSE FAILED] Impostor was unexpectedly accepted.")
                return jsonify({"scenario": scenario, "status": "FAILED", "logs": logs}), 500

        elif scenario == "double_vote":
            # Attempting duplicate vote with Account 3
            voter = accounts[3]
            db = load_db()
            if voter.lower() not in db:
                return jsonify({"error": "Run legitimate_vote first so voter has cast their first ballot."}), 400

            bio_hash = db[voter.lower()]["biometric_hash"]
            checksum_voter = Web3.to_checksum_address(voter)
            contract = get_contract()

            logs.append(f"[Duplicate Vote Test] Attempting to submit second ballot from wallet: {voter}")
            try:
                tx_vote = contract.functions.castVote(
                    2, 
                    bytes.fromhex(bio_hash.replace("0x", ""))
                ).transact({"from": checksum_voter})
                w3.eth.wait_for_transaction_receipt(tx_vote)
                logs.append("[ERROR] Second vote succeeded! Duplicate prevention failed.")
                return jsonify({"scenario": scenario, "status": "FAILED", "logs": logs}), 500
            except Exception as e:
                logs.append(f"[DEFENSE SUCCESS] Ethereum Smart Contract REVERTED the transaction!")
                logs.append("Revert Rule: 'You have already cast your ballot.'")
                logs.append("Duplicate vote was permanently denied by the immutable smart contract ledger.")
                return jsonify({
                    "scenario": scenario,
                    "status": "PASSED (DOUBLE VOTE PREVENTED)",
                    "logs": logs,
                    "summary": "Smart contract enforced the one-vote-per-voter rule and rejected the duplicate ballot."
                }), 200

        elif scenario == "unregistered_vote":
            # Attempting vote from unregistered Account 9
            unregistered = accounts[9]
            checksum_addr = Web3.to_checksum_address(unregistered)
            contract = get_contract()
            dummy_hash = bytes([1]*32)

            logs.append(f"[Authorization Test] Attempting ballot from unregistered wallet: {unregistered}")
            try:
                tx = contract.functions.castVote(1, dummy_hash).transact({"from": checksum_addr})
                w3.eth.wait_for_transaction_receipt(tx)
                logs.append("[ERROR] Unregistered vote succeeded!")
                return jsonify({"scenario": scenario, "status": "FAILED", "logs": logs}), 500
            except Exception:
                logs.append("[DEFENSE SUCCESS] Smart Contract REVERTED: 'You are not registered to vote.'")
                return jsonify({
                    "scenario": scenario,
                    "status": "PASSED (UNREGISTERED VOTE PREVENTED)",
                    "logs": logs,
                    "summary": "Smart contract verified voter registration mapping and blocked unauthorized voter."
                }), 200


        else:
            return jsonify({"error": f"Unknown scenario '{scenario}'."}), 400

    except Exception as e:
        logs.append(f"[Error Encountered] {str(e)}")
        return jsonify({"scenario": scenario, "status": "ERROR", "logs": logs, "error": str(e)}), 500


# ─────────────────────────────────────────────────────────────────────────────
# Election Lifecycle Routes
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/api/election-info", methods=["GET"])
def election_info():
    """
    Returns full election lifecycle information from the smart contract:
    status (0=NotStarted, 1=Open, 2=Closed), start/end timestamps,
    total votes cast so far, and whether voting is currently permitted.
    """
    try:
        info = get_election_info()
        info["contract_address"] = get_deployed_address()
        return jsonify(info), 200
    except BlockchainUnavailableError as e:
        return jsonify({"error": str(e), "code": "BLOCKCHAIN_UNAVAILABLE"}), 503
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/open-election", methods=["POST"])
@require_role(["COMMISSIONER"])
def open_election():
    """
    Commissioner-only: Opens the election for a specified time window.

    JSON body:
      {
        "start_time": <unix_timestamp_int>,
        "end_time":   <unix_timestamp_int>
      }
    """
    client_ip = request.remote_addr or "127.0.0.1"
    data = request.get_json(silent=True)
    if not data or "start_time" not in data or "end_time" not in data:
        log_security_event(
            event_type="MALFORMED_REQUEST",
            severity="LOW",
            description="Malformed open-election request: missing start_time or end_time",
            source_ip=client_ip,
            status="REJECTED"
        )
        return jsonify({
            "error": "JSON body must contain 'start_time' and 'end_time' (Unix timestamps)."
        }), 400

    try:
        start_time = int(data["start_time"])
        end_time   = int(data["end_time"])
    except (ValueError, TypeError):
        return jsonify({"error": "'start_time' and 'end_time' must be integers (Unix timestamps)."}), 400

    if end_time <= start_time:
        return jsonify({"error": "Invalid Timing: End time must be strictly greater than start time."}), 400

    try:
        contract     = get_contract()
        commissioner = w3.eth.accounts[0]

        # Authorization check: verify caller is commissioner if explicitly passed
        caller = request.headers.get("X-Commissioner-Address") or data.get("caller_address")
        if caller and caller.strip().lower() != commissioner.lower():
            log_security_event(
                event_type="UNAUTHORIZED_ADMIN_ACCESS",
                severity="HIGH",
                description=f"Unauthorized non-commissioner wallet {caller} attempted to open election",
                voter_address=caller,
                source_ip=client_ip,
                status="FORBIDDEN"
            )
            return jsonify({"error": "Authorization Denied: Only the Election Commissioner may open the election."}), 403

        import time
        now_host = int(time.time())

        # If opening now (demo mode or immediate start within 2 minutes of host clock),
        # set start_time to 10 seconds before now so block.timestamp is guaranteed to be >= electionStart
        if start_time <= now_host + 120:
            start_time = max(0, now_host - 10)
            if end_time <= start_time:
                end_time = start_time + 14400

        tx_hash = contract.functions.openElection(start_time, end_time).transact({"from": commissioner})
        receipt = w3.eth.wait_for_transaction_receipt(tx_hash)

        # Update persistent SQLite database
        try:
            update_election_lifecycle(
                status=1,
                status_label="Open",
                start_time=start_time,
                end_time=end_time,
                contract_address=get_deployed_address()
            )
        except Exception as db_err:
            print(f"[DB Update Lifecycle Warning] {db_err}")

        log_security_event(
            event_type="ADMIN_OPERATION_SUCCESS",
            severity="INFO",
            description=f"Election successfully opened from timestamp {start_time} to {end_time}",
            voter_address=commissioner,
            tx_hash=receipt.transactionHash.hex(),
            block_number=receipt.blockNumber,
            source_ip=client_ip,
            status="CONFIRMED"
        )

        return jsonify({
            "success": True,
            "tx_hash": receipt.transactionHash.hex(),
            "block_number": receipt.blockNumber,
            "gas_used": receipt.gasUsed,
            "start_time": start_time,
            "end_time": end_time,
            "message": (
                f"Election successfully opened. "
                f"Voting window: {start_time} to {end_time} (Unix timestamps)."
            )
        }), 200
    except BlockchainUnavailableError as e:
        return jsonify({"error": str(e), "code": "BLOCKCHAIN_UNAVAILABLE"}), 503
    except Exception as e:
        err_msg = str(e)
        if "revert" in err_msg.lower():
            if "already been opened" in err_msg:
                err_msg = "Election has already been opened or closed. Click 'Factory Reset System' to start a new election."
            elif "end time must be after" in err_msg.lower():
                err_msg = "Invalid timing: end_time must be strictly greater than start_time."
            elif "start time cannot be in the past" in err_msg.lower():
                err_msg = "Invalid timing: start_time cannot be in the past."
            elif "not the election commissioner" in err_msg.lower():
                log_security_event(
                    event_type="UNAUTHORIZED_ADMIN_ACCESS",
                    severity="HIGH",
                    description="Smart contract revert: not the election commissioner",
                    source_ip=client_ip,
                    status="FORBIDDEN"
                )
                err_msg = "Authorization denied: Only the Election Commissioner may open the election."
        return jsonify({"error": err_msg}), 400


@app.route("/api/close-election", methods=["POST"])
@require_role(["COMMISSIONER"])
def close_election():
    """
    Commissioner-only: Closes the election immediately.
    After closing, no further votes can be cast.
    The smart contract emits ElectionClosed(closedAt, totalVotes).
    """
    client_ip = request.remote_addr or "127.0.0.1"
    try:
        contract     = get_contract()
        commissioner = w3.eth.accounts[0]

        # Authorization check: verify caller is commissioner if explicitly passed
        caller = request.headers.get("X-Commissioner-Address") or (request.get_json(silent=True) or {}).get("caller_address")
        if caller and caller.strip().lower() != commissioner.lower():
            log_security_event(
                event_type="UNAUTHORIZED_ADMIN_ACCESS",
                severity="HIGH",
                description=f"Unauthorized non-commissioner wallet {caller} attempted to close election",
                voter_address=caller,
                source_ip=client_ip,
                status="FORBIDDEN"
            )
            return jsonify({"error": "Authorization Denied: Only the Election Commissioner may close the election."}), 403

        tx_hash = contract.functions.closeElection().transact({"from": commissioner})
        receipt = w3.eth.wait_for_transaction_receipt(tx_hash)

        info = get_election_info()

        # Update persistent SQLite database
        try:
            update_election_lifecycle(
                status=2,
                status_label="Closed",
                contract_address=get_deployed_address()
            )
        except Exception as db_err:
            print(f"[DB Close Lifecycle Warning] {db_err}")

        log_security_event(
            event_type="ADMIN_OPERATION_SUCCESS",
            severity="INFO",
            description=f"Election permanently closed by commissioner. Total votes cast: {info.get('total_votes', 0)}",
            voter_address=commissioner,
            tx_hash=receipt.transactionHash.hex(),
            block_number=receipt.blockNumber,
            source_ip=client_ip,
            status="CONFIRMED"
        )

        return jsonify({
            "success": True,
            "tx_hash": receipt.transactionHash.hex(),
            "block_number": receipt.blockNumber,
            "gas_used": receipt.gasUsed,
            "total_votes": info.get("total_votes", 0),
            "message": "Election has been permanently closed. No further votes will be accepted."
        }), 200
    except BlockchainUnavailableError as e:
        return jsonify({"error": str(e), "code": "BLOCKCHAIN_UNAVAILABLE"}), 503
    except Exception as e:
        err_msg = str(e)
        if "revert" in err_msg.lower():
            if "not currently open" in err_msg.lower():
                err_msg = "Cannot close election: it is not in the Open state."
            elif "not the election commissioner" in err_msg.lower():
                log_security_event(
                    event_type="UNAUTHORIZED_ADMIN_ACCESS",
                    severity="HIGH",
                    description="Smart contract revert: not the election commissioner",
                    source_ip=client_ip,
                    status="FORBIDDEN"
                )
                err_msg = "Authorization denied: Only the Election Commissioner may close the election."
        return jsonify({"error": err_msg}), 400


@app.route("/api/reset-all", methods=["POST"])
@require_role(["COMMISSIONER"])
def factory_reset():
    """
    Factory Reset:
    1. Deploys a brand new instance of Voting.sol to the blockchain (fresh state, 0 votes, NotStarted).
    2. Resets the persistent SQLite database (clears ballots, resets candidates, clears enrollments).
    3. Resets all election states so the user can demonstrate again from scratch.
    """
    try:
        # 1. Deploy fresh smart contract
        new_contract_address = deploy_fresh_contract()

        # 2. Reset persistent SQLite database (clears ballots_cast, resets candidates, clears voter_enrollments)
        factory_reset_db(new_contract_address)

        return jsonify({
            "success": True,
            "contract_address": new_contract_address,
            "message": "Factory reset complete! New smart contract deployed and persistent database cleared."
        }), 200
    except BlockchainUnavailableError as e:
        return jsonify({"error": str(e), "code": "BLOCKCHAIN_UNAVAILABLE"}), 503
    except Exception as e:
        return jsonify({"error": f"Factory reset failed: {str(e)}"}), 500


# ─────────────────────────────────────────────────────────────────────────────
# Biometric Performance Evaluation Dashboard Endpoints
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/api/biometrics/evaluate", methods=["POST"])
def evaluate_biometrics():
    """
    Triggers an empirical performance evaluation of the Siamese Residual CNN:
    - Partitions evaluation subjects without overlap.
    - Tests ground-truth genuine and impostor pairs.
    - Calculates GAR, FAR, FRR, EER, and latency benchmarks.
    - DOES NOT modify the production operating threshold (VERIFICATION_THRESHOLD=0.2385 remains untouched).
    """
    data = request.get_json() or {}

    try:
        num_genuine = int(data.get("num_genuine", 200))
        num_impostor = int(data.get("num_impostor", 200))
    except (ValueError, TypeError):
        return jsonify({"error": "Parameters 'num_genuine' and 'num_impostor' must be integers."}), 400

    # Bounds validation to prevent DoS while ensuring statistical significance
    if num_genuine < 10 or num_genuine > 1000:
        return jsonify({"error": "num_genuine must be between 10 and 1000."}), 400
    if num_impostor < 10 or num_impostor > 1000:
        return jsonify({"error": "num_impostor must be between 10 and 1000."}), 400

    eval_threshold = float(data.get("threshold", VERIFICATION_THRESHOLD))
    if eval_threshold < 0.01 or eval_threshold > 2.0:
        return jsonify({"error": "Evaluation threshold must be between 0.01 and 2.0."}), 400

    try:
        summary = run_biometric_evaluation(
            num_genuine=num_genuine,
            num_impostor=num_impostor,
            threshold=eval_threshold
        )
        return jsonify({
            "success": True,
            "message": f"Biometric evaluation complete: {summary['evaluation_protocol']['total_evaluations']} comparisons evaluated.",
            "summary": summary
        }), 200
    except Exception as e:
        return jsonify({"error": f"Evaluation pipeline failed: {str(e)}"}), 500


@app.route("/api/biometrics/evaluation-summary", methods=["GET"])
def get_evaluation_summary():
    """
    Returns the latest computed evaluation metrics, ROC/threshold curves,
    and distance distributions. If no evaluation has been run yet, runs a default benchmark.
    """
    summary = get_latest_evaluation_summary()
    if summary is None:
        try:
            summary = run_biometric_evaluation(num_genuine=100, num_impostor=100)
        except Exception as e:
            return jsonify({
                "status": "unavailable",
                "message": f"Evaluation could not be generated: {str(e)}"
            }), 200

    return jsonify(summary), 200


@app.route("/api/biometrics/export/<format_type>", methods=["GET"])
def export_biometrics(format_type):
    """
    Exports evaluation findings without leaking raw biometric images or templates:
    - 'csv': Per-comparison record (pair ID, genuine/impostor type, Euclidean distance, decision, latency).
    - 'json': Complete evaluation methodology, metrics at threshold, EER, and curves.
    """
    summary = get_latest_evaluation_summary()
    if summary is None:
        return jsonify({"error": "No evaluation has been completed yet. Run evaluation first."}), 404

    if format_type.lower() == "json":
        export_payload = {
            "title": "Biometric Performance Evaluation Report — Siamese Residual CNN",
            "institution": "NMAM Institute of Technology, Nitte (Dept of ISE)",
            "project_code": "08",
            "export_timestamp": datetime.now().isoformat() if "datetime" in globals() else summary.get("timestamp"),
            "model_metadata": {
                "architecture": "Siamese Residual CNN (4 blocks, Swish activation, L2 unit sphere)",
                "embedding_dimensions": 128,
                "configured_operational_threshold": VERIFICATION_THRESHOLD
            },
            "protocol": summary.get("evaluation_protocol"),
            "metrics": summary.get("metrics_at_threshold"),
            "eer_analysis": summary.get("eer_analysis"),
            "latency": summary.get("latency_analysis"),
            "threshold_curve": summary.get("threshold_curve")
        }
        json_str = json.dumps(export_payload, indent=2)
        return Response(
            json_str,
            mimetype="application/json",
            headers={"Content-Disposition": "attachment;filename=biometric_evaluation_report.json"}
        )

    elif format_type.lower() == "csv":
        records = summary.get("records", [])
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow([
            "Pair_ID",
            "Ground_Truth_Type",
            "Ground_Truth_Label",
            "Reference_Scan",
            "Test_Scan",
            "Euclidean_Distance",
            "Operating_Threshold",
            "Match_Decision",
            "Verification_Correct",
            "Inference_Latency_ms"
        ])
        for r in records:
            writer.writerow([
                r.get("pair_id"),
                r.get("type"),
                r.get("ground_truth"),
                r.get("file_a"),
                r.get("file_b"),
                r.get("distance"),
                r.get("threshold"),
                r.get("decision"),
                r.get("is_correct"),
                r.get("latency_ms")
            ])
        return Response(
            output.getvalue(),
            mimetype="text/csv",
            headers={"Content-Disposition": "attachment;filename=biometric_comparison_pairs.csv"}
        )

    else:
        return jsonify({"error": "Unsupported export format. Supported formats: 'csv', 'json'."}), 400


# ─────────────────────────────────────────────────────────────────────────────
# Blockchain Audit and Automatic Tamper Detection Endpoints
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/api/audit/run", methods=["POST"])
def api_run_audit():
    """
    Executes real-time cryptographic audit across smart contract state,
    immutable event logs, and off-chain storage to detect discrepancies.
    """
    try:
        report = run_blockchain_audit()
        return jsonify(report), 200
    except BlockchainUnavailableError as e:
        return jsonify({"error": str(e), "code": "BLOCKCHAIN_UNAVAILABLE"}), 503
    except Exception as e:
        return jsonify({"error": f"Audit execution failed: {str(e)}"}), 500

@app.route("/api/audit/latest", methods=["GET"])
def api_latest_audit():
    """Returns the most recent cached audit report."""
    try:
        report = get_latest_audit()
        return jsonify(report), 200
    except Exception as e:
        return jsonify({"error": f"Failed to retrieve latest audit: {str(e)}"}), 500

@app.route("/api/audit/transactions", methods=["GET"])
def api_audit_transactions():
    """Returns verified transaction receipt records from the blockchain ledger."""
    try:
        report = get_latest_audit()
        return jsonify({
            "transactions": report.get("transactions_audit", []),
            "total_transactions": report.get("total_transactions_audited", 0),
            "confirmed_transactions": report.get("confirmed_transactions", 0),
            "failed_transactions": report.get("failed_transactions", 0),
            "missing_transactions": report.get("missing_transactions", 0)
        }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/audit/candidates-comparison", methods=["GET"])
def api_audit_candidates_comparison():
    """Returns authoritative on-chain vs displayed vs event-reconstructed candidate vote counts."""
    try:
        report = get_latest_audit()
        return jsonify({
            "candidates": report.get("candidates_audit", []),
            "discrepancies": report.get("discrepancies", []),
            "contract_address": report.get("contract_address"),
            "overall_status": report.get("overall_status")
        }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/audit/export/csv", methods=["GET"])
def api_export_audit_csv():
    """Downloads RFC-4180 compliant CSV audit report."""
    try:
        csv_text = generate_audit_csv()
        timestamp_str = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        filename = f"blockchain_tamper_audit_{timestamp_str}.csv"
        return Response(
            csv_text,
            mimetype="text/csv",
            headers={"Content-Disposition": f"attachment;filename={filename}"}
        )
    except Exception as e:
        return jsonify({"error": f"CSV export failed: {str(e)}"}), 500



@app.route("/api/audit/simulate-tamper", methods=["POST"])
def api_simulate_tamper():
    """
    Exhibition Demonstration Endpoint:
    Simulates a hypothetical off-chain database modification (e.g. +5 votes for a candidate)
    and demonstrates how the blockchain audit engine instantly catches the discrepancy
    WITHOUT mutating real election database or smart contract data.
    """
    data = request.get_json() or {}
    candidate_id = int(data.get("candidate_id", 1))
    tampered_offset = int(data.get("tampered_offset", 5))

    report = run_blockchain_audit(simulated_discrepancy={
        "candidate_id": candidate_id,
        "tampered_offset": tampered_offset
    })

    return jsonify({
        "simulation": True,
        "demonstration_note": "Controlled tamper detection demonstration. Real election data was NOT mutated.",
        "simulated_candidate_id": candidate_id,
        "simulated_offset": tampered_offset,
        "audit_report": report
    }), 200



# ─────────────────────────────────────────────────────────────────────────────
# Security Monitoring & Suspicious Activity Detection Endpoints
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/api/security/summary", methods=["GET"])
def api_security_summary():
    """Returns high-level statistics and counts of flagged suspicious activities."""
    try:
        summary = get_security_summary()
        return jsonify(summary), 200
    except Exception as e:
        return jsonify({"error": f"Failed to retrieve security summary: {str(e)}"}), 500

@app.route("/api/security/events", methods=["GET"])
def api_security_events():
    """
    Returns filtered, paginated security audit events.
    Supports query params: limit, offset, event_type, severity, reviewed, search
    """
    try:
        limit = int(request.args.get("limit", 100))
        offset = int(request.args.get("offset", 0))
        event_type = request.args.get("event_type")
        severity = request.args.get("severity")
        reviewed_param = request.args.get("reviewed")
        reviewed = None
        if reviewed_param is not None and reviewed_param != "":
            reviewed = reviewed_param.lower() in ("1", "true", "yes")
        search = request.args.get("search")

        result = get_security_events(
            limit=limit,
            offset=offset,
            event_type=event_type,
            severity=severity,
            reviewed=reviewed,
            search=search
        )
        return jsonify(result), 200
    except Exception as e:
        return jsonify({"error": f"Failed to retrieve security events: {str(e)}"}), 500

@app.route("/api/security/events/<int:event_id>", methods=["GET"])
def api_security_event_detail(event_id):
    """Returns granular details for a specific security event."""
    try:
        event = get_security_event_by_id(event_id)
        if not event:
            return jsonify({"error": f"Security event #{event_id} not found."}), 404
        return jsonify(event), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/security/events/<int:event_id>/review", methods=["POST"])
@require_role(["COMMISSIONER", "AUDITOR"])
def api_security_event_review(event_id):
    """
    Marks a security event as reviewed by an auditor or commissioner.
    JSON body (optional): { "reviewed_by": "Auditor Name or Address" }
    """
    try:
        data = request.get_json(silent=True) or {}
        reviewed_by = data.get("reviewed_by", "Election Commissioner")
        updated = mark_event_reviewed(event_id, reviewed_by=reviewed_by)
        if not updated:
            return jsonify({"error": f"Security event #{event_id} not found."}), 404
        return jsonify({
            "success": True,
            "event_id": event_id,
            "reviewed_by": reviewed_by,
            "message": f"Security event #{event_id} marked as reviewed."
        }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/security/export/csv", methods=["GET"])
def api_security_export_csv():
    """Downloads RFC-4180 compliant CSV export of the persistent security log."""
    try:
        csv_text = generate_security_csv()
        timestamp_str = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        filename = f"security_incident_log_{timestamp_str}.csv"
        return Response(
            csv_text,
            mimetype="text/csv",
            headers={"Content-Disposition": f"attachment;filename={filename}"}
        )
    except Exception as e:
        return jsonify({"error": f"Security CSV export failed: {str(e)}"}), 500

@app.route("/api/security/export/json", methods=["GET"])
def api_security_export_json():
    """Downloads full JSON export of the persistent security log."""
    try:
        json_data = generate_security_json()
        timestamp_str = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        filename = f"security_incident_log_{timestamp_str}.json"
        return Response(
            json.dumps(json_data, indent=2),
            mimetype="application/json",
            headers={"Content-Disposition": f"attachment;filename={filename}"}
        )
    except Exception as e:
        return jsonify({"error": f"Security JSON export failed: {str(e)}"}), 500



# ─────────────────────────────────────────────────────────────────────────────
# Election Analytics & Results Dashboard Endpoints
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/api/analytics/overview", methods=["GET"])
def api_analytics_overview():
    """
    Returns comprehensive election overview, voter turnout %, candidate standings with ties,
    hourly voting activity, and biometric/security correlation.
    Supports query parameters: start_date, end_date, candidate_id
    """
    try:
        start_date = request.args.get("start_date")
        end_date = request.args.get("end_date")
        candidate_id = request.args.get("candidate_id")

        data = get_election_analytics(
            start_date=start_date,
            end_date=end_date,
            candidate_id=candidate_id
        )
        return jsonify(data), 200
    except Exception as e:
        return jsonify({"error": f"Failed to generate election analytics: {str(e)}"}), 500

@app.route("/api/analytics/export/csv", methods=["GET"])
def api_analytics_export_csv():
    """Downloads RFC-4180 compliant CSV export of complete election analytics report."""
    try:
        start_date = request.args.get("start_date")
        end_date = request.args.get("end_date")
        candidate_id = request.args.get("candidate_id")

        csv_text = generate_analytics_csv(
            start_date=start_date,
            end_date=end_date,
            candidate_id=candidate_id
        )
        timestamp_str = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        filename = f"election_analytics_report_{timestamp_str}.csv"
        return Response(
            csv_text,
            mimetype="text/csv",
            headers={"Content-Disposition": f"attachment;filename={filename}"}
        )
    except Exception as e:
        return jsonify({"error": f"Analytics CSV export failed: {str(e)}"}), 500

@app.route("/api/analytics/export/json", methods=["GET"])
def api_analytics_export_json():
    """Downloads structured JSON export of complete election analytics report."""
    try:
        start_date = request.args.get("start_date")
        end_date = request.args.get("end_date")
        candidate_id = request.args.get("candidate_id")

        json_data = generate_analytics_json(
            start_date=start_date,
            end_date=end_date,
            candidate_id=candidate_id
        )
        timestamp_str = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        filename = f"election_analytics_report_{timestamp_str}.json"
        return Response(
            json.dumps(json_data, indent=2),
            mimetype="application/json",
            headers={"Content-Disposition": f"attachment;filename={filename}"}
        )
    except Exception as e:
        return jsonify({"error": f"Analytics JSON export failed: {str(e)}"}), 500



# ─────────────────────────────────────────────────────────────────────────────
# Role-Based Access Control (RBAC) & Authentication Endpoints
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/api/auth/login", methods=["POST"])
def api_auth_login():
    """
    Authenticates a user by username/password or wallet address.
    Returns signed cryptographic session token with embedded role and expiry.
    """
    data = request.get_json(silent=True) or {}
    username = data.get("username")
    password = data.get("password")
    wallet_address = data.get("wallet_address")

    # 1. Username / Password authentication (e.g. Commissioner or Auditor)
    if username and password:
        auth_result = authenticate_user(username, password)
        if not auth_result:
            return jsonify({
                "error": "Invalid username or password.",
                "code": "INVALID_CREDENTIALS"
            }), 401
        return jsonify({
            "success": True,
            **auth_result,
            "message": f"Successfully authenticated as {auth_result['user']['role']}."
        }), 200

    # 2. Voter wallet authentication
    if wallet_address:
        auth_result = authenticate_voter_wallet(wallet_address)
        if not auth_result:
            return jsonify({
                "error": "Invalid Ethereum wallet address format.",
                "code": "INVALID_WALLET"
            }), 400
        return jsonify({
            "success": True,
            **auth_result,
            "message": "Successfully authenticated as Registered Voter."
        }), 200

    return jsonify({
        "error": "Request must include either 'username' and 'password' OR 'wallet_address'.",
        "code": "MISSING_CREDENTIALS"
    }), 400

@app.route("/api/auth/logout", methods=["POST"])
def api_auth_logout():
    """Revokes active bearer token session in server database."""
    token = get_token_from_request()
    if token:
        revoke_session_token(token)
    return jsonify({
        "success": True,
        "message": "Session terminated successfully."
    }), 200

@app.route("/api/auth/me", methods=["GET"])
def api_auth_me():
    """Returns currently authenticated user profile and permissions."""
    user = get_current_user()
    if not user:
        return jsonify({
            "authenticated": False,
            "user": None,
            "role": "ANONYMOUS"
        }), 200

    role = user.get("role", "ANONYMOUS")
    perms = ROLE_PERMISSIONS.get(role, {}).get("permissions", [])

    return jsonify({
        "authenticated": True,
        "user": {
            "username": user.get("sub"),
            "display_name": user.get("name"),
            "role": role,
            "wallet_address": user.get("wallet"),
            "expires_at": user.get("exp")
        },
        "permissions": perms
    }), 200

@app.route("/api/auth/roles", methods=["GET"])
def api_auth_roles():
    """Returns explicit role permission matrix."""
    return jsonify({
        "roles": ROLE_PERMISSIONS,
        "default_accounts": {
            "commissioner": { "username": "commissioner", "role": "COMMISSIONER", "default_pin": "admin123" },
            "auditor": { "username": "auditor", "role": "AUDITOR", "default_pin": "audit123" },
            "voter": { "username": "voter", "role": "VOTER", "default_pin": "voter123" }
        }
    }), 200


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=False)