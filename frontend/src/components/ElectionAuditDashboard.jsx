import React, { useState, useEffect } from 'react';

const API_BASE = "http://127.0.0.1:5000";

export default function ElectionAuditDashboard() {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [simulationNote, setSimulationNote] = useState("");
  const [error, setError] = useState("");

  const fetchAudit = async (endpoint = "/api/audit/latest") => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}${endpoint}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load audit report");
      setReport(data);
      setSimulationNote("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const runFreshAudit = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/api/audit/run`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to execute fresh audit");
      setReport(data);
      setSimulationNote("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const runTamperSimulation = async () => {
    setSimulating(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/api/audit/simulate-tamper`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidate_id: 1, tampered_offset: 5 })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Simulation failed");
      setReport(data.audit_report);
      setSimulationNote(
        "🧪 EXHIBITION SIMULATION ACTIVE: Injected simulated +5 off-chain vote discrepancy for Candidate #1. Real blockchain and SQLite data were NOT altered."
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setSimulating(false);
    }
  };

  useEffect(() => {
    fetchAudit();
  }, []);

  const overallStatus = report?.overall_status || "UNKNOWN";
  const isTamperFree = report?.is_tamper_free ?? false;

  const getStatusBadge = (status) => {
    switch (status) {
      case "PASS":
        return <span style={badgePass}>✓ PASS</span>;
      case "FAIL":
        return <span style={badgeFail}>✗ FAIL</span>;
      case "WARNING":
        return <span style={badgeWarn}>⚠ WARNING</span>;
      default:
        return <span style={badgeNeutral}>{status}</span>;
    }
  };

  return (
    <div style={containerStyle}>
      {/* Header and Controls */}
      <div style={headerCard}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
          <div>
            <div style={tagline}>CYBERSECURITY & AUDIT SUBSYSTEM &bull; NMAMIT ISE</div>
            <h2 style={titleStyle}>🔍 Blockchain Audit & Automatic Tamper Detection</h2>
            <p style={subtitleStyle}>
              Cryptographic Cross-Reconciliation of On-Chain Storage, Mined Receipts, Event Logs & Off-Chain Database
            </p>
          </div>

          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={runFreshAudit}
              disabled={loading || simulating}
              style={primaryBtn}
            >
              {loading ? "Auditing Node..." : "🔄 Run Blockchain Audit"}
            </button>

            <button
              type="button"
              onClick={runTamperSimulation}
              disabled={loading || simulating}
              style={simulationBtn}
              title="Demonstrates instant discrepancy detection for examiners without altering real data"
            >
              {simulating ? "Injecting..." : "🧪 Test Tamper Detection (Demo)"}
            </button>

            <a
              href={`${API_BASE}/api/audit/export/csv`}
              download
              style={exportBtn}
            >
              📥 Export CSV
            </a>
          </div>
        </div>

        {/* Exhibition Simulation Notice Banner */}
        {simulationNote && (
          <div style={simBannerStyle}>
            <span>{simulationNote}</span>
            <button
              type="button"
              onClick={runFreshAudit}
              style={simResetBtn}
            >
              Reset to Authoritative State
            </button>
          </div>
        )}

        {/* Global Error Banner */}
        {error && (
          <div style={errorBanner}>
            ⚠️ {error}
          </div>
        )}

        {/* Overall Status Banner */}
        {report && (
          <div style={{
            ...statusBanner,
            background: isTamperFree ? "rgba(16, 185, 129, 0.15)" : "rgba(239, 68, 68, 0.15)",
            borderColor: isTamperFree ? "#10b981" : "#ef4444"
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
              <span style={{ fontSize: "2.4rem" }}>
                {isTamperFree ? "🛡️" : "🚨"}
              </span>
              <div>
                <div style={{ fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "1px", color: isTamperFree ? "#6ee7b7" : "#fca5a5" }}>
                  System Audit Integrity Verification
                </div>
                <div style={{ fontSize: "1.6rem", fontWeight: "bold", color: isTamperFree ? "#34d399" : "#f87171" }}>
                  {overallStatus === "VERIFIED" ? "SYSTEM VERIFIED — CRYPTOGRAPHICALLY TAMPER-FREE" : overallStatus}
                </div>
                <div style={{ fontSize: "0.85rem", color: "#94a3b8", marginTop: "2px" }}>
                  Audited at {report.audit_timestamp} (UTC) &bull; Target Contract: {report.contract_address}
                </div>
              </div>
            </div>

            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: "0.8rem", color: "#94a3b8" }}>BLOCK RANGE AUDITED</div>
              <div style={{ fontSize: "1.2rem", fontWeight: "bold", color: "#f8fafc" }}>
                Blocks {report.block_range_checked}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Metrics Row */}
      {report && (
        <div style={metricsGrid}>
          <div style={metricCard}>
            <div style={metricLabel}>Authoritative On-Chain Votes</div>
            <div style={metricValue}>{report.total_votes_onchain ?? 0}</div>
            <div style={metricSub}>Direct from contract storage</div>
          </div>

          <div style={metricCard}>
            <div style={metricLabel}>Event-Reconstructed Votes</div>
            <div style={metricValue}>{report.total_votes_events ?? 0}</div>
            <div style={metricSub}>Sum of verified VoteCasted events</div>
          </div>

          <div style={metricCard}>
            <div style={metricLabel}>Transactions Confirmed</div>
            <div style={{ ...metricValue, color: "#10b981" }}>
              {report.confirmed_transactions ?? 0} / {report.total_transactions_audited ?? 0}
            </div>
            <div style={metricSub}>Status = 1 (Successful EVM execution)</div>
          </div>

          <div style={metricCard}>
            <div style={metricLabel}>Total Discrepancies</div>
            <div style={{
              ...metricValue,
              color: report.discrepancies?.length === 0 ? "#10b981" : "#ef4444"
            }}>
              {report.discrepancies?.length ?? 0}
            </div>
            <div style={metricSub}>
              {report.discrepancies?.length === 0 ? "Zero anomalies detected" : "Immediate action required"}
            </div>
          </div>
        </div>
      )}

      {/* Detected Discrepancies Alerts */}
      {report?.discrepancies?.length > 0 && (
        <div style={discrepancyBox}>
          <h3 style={{ margin: "0 0 0.5rem 0", color: "#fca5a5", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span>⚠️</span> Active Discrepancy & Tamper Alerts ({report.discrepancies.length})
          </h3>
          <ul style={{ margin: 0, paddingLeft: "1.25rem", color: "#fecaca", fontSize: "0.95rem" }}>
            {report.discrepancies.map((d, idx) => (
              <li key={idx} style={{ marginBottom: "0.35rem" }}>{d}</li>
            ))}
          </ul>
        </div>
      )}

      {/* 3-Way Candidate Reconciliation Table */}
      <div style={sectionCard}>
        <div style={sectionHeader}>
          <h3 style={sectionTitle}>📊 3-Way Candidate Vote Count Reconciliation</h3>
          <span style={sectionDesc}>
            Compares Smart Contract Storage vs. Off-Chain Displayed Count vs. Immutable Event Logs
          </span>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={tableStyle}>
            <thead>
              <tr style={tableHeadRow}>
                <th style={thStyle}>ID</th>
                <th style={thStyle}>Candidate Name</th>
                <th style={{ ...thStyle, textAlign: "center" }}>On-Chain Storage</th>
                <th style={{ ...thStyle, textAlign: "center" }}>Displayed / DB Count</th>
                <th style={{ ...thStyle, textAlign: "center" }}>Reconstructed Events</th>
                <th style={{ ...thStyle, textAlign: "center" }}>Reconciliation Status</th>
                <th style={thStyle}>Discrepancy Note</th>
              </tr>
            </thead>
            <tbody>
              {report?.candidates_audit?.map((cand) => (
                <tr
                  key={cand.candidate_id}
                  style={{
                    ...tableRowStyle,
                    background: cand.matches ? "transparent" : "rgba(239, 68, 68, 0.12)"
                  }}
                >
                  <td style={{ ...tdStyle, fontWeight: "bold" }}>#{cand.candidate_id}</td>
                  <td style={{ ...tdStyle, color: "#f8fafc" }}>{cand.name}</td>
                  <td style={{ ...tdStyle, textAlign: "center", fontWeight: "bold", color: "#38bdf8" }}>
                    {cand.onchain_votes}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "center", color: cand.matches ? "#94a3b8" : "#f87171", fontWeight: cand.matches ? "normal" : "bold" }}>
                    {cand.displayed_votes}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "center", color: "#6ee7b7" }}>
                    {cand.event_reconstructed_votes ?? 0}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "center" }}>
                    {cand.matches ? (
                      <span style={badgePass}>✓ VERIFIED</span>
                    ) : (
                      <span style={badgeFail}>✗ MISMATCH</span>
                    )}
                  </td>
                  <td style={{ ...tdStyle, fontSize: "0.85rem", color: cand.matches ? "#64748b" : "#fca5a5" }}>
                    {cand.discrepancy || "Clean (Exact Match)"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* System Integrity Checks Matrix */}
      <div style={sectionCard}>
        <div style={sectionHeader}>
          <h3 style={sectionTitle}>🛡️ System Cryptographic Integrity Checks</h3>
          <span style={sectionDesc}>Automated rule verification against EVM execution state</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {report?.checks?.map((chk) => (
            <div key={chk.id} style={checkCard}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontWeight: "bold", color: "#f8fafc", fontSize: "1rem" }}>
                  {chk.name}
                </span>
                {getStatusBadge(chk.status)}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginTop: "0.5rem", fontSize: "0.85rem" }}>
                <div>
                  <span style={{ color: "#94a3b8" }}>Expected: </span>
                  <span style={{ color: "#cbd5e1" }}>{chk.expected}</span>
                </div>
                <div>
                  <span style={{ color: "#94a3b8" }}>Actual: </span>
                  <span style={{ color: chk.status === "PASS" ? "#34d399" : "#f87171" }}>{chk.actual}</span>
                </div>
              </div>

              <div style={{ fontSize: "0.8rem", color: "#64748b", marginTop: "0.35rem", fontStyle: "italic" }}>
                {chk.explanation}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Transaction Receipt Audit Ledger */}
      <div style={sectionCard}>
        <div style={sectionHeader}>
          <h3 style={sectionTitle}>⛓️ Transaction Receipt Cryptographic Ledger</h3>
          <span style={sectionDesc}>Validates Ethereum EVM receipt status (status=1) for all cast ballots</span>
        </div>

        {report?.transactions_audit?.length === 0 ? (
          <div style={emptyBox}>
            No vote transactions found on the ledger yet. Cast ballots to populate the transaction audit trail.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={tableStyle}>
              <thead>
                <tr style={tableHeadRow}>
                  <th style={thStyle}>Transaction Hash</th>
                  <th style={thStyle}>Voter Wallet</th>
                  <th style={thStyle}>Candidate</th>
                  <th style={{ ...thStyle, textAlign: "center" }}>Block Height</th>
                  <th style={{ ...thStyle, textAlign: "center" }}>Gas Used</th>
                  <th style={{ ...thStyle, textAlign: "center" }}>Receipt Status</th>
                </tr>
              </thead>
              <tbody>
                {report?.transactions_audit?.map((tx, idx) => (
                  <tr key={idx} style={tableRowStyle}>
                    <td style={{ ...tdStyle, fontFamily: "monospace", color: "#38bdf8", fontSize: "0.85rem" }}>
                      {tx.tx_hash ? `${tx.tx_hash.slice(0, 14)}...${tx.tx_hash.slice(-10)}` : "N/A"}
                    </td>
                    <td style={{ ...tdStyle, fontFamily: "monospace", color: "#94a3b8", fontSize: "0.85rem" }}>
                      {tx.voter ? `${tx.voter.slice(0, 10)}...${tx.voter.slice(-6)}` : "Unknown"}
                    </td>
                    <td style={{ ...tdStyle, color: "#f8fafc" }}>
                      {tx.candidate_name || `Candidate #${tx.candidate_id}`}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "center", color: "#cbd5e1" }}>
                      #{tx.block_number ?? "Pending"}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "center", color: "#94a3b8" }}>
                      {tx.gas_used ? Number(tx.gas_used).toLocaleString() : "—"}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "center" }}>
                      {tx.status === "CONFIRMED" ? (
                        <span style={badgePass}>✓ MINED (SUCCESS)</span>
                      ) : tx.status === "FAILED" ? (
                        <span style={badgeFail}>✗ REVERTED (0)</span>
                      ) : (
                        <span style={badgeWarn}>⚠ {tx.status}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Audit Scope and Limitations */}
      <div style={footerCard}>
        <div style={{ fontWeight: "bold", color: "#94a3b8", marginBottom: "0.35rem", fontSize: "0.9rem" }}>
          ℹ️ AUDIT METHODOLOGY & LOCAL HARDHAT LIMITATIONS
        </div>
        <ul style={{ margin: 0, paddingLeft: "1.25rem", color: "#64748b", fontSize: "0.85rem", lineHeight: "1.5" }}>
          {report?.limitations?.map((lim, idx) => (
            <li key={idx}>{lim}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const containerStyle = {
  display: "flex",
  flexDirection: "column",
  gap: "1.5rem"
};

const headerCard = {
  background: "#1e293b",
  border: "1px solid #334155",
  borderRadius: "12px",
  padding: "1.5rem"
};

const tagline = {
  fontSize: "0.75rem",
  fontWeight: "bold",
  color: "#38bdf8",
  letterSpacing: "1px",
  marginBottom: "0.25rem"
};

const titleStyle = {
  fontSize: "1.5rem",
  fontWeight: "bold",
  color: "#f8fafc",
  margin: "0 0 0.35rem 0"
};

const subtitleStyle = {
  fontSize: "0.9rem",
  color: "#94a3b8",
  margin: 0
};

const primaryBtn = {
  background: "#0284c7",
  color: "#fff",
  border: "none",
  borderRadius: "8px",
  padding: "0.6rem 1.1rem",
  fontSize: "0.9rem",
  fontWeight: "600",
  cursor: "pointer"
};

const simulationBtn = {
  background: "#7c3aed",
  color: "#fff",
  border: "none",
  borderRadius: "8px",
  padding: "0.6rem 1.1rem",
  fontSize: "0.9rem",
  fontWeight: "600",
  cursor: "pointer"
};

const exportBtn = {
  background: "#334155",
  color: "#e2e8f0",
  border: "1px solid #475569",
  borderRadius: "8px",
  padding: "0.6rem 1rem",
  fontSize: "0.9rem",
  fontWeight: "600",
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center"
};

const simBannerStyle = {
  marginTop: "1rem",
  background: "rgba(124, 58, 237, 0.2)",
  border: "1px solid #8b5cf6",
  color: "#ddd6fe",
  borderRadius: "8px",
  padding: "0.75rem 1rem",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  fontSize: "0.9rem"
};

const simResetBtn = {
  background: "#6d28d9",
  color: "#fff",
  border: "none",
  borderRadius: "6px",
  padding: "0.35rem 0.75rem",
  fontSize: "0.8rem",
  cursor: "pointer",
  fontWeight: "600"
};

const errorBanner = {
  marginTop: "1rem",
  background: "rgba(239, 68, 68, 0.15)",
  border: "1px solid #ef4444",
  color: "#fca5a5",
  padding: "0.75rem 1rem",
  borderRadius: "8px",
  fontSize: "0.9rem"
};

const statusBanner = {
  marginTop: "1.25rem",
  border: "1px solid",
  borderRadius: "10px",
  padding: "1.25rem 1.5rem",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  flexWrap: "wrap",
  gap: "1rem"
};

const metricsGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "1rem"
};

const metricCard = {
  background: "#1e293b",
  border: "1px solid #334155",
  borderRadius: "10px",
  padding: "1.25rem"
};

const metricLabel = {
  fontSize: "0.8rem",
  color: "#94a3b8",
  textTransform: "uppercase",
  letterSpacing: "0.5px"
};

const metricValue = {
  fontSize: "1.8rem",
  fontWeight: "bold",
  color: "#f8fafc",
  margin: "0.35rem 0"
};

const metricSub = {
  fontSize: "0.75rem",
  color: "#64748b"
};

const discrepancyBox = {
  background: "rgba(239, 68, 68, 0.1)",
  border: "1px solid #ef4444",
  borderRadius: "10px",
  padding: "1rem 1.25rem"
};

const sectionCard = {
  background: "#1e293b",
  border: "1px solid #334155",
  borderRadius: "12px",
  padding: "1.25rem"
};

const sectionHeader = {
  marginBottom: "1rem"
};

const sectionTitle = {
  fontSize: "1.15rem",
  fontWeight: "bold",
  color: "#f8fafc",
  margin: "0 0 0.25rem 0"
};

const sectionDesc = {
  fontSize: "0.85rem",
  color: "#94a3b8"
};

const tableStyle = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: "0.9rem"
};

const tableHeadRow = {
  borderBottom: "1px solid #334155",
  background: "#0f172a"
};

const thStyle = {
  padding: "0.75rem 1rem",
  textAlign: "left",
  color: "#94a3b8",
  fontWeight: "600",
  fontSize: "0.8rem",
  textTransform: "uppercase",
  letterSpacing: "0.5px"
};

const tableRowStyle = {
  borderBottom: "1px solid #334155"
};

const tdStyle = {
  padding: "0.75rem 1rem"
};

const checkCard = {
  background: "#0f172a",
  border: "1px solid #334155",
  borderRadius: "8px",
  padding: "0.85rem 1rem"
};

const badgePass = {
  display: "inline-block",
  padding: "0.2rem 0.55rem",
  borderRadius: "4px",
  fontSize: "0.75rem",
  fontWeight: "bold",
  background: "#064e3b",
  color: "#6ee7b7",
  border: "1px solid #10b981"
};

const badgeFail = {
  display: "inline-block",
  padding: "0.2rem 0.55rem",
  borderRadius: "4px",
  fontSize: "0.75rem",
  fontWeight: "bold",
  background: "#7f1d1d",
  color: "#fca5a5",
  border: "1px solid #ef4444"
};

const badgeWarn = {
  display: "inline-block",
  padding: "0.2rem 0.55rem",
  borderRadius: "4px",
  fontSize: "0.75rem",
  fontWeight: "bold",
  background: "#78350f",
  color: "#fcd34d",
  border: "1px solid #f59e0b"
};

const badgeNeutral = {
  display: "inline-block",
  padding: "0.2rem 0.55rem",
  borderRadius: "4px",
  fontSize: "0.75rem",
  fontWeight: "bold",
  background: "#334155",
  color: "#cbd5e1"
};

const emptyBox = {
  padding: "1.5rem",
  textAlign: "center",
  color: "#64748b",
  fontSize: "0.9rem"
};

const footerCard = {
  background: "#0f172a",
  border: "1px solid #334155",
  borderRadius: "10px",
  padding: "1rem 1.25rem"
};
