import React, { useState, useEffect } from 'react';

const API_BASE = "http://127.0.0.1:5000";

export default function ElectionAnalyticsDashboard() {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(false);

  // Filters
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [selectedCandidateId, setSelectedCandidateId] = useState("");

  const fetchAnalytics = async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (startDate) params.append("start_date", startDate);
      if (endDate) params.append("end_date", endDate);
      if (selectedCandidateId) params.append("candidate_id", selectedCandidateId);

      const res = await fetch(`${API_BASE}/api/analytics/overview?${params.toString()}`);
      let data = null;
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        data = await res.json();
      }
      if (!res.ok) {
        throw new Error((data && data.error) || `Backend API returned status ${res.status}. Please restart backend service.`);
      }
      if (!data) {
        throw new Error("Invalid non-JSON response received from server.");
      }
      setAnalytics(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, [startDate, endDate, selectedCandidateId]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchAnalytics, 6000);
    return () => clearInterval(interval);
  }, [autoRefresh, startDate, endDate, selectedCandidateId]);

  const handleClearFilters = () => {
    setStartDate("");
    setEndDate("");
    setSelectedCandidateId("");
  };

  const getStatusColor = (status) => {
    switch (status) {
      case "Active":
        return { bg: "#064e3b", text: "#6ee7b7", border: "#059669" };
      case "Completed":
        return { bg: "#1e1b4b", text: "#a5b4fc", border: "#4338ca" };
      case "Scheduled":
        return { bg: "#422006", text: "#fcd34d", border: "#f59e0b" };
      case "Not Started":
      default:
        return { bg: "#1e293b", text: "#94a3b8", border: "#475569" };
    }
  };

  const ov = analytics?.overview || {};
  const standings = analytics?.standings || {};
  const candidates = standings.candidates || [];
  const leader = standings.leader;
  const hasTie = standings.has_tie;
  const integ = analytics?.integrity || {};
  const sec = analytics?.security_correlation || {};
  const activity = analytics?.temporal_activity || [];

  const maxVotes = Math.max(...candidates.map(c => c.onchain_votes || 0), 1);
  const statusBadge = getStatusColor(ov.election_status);

  // URL query string for exports
  const exportQuery = new URLSearchParams();
  if (startDate) exportQuery.append("start_date", startDate);
  if (endDate) exportQuery.append("end_date", endDate);
  if (selectedCandidateId) exportQuery.append("candidate_id", selectedCandidateId);
  const exportQueryStr = exportQuery.toString() ? `?${exportQuery.toString()}` : "";

  return (
    <div style={containerStyle}>
      {/* Header & Export Bar */}
      <div style={headerCard}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
          <div>
            <div style={badgeStyle}>📈 IMPLEMENTATION 7: ELECTION ANALYTICS & RESULTS</div>
            <h2 style={titleStyle}>Election Analytics & Results Dashboard</h2>
            <p style={subtitleStyle}>
              Turnout tracking, smart contract candidate standings, tie-breaker detection, and forensic temporal participation trends.
            </p>
          </div>

          <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap", alignItems: "center" }}>
            <label style={autoRefreshLabel}>
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                style={{ marginRight: "6px" }}
              />
              Auto-refresh (6s)
            </label>

            <button
              onClick={fetchAnalytics}
              disabled={loading}
              style={refreshBtn}
            >
              {loading ? "⏳ Updating..." : "🔄 Refresh"}
            </button>

            <a
              href={`${API_BASE}/api/analytics/export/csv${exportQueryStr}`}
              download
              style={exportBtn}
            >
              📥 Export CSV
            </a>

            <a
              href={`${API_BASE}/api/analytics/export/json${exportQueryStr}`}
              download
              style={exportBtn}
            >
              📥 Export JSON
            </a>
          </div>
        </div>

        {error && (
          <div style={errorAlert}>
            ⚠️ {error}
          </div>
        )}
      </div>

      {/* Integrity & Blockchain Status Notification */}
      {integ.has_discrepancy ? (
        <div style={warningBanner}>
          <span style={{ fontSize: "1.4rem" }}>⚠️</span>
          <div>
            <strong>DISCREPANCY DETECTED BETWEEN SMART CONTRACT AND DATABASE</strong>
            <div style={{ fontSize: "0.85rem", marginTop: "3px" }}>
              {integ.audit_notice} Authoritative on-chain counts are prioritized.
            </div>
          </div>
        </div>
      ) : integ.blockchain_connected ? (
        <div style={verifiedBanner}>
          <span style={{ fontSize: "1.3rem" }}>🛡️</span>
          <div>
            <strong style={{ color: "#34d399" }}>CRYPTOGRAPHICALLY SYNCHRONIZED WITH ETHEREUM SMART CONTRACT</strong>
            <div style={{ fontSize: "0.82rem", color: "#94a3b8", marginTop: "2px" }}>
              Authoritative Source: <code>{integ.contract_address}</code> ({integ.network}) &bull; Status: {integ.data_freshness}
            </div>
          </div>
        </div>
      ) : (
        <div style={warningBanner}>
          <span style={{ fontSize: "1.3rem" }}>⚠️</span>
          <div>
            <strong>BLOCKCHAIN NODE OFFLINE</strong>
            <div style={{ fontSize: "0.85rem", marginTop: "2px" }}>
              Displaying cached off-chain records. Reconnect Hardhat node to resume live blockchain synchronization.
            </div>
          </div>
        </div>
      )}

      {/* Winner / Tie Alert Banner */}
      {hasTie ? (
        <div style={tieBanner}>
          <span style={{ fontSize: "1.5rem" }}>🤝</span>
          <div>
            <strong style={{ fontSize: "1.05rem", color: "#fcd34d" }}>TIE DETECTED FOR 1ST PLACE</strong>
            <div style={{ fontSize: "0.85rem", color: "#fef08a", marginTop: "2px" }}>
              Contenders ({standings.tied_candidates?.join(" and ")}) are currently tied with {standings.candidates[0]?.onchain_votes} votes each.
            </div>
          </div>
        </div>
      ) : leader ? (
        <div style={winnerBanner}>
          <span style={{ fontSize: "1.5rem" }}>🏆</span>
          <div>
            <strong style={{ fontSize: "1.05rem", color: "#6ee7b7" }}>CURRENT PROJECTED WINNER: {leader.name}</strong>
            <div style={{ fontSize: "0.85rem", color: "#a7f3d0", marginTop: "2px" }}>
              Leading with {leader.onchain_votes} on-chain votes ({leader.percentage}% of all valid ballots cast).
            </div>
          </div>
        </div>
      ) : (
        <div style={neutralBanner}>
          <span style={{ fontSize: "1.3rem" }}>🗳️</span>
          <div>
            <strong style={{ color: "#cbd5e1" }}>NO BALLOTS CAST YET</strong>
            <div style={{ fontSize: "0.85rem", color: "#94a3b8", marginTop: "2px" }}>
              Standings will populate in real time as eligible voters cast authenticated ballots.
            </div>
          </div>
        </div>
      )}

      {/* Overview Metrics Cards */}
      <div style={metricGrid}>
        <div style={metricCard}>
          <div style={metricLabel}>ELECTION LIFECYCLE STATUS</div>
          <div style={{ marginTop: "0.3rem" }}>
            <span style={{
              display: "inline-block",
              padding: "0.3rem 0.8rem",
              borderRadius: "6px",
              fontWeight: "700",
              fontSize: "1.1rem",
              backgroundColor: statusBadge.bg,
              color: statusBadge.text,
              border: `1px solid ${statusBadge.border}`
            }}>
              {ov.election_status || "Not Started"}
            </span>
          </div>
          <div style={metricSub}>On-chain timing state</div>
        </div>

        <div style={metricCard}>
          <div style={metricLabel}>VOTER TURNOUT RATE</div>
          <div style={{ ...metricValue, color: "#38bdf8" }}>
            {ov.turnout_percentage ?? 0}%
          </div>
          <div style={metricSub}>{ov.total_votes_cast ?? 0} of {ov.total_registered_voters ?? 0} enrolled</div>
        </div>

        <div style={metricCard}>
          <div style={metricLabel}>TOTAL REGISTERED VOTERS</div>
          <div style={{ ...metricValue, color: "#a78bfa" }}>
            {ov.total_registered_voters ?? 0}
          </div>
          <div style={metricSub}>Enrolled biometric templates</div>
        </div>

        <div style={metricCard}>
          <div style={metricLabel}>TOTAL BALLOTS CAST</div>
          <div style={{ ...metricValue, color: "#34d399" }}>
            {ov.total_votes_cast ?? 0}
          </div>
          <div style={metricSub}>Authoritative blockchain tally</div>
        </div>

        <div style={metricCard}>
          <div style={metricLabel}>REMAINING ELIGIBLE VOTERS</div>
          <div style={{ ...metricValue, color: "#f59e0b" }}>
            {ov.remaining_eligible_voters ?? 0}
          </div>
          <div style={metricSub}>Awaiting ballot submission</div>
        </div>

        <div style={metricCard}>
          <div style={metricLabel}>CONTESTING CANDIDATES</div>
          <div style={{ ...metricValue, color: "#f472b6" }}>
            {ov.candidate_count ?? 0}
          </div>
          <div style={metricSub}>Official electoral ballot</div>
        </div>
      </div>

      {/* Interactive Filters Bar */}
      <div style={filterCard}>
        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ flex: "1 1 200px" }}>
            <label style={filterLabel}>Filter by Candidate</label>
            <select
              value={selectedCandidateId}
              onChange={(e) => setSelectedCandidateId(e.target.value)}
              style={selectStyle}
            >
              <option value="">All Candidates</option>
              {candidates.map(c => (
                <option key={c.id} value={c.id}>
                  #{c.id} {c.name}
                </option>
              ))}
            </select>
          </div>

          <div style={{ flex: "1 1 180px" }}>
            <label style={filterLabel}>From Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              style={inputStyle}
            />
          </div>

          <div style={{ flex: "1 1 180px" }}>
            <label style={filterLabel}>To Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              style={inputStyle}
            />
          </div>

          {(startDate || endDate || selectedCandidateId) && (
            <button
              onClick={handleClearFilters}
              style={clearBtn}
            >
              ✕ Clear Filters
            </button>
          )}
        </div>
      </div>

      {/* Candidate Standings & Visual Bar Chart */}
      <div style={sectionCard}>
        <h3 style={sectionHeading}>
          📊 Official Candidate Standings & Vote Distribution
        </h3>
        <p style={{ margin: "0.2rem 0 1.2rem 0", color: "#94a3b8", fontSize: "0.85rem" }}>
          Vote totals are verified directly against the smart contract storage layout.
        </p>

        {candidates.length === 0 ? (
          <div style={emptyBox}>No candidate results available for current filter selection.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
            {candidates.map((c) => {
              const barWidth = maxVotes > 0 ? (c.onchain_votes / maxVotes) * 100 : 0;
              const isFirst = c.rank === 1 && c.onchain_votes > 0;
              const isTied = c.is_tied;

              return (
                <div key={c.id} style={candidateCard}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem", flexWrap: "wrap", gap: "0.4rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                      <span style={{
                        padding: "0.2rem 0.55rem",
                        borderRadius: "4px",
                        fontSize: "0.75rem",
                        fontWeight: "800",
                        backgroundColor: isTied ? "#422006" : (isFirst ? "#064e3b" : "#1e293b"),
                        color: isTied ? "#fcd34d" : (isFirst ? "#6ee7b7" : "#94a3b8"),
                        border: `1px solid ${isTied ? "#f59e0b" : (isFirst ? "#059669" : "#334155")}`
                      }}>
                        {c.standing_label}
                      </span>
                      <span style={{ fontWeight: "700", color: "#f8fafc", fontSize: "0.95rem" }}>
                        #{c.id} {c.name}
                      </span>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                      <span style={{ fontSize: "1.1rem", fontWeight: "800", color: isFirst ? "#38bdf8" : "#f8fafc" }}>
                        {c.onchain_votes} <span style={{ fontSize: "0.75rem", fontWeight: "600", color: "#94a3b8" }}>votes</span>
                      </span>
                      <span style={{ fontSize: "0.85rem", fontWeight: "700", color: "#38bdf8", minWidth: "48px", textAlign: "right" }}>
                        {c.percentage}%
                      </span>
                    </div>
                  </div>

                  {/* Visual Progress Bar */}
                  <div style={barBackground}>
                    <div style={{
                      ...barFill,
                      width: `${Math.max(barWidth, c.onchain_votes > 0 ? 3 : 0)}%`,
                      backgroundColor: isTied ? "#f59e0b" : (isFirst ? "#0284c7" : "#3b82f6")
                    }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Temporal Voting Activity & Security Correlation Grid */}
      <div style={twoColGrid}>
        {/* Voting Activity Over Time */}
        <div style={sectionCard}>
          <h3 style={sectionHeading}>⏱️ Voting Activity Over Time</h3>
          <p style={{ margin: "0.2rem 0 1rem 0", color: "#94a3b8", fontSize: "0.85rem" }}>
            Real-time hourly breakdown of cast ballots recorded on ledger.
          </p>

          {activity.length === 0 ? (
            <div style={emptyBox}>
              No voting activity logged within the selected timeframe.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
              {activity.map((act, idx) => (
                <div key={idx} style={activityRow}>
                  <div style={{ fontFamily: "monospace", fontSize: "0.82rem", color: "#cbd5e1" }}>
                    {act.time_bucket}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <span style={{ fontWeight: "700", color: "#34d399", fontSize: "0.95rem" }}>
                      +{act.ballots_count}
                    </span>
                    <span style={{ fontSize: "0.75rem", color: "#64748b" }}>ballots</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Security & Biometric Operational Correlation */}
        <div style={sectionCard}>
          <h3 style={sectionHeading}>🛡️ Security & Biometric Analytics</h3>
          <p style={{ margin: "0.2rem 0 1rem 0", color: "#94a3b8", fontSize: "0.85rem" }}>
            Biometric verification accuracy and security barrier triggers.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <div style={secItem}>
              <span style={secLabel}>Biometric Verification Success Rate</span>
              <span style={{ fontWeight: "800", color: "#38bdf8", fontSize: "1rem" }}>
                {sec.verification_success_rate ?? 0}%
              </span>
            </div>

            <div style={secItem}>
              <span style={secLabel}>Successful Biometric Matches</span>
              <span style={{ fontWeight: "700", color: "#34d399" }}>
                {sec.biometric_successes ?? 0}
              </span>
            </div>

            <div style={secItem}>
              <span style={secLabel}>Biometric Verification Failures</span>
              <span style={{ fontWeight: "700", color: "#f59e0b" }}>
                {sec.biometric_failures ?? 0}
              </span>
            </div>

            <div style={secItem}>
              <span style={secLabel}>Duplicate Voting Attempts Blocked</span>
              <span style={{ fontWeight: "700", color: "#c084fc" }}>
                {sec.duplicate_voting_attempts ?? 0}
              </span>
            </div>

            <div style={secItem}>
              <span style={secLabel}>Unauthorized Admin Operations Denied</span>
              <span style={{ fontWeight: "700", color: "#fb7185" }}>
                {sec.unauthorized_admin_attempts ?? 0}
              </span>
            </div>

            <div style={secItem}>
              <span style={secLabel}>Blockchain Transaction Failures</span>
              <span style={{ fontWeight: "700", color: "#f43f5e" }}>
                {sec.blockchain_tx_failures ?? 0}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────────────────────────────

const containerStyle = {
  display: "flex",
  flexDirection: "column",
  gap: "1.2rem",
  color: "#f8fafc"
};

const headerCard = {
  background: "#0f172a",
  border: "1px solid #1e293b",
  borderRadius: "12px",
  padding: "1.5rem"
};

const badgeStyle = {
  display: "inline-block",
  background: "#1e1b4b",
  color: "#a5b4fc",
  border: "1px solid #4338ca",
  padding: "0.25rem 0.6rem",
  borderRadius: "4px",
  fontSize: "0.75rem",
  fontWeight: "700",
  letterSpacing: "0.05em",
  marginBottom: "0.5rem"
};

const titleStyle = {
  margin: 0,
  fontSize: "1.5rem",
  fontWeight: "700",
  color: "#f8fafc"
};

const subtitleStyle = {
  margin: "0.3rem 0 0 0",
  fontSize: "0.9rem",
  color: "#94a3b8"
};

const autoRefreshLabel = {
  display: "flex",
  alignItems: "center",
  fontSize: "0.82rem",
  color: "#94a3b8",
  cursor: "pointer",
  marginRight: "0.5rem"
};

const refreshBtn = {
  background: "#0284c7",
  color: "#fff",
  border: "none",
  borderRadius: "6px",
  padding: "0.55rem 1rem",
  fontWeight: "600",
  cursor: "pointer",
  fontSize: "0.85rem"
};

const exportBtn = {
  background: "#1e293b",
  color: "#38bdf8",
  border: "1px solid #0284c7",
  borderRadius: "6px",
  padding: "0.5rem 0.9rem",
  fontWeight: "600",
  textDecoration: "none",
  fontSize: "0.85rem",
  display: "inline-block"
};

const clearBtn = {
  background: "#334155",
  color: "#cbd5e1",
  border: "none",
  borderRadius: "6px",
  padding: "0.5rem 0.9rem",
  fontWeight: "600",
  cursor: "pointer",
  fontSize: "0.85rem"
};

const errorAlert = {
  marginTop: "1rem",
  padding: "0.75rem 1rem",
  borderRadius: "6px",
  background: "#450a0a",
  border: "1px solid #dc2626",
  color: "#fecaca",
  fontSize: "0.85rem"
};

const verifiedBanner = {
  display: "flex",
  alignItems: "center",
  gap: "1rem",
  background: "#064e3b",
  border: "1px solid #059669",
  borderRadius: "10px",
  padding: "1rem 1.25rem"
};

const warningBanner = {
  display: "flex",
  alignItems: "center",
  gap: "1rem",
  background: "#450a0a",
  border: "1px solid #dc2626",
  borderRadius: "10px",
  padding: "1rem 1.25rem",
  color: "#fecaca"
};

const winnerBanner = {
  display: "flex",
  alignItems: "center",
  gap: "1rem",
  background: "#064e3b",
  border: "1px solid #10b981",
  borderRadius: "10px",
  padding: "1rem 1.25rem"
};

const tieBanner = {
  display: "flex",
  alignItems: "center",
  gap: "1rem",
  background: "#422006",
  border: "1px solid #f59e0b",
  borderRadius: "10px",
  padding: "1rem 1.25rem"
};

const neutralBanner = {
  display: "flex",
  alignItems: "center",
  gap: "1rem",
  background: "#0f172a",
  border: "1px solid #334155",
  borderRadius: "10px",
  padding: "1rem 1.25rem"
};

const metricGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: "1rem"
};

const metricCard = {
  background: "#0f172a",
  border: "1px solid #1e293b",
  borderRadius: "10px",
  padding: "1.2rem",
  display: "flex",
  flexDirection: "column",
  gap: "0.3rem"
};

const metricLabel = {
  fontSize: "0.75rem",
  fontWeight: "700",
  color: "#94a3b8",
  letterSpacing: "0.05em"
};

const metricValue = {
  fontSize: "1.8rem",
  fontWeight: "800",
  lineHeight: 1.1
};

const metricSub = {
  fontSize: "0.78rem",
  color: "#64748b"
};

const filterCard = {
  background: "#0f172a",
  border: "1px solid #1e293b",
  borderRadius: "10px",
  padding: "1.2rem"
};

const filterLabel = {
  display: "block",
  fontSize: "0.75rem",
  fontWeight: "600",
  color: "#94a3b8",
  marginBottom: "0.35rem"
};

const selectStyle = {
  width: "100%",
  background: "#1e293b",
  color: "#f8fafc",
  border: "1px solid #334155",
  borderRadius: "6px",
  padding: "0.5rem 0.75rem",
  fontSize: "0.85rem"
};

const inputStyle = {
  width: "100%",
  background: "#1e293b",
  color: "#f8fafc",
  border: "1px solid #334155",
  borderRadius: "6px",
  padding: "0.45rem 0.75rem",
  fontSize: "0.85rem"
};

const sectionCard = {
  background: "#0f172a",
  border: "1px solid #1e293b",
  borderRadius: "10px",
  padding: "1.5rem"
};

const sectionHeading = {
  margin: 0,
  fontSize: "1.15rem",
  fontWeight: "700",
  color: "#f8fafc"
};

const candidateCard = {
  background: "#1e293b",
  border: "1px solid #334155",
  borderRadius: "8px",
  padding: "0.85rem 1rem"
};

const barBackground = {
  height: "10px",
  background: "#0f172a",
  borderRadius: "5px",
  overflow: "hidden"
};

const barFill = {
  height: "100%",
  borderRadius: "5px",
  transition: "width 0.4s ease-in-out"
};

const twoColGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
  gap: "1.2rem"
};

const activityRow = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "0.6rem 0.8rem",
  background: "#1e293b",
  borderRadius: "6px",
  border: "1px solid #334155"
};

const secItem = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "0.65rem 0.85rem",
  background: "#1e293b",
  borderRadius: "6px",
  border: "1px solid #334155"
};

const secLabel = {
  fontSize: "0.85rem",
  color: "#cbd5e1"
};

const emptyBox = {
  padding: "2rem 1rem",
  textAlign: "center",
  color: "#64748b",
  fontSize: "0.85rem",
  background: "#1e293b",
  borderRadius: "6px"
};
