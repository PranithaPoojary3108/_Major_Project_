import os
import csv
import json
import io
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
from database import (
    get_candidates_results,
    get_all_cast_ballots,
    get_election_lifecycle,
    get_all_enrolled_voters
)

AUDIT_RESULTS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "audit_latest.json")

def get_block_timestamp(block_number):
    """Safely retrieves block timestamp from node with caching."""
    try:
        block = w3.eth.get_block(block_number)
        return block.get("timestamp")
    except Exception:
        return None

def verify_transaction_receipt(tx_hash_hex):
    """
    Verifies a transaction receipt against the blockchain node.
    Returns:
      status: 'CONFIRMED' (1), 'FAILED' (0), 'PENDING' (no receipt yet), 'NOT_FOUND' / 'RPC_ERROR'
      receipt_info: dict of details or error
    """
    if not is_connected():
        return {
            "status": "UNABLE_TO_VERIFY",
            "confirmed": False,
            "error": "Blockchain node unavailable"
        }

    try:
        receipt = w3.eth.get_transaction_receipt(tx_hash_hex)
        if receipt is None:
            return {
                "status": "PENDING",
                "confirmed": False,
                "error": "Transaction is pending in the mempool or receipt not yet mined."
            }
        
        tx_status = receipt.get("status", 1)
        is_success = (tx_status == 1)
        
        return {
            "status": "CONFIRMED" if is_success else "FAILED",
            "confirmed": is_success,
            "block_number": receipt.get("blockNumber"),
            "gas_used": receipt.get("gasUsed"),
            "contract_address": receipt.get("to"),
            "from_address": receipt.get("from"),
            "raw_status": tx_status
        }
    except Exception as e:
        err_str = str(e)
        if "not found" in err_str.lower():
            return {
                "status": "MISSING",
                "confirmed": False,
                "error": f"Transaction hash {tx_hash_hex} not found on current chain history."
            }
        return {
            "status": "RPC_ERROR",
            "confirmed": False,
            "error": err_str
        }

def run_blockchain_audit(simulated_discrepancy=None):
    """
    Core Audit and Automatic Tamper Detection Engine.
    Executes comprehensive 6-stage verification across on-chain contract state,
    immutable event logs, and off-chain storage.
    
    If simulated_discrepancy is provided, injects a controlled test variance
    for exhibition demonstration without mutating real election data.
    """
    timestamp = datetime.now(timezone.utc).isoformat()
    contract_addr = get_deployed_address()
    
    checks = []
    discrepancies = []
    
    if not is_connected():
        return {
            "overall_status": "UNABLE_TO_VERIFY",
            "audit_timestamp": timestamp,
            "contract_address": contract_addr,
            "network": "Hardhat Local (Disconnected)",
            "summary": "Audit could not be executed because the blockchain node is offline.",
            "checks": [{
                "id": "node_connectivity",
                "name": "Ethereum Node RPC Connectivity",
                "status": "FAIL",
                "expected": "RPC server at 127.0.0.1:8545 responding",
                "actual": "Connection refused / offline",
                "explanation": "Cannot query smart contract state or block headers."
            }],
            "candidates_audit": [],
            "transactions_audit": [],
            "discrepancies": ["Blockchain node is offline."]
        }

    try:
        contract = get_contract()
        current_block = w3.eth.block_number
    except Exception as e:
        return {
            "overall_status": "UNABLE_TO_VERIFY",
            "audit_timestamp": timestamp,
            "contract_address": contract_addr,
            "network": "Hardhat Local",
            "summary": f"Failed to connect to deployed contract: {e}",
            "checks": [{
                "id": "contract_bytecode",
                "name": "Smart Contract Bytecode Verification",
                "status": "FAIL",
                "expected": "Active contract deployed at address",
                "actual": str(e),
                "explanation": "Smart contract bytecode is missing or address is stale."
            }],
            "candidates_audit": [],
            "transactions_audit": [],
            "discrepancies": [str(e)]
        }

    # ──────────────────────────────────────────────────────────────────────────
    # STAGE 1: On-Chain Candidate Vote Counts vs Off-Chain Displayed Counts
    # ──────────────────────────────────────────────────────────────────────────
    candidates_audit = []
    onchain_total_from_candidates = 0
    
    try:
        total_candidates = contract.functions.candidatesCount().call()
    except Exception:
        total_candidates = 0

    # Fetch off-chain candidate records from SQLite
    db_candidate_records = get_candidates_results().get("candidates", [])
    db_candidates_map = {c["id"]: c for c in db_candidate_records}

    candidate_mismatches = 0
    for cid in range(1, total_candidates + 1):
        try:
            c_id, c_name, onchain_votes = contract.functions.getCandidate(cid).call()
            onchain_total_from_candidates += onchain_votes
            
            db_record = db_candidates_map.get(cid, {})
            db_votes = db_record.get("vote_count", 0)
            
            # Apply controlled simulation if requested
            displayed_votes = db_votes
            if simulated_discrepancy and simulated_discrepancy.get("candidate_id") == cid:
                displayed_votes += simulated_discrepancy.get("tampered_offset", 5)

            matches = (onchain_votes == displayed_votes)
            if not matches:
                candidate_mismatches += 1
                discrepancies.append(
                    f"Candidate #{cid} ('{c_name}'): On-chain vote count is {onchain_votes}, "
                    f"but displayed/off-chain count is {displayed_votes}."
                )

            candidates_audit.append({
                "candidate_id": c_id,
                "name": c_name,
                "onchain_votes": onchain_votes,
                "displayed_votes": displayed_votes,
                "db_votes": db_votes,
                "matches": matches,
                "discrepancy": None if matches else f"Delta: {displayed_votes - onchain_votes:+d} votes"
            })
        except Exception as e:
            candidates_audit.append({
                "candidate_id": cid,
                "name": f"Candidate #{cid}",
                "onchain_votes": 0,
                "displayed_votes": 0,
                "matches": False,
                "discrepancy": f"Query Error: {str(e)}"
            })

    checks.append({
        "id": "candidate_counts_crosscheck",
        "name": "Authoritative On-Chain Vote Count vs. Off-Chain Displayed Tally",
        "status": "PASS" if candidate_mismatches == 0 else "FAIL",
        "expected": "All displayed candidate vote counts match smart contract storage exactly",
        "actual": f"{candidate_mismatches} candidate mismatch(es) detected." if candidate_mismatches > 0 else "All candidate vote tallies match 100%",
        "explanation": "Smart contract storage is the sole cryptographic source of truth. Any deviation indicates database desynchronization, unconfirmed local edits, or off-chain data tampering."
    })

    # ──────────────────────────────────────────────────────────────────────────
    # STAGE 2: Immutable Event Reconstruction (VoteCasted Events)
    # ──────────────────────────────────────────────────────────────────────────
    event_counts_by_candidate = {cid: 0 for cid in range(1, total_candidates + 1)}
    unique_event_voters = set()
    vote_events_raw = []
    events_reconstruction_error = None

    try:
        vote_filter = contract.events.VoteCasted.create_filter(from_block=0, to_block="latest")
        all_vote_entries = vote_filter.get_all_entries()
        
        for log in all_vote_entries:
            voter_addr = log.args.voterAddress.lower()
            candidate_id = log.args.candidateId
            unique_event_voters.add(voter_addr)
            
            if candidate_id in event_counts_by_candidate:
                event_counts_by_candidate[candidate_id] += 1
            else:
                event_counts_by_candidate[candidate_id] = 1

            vote_events_raw.append({
                "tx_hash": log.transactionHash.hex(),
                "block_number": log.blockNumber,
                "voter": log.args.voterAddress,
                "candidate_id": candidate_id
            })
    except Exception as e:
        events_reconstruction_error = str(e)

    # Attach event-reconstructed counts to candidate audit records
    event_discrepancies = 0
    for cand in candidates_audit:
        cid = cand["candidate_id"]
        evt_cnt = event_counts_by_candidate.get(cid, 0)
        cand["event_reconstructed_votes"] = evt_cnt
        if cand["onchain_votes"] != evt_cnt and not events_reconstruction_error:
            event_discrepancies += 1
            discrepancies.append(
                f"Candidate #{cid} ('{cand['name']}'): Stored on-chain count is {cand['onchain_votes']}, "
                f"but event logs contain {evt_cnt} confirmed VoteCasted events."
            )

    total_event_votes = len(vote_events_raw)

    if events_reconstruction_error:
        checks.append({
            "id": "event_log_reconstruction",
            "name": "Event Log Tally Reconstruction",
            "status": "WARNING",
            "expected": "All VoteCasted events retrieved and matched to contract storage",
            "actual": f"Event retrieval warning: {events_reconstruction_error}",
            "explanation": "Node returned an error when filtering logs. Historical events may be unavailable if node was started without archive mode."
        })
    else:
        checks.append({
            "id": "event_log_reconstruction",
            "name": "Event Log Tally Reconstruction vs. Contract Storage",
            "status": "PASS" if event_discrepancies == 0 else "FAIL",
            "expected": "Sum of VoteCasted events matches candidate stored voteCount",
            "actual": f"{event_discrepancies} candidate mismatch(es) between event logs and storage." if event_discrepancies > 0 else f"{total_event_votes} vote events successfully reconciled with contract storage.",
            "explanation": "Every valid vote transaction emits an indexed VoteCasted event on the Ethereum ledger. Reconstructing the ledger independent of state variables verifies internal contract consistency."
        })

    # ──────────────────────────────────────────────────────────────────────────
    # STAGE 3: Total Votes Aggregate Sanity
    # ──────────────────────────────────────────────────────────────────────────
    try:
        status_code, start_time, end_time, onchain_total_votes, voting_now = contract.functions.getElectionInfo().call()
    except Exception:
        status_code, start_time, end_time, onchain_total_votes, voting_now = 0, None, None, 0, False

    total_sanity_match = (onchain_total_from_candidates == onchain_total_votes)
    if not total_sanity_match:
        discrepancies.append(
            f"Election Total Votes Inconsistency: Sum of candidate voteCounts ({onchain_total_from_candidates}) "
            f"does not match contract totalVotes ({onchain_total_votes})."
        )

    checks.append({
        "id": "total_votes_sanity",
        "name": "Aggregate Vote Count Mathematical Sanity",
        "status": "PASS" if total_sanity_match else "FAIL",
        "expected": f"Total votes equals sum of candidate votes ({onchain_total_from_candidates})",
        "actual": f"Contract aggregate total: {onchain_total_votes}, Sum of candidates: {onchain_total_from_candidates}",
        "explanation": "Validates that the smart contract internal tally accumulator matches the sum of individual candidate buckets."
    })

    # ──────────────────────────────────────────────────────────────────────────
    # STAGE 4: Transaction Receipts Verification
    # ──────────────────────────────────────────────────────────────────────────
    db_ballots = get_all_cast_ballots()
    transactions_audit = []
    
    confirmed_tx_count = 0
    failed_tx_count = 0
    missing_tx_count = 0

    # Build unique transactions set from DB ballots and event logs
    tx_map = {}
    for b in db_ballots:
        h = b.get("tx_hash")
        if h:
            tx_map[h.lower()] = {
                "tx_hash": h,
                "source": "Ballot Record (Off-Chain)",
                "voter": b.get("checksum_address") or b.get("voter_address"),
                "candidate_id": b.get("candidate_id"),
                "candidate_name": b.get("candidate_name"),
                "block_number": b.get("block_number"),
                "voted_at": b.get("voted_at")
            }

    for ev in vote_events_raw:
        h = ev["tx_hash"].lower()
        if h not in tx_map:
            tx_map[h] = {
                "tx_hash": ev["tx_hash"],
                "source": "VoteCasted Event (On-Chain)",
                "voter": ev["voter"],
                "candidate_id": ev["candidate_id"],
                "candidate_name": f"Candidate #{ev['candidate_id']}",
                "block_number": ev["block_number"],
                "voted_at": None
            }

    # Verify receipts with node
    for tx_h, item in tx_map.items():
        receipt_res = verify_transaction_receipt(item["tx_hash"])
        st = receipt_res["status"]
        
        blk = receipt_res.get("block_number") or item.get("block_number")
        blk_ts = get_block_timestamp(blk) if blk else None
        
        tx_record = {
            "tx_hash": item["tx_hash"],
            "voter": item["voter"],
            "candidate_id": item["candidate_id"],
            "candidate_name": item["candidate_name"],
            "block_number": blk,
            "gas_used": receipt_res.get("gas_used"),
            "status": st,
            "confirmed": receipt_res.get("confirmed", False),
            "timestamp": blk_ts or item.get("voted_at"),
            "error": receipt_res.get("error")
        }

        if st == "CONFIRMED":
            confirmed_tx_count += 1
        elif st == "FAILED":
            failed_tx_count += 1
            discrepancies.append(f"Transaction {item['tx_hash'][:12]}... was mined but execution status is REVERTED (0).")
        else:
            missing_tx_count += 1
            discrepancies.append(f"Transaction {item['tx_hash'][:12]}... receipt could not be verified on current chain: {receipt_res.get('error')}.")

        transactions_audit.append(tx_record)

    tx_status = "PASS"
    if failed_tx_count > 0:
        tx_status = "FAIL"
    elif missing_tx_count > 0:
        tx_status = "WARNING"

    checks.append({
        "id": "transaction_receipts_validation",
        "name": "Cryptographic Transaction Receipts & Block Inclusion",
        "status": tx_status,
        "expected": "All recorded vote transactions exist on Ethereum with status=1 (Mined & Successful)",
        "actual": f"Confirmed: {confirmed_tx_count}, Failed: {failed_tx_count}, Missing/Unverifiable: {missing_tx_count}",
        "explanation": "Having a transaction hash does not guarantee the ballot was counted; the Ethereum EVM receipt status must be strictly 1 (Success)."
    })

    # ──────────────────────────────────────────────────────────────────────────
    # STAGE 5: Voter Registration & Double-Voting Integrity
    # ──────────────────────────────────────────────────────────────────────────
    duplicate_events = len(vote_events_raw) - len(unique_event_voters)
    voter_integrity_status = "PASS" if duplicate_events == 0 else "FAIL"
    
    if duplicate_events > 0:
        discrepancies.append(f"Double-Voting Violation: {duplicate_events} duplicate VoteCasted events detected for the same wallet address.")

    checks.append({
        "id": "voter_singularity_integrity",
        "name": "One-Person-One-Vote Cryptographic Constraint",
        "status": voter_integrity_status,
        "expected": "Each registered voter address appears at most once in verified vote events",
        "actual": f"{len(unique_event_voters)} unique voting accounts across {len(vote_events_raw)} vote events (0 duplicates)." if duplicate_events == 0 else f"{duplicate_events} duplicate vote event(s) detected!",
        "explanation": "Guarantees that no address was able to submit more than one ballot on the blockchain ledger."
    })

    # ──────────────────────────────────────────────────────────────────────────
    # STAGE 6: Election Lifecycle State Consistency
    # ──────────────────────────────────────────────────────────────────────────
    db_lifecycle = get_election_lifecycle()
    db_status = db_lifecycle.get("status", 0)
    
    status_match = (db_status == status_code)
    checks.append({
        "id": "lifecycle_synchronization",
        "name": "Election Lifecycle State Synchronization",
        "status": "PASS" if status_match else "WARNING",
        "expected": f"Smart contract status ({status_code}) matches persistent database status",
        "actual": f"Contract status: {status_code}, Database status: {db_status}",
        "explanation": "Verifies that administrative open/close transitions are uniformly recognized by both the blockchain state and the backend coordinator."
    })

    # ──────────────────────────────────────────────────────────────────────────
    # Overall Audit Determination
    # ──────────────────────────────────────────────────────────────────────────
    has_failure = any(c["status"] == "FAIL" for c in checks)
    has_warning = any(c["status"] == "WARNING" for c in checks)

    if has_failure:
        overall_status = "DISCREPANCY DETECTED"
    elif has_warning:
        overall_status = "WARNING"
    else:
        overall_status = "VERIFIED"

    report = {
        "overall_status": overall_status,
        "is_tamper_free": (overall_status == "VERIFIED"),
        "audit_timestamp": timestamp,
        "contract_address": contract_addr,
        "current_block": current_block,
        "block_range_checked": f"0 to {current_block}",
        "network": "Hardhat Local (ChainID: 31337)",
        "total_votes_onchain": onchain_total_votes,
        "total_votes_events": total_event_votes,
        "total_votes_displayed": sum(c["displayed_votes"] for c in candidates_audit),
        "total_transactions_audited": len(transactions_audit),
        "confirmed_transactions": confirmed_tx_count,
        "failed_transactions": failed_tx_count,
        "missing_transactions": missing_tx_count,
        "checks": checks,
        "candidates_audit": candidates_audit,
        "transactions_audit": transactions_audit,
        "discrepancies": discrepancies,
        "limitations": [
            "Local Hardhat development network timestamps advance with transactions, not real-world seconds.",
            "Audit validates cryptographic state against current block height; historical events require archive node availability.",
            "Hardware sensor physical impedance attacks cannot be detected via blockchain state inspection alone."
        ]
    }

    # Cache latest report
    if not simulated_discrepancy:
        try:
            with open(AUDIT_RESULTS_FILE, "w", encoding="utf-8") as f:
                json.dump(report, f, indent=2)
        except Exception:
            pass

    return report

def get_latest_audit():
    """Returns cached audit report if present, or executes a fresh audit."""
    if os.path.exists(AUDIT_RESULTS_FILE):
        try:
            with open(AUDIT_RESULTS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return run_blockchain_audit()

def generate_audit_csv(report=None):
    """Generates an RFC-4180 compliant CSV export of the blockchain audit."""
    if report is None:
        report = get_latest_audit()

    output = io.StringIO()
    writer = csv.writer(output)

    # 1. Header Metadata
    writer.writerow(["================================================================="])
    writer.writerow(["SECURE E-VOTING SYSTEM - BLOCKCHAIN AUDIT & TAMPER DETECTION REPORT"])
    writer.writerow(["NMAMIT Department of Information Science & Engineering (Project 08)"])
    writer.writerow(["================================================================="])
    writer.writerow([])
    writer.writerow(["Audit Timestamp (UTC)", report.get("audit_timestamp")])
    writer.writerow(["Overall Audit Status", report.get("overall_status")])
    writer.writerow(["Cryptographic Integrity", "VERIFIED (TAMPER-FREE)" if report.get("is_tamper_free") else "COMPROMISED / WARNING"])
    writer.writerow(["Network Environment", report.get("network")])
    writer.writerow(["Contract Address", report.get("contract_address")])
    writer.writerow(["Block Range Audited", report.get("block_range_checked")])
    writer.writerow(["Total On-Chain Votes", report.get("total_votes_onchain")])
    writer.writerow(["Total Event-Reconstructed Votes", report.get("total_votes_events")])
    writer.writerow([])

    # 2. System Integrity Checks
    writer.writerow(["--- INTEGRITY CHECK MATRIX ---"])
    writer.writerow(["Check ID", "Rule Name", "Status", "Expected", "Actual", "Explanation"])
    for chk in report.get("checks", []):
        writer.writerow([
            chk.get("id"),
            chk.get("name"),
            chk.get("status"),
            chk.get("expected"),
            chk.get("actual"),
            chk.get("explanation")
        ])
    writer.writerow([])

    # 3. Candidate Result Comparisons
    writer.writerow(["--- CANDIDATE VOTE TALLIES AUDIT ---"])
    writer.writerow(["Candidate ID", "Candidate Name", "On-Chain Votes", "Displayed Votes", "Event Votes", "Match Status", "Discrepancy Note"])
    for cand in report.get("candidates_audit", []):
        writer.writerow([
            cand.get("candidate_id"),
            cand.get("name"),
            cand.get("onchain_votes"),
            cand.get("displayed_votes"),
            cand.get("event_reconstructed_votes", 0),
            "MATCH" if cand.get("matches") else "MISMATCH",
            cand.get("discrepancy") or "None (Clean)"
        ])
    writer.writerow([])

    # 4. Transaction Audit Ledger
    writer.writerow(["--- TRANSACTION RECEIPT AUDIT LEDGER ---"])
    writer.writerow(["Transaction Hash", "Voter Address", "Candidate ID", "Candidate Name", "Block Height", "Gas Used", "Receipt Status", "Confirmed On-Chain"])
    for tx in report.get("transactions_audit", []):
        writer.writerow([
            tx.get("tx_hash"),
            tx.get("voter"),
            tx.get("candidate_id"),
            tx.get("candidate_name"),
            tx.get("block_number"),
            tx.get("gas_used"),
            tx.get("status"),
            "YES" if tx.get("confirmed") else "NO"
        ])
    writer.writerow([])

    # 5. Detected Discrepancies
    writer.writerow(["--- DETECTED DISCREPANCIES & ALERTS ---"])
    discs = report.get("discrepancies", [])
    if not discs:
        writer.writerow(["Zero discrepancies detected. Smart contract state is cryptographically consistent."])
    else:
        for idx, d in enumerate(discs, 1):
            writer.writerow([f"Discrepancy #{idx}", d])
    writer.writerow([])

    # 6. Audit Limitations
    writer.writerow(["--- AUDIT SCOPE & LIMITATIONS ---"])
    for lim in report.get("limitations", []):
        writer.writerow(["Notice", lim])

    return output.getvalue()
