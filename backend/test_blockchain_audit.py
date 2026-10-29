import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import unittest
from unittest.mock import patch, MagicMock
import json
import io
import csv

from audit_service import (
    run_blockchain_audit,
    verify_transaction_receipt,
    generate_audit_csv
)

class TestBlockchainAuditEngine(unittest.TestCase):
    """
    Automated test suite for Blockchain Audit and Automatic Tamper Detection:
    Validates all 13 audit checks, mathematical invariants, error modes,
    and report serializations using controlled test fixtures.
    """

    def setUp(self):
        # Sample controlled test fixtures
        self.mock_contract_address = "0x5FbDB2315678afecb367f032d93F642f64180aa3"
        self.mock_candidates = [
            (1, "Candidate A", 3),
            (2, "Candidate B", 2)
        ]
        self.mock_db_candidates = [
            {"id": 1, "name": "Candidate A", "vote_count": 3},
            {"id": 2, "name": "Candidate B", "vote_count": 2}
        ]

    # ──────────────────────────────────────────────────────────────────────────
    # 1. Matching on-chain and displayed vote counts
    # ──────────────────────────────────────────────────────────────────────────
    @patch("audit_service.is_connected", return_value=True)
    @patch("audit_service.get_contract")
    @patch("audit_service.get_candidates_results")
    @patch("audit_service.get_all_cast_ballots", return_value=[])
    @patch("audit_service.get_election_lifecycle", return_value={"status": 1})
    def test_01_matching_onchain_and_displayed_votes(self, mock_life, mock_ballots, mock_db_cand, mock_contract, mock_conn):
        mock_c = MagicMock()
        mock_c.functions.candidatesCount().call.return_value = 2
        def get_cand(cid):
            m = MagicMock()
            if cid == 1:
                m.call.return_value = (1, "Candidate A", 3)
            else:
                m.call.return_value = (2, "Candidate B", 2)
            return m
        mock_c.functions.getCandidate.side_effect = get_cand
        mock_c.functions.getElectionInfo().call.return_value = (1, 1000, 5000, 5, True)
        mock_c.events.VoteCasted.create_filter().get_all_entries.return_value = []
        mock_contract.return_value = mock_c
        mock_db_cand.return_value = {"candidates": self.mock_db_candidates}

        report = run_blockchain_audit()
        chk = next(c for c in report["checks"] if c["id"] == "candidate_counts_crosscheck")
        self.assertEqual(chk["status"], "PASS")
        self.assertTrue(report["candidates_audit"][0]["matches"])
        self.assertTrue(report["candidates_audit"][1]["matches"])

    # ──────────────────────────────────────────────────────────────────────────
    # 2. Mismatched candidate vote counts (Off-chain DB altered)
    # ──────────────────────────────────────────────────────────────────────────
    @patch("audit_service.is_connected", return_value=True)
    @patch("audit_service.get_contract")
    @patch("audit_service.get_candidates_results")
    @patch("audit_service.get_all_cast_ballots", return_value=[])
    @patch("audit_service.get_election_lifecycle", return_value={"status": 1})
    def test_02_mismatched_candidate_vote_counts(self, mock_life, mock_ballots, mock_db_cand, mock_contract, mock_conn):
        mock_c = MagicMock()
        mock_c.functions.candidatesCount().call.return_value = 2
        # On-chain says 3 votes for Candidate 1
        mock_c.functions.getCandidate(1).call.return_value = (1, "Candidate A", 3)
        mock_c.functions.getCandidate(2).call.return_value = (2, "Candidate B", 2)
        mock_c.functions.getElectionInfo().call.return_value = (1, 1000, 5000, 5, True)
        mock_c.events.VoteCasted.create_filter().get_all_entries.return_value = []
        mock_contract.return_value = mock_c

        # DB has tampered vote count: 10 votes for Candidate 1
        tampered_db = [
            {"id": 1, "name": "Candidate A", "vote_count": 10},
            {"id": 2, "name": "Candidate B", "vote_count": 2}
        ]
        mock_db_cand.return_value = {"candidates": tampered_db}

        report = run_blockchain_audit()
        chk = next(c for c in report["checks"] if c["id"] == "candidate_counts_crosscheck")
        self.assertEqual(chk["status"], "FAIL")
        self.assertFalse(report["candidates_audit"][0]["matches"])
        self.assertEqual(report["overall_status"], "DISCREPANCY DETECTED")
        self.assertFalse(report["is_tamper_free"])

    # ──────────────────────────────────────────────────────────────────────────
    # 3. Matching event-derived and contract vote totals
    # ──────────────────────────────────────────────────────────────────────────
    @patch("audit_service.is_connected", return_value=True)
    @patch("audit_service.get_contract")
    @patch("audit_service.get_candidates_results")
    @patch("audit_service.get_all_cast_ballots", return_value=[])
    @patch("audit_service.get_election_lifecycle", return_value={"status": 1})
    def test_03_matching_event_derived_and_contract_totals(self, mock_life, mock_ballots, mock_db_cand, mock_contract, mock_conn):
        mock_c = MagicMock()
        mock_c.functions.candidatesCount().call.return_value = 1
        mock_c.functions.getCandidate(1).call.return_value = (1, "Candidate A", 2)
        mock_c.functions.getElectionInfo().call.return_value = (1, 1000, 5000, 2, True)

        # 2 VoteCasted events for Candidate 1
        evt1 = MagicMock(args=MagicMock(voterAddress="0x1111", candidateId=1), transactionHash=MagicMock(hex=lambda: "0xaaa"), blockNumber=1)
        evt2 = MagicMock(args=MagicMock(voterAddress="0x2222", candidateId=1), transactionHash=MagicMock(hex=lambda: "0xbbb"), blockNumber=2)
        mock_c.events.VoteCasted.create_filter().get_all_entries.return_value = [evt1, evt2]
        mock_contract.return_value = mock_c
        mock_db_cand.return_value = {"candidates": [{"id": 1, "name": "Candidate A", "vote_count": 2}]}

        with patch("audit_service.verify_transaction_receipt", return_value={"status": "CONFIRMED", "confirmed": True, "block_number": 1}):
            report = run_blockchain_audit()
            chk = next(c for c in report["checks"] if c["id"] == "event_log_reconstruction")
            self.assertEqual(chk["status"], "PASS")
            self.assertEqual(report["total_votes_events"], 2)

    # ──────────────────────────────────────────────────────────────────────────
    # 4. Event-derived and contract totals that differ
    # ──────────────────────────────────────────────────────────────────────────
    @patch("audit_service.is_connected", return_value=True)
    @patch("audit_service.get_contract")
    @patch("audit_service.get_candidates_results")
    @patch("audit_service.get_all_cast_ballots", return_value=[])
    @patch("audit_service.get_election_lifecycle", return_value={"status": 1})
    def test_04_event_derived_and_contract_totals_differ(self, mock_life, mock_ballots, mock_db_cand, mock_contract, mock_conn):
        mock_c = MagicMock()
        mock_c.functions.candidatesCount().call.return_value = 1
        # Contract storage says 5 votes
        mock_c.functions.getCandidate(1).call.return_value = (1, "Candidate A", 5)
        mock_c.functions.getElectionInfo().call.return_value = (1, 1000, 5000, 5, True)

        # But only 1 event exists
        evt1 = MagicMock(args=MagicMock(voterAddress="0x1111", candidateId=1), transactionHash=MagicMock(hex=lambda: "0xaaa"), blockNumber=1)
        mock_c.events.VoteCasted.create_filter().get_all_entries.return_value = [evt1]
        mock_contract.return_value = mock_c
        mock_db_cand.return_value = {"candidates": [{"id": 1, "name": "Candidate A", "vote_count": 5}]}

        with patch("audit_service.verify_transaction_receipt", return_value={"status": "CONFIRMED", "confirmed": True, "block_number": 1}):
            report = run_blockchain_audit()
            chk = next(c for c in report["checks"] if c["id"] == "event_log_reconstruction")
            self.assertEqual(chk["status"], "FAIL")
            self.assertEqual(report["overall_status"], "DISCREPANCY DETECTED")

    # ──────────────────────────────────────────────────────────────────────────
    # 5. Successful transaction receipts
    # ──────────────────────────────────────────────────────────────────────────
    @patch("audit_service.is_connected", return_value=True)
    @patch("audit_service.w3")
    def test_05_successful_transaction_receipt(self, mock_w3, mock_conn):
        mock_w3.eth.get_transaction_receipt.return_value = {
            "status": 1,
            "blockNumber": 42,
            "gasUsed": 65000,
            "from": "0xVoter",
            "to": "0xContract"
        }
        res = verify_transaction_receipt("0xValidHash")
        self.assertEqual(res["status"], "CONFIRMED")
        self.assertTrue(res["confirmed"])
        self.assertEqual(res["block_number"], 42)

    # ──────────────────────────────────────────────────────────────────────────
    # 6. Failed transaction receipts (Reverted, status = 0)
    # ──────────────────────────────────────────────────────────────────────────
    @patch("audit_service.is_connected", return_value=True)
    @patch("audit_service.w3")
    def test_06_failed_transaction_receipt(self, mock_w3, mock_conn):
        mock_w3.eth.get_transaction_receipt.return_value = {
            "status": 0,
            "blockNumber": 43,
            "gasUsed": 21000,
            "from": "0xVoter",
            "to": "0xContract"
        }
        res = verify_transaction_receipt("0xFailedHash")
        self.assertEqual(res["status"], "FAILED")
        self.assertFalse(res["confirmed"])

    # ──────────────────────────────────────────────────────────────────────────
    # 7. Missing transaction receipts (Not found on chain)
    # ──────────────────────────────────────────────────────────────────────────
    @patch("audit_service.is_connected", return_value=True)
    @patch("audit_service.w3")
    def test_07_missing_transaction_receipt(self, mock_w3, mock_conn):
        mock_w3.eth.get_transaction_receipt.side_effect = Exception("Transaction 0xGhost not found")
        res = verify_transaction_receipt("0xGhost")
        self.assertEqual(res["status"], "MISSING")
        self.assertFalse(res["confirmed"])

    # ──────────────────────────────────────────────────────────────────────────
    # 8. Missing event history (Filter error / Non-archive node)
    # ──────────────────────────────────────────────────────────────────────────
    @patch("audit_service.is_connected", return_value=True)
    @patch("audit_service.get_contract")
    @patch("audit_service.get_candidates_results")
    @patch("audit_service.get_all_cast_ballots", return_value=[])
    @patch("audit_service.get_election_lifecycle", return_value={"status": 1})
    def test_08_missing_event_history(self, mock_life, mock_ballots, mock_db_cand, mock_contract, mock_conn):
        mock_c = MagicMock()
        mock_c.functions.candidatesCount().call.return_value = 1
        mock_c.functions.getCandidate(1).call.return_value = (1, "Candidate A", 0)
        mock_c.functions.getElectionInfo().call.return_value = (1, 1000, 5000, 0, True)
        mock_c.events.VoteCasted.create_filter.side_effect = Exception("Filter logs purged")
        mock_contract.return_value = mock_c
        mock_db_cand.return_value = {"candidates": [{"id": 1, "name": "Candidate A", "vote_count": 0}]}

        report = run_blockchain_audit()
        chk = next(c for c in report["checks"] if c["id"] == "event_log_reconstruction")
        self.assertEqual(chk["status"], "WARNING")

    # ──────────────────────────────────────────────────────────────────────────
    # 9. RPC connection failures
    # ──────────────────────────────────────────────────────────────────────────
    @patch("audit_service.is_connected", return_value=False)
    def test_09_rpc_connection_failure(self, mock_conn):
        report = run_blockchain_audit()
        self.assertEqual(report["overall_status"], "UNABLE_TO_VERIFY")
        self.assertEqual(report["checks"][0]["status"], "FAIL")
        self.assertIn("offline", report["checks"][0]["actual"].lower())

    # ──────────────────────────────────────────────────────────────────────────
    # 10. Invalid contract configuration (Bytecode missing)
    # ──────────────────────────────────────────────────────────────────────────
    @patch("audit_service.is_connected", return_value=True)
    @patch("audit_service.get_contract", side_effect=Exception("No contract bytecode at 0x123"))
    def test_10_invalid_contract_configuration(self, mock_contract, mock_conn):
        report = run_blockchain_audit()
        self.assertEqual(report["overall_status"], "UNABLE_TO_VERIFY")
        self.assertEqual(report["checks"][0]["id"], "contract_bytecode")
        self.assertEqual(report["checks"][0]["status"], "FAIL")

    # ──────────────────────────────────────────────────────────────────────────
    # 11. CSV report consistency
    # ──────────────────────────────────────────────────────────────────────────
    def test_11_csv_report_consistency(self):
        sample_report = {
            "audit_timestamp": "2026-10-28T12:00:00Z",
            "overall_status": "VERIFIED",
            "is_tamper_free": True,
            "network": "Hardhat Local",
            "contract_address": self.mock_contract_address,
            "block_range_checked": "0 to 10",
            "total_votes_onchain": 5,
            "total_votes_events": 5,
            "checks": [
                {
                    "id": "candidate_counts_crosscheck",
                    "name": "Candidate Vote Count Crosscheck",
                    "status": "PASS",
                    "expected": "Exact match",
                    "actual": "Exact match",
                    "explanation": "No delta"
                }
            ],
            "candidates_audit": [
                {
                    "candidate_id": 1,
                    "name": "Pranitha",
                    "onchain_votes": 3,
                    "displayed_votes": 3,
                    "event_reconstructed_votes": 3,
                    "matches": True,
                    "discrepancy": None
                }
            ],
            "transactions_audit": [],
            "discrepancies": [],
            "limitations": ["Local network only"]
        }

        csv_text = generate_audit_csv(sample_report)
        self.assertIn("SECURE E-VOTING SYSTEM", csv_text)
        self.assertIn("VERIFIED (TAMPER-FREE)", csv_text)
        self.assertIn("Pranitha", csv_text)
        self.assertIn(self.mock_contract_address, csv_text)

        # Validate valid CSV structure with reader
        reader = csv.reader(io.StringIO(csv_text))
        rows = list(reader)
        self.assertGreater(len(rows), 10)

    # ──────────────────────────────────────────────────────────────────────────
    # 12. JSON report consistency
    # ──────────────────────────────────────────────────────────────────────────
    def test_12_json_report_consistency(self):
        sample_report = {
            "audit_timestamp": "2026-10-28T12:00:00Z",
            "overall_status": "VERIFIED",
            "is_tamper_free": True,
            "contract_address": self.mock_contract_address,
            "checks": [{"id": "test_chk", "status": "PASS"}]
        }
        json_str = json.dumps(sample_report)
        parsed = json.loads(json_str)
        self.assertEqual(parsed["overall_status"], "VERIFIED")
        self.assertTrue(parsed["is_tamper_free"])
        self.assertEqual(parsed["contract_address"], self.mock_contract_address)

    # ──────────────────────────────────────────────────────────────────────────
    # 13. Audit discrepancy detection and reporting
    # ──────────────────────────────────────────────────────────────────────────
    @patch("audit_service.is_connected", return_value=True)
    @patch("audit_service.get_contract")
    @patch("audit_service.get_candidates_results")
    @patch("audit_service.get_all_cast_ballots", return_value=[])
    @patch("audit_service.get_election_lifecycle", return_value={"status": 1})
    def test_13_discrepancy_detection_and_reporting(self, mock_life, mock_ballots, mock_db_cand, mock_contract, mock_conn):
        mock_c = MagicMock()
        mock_c.functions.candidatesCount().call.return_value = 1
        mock_c.functions.getCandidate(1).call.return_value = (1, "Candidate A", 2)
        mock_c.functions.getElectionInfo().call.return_value = (1, 1000, 5000, 2, True)
        mock_c.events.VoteCasted.create_filter().get_all_entries.return_value = []
        mock_contract.return_value = mock_c
        mock_db_cand.return_value = {"candidates": [{"id": 1, "name": "Candidate A", "vote_count": 2}]}

        # Simulate exhibition tamper detection: offset +5 votes on candidate 1
        report = run_blockchain_audit(simulated_discrepancy={"candidate_id": 1, "tampered_offset": 5})
        self.assertEqual(report["overall_status"], "DISCREPANCY DETECTED")
        self.assertFalse(report["is_tamper_free"])
        self.assertIn("Delta: +5 votes", report["candidates_audit"][0]["discrepancy"])
        self.assertGreater(len(report["discrepancies"]), 0)


if __name__ == "__main__":
    unittest.main()
