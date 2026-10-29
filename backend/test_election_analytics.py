"""
Unit and Integration Tests for Implementation 7:
Election Analytics and Results Dashboard
NMAMIT Major Project Code 08
"""

import os
import json
import sqlite3
import unittest
from unittest.mock import patch

from app import app
from database import DB_PATH, init_db
from analytics_service import (
    calculate_turnout,
    determine_election_status,
    rank_candidates,
    get_election_analytics,
    generate_analytics_csv,
    generate_analytics_json
)

class ElectionAnalyticsTestCase(unittest.TestCase):
    def setUp(self):
        """Prepare clean test database and Flask test client."""
        init_db()
        app.config["TESTING"] = True
        self.client = app.test_client()

    def test_turnout_calculation_with_normal_values(self):
        """Turnout percentage calculation: (votes / registered) * 100."""
        self.assertEqual(calculate_turnout(50, 100), 50.0)
        self.assertEqual(calculate_turnout(1, 3), 33.33)
        self.assertEqual(calculate_turnout(235, 235), 100.0)

    def test_turnout_calculation_zero_registered_voters(self):
        """Turnout calculation handles 0 registered voters safely without ZeroDivisionError."""
        self.assertEqual(calculate_turnout(0, 0), 0.0)
        self.assertEqual(calculate_turnout(5, 0), 0.0)
        self.assertEqual(calculate_turnout(0, -1), 0.0)

    def test_determine_election_status(self):
        """Verifies status inference from lifecycle timestamps and codes."""
        # Not started
        self.assertEqual(determine_election_status({"status": 0}), "Not Started")
        # Completed / Closed
        self.assertEqual(determine_election_status({"status": 2}), "Completed")
        # Open and currently active
        self.assertEqual(determine_election_status({"status": 1, "voting_now": True}), "Active")
        # Open but scheduled in future
        future_ts = 9999999999
        self.assertEqual(
            determine_election_status({"status": 1, "voting_now": False, "start_time": future_ts, "end_time": future_ts + 3600}),
            "Scheduled"
        )

    def test_candidate_rankings_with_clear_winner(self):
        """Tests that highest vote earner is identified as leader with correct rank #1."""
        test_cands = [
            {"id": 1, "name": "Candidate A", "onchain_votes": 10},
            {"id": 2, "name": "Candidate B", "onchain_votes": 25},
            {"id": 3, "name": "Candidate C", "onchain_votes": 5}
        ]
        ranked, leader, has_tie, tied_cands = rank_candidates(test_cands)

        self.assertFalse(has_tie)
        self.assertIsNotNone(leader)
        self.assertEqual(leader["id"], 2)
        self.assertEqual(leader["name"], "Candidate B")
        self.assertEqual(ranked[0]["rank"], 1)
        self.assertEqual(ranked[0]["id"], 2)
        self.assertEqual(ranked[1]["rank"], 2)
        self.assertEqual(ranked[1]["id"], 1)
        self.assertEqual(ranked[2]["rank"], 3)
        self.assertEqual(ranked[2]["id"], 3)
        # Percentage share of 40 total votes: 25/40 = 62.5%
        self.assertEqual(ranked[0]["percentage"], 62.5)

    def test_candidate_tie_detection(self):
        """Tests that two or more top candidates with equal votes trigger tie handling."""
        tied_data = [
            {"id": 1, "name": "Candidate A", "onchain_votes": 15},
            {"id": 2, "name": "Candidate B", "onchain_votes": 15},
            {"id": 3, "name": "Candidate C", "onchain_votes": 4}
        ]
        ranked, leader, has_tie, tied_cands = rank_candidates(tied_data)

        self.assertTrue(has_tie)
        self.assertIsNone(leader)
        self.assertEqual(len(tied_cands), 2)
        self.assertEqual(ranked[0]["rank"], 1)
        self.assertEqual(ranked[1]["rank"], 1)
        self.assertTrue(ranked[0]["is_tied"])
        self.assertTrue(ranked[1]["is_tied"])
        self.assertEqual(ranked[0]["standing_label"], "Tied for 1st Place")
        self.assertEqual(ranked[1]["standing_label"], "Tied for 1st Place")

    def test_empty_election_state(self):
        """Tests empty election when zero votes have been cast."""
        zero_data = [
            {"id": 1, "name": "Candidate A", "onchain_votes": 0},
            {"id": 2, "name": "Candidate B", "onchain_votes": 0}
        ]
        ranked, leader, has_tie, tied_cands = rank_candidates(zero_data)
        self.assertFalse(has_tie)
        self.assertIsNone(leader)
        self.assertEqual(ranked[0]["percentage"], 0.0)

    def test_discrepancy_detection_between_chain_and_database(self):
        """When on-chain count differs from SQLite ballots_cast, flags has_discrepancy=True."""
        # Insert 3 test ballots for Candidate #1 in SQLite
        with sqlite3.connect(DB_PATH, timeout=10.0) as conn:
            cur = conn.cursor()
            cur.execute("DELETE FROM ballots_cast WHERE voter_address LIKE '0xtest_disc_%'")
            for i in range(3):
                cur.execute(
                    "INSERT INTO ballots_cast (voter_address, checksum_address, candidate_id, biometric_hash) VALUES (?, ?, ?, ?)",
                    (f"0xtest_disc_{i}", f"0xTest_Disc_{i}", 1, "0x123")
                )
            conn.commit()

        # Mock contract returning 0 votes for Candidate #1
        with patch("analytics_service.is_connected", return_value=True):
            with patch("analytics_service.get_contract") as mock_contract_fn:
                mock_contract = mock_contract_fn.return_value
                mock_contract.functions.candidatesCount().call.return_value = 2

                def mock_get_candidate(cid):
                    call_mock = unittest.mock.MagicMock()
                    if cid == 1:
                        call_mock.call.return_value = (1, "Candidate 1", 0)  # On-chain says 0, SQLite says 3
                    else:
                        call_mock.call.return_value = (cid, f"Candidate {cid}", 0)
                    return call_mock

                mock_contract.functions.getCandidate.side_effect = mock_get_candidate
                with patch("analytics_service.get_election_info", return_value={"status": 1, "total_votes": 0}):
                    data = get_election_analytics()
                    self.assertTrue(data["integrity"]["has_discrepancy"])
                    self.assertGreaterEqual(len(data["integrity"]["discrepancies"]), 1)
                    disc = data["integrity"]["discrepancies"][0]
                    self.assertEqual(disc["candidate_id"], 1)
                    self.assertEqual(disc["onchain_votes"], 0)
                    self.assertGreaterEqual(disc["db_votes"], 3)

        # Cleanup
        with sqlite3.connect(DB_PATH, timeout=10.0) as conn:
            cur = conn.cursor()
            cur.execute("DELETE FROM ballots_cast WHERE voter_address LIKE '0xtest_disc_%'")
            conn.commit()

    def test_blockchain_rpc_failure_graceful_fallback(self):
        """When blockchain is unreachable, gracefully falls back to cached off-chain data."""
        with patch("analytics_service.is_connected", return_value=False):
            data = get_election_analytics()
            self.assertFalse(data["integrity"]["blockchain_connected"])
            self.assertEqual(data["integrity"]["data_freshness"], "Cached (Off-Chain)")
            self.assertIn("overview", data)
            self.assertIn("standings", data)

    def test_analytics_api_endpoint_and_filtering(self):
        """Tests GET /api/analytics/overview endpoint and query parameter handling."""
        res = self.client.get("/api/analytics/overview")
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertIn("overview", data)
        self.assertIn("standings", data)
        self.assertIn("integrity", data)
        self.assertIn("temporal_activity", data)
        self.assertIn("security_correlation", data)

        # Filter by candidate_id
        res_cand = self.client.get("/api/analytics/overview?candidate_id=1")
        self.assertEqual(res_cand.status_code, 200)
        cand_data = res_cand.get_json()
        cands = cand_data["standings"]["candidates"]
        if cands:
            self.assertEqual(cands[0]["id"], 1)

    def test_export_csv_endpoint(self):
        """Verifies CSV export contains required analytics sections."""
        res = self.client.get("/api/analytics/export/csv")
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.content_type.startswith("text/csv"))
        text = res.get_data(as_text=True)
        self.assertIn("ELECTION ANALYTICS REPORT", text)
        self.assertIn("TURNOUT & LIFECYCLE OVERVIEW", text)
        self.assertIn("CANDIDATE RESULTS & RANKINGS", text)
        self.assertIn("VOTING ACTIVITY OVER TIME", text)

    def test_export_json_endpoint(self):
        """Verifies JSON export returns complete valid report structure."""
        res = self.client.get("/api/analytics/export/json")
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.content_type.startswith("application/json"))
        data = res.get_json()
        self.assertIn("overview", data)
        self.assertIn("standings", data)
        self.assertIn("metadata", data)
        self.assertIn("Hardhat Local Testnet", data["integrity"]["network"])

    def test_zero_biometric_data_leakage_in_analytics(self):
        """Assures that no raw fingerprint templates or private keys leak in analytics output."""
        res = self.client.get("/api/analytics/overview")
        text = res.get_data(as_text=True).lower()
        forbidden = ["embedding_json", "private_key", "password", "raw_image"]
        for f in forbidden:
            self.assertNotIn(f, text, f"Security violation: key '{f}' leaked in analytics API!")


if __name__ == "__main__":
    unittest.main()
