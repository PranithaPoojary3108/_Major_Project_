"""
Unit and Integration Tests for Implementation 4:
Security Monitoring and Suspicious Activity Detection
NMAMIT Major Project Code 08
"""

import os
import json
import sqlite3
import unittest
from app import app
from database import DB_PATH, init_db
from security_service import (
    SECURITY_CONFIG,
    _rate_limit_buckets,
    _biometric_failure_tracker,
    check_rate_limit,
    record_biometric_attempt,
    log_security_event,
    get_security_summary,
    get_security_events,
    get_security_event_by_id,
    mark_event_reviewed,
    generate_security_csv,
    generate_security_json,
)

class SecurityMonitoringTestCase(unittest.TestCase):
    def setUp(self):
        """Ensure clean in-memory trackers and database before each test run."""
        init_db()
        _rate_limit_buckets.clear()
        _biometric_failure_tracker.clear()
        with sqlite3.connect(DB_PATH, timeout=10.0) as conn:
            cur = conn.cursor()
            cur.execute("DELETE FROM security_events")
            cur.execute("DELETE FROM ballots_cast WHERE voter_address = '0x70997970c51812dc3a010c7d01b50e0d17dc79c8'")
            conn.commit()

        app.config["TESTING"] = True
        self.client = app.test_client()

    def tearDown(self):
        _rate_limit_buckets.clear()
        _biometric_failure_tracker.clear()
        try:
            with sqlite3.connect(DB_PATH, timeout=10.0) as conn:
                cur = conn.cursor()
                cur.execute("DELETE FROM security_events")
                cur.execute("DELETE FROM ballots_cast WHERE voter_address = '0x70997970c51812dc3a010c7d01b50e0d17dc79c8'")
                conn.commit()
        except Exception:
            pass

    def test_isolated_biometric_failure_is_low_severity(self):
        """Single isolated fingerprint failure should be logged with LOW severity."""
        voter = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
        event_id = record_biometric_attempt(voter, is_match=False, distance=0.35, source_ip="127.0.0.1")
        self.assertIsNotNone(event_id)

        event = get_security_event_by_id(event_id)
        self.assertIsNotNone(event)
        self.assertEqual(event["event_type"], "FINGERPRINT_VERIFICATION_FAILURE")
        self.assertEqual(event["severity"], "LOW")
        self.assertEqual(event["status"], "FAILED")
        self.assertIn("0.35", event["description"])

    def test_repeated_biometric_failures_escalate_to_high_alert(self):
        """Threshold (>=3 failures in 5 min) should trigger HIGH severity REPEATED_BIOMETRIC_FAILURES alert."""
        voter = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"

        # Attempt 1
        id1 = record_biometric_attempt(voter, is_match=False, distance=0.41, source_ip="127.0.0.1")
        e1 = get_security_event_by_id(id1)
        self.assertEqual(e1["severity"], "LOW")

        # Attempt 2
        id2 = record_biometric_attempt(voter, is_match=False, distance=0.39, source_ip="127.0.0.1")
        e2 = get_security_event_by_id(id2)
        self.assertEqual(e2["severity"], "LOW")

        # Attempt 3 -> Triggers incident escalation
        id3 = record_biometric_attempt(voter, is_match=False, distance=0.45, source_ip="127.0.0.1")
        e3 = get_security_event_by_id(id3)
        self.assertEqual(e3["event_type"], "REPEATED_BIOMETRIC_FAILURES")
        self.assertEqual(e3["severity"], "HIGH")
        self.assertEqual(e3["status"], "ALERT")
        self.assertIn("Repeated fingerprint mismatch alert", e3["description"])

    def test_successful_match_resets_failure_tracker(self):
        """A genuine verification match clears the consecutive failure tracker."""
        voter = "0x90F79bf6EB2c4f870365E785982E1f101E93b906"
        record_biometric_attempt(voter, is_match=False, distance=0.32, source_ip="127.0.0.1")
        record_biometric_attempt(voter, is_match=False, distance=0.33, source_ip="127.0.0.1")
        self.assertEqual(len(_biometric_failure_tracker.get(voter.lower(), [])), 2)

        # Genuine match
        record_biometric_attempt(voter, is_match=True, distance=0.12, source_ip="127.0.0.1")
        self.assertNotIn(voter.lower(), _biometric_failure_tracker)

    def test_rate_limiting_sliding_window(self):
        """Exceeding request rate limit should return allowed=False and positive retry_after."""
        key = "test_client_ip_1"
        limit = SECURITY_CONFIG["RATE_LIMIT_VERIFY_MAX_REQUESTS"]

        for _ in range(limit):
            allowed, _ = check_rate_limit(key, limit_type="verification")
            self.assertTrue(allowed)

        # Next call exceeds rate limit
        allowed, retry_after = check_rate_limit(key, limit_type="verification")
        self.assertFalse(allowed)
        self.assertGreater(retry_after, 0)

    def test_rate_limit_http_response_429(self):
        """Exceeding endpoint rate limit should trigger HTTP 429 response."""
        key = "127.0.0.1"
        _rate_limit_buckets[f"verification:{key}"] = [9999999999.0] * SECURITY_CONFIG["RATE_LIMIT_VERIFY_MAX_REQUESTS"]

        res = self.client.post("/api/verify-and-vote", data={
            "voter_address": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
        })
        self.assertEqual(res.status_code, 429)
        data = res.get_json()
        self.assertIn("Rate limit exceeded", data["error"])
        self.assertGreater(data["retry_after"], 0)

    def test_unregistered_voter_attempt_detection(self):
        """Biometric verification with an unknown wallet returns 404 and logs UNREGISTERED_VOTER_ATTEMPT."""
        fake_address = "0x000000000000000000000000000000000000dEaD"
        res = self.client.post("/api/verify-and-vote", data={
            "voter_address": fake_address,
            "fingerprint": (open(__file__, "rb"), "fake.tif")
        })
        self.assertEqual(res.status_code, 404)

        events = get_security_events(event_type="UNREGISTERED_VOTER_ATTEMPT")["events"]
        self.assertGreaterEqual(len(events), 1)
        self.assertEqual(events[0]["severity"], "MEDIUM")
        self.assertEqual(events[0]["voter_address"], fake_address.lower())

    def test_unauthorized_admin_access_detection(self):
        """Calling open-election or close-election with non-commissioner header triggers 403 and HIGH alert."""
        non_commissioner = "0x9965507D1a55bcC2695C58ba16FB37d819B0A4df"
        res = self.client.post(
            "/api/open-election",
            headers={"X-Commissioner-Address": non_commissioner},
            json={"start_time": 100000, "end_time": 200000}
        )
        self.assertEqual(res.status_code, 403)
        data = res.get_json()
        self.assertIn("Authorization Denied", data["error"])

        events = get_security_events(event_type="UNAUTHORIZED_ADMIN_ACCESS")["events"]
        self.assertGreaterEqual(len(events), 1)
        self.assertEqual(events[0]["severity"], "HIGH")
        self.assertEqual(events[0]["status"], "FORBIDDEN")

    def test_duplicate_voting_attempt_detection(self):
        """Attempting to vote when DB records already voted triggers DUPLICATE_VOTING_ATTEMPT HIGH alert."""
        voter = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
        # Mark as voted in DB safely
        with sqlite3.connect(DB_PATH, timeout=10.0) as conn:
            cur = conn.cursor()
            cur.execute("DELETE FROM ballots_cast WHERE voter_address = ?", (voter.lower(),))
            cur.execute(
                "INSERT INTO ballots_cast (voter_address, checksum_address, candidate_id, biometric_hash, tx_hash, block_number) VALUES (?, ?, ?, ?, ?, ?)",
                (voter.lower(), voter, 1, "0x123", "0xabc", 100)
            )
            conn.commit()

        res = self.client.post("/api/cast-vote", json={
            "voter_address": voter,
            "candidate_id": 1,
            "biometric_hash": "0x123"
        })
        self.assertEqual(res.status_code, 400)
        self.assertIn("Double Voting Prevented", res.get_json()["error"])

        events = get_security_events(event_type="DUPLICATE_VOTING_ATTEMPT")["events"]
        self.assertGreaterEqual(len(events), 1)
        self.assertEqual(events[0]["severity"], "HIGH")
        self.assertEqual(events[0]["voter_address"], voter.lower())

    def test_security_summary_and_review_workflow(self):
        """Tests summary aggregation, event listing, and marking an incident as reviewed."""
        id1 = log_security_event(
            event_type="UNREGISTERED_VOTER_ATTEMPT",
            severity="MEDIUM",
            description="Unregistered voter probed system",
            status="FAILED"
        )
        id2 = log_security_event(
            event_type="DUPLICATE_VOTING_ATTEMPT",
            severity="HIGH",
            description="Double vote flagged",
            status="REJECTED"
        )

        # Check summary
        res = self.client.get("/api/security/summary")
        self.assertEqual(res.status_code, 200)
        summary = res.get_json()
        self.assertEqual(summary["total_events"], 2)
        self.assertEqual(summary["high_critical_alerts"], 1)
        self.assertEqual(summary["unreviewed_events"], 2)

        # Review event #1
        res_review = self.client.post(f"/api/security/events/{id1}/review", json={
            "reviewed_by": "Audit Officer Sharma"
        })
        self.assertEqual(res_review.status_code, 200)

        # Verify event state in database
        evt1 = get_security_event_by_id(id1)
        self.assertEqual(evt1["reviewed"], 1)
        self.assertEqual(evt1["reviewed_by"], "Audit Officer Sharma")
        self.assertIsNotNone(evt1["reviewed_at"])

        # Check summary reflects 1 remaining unreviewed
        res2 = self.client.get("/api/security/summary")
        self.assertEqual(res2.get_json()["unreviewed_events"], 1)

    def test_export_endpoints(self):
        """Verifies that CSV and JSON exports return valid formatting and headers."""
        log_security_event(
            event_type="RATE_LIMIT_EXCEEDED",
            severity="LOW",
            description="Export test rate limit log",
            status="BLOCKED"
        )

        # CSV Export
        res_csv = self.client.get("/api/security/export/csv")
        self.assertEqual(res_csv.status_code, 200)
        self.assertTrue(res_csv.content_type.startswith("text/csv"))
        csv_text = res_csv.get_data(as_text=True)
        self.assertIn("id,event_type,severity,timestamp,voter_address", csv_text)
        self.assertIn("RATE_LIMIT_EXCEEDED", csv_text)

        # JSON Export
        res_json = self.client.get("/api/security/export/json")
        self.assertEqual(res_json.status_code, 200)
        self.assertTrue(res_json.content_type.startswith("application/json"))
        json_data = res_json.get_json()
        self.assertEqual(json_data["status"], "SUCCESS")
        self.assertGreaterEqual(json_data["total_events"], 1)
        self.assertEqual(json_data["events"][0]["event_type"], "RATE_LIMIT_EXCEEDED")

    def test_zero_biometric_data_in_security_logs(self):
        """Forensic verification: No raw fingerprint images or 128-d embeddings in security_events."""
        with sqlite3.connect(DB_PATH, timeout=10.0) as conn:
            cur = conn.cursor()
            cur.execute("PRAGMA table_info(security_events)")
            columns = [row[1] for row in cur.fetchall()]

        forbidden = ["embedding", "fingerprint", "image", "raw_data", "private_key", "password"]
        for f in forbidden:
            self.assertNotIn(f, columns, f"Security violation: column '{f}' found in security_events table schema!")


if __name__ == "__main__":
    unittest.main()
