import React, { useState, useEffect } from 'react';
import VoterEnrollment from './components/VoterEnrollment';
import StudentRoster from './components/StudentRoster';
import ResultsDashboard from './components/ResultsDashboard';
import AuditExplorer from './components/AuditExplorer';
import ElectionControl from './components/ElectionControl';
import BiometricEvaluationDashboard from './components/BiometricEvaluationDashboard';
import ElectionAuditDashboard from './components/ElectionAuditDashboard';
import SecurityMonitoringDashboard from './components/SecurityMonitoringDashboard';
import ElectionAnalyticsDashboard from './components/ElectionAnalyticsDashboard';
import RoleLoginModal from './components/RoleLoginModal';
import VoterPortalDashboard from './components/VoterPortalDashboard';

const API_BASE = "http://127.0.0.1:5000";

export default function AdminApp() {
  const [activeTab, setActiveTab] = useState("enrollment");
  const [candidates, setCandidates] = useState([]);
  const [totalVotes, setTotalVotes] = useState(0);
  const [accounts, setAccounts] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [systemStatus, setSystemStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState("");

  // Role-Based Access Control State
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const saved = localStorage.getItem("evoting_user");
      return saved ? JSON.parse(saved) : { username: "commissioner", role: "COMMISSIONER", display_name: "Ms. Tanzila Nargis (Commissioner)" };
    } catch {
      return { username: "commissioner", role: "COMMISSIONER", display_name: "Ms. Tanzila Nargis (Commissioner)" };
    }
  });
  const [authToken, setAuthToken] = useState(() => localStorage.getItem("evoting_token") || "");

  const checkAuthSession = async () => {
    const savedToken = localStorage.getItem("evoting_token");
    if (savedToken) {
      try {
        const res = await fetch(`${API_BASE}/api/auth/me`, {
          headers: { "Authorization": `Bearer ${savedToken}` }
        });
        const data = await res.json();
        if (data.authenticated && data.user) {
          setCurrentUser(data.user);
          setAuthToken(savedToken);
          return;
        }
      } catch {}
    }
    // Default initial auto-login as commissioner for seamless exhibition experience
    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "commissioner", password: "admin123" })
      });
      const data = await res.json();
      if (data.success) {
        setAuthToken(data.token);
        setCurrentUser(data.user);
        localStorage.setItem("evoting_token", data.token);
        localStorage.setItem("evoting_user", JSON.stringify(data.user));
      }
    } catch {}
  };

  const handleLoginSuccess = (token, user) => {
    setAuthToken(token);
    setCurrentUser(user);
    localStorage.setItem("evoting_token", token);
    localStorage.setItem("evoting_user", JSON.stringify(user));
    if (user.role === "AUDITOR") {
      setActiveTab("audit");
    } else if (user.role === "VOTER") {
      setActiveTab("voter_portal");
    } else {
      setActiveTab("enrollment");
    }
    refreshAllData();
  };

  const handleLogout = async () => {
    if (authToken) {
      try {
        await fetch(`${API_BASE}/api/auth/logout`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${authToken}` }
        });
      } catch {}
    }
    localStorage.removeItem("evoting_token");
    localStorage.removeItem("evoting_user");
    setAuthToken("");
    setCurrentUser(null);
    setAuthModalOpen(true);
  };

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
      if (!res.ok) throw new Error(data.error || "Could not load candidates");
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

  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const refreshAllData = () => {
    fetchStatus();
    fetchCandidates();
    fetchAccounts();
    setRefreshTrigger(prev => prev + 1);
  };

  useEffect(() => {
    checkAuthSession();
    refreshAllData();
  }, []);

  const currentRole = currentUser?.role || "COMMISSIONER";

  const allTabs = [
    { id: "enrollment", label: "📝 Pre-Election Enrollment", desc: "Biometric Feature Extraction & On-Chain Registration", roles: ["COMMISSIONER"] },
    { id: "lifecycle", label: "⚡ Election Lifecycle", desc: "Commissioner Timing & Status Control", roles: ["COMMISSIONER"] },
    { id: "roster", label: "📋 Student Electoral Roll", desc: "235 Students (VII A, VII B, VII C)", roles: ["COMMISSIONER"] },
    { id: "voter_portal", label: "👤 Voter Verification", desc: "Eligibility, Window & Personal Receipt", roles: ["VOTER"] },
    { id: "results", label: "📊 Election Standings", desc: "Live Tally & Vote Distribution", roles: ["COMMISSIONER", "AUDITOR", "VOTER"] },
    { id: "analytics", label: "📈 Election Analytics", desc: "Turnout, Candidate Rankings & Temporal Trends", roles: ["COMMISSIONER", "AUDITOR"] },
    { id: "audit", label: "🔍 Tamper Audit", desc: "Automated On-Chain Discrepancy & Tamper Detection", roles: ["COMMISSIONER", "AUDITOR"] },
    { id: "security", label: "🛡️ Security Monitoring", desc: "Suspicious Activity Detection & Incident Log", roles: ["COMMISSIONER", "AUDITOR"] },
    { id: "explorer", label: "⛓️ Blockchain Explorer", desc: "Immutable Public Ledger & Transaction Log", roles: ["COMMISSIONER", "AUDITOR", "VOTER"] },
    { id: "biometrics", label: "🔬 Biometric Performance", desc: "FAR, FRR, EER & ROC Analysis", roles: ["COMMISSIONER", "AUDITOR"] }
  ];

  const tabs = allTabs.filter(t => t.roles.includes(currentRole));

  return (
    <div style={appContainer}>
      {/* Admin Institutional Header */}
      <header style={topBar}>
        <div style={topBarInner}>
          <div style={brandBadge}>
            <span style={{ fontSize: "1.6rem" }}>🏛️</span>
            <div>
              <div style={instTitle}>N.M.A.M. INSTITUTE OF TECHNOLOGY, NITTE</div>
              <div style={deptTitle}>DEPARTMENT OF INFORMATION SCIENCE & ENGINEERING &bull; MAJOR PROJECT (CODE 08)</div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <div style={projectTitleBlock}>
              <div style={adminBadge}>🛡️ ELECTION COMMISSIONER &bull; ADMIN PORTAL</div>
              <h1 style={mainTitle}>Pre-Election Voter Enrollment Center</h1>
            </div>

            {/* Role-Based Access Control Switcher */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", background: "#0f172a", border: "1px solid #334155", padding: "0.35rem 0.6rem", borderRadius: "8px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                <span style={{ fontSize: "1.1rem" }}>{currentRole === "COMMISSIONER" ? "👑" : (currentRole === "AUDITOR" ? "🔍" : "👤")}</span>
                <div>
                  <div style={{ fontSize: "0.7rem", color: currentRole === "COMMISSIONER" ? "#6ee7b7" : (currentRole === "AUDITOR" ? "#fcd34d" : "#38bdf8"), fontWeight: "800", letterSpacing: "0.05em" }}>
                    ROLE: {currentRole}
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "#cbd5e1", maxWidth: "160px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {currentUser?.display_name || "User"}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setAuthModalOpen(true)}
                style={switchRoleBtn}
                title="Switch Role or Log In with Credentials"
              >
                Switch Role
              </button>

              <button
                type="button"
                onClick={handleLogout}
                style={logoutBtn}
                title="Terminate active session"
              >
                Logout
              </button>
            </div>

            {/* Link to Booth Client Station */}
            <a
              href="http://localhost:3000"
              target="_blank"
              rel="noreferrer"
              style={boothLinkBtn}
              title="Open Booth Level Client Station on Port 3000"
            >
              <span>🗳️ Open Booth Station (:3000) ↗</span>
            </a>
          </div>
        </div>
      </header>

      {/* Admin Status Bar */}
      <div style={statusBar}>
        <div style={statusBarInner}>
          <div style={statusItem}>
            <span style={{
              ...statusDot,
              background: systemStatus?.status === "healthy" ? "#10b981" : "#ef4444"
            }} />
            <span>Flask REST API: <strong>{systemStatus?.status === "healthy" ? "ONLINE (:5000)" : "OFFLINE"}</strong></span>
          </div>

          <div style={statusItem}>
            <span style={{
              ...statusDot,
              background: systemStatus?.blockchain_connected ? "#10b981" : "#f59e0b"
            }} />
            <span>Hardhat Ethereum Node: <strong>{systemStatus?.blockchain_connected ? "CONNECTED (:8545)" : "OFFLINE"}</strong></span>
          </div>

          <div style={statusItem}>
            <span>Admin Authority: <strong>Ms. Tanzila Nargis (Commissioner Account #0)</strong></span>
          </div>

          <div style={statusItem}>
            <span>Enrolled Biometric Templates: <strong>{systemStatus?.templates_count ?? 0}</strong></span>
          </div>

          <div style={statusItem}>
            <span style={portPill}>PORT: 3001</span>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <main style={mainContent}>
        {apiError && !systemStatus?.blockchain_connected && (
          <div style={warningNotice}>
            <strong>Notice:</strong> Local Ethereum Hardhat node is starting or offline. Ensure the blockchain service is running.
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
          {activeTab === "enrollment" && (
            <VoterEnrollment
              onEnrollSuccess={refreshAllData}
              accounts={accounts}
              preselectedStudent={selectedStudent}
              onSwitchToVote={() => window.open("http://localhost:3000", "_blank")}
            />
          )}

          {activeTab === "lifecycle" && (
            <ElectionControl
              onElectionChanged={refreshAllData}
            />
          )}

          {activeTab === "roster" && (
            <StudentRoster
              refreshTrigger={refreshTrigger}
              onSelectStudent={(student) => {
                setSelectedStudent(student);
                setActiveTab("enrollment");
              }}
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

          {activeTab === "analytics" && (
            <ElectionAnalyticsDashboard />
          )}

          {activeTab === "audit" && (
            <ElectionAuditDashboard />
          )}

          {activeTab === "security" && (
            <SecurityMonitoringDashboard />
          )}

          {activeTab === "explorer" && (
            <AuditExplorer />
          )}

          {activeTab === "voter_portal" && (
            <VoterPortalDashboard
              currentUser={currentUser}
              onSwitchToBooth={() => window.open("http://localhost:3000", "_blank")}
            />
          )}

          {activeTab === "biometrics" && (
            <BiometricEvaluationDashboard />
          )}
        </div>

        <RoleLoginModal
          isOpen={authModalOpen}
          onClose={() => setAuthModalOpen(false)}
          onLoginSuccess={handleLoginSuccess}
          currentRole={currentRole}
        />
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

const appContainer = { minHeight: "100vh", display: "flex", flexDirection: "column", background: "#060913" };

const topBar = {
  background: "#0a1128",
  borderBottom: "1px solid #1e293b",
  padding: "1rem 2rem"
};

const topBarInner = {
  maxWidth: "1350px",
  margin: "0 auto",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  flexWrap: "wrap",
  gap: "1rem"
};

const brandBadge = { display: "flex", alignItems: "center", gap: "12px" };
const instTitle = { fontSize: "0.85rem", fontWeight: 800, color: "#f8fafc", letterSpacing: "0.5px" };
const deptTitle = { fontSize: "0.7rem", color: "#38bdf8", fontWeight: 600 };

const projectTitleBlock = { textAlign: "right" };
const adminBadge = { fontSize: "0.72rem", color: "#fbbf24", fontWeight: 700, letterSpacing: "0.5px" };
const mainTitle = { margin: 0, fontSize: "1.25rem", color: "#38bdf8", fontWeight: 800, letterSpacing: "0.5px" };

const boothLinkBtn = {
  background: "#059669",
  color: "#fff",
  padding: "8px 14px",
  borderRadius: "8px",
  fontSize: "0.8rem",
  fontWeight: "bold",
  textDecoration: "none",
  display: "flex",
  alignItems: "center",
  boxShadow: "0 4px 12px rgba(5, 150, 105, 0.3)"
};

const statusBar = {
  background: "#020617",
  borderBottom: "1px solid #1e293b",
  padding: "8px 2rem",
  fontSize: "0.78rem",
  color: "#cbd5e1"
};

const statusBarInner = {
  maxWidth: "1350px",
  margin: "0 auto",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  flexWrap: "wrap",
  gap: "1rem"
};

const statusItem = { display: "flex", alignItems: "center", gap: "6px" };
const statusDot = { width: "8px", height: "8px", borderRadius: "50%", display: "inline-block" };
const portPill = { background: "#1e293b", color: "#38bdf8", border: "1px solid #38bdf8", padding: "2px 8px", borderRadius: "10px", fontWeight: "bold" };

const mainContent = {
  maxWidth: "1350px",
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
  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
  gap: "8px"
};

const tabBtn = {
  padding: "10px 14px",
  border: "1px solid",
  borderRadius: "8px",
  cursor: "pointer",
  textAlign: "left",
  transition: "all 0.2s"
};

const tabTitle = { fontSize: "0.88rem", fontWeight: 700 };
const tabDesc = { fontSize: "0.68rem", opacity: 0.8, marginTop: "2px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };

const footerStyle = {
  background: "#0a1128",
  borderTop: "1px solid #1e293b",
  padding: "1.2rem 2rem",
  textAlign: "center",
  fontSize: "0.8rem",
  color: "#94a3b8"
};

const switchRoleBtn = {
  background: "#0284c7",
  color: "#fff",
  border: "none",
  borderRadius: "5px",
  padding: "0.32rem 0.65rem",
  fontSize: "0.75rem",
  fontWeight: "700",
  cursor: "pointer"
};

const logoutBtn = {
  background: "#334155",
  color: "#f87171",
  border: "1px solid #475569",
  borderRadius: "5px",
  padding: "0.32rem 0.65rem",
  fontSize: "0.75rem",
  fontWeight: "700",
  cursor: "pointer"
};
