import React, { useState, useEffect } from 'react';
import VotingPortal from './components/VotingPortal';
import VoterEnrollment from './components/VoterEnrollment';
import ResultsDashboard from './components/ResultsDashboard';
import AuditExplorer from './components/AuditExplorer';
import StudentRoster from './components/StudentRoster';

const API_BASE = "http://127.0.0.1:5000";

export default function App() {
  const [activeTab, setActiveTab] = useState("roster");
  const [candidates, setCandidates] = useState([]);
  const [totalVotes, setTotalVotes] = useState(0);
  const [accounts, setAccounts] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [systemStatus, setSystemStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState("");

  const fetchStatus = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/status`);
      const data = await res.json();
      setSystemStatus(data);
    } catch {
      setSystemStatus({ status: "offline", blockchain_connected: false });
    }
  };

  const fetchCandidates = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/candidates`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load candidate standings");
      setCandidates(data.candidates || []);
      setTotalVotes(data.total_votes || 0);
      setApiError("");
    } catch (err) {
      setApiError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchAccounts = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/accounts`);
      const data = await res.json();
      if (data.accounts) setAccounts(data.accounts);
    } catch {}
  };

  const refreshAllData = () => {
    fetchStatus();
    fetchCandidates();
    fetchAccounts();
  };

  useEffect(() => {
    refreshAllData();
  }, []);

  const tabs = [
    { id: "roster", label: "📋 Student Electoral Roll", desc: "235 Students (VII A, VII B, VII C)" },
    { id: "voting", label: "🗳️ Voting Booth", desc: "Biometric Authentication & Ballot Casting" },
    { id: "enrollment", label: "📝 Voter Enrollment", desc: "Feature Extraction & On-Chain Registration" },
    { id: "results", label: "📊 Election Results", desc: "Live Tally & Department Standings" },
    { id: "explorer", label: "⛓️ Blockchain Explorer", desc: "Immutable Public Ledger & Event Log" }
  ];

  return (
    <div style={appContainer}>
      {/* Institutional Top Bar */}
      <header style={topBar}>
        <div style={topBarInner}>
          <div style={brandBadge}>
            <span style={{ fontSize: "1.4rem" }}>🏛️</span>
            <div>
              <div style={instTitle}>N.M.A.M. INSTITUTE OF TECHNOLOGY, NITTE</div>
              <div style={deptTitle}>DEPARTMENT OF INFORMATION SCIENCE & ENGINEERING &bull; MAJOR PROJECT (CODE 08)</div>
            </div>
          </div>

          <div style={projectTitleBlock}>
            <h1 style={mainTitle}>SECURE E-VOTING SYSTEM</h1>
            <p style={subHeaderTitle}>
              Siamese Residual CNN Biometric Verification &bull; Ethereum Smart Contract Immutable Storage
            </p>
          </div>
        </div>
      </header>

      {/* System Architecture Status Bar */}
      <div style={statusBar}>
        <div style={statusBarInner}>
          <div style={statusItem}>
            <span style={{
              ...statusDot,
              background: systemStatus?.status === "healthy" ? "#10b981" : "#ef4444"
            }} />
            <span>Flask REST API: <strong>{systemStatus ? "ONLINE" : "CONNECTING..."}</strong></span>
          </div>

          <div style={statusItem}>
            <span style={{
              ...statusDot,
              background: systemStatus?.blockchain_connected ? "#10b981" : "#f59e0b"
            }} />
            <span>Ethereum Hardhat Node: <strong>{systemStatus?.blockchain_connected ? "CONNECTED (RPC :8545)" : "OFFLINE"}</strong></span>
          </div>

          <div style={statusItem}>
            <span>Siamese CNN Threshold: <strong>τ ≤ {systemStatus?.operational_threshold ?? "0.2385"}</strong></span>
          </div>

          <div style={statusItem}>
            <span>Enrolled Biometric Templates: <strong>{systemStatus?.templates_count ?? 0}</strong></span>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <main style={mainContent}>
        {apiError && !systemStatus?.blockchain_connected && (
          <div style={warningNotice}>
            <strong>Notice:</strong> Local Ethereum Hardhat node is starting or offline. Start the node with{" "}
            <code>npx hardhat node</code> in the <code>blockchain</code> folder and deploy with <code>python deploy_contract.py</code>.
          </div>
        )}

        {/* Tab Navigation */}
        <nav style={tabsContainer}>
          {tabs.map((t) => {
            const isActive = activeTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTab(t.id)}
                style={{
                  ...tabBtn,
                  background: isActive ? "#0284c7" : "#1e293b",
                  color: isActive ? "#fff" : "#94a3b8",
                  borderColor: isActive ? "#38bdf8" : "#334155"
                }}
              >
                <div style={tabTitle}>{t.label}</div>
                <div style={tabDesc}>{t.desc}</div>
              </button>
            );
          })}
        </nav>

        {/* Tab Panels */}
        <div style={{ marginTop: "1.5rem" }}>
          {activeTab === "roster" && (
            <StudentRoster
              onSelectStudent={(student, targetTab = "voting") => {
                setSelectedStudent(student);
                setActiveTab(targetTab);
              }}
            />
          )}

          {activeTab === "voting" && (
            <VotingPortal
              candidates={candidates}
              onVoteCast={refreshAllData}
              accounts={accounts}
              preselectedStudent={selectedStudent}
              onSwitchToEnroll={() => setActiveTab("enrollment")}
            />
          )}

          {activeTab === "enrollment" && (
            <VoterEnrollment
              onEnrollSuccess={refreshAllData}
              accounts={accounts}
              preselectedStudent={selectedStudent}
              onSwitchToVote={() => setActiveTab("voting")}
            />
          )}

          {activeTab === "results" && (
            <ResultsDashboard
              candidates={candidates}
              onRefresh={refreshAllData}
              loading={loading}
              contractAddress={systemStatus?.contract_address}
              totalVotes={totalVotes}
            />
          )}

          {activeTab === "explorer" && (
            <AuditExplorer />
          )}
        </div>
      </main>

      {/* Footer */}
      <footer style={footerStyle}>
        <div>
          Major Project Work: <strong>Pranitha C Poojary (NNM23IS134), Pranjali N (NNM23IS135), Raksha S Suvarna (NNM23IS143), Nireeksha (NNM23IS111)</strong>
        </div>
        <div style={{ marginTop: "4px", color: "#64748b" }}>
          Under Guidance of: <strong>Ms. Tanzila Nargis</strong> &bull; Dept of Information Science & Engineering &bull; NMAMIT Nitte
        </div>
      </footer>
    </div>
  );
}

const appContainer = { minHeight: "100vh", display: "flex", flexDirection: "column" };

const topBar = {
  background: "#0b1329",
  borderBottom: "1px solid #1e293b",
  padding: "1rem 2rem"
};

const topBarInner = {
  maxWidth: "1300px",
  margin: "0 auto",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  flexWrap: "wrap",
  gap: "1rem"
};

const brandBadge = { display: "flex", alignItems: "center", gap: "10px" };
const instTitle = { fontSize: "0.85rem", fontWeight: 800, color: "#f8fafc", letterSpacing: "0.5px" };
const deptTitle = { fontSize: "0.7rem", color: "#38bdf8", fontWeight: 600 };

const projectTitleBlock = { textAlign: "right" };
const mainTitle = { margin: 0, fontSize: "1.25rem", color: "#38bdf8", fontWeight: 800, letterSpacing: "0.5px" };
const subHeaderTitle = { margin: "2px 0 0", fontSize: "0.75rem", color: "#94a3b8" };

const statusBar = {
  background: "#020617",
  borderBottom: "1px solid #1e293b",
  padding: "8px 2rem",
  fontSize: "0.78rem",
  color: "#cbd5e1"
};

const statusBarInner = {
  maxWidth: "1300px",
  margin: "0 auto",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  flexWrap: "wrap",
  gap: "1rem"
};

const statusItem = { display: "flex", alignItems: "center", gap: "6px" };
const statusDot = { width: "8px", height: "8px", borderRadius: "50%", display: "inline-block" };

const mainContent = {
  maxWidth: "1300px",
  width: "100%",
  margin: "0 auto",
  padding: "1.5rem 1rem",
  flex: 1
};

const warningNotice = {
  background: "#451a03",
  border: "1px solid #b45309",
  borderRadius: "8px",
  padding: "10px 14px",
  color: "#fde68a",
  fontSize: "0.85rem",
  marginBottom: "1rem"
};

const tabsContainer = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: "8px"
};

const tabBtn = {
  padding: "10px 12px",
  border: "1px solid",
  borderRadius: "8px",
  cursor: "pointer",
  textAlign: "left",
  transition: "all 0.2s"
};

const tabTitle = { fontSize: "0.88rem", fontWeight: 700 };
const tabDesc = { fontSize: "0.68rem", opacity: 0.8, marginTop: "2px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };

const footerStyle = {
  background: "#0b1329",
  borderTop: "1px solid #1e293b",
  padding: "1.2rem 2rem",
  textAlign: "center",
  fontSize: "0.8rem",
  color: "#94a3b8"
};
