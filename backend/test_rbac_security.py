"""
Unit and Integration Tests for Implementation 8:
Role-Based Access Control (RBAC) and Secure Dashboards
NMAMIT Major Project Code 08
"""

import os
import json
import sqlite3
import unittest
import time
from unittest.mock import patch

from app import app
from database import DB_PATH, init_db
from auth_service import (
    hash_password,
    verify_password,
    create_session_token,
    verify_session_token,
    revoke_session_token,
    authenticate_user,
    authenticate_voter_wallet,
    ROLE_PERMISSIONS
)

class RBACSecurityTestCase(unittest.TestCase):
    def setUp(self):
        """Enable strict RBAC enforcement in Flask testing environment."""
        init_db()
        app.config["TESTING"] = True
        app.config["ENFORCE_RBAC"] = True
        self.client = app.test_client()

    def tearDown(self):
        app.config["ENFORCE_RBAC"] = False

    def test_password_hashing_and_verification(self):
        """PBKDF2-HMAC-SHA256 password hashing with unique salts."""
        raw_pwd = "SecretPassword123!"
        key1, salt1 = hash_password(raw_pwd)
        key2, salt2 = hash_password(raw_pwd)

        # Unique salts guarantee different hashes
        self.assertNotEqual(salt1, salt2)
        self.assertNotEqual(key1, key2)

        # Verify correct vs incorrect password
        self.assertTrue(verify_password(raw_pwd, salt1, key1))
        self.assertFalse(verify_password("WrongPassword", salt1, key1))
        self.assertFalse(verify_password("", salt1, key1))

    def test_cryptographic_token_creation_and_verification(self):
        """Verifies session token signing, tamper resistance, and expiration."""
        token, exp = create_session_token(
            username="test_user",
            role="COMMISSIONER",
            display_name="Test Commissioner",
            expiry_seconds=3600
        )
        self.assertIn(".", token)

        # 1. Valid token verifies
        payload = verify_session_token(token)
        self.assertIsNotNone(payload)
        self.assertEqual(payload["sub"], "test_user")
        self.assertEqual(payload["role"], "COMMISSIONER")

        # 2. Tampered signature is rejected
        b64_part, _ = token.split(".", 1)
        tampered_token = f"{b64_part}.bad_tampered_signature"
        self.assertIsNone(verify_session_token(tampered_token))

        # 3. Expired token is rejected
        expired_token, _ = create_session_token(
            username="test_expired",
            role="VOTER",
            display_name="Expired User",
            expiry_seconds=-10
        )
        self.assertIsNone(verify_session_token(expired_token))

    def test_unauthenticated_access_is_rejected_401(self):
        """Calling protected endpoints without token must return 401 Unauthorized."""
        # Open election requires commissioner authentication
        res = self.client.post("/api/open-election", json={"start_time": 100, "end_time": 200})
        self.assertEqual(res.status_code, 401)
        data = res.get_json()
        self.assertEqual(data.get("code"), "UNAUTHENTICATED")

        # Enroll voter requires commissioner authentication
        res_enroll = self.client.post("/api/enroll-voter", data={"voter_address": "0x123"})
        self.assertEqual(res_enroll.status_code, 401)

        # Factory reset requires commissioner authentication
        res_reset = self.client.post("/api/reset-all")
        self.assertEqual(res_reset.status_code, 401)

    def test_voter_denied_commissioner_operations_403(self):
        """A user holding VOTER role cannot perform commissioner operations (403 Forbidden)."""
        voter_token, _ = create_session_token(
            username="voter_alice",
            role="VOTER",
            display_name="Alice Voter"
        )
        headers = {"Authorization": f"Bearer {voter_token}"}

        # Attempt to open election as voter -> 403
        res = self.client.post("/api/open-election", headers=headers, json={"start_time": 100, "end_time": 200})
        self.assertEqual(res.status_code, 403)
        data = res.get_json()
        self.assertEqual(data.get("code"), "FORBIDDEN")
        self.assertEqual(data.get("held_role"), "VOTER")

        # Attempt to factory reset as voter -> 403
        res_reset = self.client.post("/api/reset-all", headers=headers)
        self.assertEqual(res_reset.status_code, 403)

    def test_auditor_denied_commissioner_actions_but_allowed_review(self):
        """Auditor cannot open election or enroll voters, but can review security incidents."""
        auditor_token, _ = create_session_token(
            username="auditor_bob",
            role="AUDITOR",
            display_name="Bob Auditor"
        )
        headers = {"Authorization": f"Bearer {auditor_token}"}

        # Auditor denied opening election -> 403
        res_open = self.client.post("/api/open-election", headers=headers, json={"start_time": 100, "end_time": 200})
        self.assertEqual(res_open.status_code, 403)

        # Auditor denied factory reset -> 403
        res_reset = self.client.post("/api/reset-all", headers=headers)
        self.assertEqual(res_reset.status_code, 403)

        # Auditor permitted to review security incident
        with patch("app.mark_event_reviewed", return_value=True):
            res_rev = self.client.post(
                "/api/security/events/1/review",
                headers=headers,
                json={"reviewed_by": "Auditor Bob"}
            )
            self.assertEqual(res_rev.status_code, 200)
            self.assertTrue(res_rev.get_json()["success"])

    def test_role_tampering_in_request_body_ignored(self):
        """Voter cannot escalate privileges by sending 'role': 'COMMISSIONER' in JSON payload."""
        voter_token, _ = create_session_token(
            username="voter_mallory",
            role="VOTER",
            display_name="Mallory Attacker"
        )
        headers = {"Authorization": f"Bearer {voter_token}"}

        # Attack: passing role='COMMISSIONER' in JSON body
        res = self.client.post(
            "/api/open-election",
            headers=headers,
            json={"start_time": 100, "end_time": 200, "role": "COMMISSIONER", "user_role": "COMMISSIONER"}
        )
        self.assertEqual(res.status_code, 403)
        self.assertEqual(res.get_json()["held_role"], "VOTER")

    def test_login_endpoint_credentials_and_logout(self):
        """Tests /api/auth/login with valid/invalid credentials and /api/auth/logout."""
        # 1. Invalid credentials -> 401
        res_bad = self.client.post("/api/auth/login", json={"username": "commissioner", "password": "wrong_password"})
        self.assertEqual(res_bad.status_code, 401)
        self.assertEqual(res_bad.get_json()["code"], "INVALID_CREDENTIALS")

        # 2. Valid commissioner login -> 200
        res_good = self.client.post("/api/auth/login", json={"username": "commissioner", "password": "admin123"})
        self.assertEqual(res_good.status_code, 200)
        data = res_good.get_json()
        self.assertTrue(data["success"])
        token = data["token"]
        self.assertEqual(data["user"]["role"], "COMMISSIONER")

        # 3. Check /api/auth/me with valid token
        res_me = self.client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        self.assertEqual(res_me.status_code, 200)
        me_data = res_me.get_json()
        self.assertTrue(me_data["authenticated"])
        self.assertEqual(me_data["user"]["role"], "COMMISSIONER")

        # 4. Logout -> token revoked
        res_logout = self.client.post("/api/auth/logout", headers={"Authorization": f"Bearer {token}"})
        self.assertEqual(res_logout.status_code, 200)

        # 5. Subsequent request with revoked token fails -> 401
        res_revoked = self.client.post("/api/open-election", headers={"Authorization": f"Bearer {token}"}, json={"start_time": 100, "end_time": 200})
        self.assertEqual(res_revoked.status_code, 401)

    def test_voter_wallet_login(self):
        """Tests voter authenticating using their registered wallet address."""
        voter_wallet = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
        res = self.client.post("/api/auth/login", json={"wallet_address": voter_wallet})
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertTrue(data["success"])
        self.assertEqual(data["user"]["role"], "VOTER")
        self.assertEqual(data["user"]["wallet_address"], voter_wallet.lower())

    def test_roles_directory_and_permission_matrix(self):
        """Verifies /api/auth/roles returns explicit permission matrix for all 3 roles."""
        res = self.client.get("/api/auth/roles")
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertIn("roles", data)
        roles = data["roles"]
        self.assertIn("COMMISSIONER", roles)
        self.assertIn("AUDITOR", roles)
        self.assertIn("VOTER", roles)
        self.assertIn("election:open", roles["COMMISSIONER"]["permissions"])
        self.assertNotIn("election:open", roles["AUDITOR"]["permissions"])
        self.assertNotIn("election:open", roles["VOTER"]["permissions"])


if __name__ == "__main__":
    unittest.main()
