# Secure E-Voting System Using CNN-Based Fingerprint Recognition and Blockchain Technology

**Department of Information Science & Engineering &bull; Major Project (Code 08)**  
**N.M.A.M. Institute of Technology, Nitte**  
**Under Guidance of:** Ms. Tanzila Nargis  
**Project Team:**  
- Pranitha C Poojary (NNM23IS134)  
- Pranjali N (NNM23IS135)  
- Raksha S Suvarna (NNM23IS143)  
- Nireeksha (NNM23IS111)  

---

## 📌 System Architecture Overview

The system combines cryptographic integrity from decentralized Ethereum smart contracts with deep-learning biometric verification using a residual convolutional neural network (CNN):

```
+-----------------------------------------------------------------------------------+
|                            EVALUATION & ADMIN PORTAL                             |
|               (Port 3001: Pre-Election Enrollment & Performance Dashboard)         |
+-----------------------------------------------------------------------------------+
        |                                                            ^
        | Biometric Template                                          | Metrics & CSV/JSON
        v                                                            |
+-----------------------------------------------------------------------------------+
|                             FLASK BACKEND SERVICE                                |
|                                  (Port 5000)                                      |
|   - CNN Embedding Inference (128-D L2-normalized hypersphere vectors)             |
|   - Evaluation Engine: Disjoint Identity Protocol & Scanner Presentation Variance |
|   - Web3.py Gateway (Election Lifecycle & Vote Verification)                      |
+-----------------------------------------------------------------------------------+
        |                                                            |
        v                                                            v
+-------------------------------+          +----------------------------------------+
|   ETHEREUM SMART CONTRACT     |          |         SOCOFing REAL DATASET          |
|    (Hardhat Local Node: 8545) |          | 6000 BMPs, 600 Unique Subject Folders  |
| - Election State & Timing     |          |  - 480 Training Disjoint Identities    |
| - Double-Vote Prevention      |          |  - 120 Test Disjoint Identities        |
| - Commissioner Access Control |          +----------------------------------------+
+-------------------------------+
```

---

## ⚡ Advanced Feature 1: Complete Election Lifecycle with Demo & Scheduled Modes

The election lifecycle allows the Election Commissioner to govern voting windows with on-chain cryptographic enforcement:

### 1. Dual Operational Modes (Demo Mode vs. Scheduled Mode)
A toggle switch in the **⚡ Election Lifecycle** tab allows the commissioner to switch between:

- **🚀 Demo Mode (ON - Default):**
  - Designed for college project exhibitions and rapid vivas.
  - Instantly opens the ballot box with duration presets (1 hour, 2 hours, 4 hours, 8 hours, 24 hours).
  - Voting becomes active immediately (`voting_now: true`) on the Ethereum smart contract without clock discrepancies.
- **🗓️ Scheduled Mode (OFF):**
  - Designed for production and calendar-based elections.
  - Prompts the commissioner for exact **Voting Start Date & Time** and **Voting End Date & Time** using datetime pickers.
  - Provides quick schedule presets (*Start in 15 Minutes*, *Tomorrow 9:00 AM – 5:00 PM*, *Full Day*).
  - Enforces start time and end time restrictions on-chain: if the start time is in the future, the election is marked as scheduled/upcoming (`voting_now: false`), and any premature ballot submission is reverted with `"Election has not started yet."`

### 2. SQLite Persistent Database & Server Restart Tolerance
The system utilizes a relational SQLite database (`backend/evoting.db`) storing:
- `election_lifecycle`: Persistent start/end timestamps, open/closed status, and contract addresses.
- `candidates`: Persistent vote tallies and nominee profiles.
- `voter_enrollments`: Biometric embeddings, SHA-256 hashes, and on-chain registration flags.
- `ballots_cast`: Permanent audit log of cast ballots (enforcing unique voter addresses).

**Server Restart Persistence:**
- When `run_all.py` or the server is stopped and restarted, all existing votes, candidate counts, and voter `has_voted` statuses are retrieved from `evoting.db`.
- The smart contract deployment script automatically detects existing state and re-hydrates the blockchain ledger so the on-chain contract and database remain synchronized.
- Citizens who voted remain flagged as `has_voted: true` and cannot vote again.

### 3. Factory Reset System (Only Way to Reset Votes)
- Clicking the **"🔄 Factory Reset System"** button in the Election Lifecycle tab is the **only action** that clears votes and resets the database.
- It deploys a clean `Voting.sol` contract to Ethereum, wipes the `ballots_cast` table, resets candidate tallies to zero, and clears enrolled templates.

---

## 🔬 Advanced Feature 2: Biometric Performance Evaluation Dashboard

### 1. Mathematical Definitions & Evaluation Metrics

The biometric engine maps raw grayscale fingerprint impressions ($96 \times 96 \times 1$) into 128-dimensional continuous embeddings normalized onto a unit hypersphere ($\|v\|_2 = 1$). Matching between a probe embedding $e_p$ and gallery template $e_g$ is determined by Euclidean distance:

$$d(e_p, e_g) = \sqrt{\sum_{i=1}^{128} (e_{p,i} - e_{g,i})^2}$$

The decision rule at threshold $\tau$ (configured operational baseline $\tau_0 = 0.2385$):
- **MATCH (Accept):** $d(e_p, e_g) \le \tau$
- **NON-MATCH (Reject):** $d(e_p, e_g) > \tau$

| Metric | Formula | Definition & Operational Relevance |
| :--- | :--- | :--- |
| **FAR** (False Acceptance Rate) | $\text{FAR} = \frac{\text{FP}}{\text{FP} + \text{TN}} = \frac{\text{Impostors Accepted}}{\text{Total Impostor Comparisons}}$ | Critical security metric. Measures vulnerability to unauthorized impostor impersonation. |
| **FRR** (False Rejection Rate) | $\text{FRR} = \frac{\text{FN}}{\text{TP} + \text{FN}} = \frac{\text{Genuines Rejected}}{\text{Total Genuine Comparisons}}$ | Usability metric. Measures how often legitimate voters are falsely turned away at the booth. |
| **GAR / TAR** (Genuine Acceptance Rate) | $\text{GAR} = 1 - \text{FRR} = \frac{\text{TP}}{\text{TP} + \text{FN}}$ | Percentage of genuine voters correctly authenticated. |
| **EER** (Equal Error Rate) | Point where $\text{FAR}(\tau) \approx \text{FRR}(\tau)$ | Operating point balancing false acceptance and false rejection via linear interpolation. |
| **Pairwise Accuracy** | $\text{Accuracy} = \frac{\text{TP} + \text{TN}}{\text{TP} + \text{TN} + \text{FP} + \text{FN}}$ | Overall binary classification accuracy across genuine and impostor comparison pairs. |
| **F1-Score & Precision** | $\text{Precision} = \frac{\text{TP}}{\text{TP} + \text{FP}}$, $\text{F1} = \frac{2 \cdot P \cdot R}{P + R}$ | Harmonized metric accounting for class balance between matching and non-matching comparisons. |

---

### 2. Defensible Evaluation Protocol

To prevent metric inflation and evaluate generalization capability rather than training memorization:

1. **Disjoint Identity Partitioning (80/20):**
   - The SOCOFing dataset contains 6,000 BMP images from 600 distinct subjects (10 impressions per subject).
   - Subject IDs 1 to 480 are reserved for training/development.
   - **Subject IDs 481 to 600 (120 subjects)** are strictly designated as the test partition.
   - **Zero identity overlap** exists between training identities and test identities.

2. **Physical Presentation Scanner Variance Model:**
   - In biometric enrollment/verification, repeated impressions from real voters exhibit sensor noise, finger roll, tilt, and pressure variance.
   - Genuine pairs are synthesized following the physical scanner presentation model specified in the training pipeline (`ml-model/fingerprint_evoting_production.ipynb`):
     - Spatial Rotation: $\theta \in [-8^\circ, +8^\circ]$
     - Translation Displacement: $(\Delta x, \Delta y) \in [-4\text{px}, +4\text{px}]$
     - Sensor Illumination & Gamma: $\gamma \in [0.88, 1.12]$
   - Impostor pairs are sampled across completely different subject identities from the disjoint test set.

---

### 3. Accessing the Performance Dashboard

1. Start the system or run the existing Flask & Vite servers:
   ```powershell
   python run_all.py
   ```
2. Open the **Admin & Commissioner Portal**:
   - URL: **`http://localhost:3001/admin.html`**
3. Click on the tab: **`🔬 Biometric Performance`**
4. Features available in the dashboard:
   - **KPI Summary Cards:** Displays empirical GAR, FAR, FRR, EER, Accuracy, and Mean/Median latencies.
   - **SVG Multi-Threshold Curve:** Interactive visualization showing $\text{FAR}(\tau)$, $\text{FRR}(\tau)$, and $\text{GAR}(\tau)$ over $\tau \in [0.10, 1.00]$, highlighting the operational threshold $\tau = 0.2385$.
   - **Separation Histogram:** Visualizes empirical genuine vs. impostor Euclidean distance distributions and decision boundary overlap.
   - **Evaluation Control Bar:** Allows running evaluations over 50, 150, 300, or 500 comparison pairs.
   - **Export Data Buttons:** One-click downloads for **CSV Comparison Log** and **JSON Research Audit Report**.

---

## 🧪 Automated Testing Suite

### 1. Biometric Evaluation Unit Tests
To verify metric calculation logic, zero-sample protection, class imbalance handling, and linear EER interpolation:

```powershell
cd backend
..\venv\Scripts\python.exe test_biometric_evaluation.py
```

Expected output:
```
Ran 6 tests in 0.000s
OK
```

Test coverage includes:
- `test_metric_calculation_standard`: Verifies TP, FP, TN, FN, FAR, FRR, and GAR calculations against hand-computed ground truth.
- `test_eer_linear_interpolation`: Tests cross-over point estimation between FAR and FRR curves.
- `test_extreme_thresholds`: Asserts boundary conditions ($\tau = 0 \implies \text{FAR}=0, \text{FRR}=1$; $\tau \to \infty \implies \text{FAR}=1, \text{FRR}=0$).
- `test_empty_and_zero_division_handling`: Ensures robust fallback without Python exceptions when genuine or impostor sets are empty.
- `test_class_imbalance_accuracy`: Validates that class proportions do not distort pairwise confusion matrix calculation.
- `test_disjoint_test_identities`: Asserts that test identities ($ID \ge 481$) are strictly disjoint from training identities ($ID \le 480$).

### 2. Smart Contract Lifecycle Tests
To verify Hardhat smart contract election lifecycle restrictions:

```powershell
cd blockchain
npx hardhat test
```

---

## 🏛️ College Exhibition & Viva Demonstration Guide

When presenting the project to examiners and exhibition evaluators, follow this recommended walkthrough:

1. **Demonstrate Strict Security Configuration ($\tau = 0.2385$):**
   - Point out that in an e-voting system, **FAR must be prioritized over FRR**.
   - Show that at $\tau = 0.2385$, the measured $\text{FAR} = 0.0\%$, ensuring no unauthorized imposter can cast a fraudulent ballot.
   - Explain that the resulting $\text{FRR}$ can be mitigated in a polling booth by allowing a voter up to 3 scan attempts if finger placement was poor.

2. **Demonstrate Generalization via the Disjoint Protocol:**
   - Explain to the examiner that the evaluation was performed on 120 **unseen subjects** (IDs 481-600) who were never part of CNN training.
   - This proves the residual CNN is acting as a genuine generalized metric feature extractor, not just memorizing enrolled training images.

3. **Demonstrate the Threshold Trade-Off Curve:**
   - Navigate to the threshold trade-off curve on the dashboard.
   - Show how increasing the threshold improves convenience ($\text{GAR} \to 100\%$) but increases security risk ($\text{FAR}$ rises above $0.50$).
   - Point out the vertical marker at $\tau = 0.2385$ where the system is currently anchored.

4. **Demonstrate Audit Data Export:**
   - Click **`⬇️ Download CSV Log`** to show raw comparison records with measured Euclidean distances and individual match/reject verdicts.
   - Click **`⬇️ Download JSON Report`** to show institutional metadata and exportable audit parameters for election observers.
# _Major_Project_

---

## 🔍 Advanced Feature 3: Blockchain Audit and Automatic Tamper Detection

The system includes an automated cryptographic audit subsystem designed to detect off-chain database alterations, unconfirmed transactions, double-voting violations, and candidate tally discrepancies.

### 1. How the System Reads Blockchain Data
1. **Direct Smart Contract Storage:** Queries `candidates(i).voteCount` and `candidatesCount` directly via Web3.py RPC calls to `Voting.sol`. This is the authoritative cryptographic ground truth.
2. **Immutable Event Reconstruction:** Creates contract event filters (`VoteCasted.create_filter(from_block=0, to_block="latest")`) and tallies votes solely from mined event logs, independent of state variables.
3. **Receipt Status Validation:** For every recorded transaction hash, calls `w3.eth.get_transaction_receipt(tx_hash)` to verify `status == 1` (Mined & Successful execution). Transactions are never assumed valid simply because a hash exists.
4. **Off-Chain Cross-Check:** Fetches displayed and database candidate tallies from SQLite (`candidates` table) and compares them against on-chain storage.

### 2. Audit Status Classifications
- **`VERIFIED (TAMPER-FREE)`**: All on-chain counts match displayed tallies, event reconstruction matches storage, receipts are confirmed with status=1, and zero double-voting events exist.
- **`DISCREPANCY DETECTED`**: A discrepancy was detected (e.g. displayed vote count does not match on-chain storage, or event logs differ from stored candidate totals).
- **`WARNING`**: Non-critical issue (e.g., node running without historical archive logs or administrative lifecycle state desynchronization).
- **`UNABLE TO VERIFY`**: The Ethereum RPC node is offline or the smart contract bytecode is missing from the target address.

### 3. How to Run an Audit
1. **Via Admin Portal UI:**
   - Open [http://localhost:3001/admin.html](http://localhost:3001/admin.html)
   - Click the **🔍 Tamper Audit** tab.
   - Click **`🔄 Run Blockchain Audit`** to execute real-time cross-verification.
2. **Via REST API:**
   ```powershell
   Invoke-RestMethod -Method POST -Uri "http://127.0.0.1:5000/api/audit/run"
   ```

### 4. How to Export Audit Reports
- **CSV Audit Report:** Click **`📥 Export CSV`** in the Tamper Audit tab or access `GET /api/audit/export/csv`.

### 5. Running Automated Audit Tests
To run the automated audit test suite:
```powershell
.\venv\Scripts\python.exe -m unittest backend/test_blockchain_audit.py
```
Expected output:
```
Ran 13 tests in 0.085s
OK
```

### 6. Scope, Limitations & Differences from Production Blockchain
- **Authoritative Source:** On-chain EVM storage is always prioritized over frontend or off-chain database records.
- **Local Hardhat Differences:** In local Hardhat development, block timestamps advance when transactions are mined rather than in continuous real-world seconds.
- **What System Cannot Guarantee:** The audit inspects cryptographic data integrity on-chain and off-chain; it cannot prevent physical optical scanner sensor presentation attacks (addressed separately by the Siamese CNN biometric threshold).

### 7. College Exhibition & Viva Demonstration
1. **Demonstrate Verified Clean State:**
   - Open **🔍 Tamper Audit** tab.
   - Show examiners the green **`VERIFIED — CRYPTOGRAPHICALLY TAMPER-FREE`** banner, 3-way candidate matching, and verified transaction receipts table.
2. **Demonstrate Live Tamper Detection (Demo Simulation):**
   - Click **`🧪 Test Tamper Detection (Demo)`**.
   - Show examiners how the system instantly flags a red **`DISCREPANCY DETECTED`** alert with an exact delta note (`Candidate #1: Delta: +5 votes`), proving that unauthorized tally manipulation is caught immediately without altering live data.
   - Click **`Reset to Authoritative State`** to restore verified state directly from the smart contract.
3. **Demonstrate Audit Report Download:**
   - Click **`📥 Export CSV`** to inspect the cryptographic report and proof of block inclusion.

---

## 🛡️ Implementation 4: Security Monitoring & Suspicious Activity Detection

### 1. Overview
The **Security Monitoring and Suspicious Activity Detection** module implements defense-in-depth monitoring across authentication, rate-limiting, election administration, and blockchain transaction lifecycles. It continuously tracks anomalies and logs incidents into a persistent SQLite security ledger without ever recording sensitive biometric templates, raw images, or cryptographic secrets.

### 2. Configurable Threat Detection Rules

| Event Type | Trigger Condition | Severity | Action / Status |
| :--- | :--- | :--- | :--- |
| **`FINGERPRINT_VERIFICATION_FAILURE`** | Single biometric probe exceeds operating threshold ($\tau = 0.2385$) | `LOW` | Rejected with 401; logged as `FAILED` |
| **`REPEATED_BIOMETRIC_FAILURES`** | $\ge 3$ consecutive biometric failures within a 5-minute sliding window | `HIGH` | Escalated incident alert; logged as `ALERT` |
| **`RATE_LIMIT_EXCEEDED`** | $> 6$ requests within 30 seconds on sensitive endpoints (`/verify-and-vote`, `/cast-vote`) | `LOW` | HTTP 429 response with `Retry-After`; logged as `BLOCKED` |
| **`DUPLICATE_VOTING_ATTEMPT`** | Voter attempts to vote again (caught by SQLite check or contract revert) | `HIGH` | Blocked with 400; logged as `REJECTED` |
| **`UNREGISTERED_VOTER_ATTEMPT`** | Unenrolled wallet attempts verification or voting | `MEDIUM` | Blocked with 404; logged as `FAILED` |
| **`UNAUTHORIZED_ADMIN_ACCESS`** | Non-commissioner address attempts restricted administrative operations | `HIGH` | Blocked with 403; logged as `FORBIDDEN` |
| **`BLOCKCHAIN_TRANSACTION_FAILURE`** | Smart contract transaction revert, RPC error, or missing receipt | `HIGH` | Captured with error classification; logged as `ERROR` |
| **`MALFORMED_REQUEST`** | Missing required parameters or corrupt payload bodies | `LOW` | Rejected with 400; logged as `REJECTED` |

### 3. Data Privacy & Zero Biometric Leakage
To adhere to strict zero-knowledge and privacy-preserving design principles:
- **No Biometric Data:** Raw fingerprint images and 128-dimensional embedding vectors are **never stored** in the security audit table.
- **Log Sanitization:** All user-supplied inputs and user-agent strings are sanitized to prevent log injection attacks and control-character pollution.
- **Anonymized Identifiers:** Logs store truncated checksum wallet addresses, sanitized endpoint paths, and UTC timestamps.

### 4. Security Monitoring Dashboard UI
Located under the **🛡️ Security Monitoring** tab in the Election Commissioner Admin Portal:
- **6 Key Metrics:** Total Events, High/Critical Alerts, Failed Biometric Attempts, Duplicate Vote Attempts, Unauthorized Admin Attempts, and Blockchain Tx Failures.
- **Real-Time Filters:** Filter by Severity (`CRITICAL`, `HIGH`, `MEDIUM`, `LOW`, `INFO`), Event Type, Review Status (`Reviewed` vs. `Unreviewed`), and text search.
- **Auditor Workflow:** Incident review button (`Mark Reviewed`) updates the persistent ledger with auditor identification and timestamp.
- **Forensic Exports:** One-click downloads for RFC-4180 compliant **CSV Incident Logs** and structured **JSON Incident Logs**.

### 5. Automated Testing
Run the complete security test suite:
```powershell
.\venv\Scripts\python.exe backend/test_security_monitoring.py
```
Expected output:
```
Ran 11 tests in 0.497s
OK
```

### 6. Exhibition & Viva Walkthrough
1. **Show Live Operational Dashboard:**
   - Navigate to [http://localhost:3001/admin.html](http://localhost:3001/admin.html) and click the **🛡️ Security Monitoring** tab.
   - Point out the 6 real-time sensor counters and the clean baseline log.
2. **Demonstrate Rate-Limiting Barrier:**
   - Explain how rapid probing on biometric authentication or ballot submission endpoints triggers HTTP 429 throttling to prevent automated brute-force attacks.
3. **Demonstrate Escalated Repeated Biometric Alert:**
   - Explain that while isolated biometric mismatches are classified as low-severity noise, 3 consecutive failures within 5 minutes automatically elevate to a **`HIGH`** severity incident alert (`REPEATED_BIOMETRIC_FAILURES`).
4. **Demonstrate Double-Voting Prevention & Logged Audit Trail:**
   - Explain that duplicate ballot attempts are blocked at both the database barrier and the EVM smart contract barrier, immediately logging a **`HIGH`** alert (`DUPLICATE_VOTING_ATTEMPT`).
5. **Demonstrate Auditor Incident Review & Log Export:**
   - Click **`Mark Reviewed`** on an incident row to show the reviewer audit trail update.
   - Click **`📥 Export CSV`** and **`📥 Export JSON`** to inspect the downloadable compliance logs.

---

## 📈 Implementation 7: Election Analytics & Results Dashboard

### 1. Overview
The **Election Analytics and Results Dashboard** provides institutional oversight, turnout analytics, smart contract candidate standings, transparent tie handling, and temporal voting participation trends. It integrates with the authoritative EVM smart contract (`Voting.sol`) while cross-verifying with the local SQLite persistence layer.

### 2. Core Metrics & Mathematical Formulations

- **Voter Turnout Rate:**
  $$\text{Turnout (\%)} = \left(\frac{\text{Authoritative Votes Cast}}{\text{Total Registered Voters}}\right) \times 100$$
  *(Safely evaluates to $0.0\%$ when registered voters $= 0$ to prevent division by zero).*
- **Remaining Eligible Voters:**
  $$\text{Remaining Voters} = \max(0, \text{Registered Voters} - \text{Votes Cast})$$
- **Candidate Vote Share:**
  $$\text{Vote Share (\%)} = \left(\frac{\text{Candidate Votes}}{\text{Total Valid Ballots Cast}}\right) \times 100$$
- **Election Lifecycle States:** Dynamically inferred from contract timestamps into `Not Started`, `Scheduled`, `Active`, or `Completed`.

### 3. Tie Handling & Authoritative Verification
- **Competition Ranking:** Candidates are ranked descending by on-chain votes.
- **Tie Detection:** If two or more top candidates share the highest vote tally ($>0$), the system flags **`TIE DETECTED FOR 1ST PLACE`** and displays a yellow warning banner identifying the tied candidates instead of declaring a single winner.
- **Cross-Verification Discrepancy Alert:** If the local SQLite database disagrees with on-chain contract state, a red warning is raised referring administrators to the **Blockchain Tamper Audit** module.

### 4. Temporal Voting & Security Correlation
- **Temporal Distribution:** Groups ballots cast into hourly/daily buckets using real `ballots_cast.voted_at` timestamps.
- **Date & Candidate Filtering:** Supports date range (`start_date`, `end_date`) and specific candidate selection.
- **Biometric & Security Correlation:** Correlates voting turnout with biometric verification accuracy ($(\text{Successes} / \text{Total Attempts}) \times 100$), blocked double votes, unauthorized admin access denial, and transaction reverts.

### 5. Exportable Forensic Reports
- **CSV Analytics Export:** `GET /api/analytics/export/csv` generates an RFC-4180 compliance report containing metadata, turnout summary, candidate standings, hourly activity, and security statistics.
- **JSON Analytics Export:** `GET /api/analytics/export/json` returns full structured analytics data for institutional archiving.

### 6. Running Automated Analytics Tests
```powershell
.\venv\Scripts\python.exe backend/test_election_analytics.py
```
Expected output:
```
Ran 12 tests in 1.547s
OK
```

### 7. College Exhibition & Viva Demonstration
1. **Open Analytics Dashboard:**
   - Open [http://localhost:3001/admin.html](http://localhost:3001/admin.html) and click the **📈 Election Analytics** tab.
2. **Demonstrate Live Turnout & Metrics Cards:**
   - Show examiners the 6 metric cards: Lifecycle Status, Turnout Rate, Registered Voters, Ballots Cast, Remaining Eligible Voters, and Contesting Candidates.
3. **Demonstrate Tie & Leader Detection:**
   - Point out how projected winners or tied contenders are surfaced with visual percentage progress bars.
4. **Demonstrate Date & Candidate Filtering:**
   - Use the date pickers or candidate selector to filter temporal participation.
5. **Demonstrate Exportable Reports:**
   - Click **`📥 Export CSV`** and **`📥 Export JSON`** to inspect the downloadable compliance summaries.


---

## 🔐 Implementation 8: Role-Based Access Control (RBAC) & Secure Role Dashboards

### 1. Overview & Security Architecture
The **Role-Based Access Control (RBAC)** module establishes defense-in-depth authorization across backend Flask APIs, on-chain smart contract modifiers, and frontend user interfaces. It enforces strict separation of duties among three distinct institutional roles: **Election Commissioner**, **Electoral Auditor**, and **Citizen Voter**.

- **PBKDF2-HMAC-SHA256 Password Hashing:** Passwords are never stored in plaintext. They are salted with a 16-byte cryptographically secure random salt and hashed with 100,000 PBKDF2 iterations.
- **Signed Bearer Session Tokens:** Generates tamper-proof base64 tokens cryptographically signed using HMAC-SHA256 (`<payload_b64>.<signature_hex>`) with an isolated server secret key (`auth_secret.key`).
- **Stateful Session Revocation:** Active sessions are tracked in SQLite (`user_sessions`), enabling instantaneous single-click revocation and logout across devices.
- **Server-Side Authoritative Enforcement:** Role permissions are validated strictly server-side using `@require_auth` and `@require_role` decorators. Requests lacking proper credentials receive HTTP 401 Unauthorized or HTTP 403 Forbidden with automatic incident logging.

### 2. Role Definitions & Default Credentials

For college exhibition and viva evaluation, three pre-seeded institutional accounts are provisioned:

| Role | Default Username | Default Password | Associated Hardhat Address | Institutional Scope & Responsibilities |
| :--- | :--- | :--- | :--- | :--- |
| **👑 COMMISSIONER** | `commissioner` | `admin123` | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` (Account #0) | Full election administration: open/close voting windows, factory reset, biometric enrollment, on-chain voter registration, security review, and audit inspections. |
| **🔍 AUDITOR** | `auditor` | `audit123` | N/A (Independent Oversight) | Read-only oversight: inspect blockchain tamper audits, view forensic security event logs, mark incident reviews, monitor turnout analytics, and export CSV/JSON compliance reports. Strictly forbidden from changing election state, enrolling voters, casting ballots, or executing resets. |
| **👤 VOTER** | `voter` | `voter123` | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` (Account #1) | Self-service voter portal: query registration and eligibility status, participate in CNN biometric fingerprint verification, cast single ballot during open window, and view immutable transaction receipt. Strictly forbidden from accessing administrative endpoints or other voters' biometric templates. |

### 3. Permission Matrix

| Feature / API Action | HTTP Method & Route | COMMISSIONER | AUDITOR | VOTER |
| :--- | :--- | :---: | :---: | :---: |
| **Open / Close Election** | `POST /api/open-election`, `POST /api/close-election` | ✅ Allow | ❌ 403 Forbidden | ❌ 403 Forbidden |
| **Factory Reset System** | `POST /api/reset-all` | ✅ Allow | ❌ 403 Forbidden | ❌ 403 Forbidden |
| **Enroll Voter & Biometrics** | `POST /api/enroll-voter` | ✅ Allow | ❌ 403 Forbidden | ❌ 403 Forbidden |
| **Register Voter On-Chain** | `POST /api/register-onchain` | ✅ Allow | ❌ 403 Forbidden | ❌ 403 Forbidden |
| **View Registered Voters Roster**| `GET /api/registered-voters` | ✅ Allow | ❌ Hidden | ❌ Hidden |
| **Review Security Incident** | `POST /api/security/events/<id>/review` | ✅ Allow | ✅ Allow | ❌ 403 Forbidden |
| **Run Blockchain Tamper Audit** | `POST /api/audit/run`, `GET /api/audit/status` | ✅ Allow | ✅ Allow | ❌ Hidden |
| **View Security Monitoring** | `GET /api/security/summary`, `GET /api/security/events` | ✅ Allow | ✅ Allow | ❌ Hidden |
| **View Election Analytics** | `GET /api/analytics/dashboard` | ✅ Allow | ✅ Allow | ❌ Hidden |
| **Export Compliance Reports** | `GET /api/audit/export/csv`, `/api/security/export/*` | ✅ Allow | ✅ Allow | ❌ Hidden |
| **Verify Biometric Fingerprint** | `POST /api/verify-fingerprint` | ✅ Allow | ❌ Forbidden | ✅ Allow |
| **Cast Ballot (Polling Booth)** | `POST /api/cast-vote` | ❌ Disallowed | ❌ Disallowed | ✅ Allow |
| **Voter Self-Service Status** | `GET /api/auth/me`, `GET /api/voter/status` | ✅ Allow | ✅ Allow | ✅ Allow |

### 4. Authentication API Endpoints
- **`POST /api/auth/login`**: Accepts `{ "username": "...", "password": "..." }` or `{ "wallet_address": "0x..." }`. Returns Bearer token, role, and profile info.
- **`POST /api/auth/logout`**: Revokes session token in `user_sessions`.
- **`GET /api/auth/me`**: Returns authenticated user profile, active role, permissions, and session expiry.
- **`GET /api/auth/roles`**: Public metadata endpoint listing system roles and default credentials for viva demonstrators.

### 5. Role-Specific Dashboards
1. **Header Role Switcher & Modal:**
   - In `http://localhost:3001/admin.html`, the top navigation bar displays the current role badge (`👑 Commissioner`, `🔍 Auditor`, or `👤 Voter`).
   - Clicking **`🔄 Switch Role`** opens the authentication modal with 1-click role switches or custom credential login.
2. **Dynamic Navigation Tab Filtering:**
   - When logged in as **Commissioner**: All tabs (⚡ Lifecycle, 👥 Voters, 🔬 Biometric, 🔍 Tamper Audit, 🛡️ Security, 📈 Analytics) are visible with full operational controls.
   - When logged in as **Auditor**: Administrative tabs (Lifecycle, Voters) are hidden. Auditor has read-only access to Tamper Audit, Security Monitoring, and Election Analytics with action banners disabled.
   - When logged in as **Voter**: Navigates directly to the dedicated **👤 Voter Portal**, hiding all administrative and election commissioner settings.
3. **Voter Self-Service Portal (`VoterPortalDashboard.jsx`):**
   - Displays personal enrollment status, on-chain registration indicator, voting eligibility, and election time window.
   - Shows ballot confirmation status (Voted vs. Not Voted) and transaction hash receipt link without exposing candidate choice or other voters' biometric data.

### 6. Automated RBAC Security Tests
Run the dedicated RBAC and role enforcement test suite:
```powershell
.\venv\Scripts\python.exe backend/test_rbac_security.py
```
Expected output:
```
Ran 9 tests in 0.819s
OK
```

Test coverage validates:
- `test_login_success_commissioner`: Successful authentication and cryptographic token generation.
- `test_login_invalid_password`: Immediate rejection (401) on bad credentials.
- `test_commissioner_can_access_open_election`: Commissioner successfully opens election lifecycle.
- `test_auditor_cannot_access_open_election`: Auditor attempt to open election returns 403 Forbidden.
- `test_voter_cannot_access_reset_all`: Voter attempt to execute factory reset returns 403 Forbidden.
- `test_unauthenticated_request_rejected`: Sensitive admin routes reject unauthenticated requests with 401.
- `test_auditor_can_review_security_event`: Auditor successfully completes compliance review.
- `test_session_revocation_logout`: Calling `/api/auth/logout` invalidates token immediately.
- `test_role_tampering_prevented`: Manipulating client-side payload roles is blocked by server-side database verification.

### 7. College Exhibition & Viva Demonstration
1. **Demonstrate Commissioner Access:**
   - Open [http://localhost:3001/admin.html](http://localhost:3001/admin.html).
   - Show that by default, the session is authenticated as **`👑 Commissioner`**.
   - Point out full access to election lifecycle toggles, voter enrollment, and reset controls.
2. **Demonstrate 1-Click Role Switch to Auditor:**
   - Click **`🔄 Switch Role`** in the top header.
   - Select **Auditor (`auditor` / `audit123`)**.
   - Show how the UI dynamically adapts: ⚡ Lifecycle and 👥 Voters tabs disappear from navigation.
   - Open the **🔍 Tamper Audit** or **🛡️ Security Monitoring** tab to demonstrate read-only compliance inspection.
3. **Demonstrate Server-Side 403 Enforcement:**
   - Explain to examiners that even if a malicious user manually sends an HTTP POST request to `/api/reset-all` with an Auditor token, the backend returns HTTP 403 Forbidden and logs an `UNAUTHORIZED_ADMIN_ACCESS` incident in the security monitor.
4. **Demonstrate Voter Self-Service Portal:**
   - Click **`🔄 Switch Role`** and select **Voter (`voter` / `voter123`)**.
   - Show the dedicated **👤 Voter Portal** displaying real-time enrollment status, voting eligibility, election countdown, and personal ballot receipt without exposing sensitive administrative operations.
