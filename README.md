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
#   _ M a j o r _ P r o j e c t _  
 