import React, { useState, useEffect } from 'react';

const API_BASE = "http://127.0.0.1:5000";

export default function SecurityMonitoringDashboard() {
  const [summary, setSummary] = useState(null);
  const [events, setEvents] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [actionMsg, setActionMsg] = useState("");

  // Filters
  const [severityFilter, setSeverityFilter] = useState("");
  const [eventTypeFilter, setEventTypeFilter] = useState("");
  const [reviewedFilter, setReviewedFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  // Fetch Summary
  const fetchSummary = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/security/summary`);
      const data = await res.json();
      if (res.ok) setSummary(data);
    } catch (err) {
      console.error("Failed to load security summary:", err);
    }
  };

  // Fetch Events with current filters
  const fetchEvents = async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      params.append("limit", "100");
      params.append("offset", "0");
      if (severityFilter) params.append("severity", severityFilter);
      if (eventTypeFilter) params.append("event_type", eventTypeFilter);
      if (reviewedFilter !== "") params.append("reviewed", reviewedFilter);
      if (searchQuery.trim()) params.append("search", searchQuery.trim());

      const res = await fetch(`${API_BASE}/api/security/events?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to fetch security events");
      setEvents(data.events || []);
      setTotalCount(data.total_count || 0);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const refreshAll = () => {
    fetchSummary();
    fetchEvents();
  };

  useEffect(() => {
    refreshAll();
  }, [severityFilter, eventTypeFilter, reviewedFilter]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchEvents();
  };

  const handleMarkReviewed = async (eventId) => {
    try {
      setActionMsg("");
      const res = await fetch(`${API_BASE}/api/security/events/${eventId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewed_by: "Election Commissioner" })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to mark event reviewed");
      setActionMsg(`Event #${eventId} marked as reviewed.`);
      refreshAll();
      setTimeout(() => setActionMsg(""), 4000);
    } catch (err) {
      setError(err.message);
    }
  };

  const getSeverityBadge = (severity) => {
    switch ((severity || "").toUpperCase()) {
      case "CRITICAL":
        return { bg: "#450a0a", color: "#fca5a5", border: "#ef4444" };
      case "HIGH":
        return { bg: "#3b0764", color: "#f472b6", border: "#f43f5e" };
      case "MEDIUM":
        return { bg: "#422006", color: "#fcd34d", border: "#f59e0b" };
      case "LOW":
        return { bg: "#1e293b", color: "#94a3b8", border: "#475569" };
      case "INFO":
      default:
        return { bg: "#082f49", color: "#7dd3fc", border: "#0284c7" };
    }
  };

  return (
    <div style={containerStyle}>
      {/* Header & Action Bar */}
      <div style={headerCard}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
          <div>
            <div style={badgeStyle}>🛡️ IMPLEMENTATION 4: CYBERSECURITY MONITORING</div>
            <h2 style={titleStyle}>Security Monitoring & Suspicious Activity Detection</h2>
            <p style={subtitleStyle}>
              Continuous threat detection, rate-limiting oversight, duplicate ballot prevention, and forensic security logging.
            </p>
          </div>

          <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap", alignItems: "center" }}>
            <button
              onClick={refreshAll}
              disabled={loading}
              style={refreshBtn}
            >
              {loading ? "⏳ Loading..." : "🔄 Refresh Log"}
            </button>
            <a
              href={`${API_BASE}/api/security/export/csv`}
              download
              style={exportBtn}
            >
              📥 Export CSV
            </a>
            <a
              href={`${API_BASE}/api/security/export/json`}
              download
              style={exportBtn}
            >
              📥 Export JSON
            </a>
          </div>
        </div>

        {actionMsg && (
          <div style={successAlert}>
            ✅ {actionMsg}
          </div>
        )}

        {error && (
          <div style={errorAlert}>
            ⚠️ {error}
          </div>
        )}
      </div>

      {/* Metric Cards Grid */}
      <div style={metricGrid}>
        <div style={metricCard}>
          <div style={metricLabel}>TOTAL EVENTS LOGGED</div>
          <div style={{ ...metricValue, color: "#38bdf8" }}>{summary?.total_events ?? 0}</div>
          <div style={metricSub}>Persistent security trail</div>
        </div>

        <div style={{ ...metricCard, borderColor: summary?.high_critical_alerts > 0 ? "#f43f5e" : "#334155" }}>
          <div style={metricLabel}>HIGH / CRITICAL ALERTS</div>
          <div style={{ ...metricValue, color: summary?.high_critical_alerts > 0 ? "#f43f5e" : "#10b981" }}>
            {summary?.high_critical_alerts ?? 0}
          </div>
          <div style={metricSub}>Priority security incidents</div>
        </div>

        <div style={metricCard}>
          <div style={metricLabel}>FAILED FINGERPRINT ATTEMPTS</div>
          <div style={{ ...metricValue, color: "#f59e0b" }}>{summary?.failed_fingerprints ?? 0}</div>
          <div style={metricSub}>Biometric threshold breaches</div>
        </div>

        <div style={metricCard}>
          <div style={metricLabel}>DUPLICATE VOTE ATTEMPTS</div>
          <div style={{ ...metricValue, color: "#c084fc" }}>{summary?.duplicate_votes ?? 0}</div>
          <div style={metricSub}>Double-voting prevention flags</div>
        </div>

        <div style={metricCard}>
          <div style={metricLabel}>UNAUTHORIZED ACCESS</div>
          <div style={{ ...metricValue, color: "#fb7185" }}>{summary?.unauthorized_access ?? 0}</div>
          <div style={metricSub}>Admin route barrier triggers</div>
        </div>

        <div style={metricCard}>
          <div style={metricLabel}>BLOCKCHAIN TX FAILURES</div>
          <div style={{ ...metricValue, color: "#34d399" }}>{summary?.blockchain_errors ?? 0}</div>
          <div style={metricSub}>Reverts & RPC exceptions</div>
        </div>
      </div>

      {/* Filters Toolbar */}
      <div style={filterBar}>
        <form onSubmit={handleSearchSubmit} style={{ display: "flex", gap: "0.8rem", flexWrap: "wrap", alignItems: "center", width: "100%" }}>
          <div style={{ flex: "1 1 200px" }}>
            <label style={filterLabel}>Severity Level</label>
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              style={selectStyle}
            >
              <option value="">All Severities</option>
              <option value="CRITICAL">🔴 CRITICAL</option>
              <option value="HIGH">🟠 HIGH</option>
              <option value="MEDIUM">🟡 MEDIUM</option>
              <option value="LOW">⚪ LOW</option>
              <option value="INFO">🔵 INFO</option>
            </select>
          </div>

          <div style={{ flex: "1 1 240px" }}>
            <label style={filterLabel}>Event Type</label>
            <select
              value={eventTypeFilter}
              onChange={(e) => setEventTypeFilter(e.target.value)}
              style={selectStyle}
            >
              <option value="">All Event Types</option>
              <option value="FINGERPRINT_VERIFICATION_FAILURE">Biometric Mismatch</option>
              <option value="REPEATED_BIOMETRIC_FAILURES">Repeated Biometric Failures</option>
              <option value="DUPLICATE_VOTING_ATTEMPT">Duplicate Voting Attempt</option>
              <option value="UNREGISTERED_VOTER_ATTEMPT">Unregistered Voter Attempt</option>
              <option value="UNAUTHORIZED_ADMIN_ACCESS">Unauthorized Admin Access</option>
              <option value="BLOCKCHAIN_TRANSACTION_FAILURE">Blockchain Tx Failure</option>
              <option value="RATE_LIMIT_EXCEEDED">Rate Limit Exceeded</option>
              <option value="MALFORMED_REQUEST">Malformed Request</option>
              <option value="BALLOT_CAST_SUCCESS">Ballot Cast Success</option>
              <option value="ADMIN_OPERATION_SUCCESS">Admin Operation Success</option>
            </select>
          </div>

          <div style={{ flex: "1 1 160px" }}>
            <label style={filterLabel}>Review Status</label>
            <select
              value={reviewedFilter}
              onChange={(e) => setReviewedFilter(e.target.value)}
              style={selectStyle}
            >
              <option value="">All Statuses</option>
              <option value="0">Unreviewed Only</option>
              <option value="1">Reviewed Only</option>
            </select>
          </div>

          <div style={{ flex: "2 1 260px" }}>
            <label style={filterLabel}>Search Address / Details</label>
            <div style={{ display: "flex", gap: "0.4rem" }}>
              <input
                type="text"
                placeholder="Search wallet, keyword, tx..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={inputStyle}
              />
              <button type="submit" style={searchBtn}>Search</button>
            </div>
          </div>
        </form>
      </div>

      {/* Incident Log Table */}
      <div style={tableCard}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <h3 style={{ margin: 0, fontSize: "1.1rem", color: "#f8fafc", fontWeight: "600" }}>
            Security Incident Log ({totalCount} matching)
          </h3>
          <span style={{ fontSize: "0.85rem", color: "#64748b" }}>
            Unreviewed Pending: <strong style={{ color: "#f59e0b" }}>{summary?.unreviewed_events ?? 0}</strong>
          </span>
        </div>

        {events.length === 0 ? (
          <div style={emptyState}>
            <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>🛡️</div>
            <div style={{ fontWeight: "600", color: "#94a3b8" }}>No security events match your filter criteria</div>
            <div style={{ fontSize: "0.85rem", color: "#64748b", marginTop: "4px" }}>
              All suspicious activity detection sensors are operational.
            </div>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={tableStyle}>
              <thead>
                <tr style={tableHeaderRow}>
                  <th style={thStyle}>ID</th>
                  <th style={thStyle}>Timestamp (UTC)</th>
                  <th style={thStyle}>Severity</th>
                  <th style={thStyle}>Event Type</th>
                  <th style={thStyle}>Subject / Address</th>
                  <th style={thStyle}>Description</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Tx Hash / Block</th>
                  <th style={thStyle}>Review Action</th>
                </tr>
              </thead>
              <tbody>
                {events.map((evt) => {
                  const badge = getSeverityBadge(evt.severity);
                  return (
                    <tr key={evt.id} style={tableRow}>
                      <td style={{ ...tdStyle, color: "#64748b", fontWeight: "600" }}>#{evt.id}</td>
                      <td style={{ ...tdStyle, whiteSpace: "nowrap", fontSize: "0.82rem", color: "#cbd5e1" }}>
                        {evt.created_at ? evt.created_at.replace("T", " ").substring(0, 19) : "N/A"}
                      </td>
                      <td style={tdStyle}>
                        <span style={{
                          display: "inline-block",
                          padding: "0.2rem 0.55rem",
                          borderRadius: "4px",
                          fontSize: "0.75rem",
                          fontWeight: "700",
                          backgroundColor: badge.bg,
                          color: badge.color,
                          border: `1px solid ${badge.border}`
                        }}>
                          {evt.severity}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: "0.8rem", color: "#e2e8f0" }}>
                        {evt.event_type}
                      </td>
                      <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: "0.8rem", color: "#38bdf8" }}>
                        {evt.voter_address ? (
                          <span title={evt.voter_address}>
                            {evt.voter_address.substring(0, 6)}...{evt.voter_address.substring(evt.voter_address.length - 4)}
                          </span>
                        ) : (
                          <span style={{ color: "#475569" }}>System / Anonymous</span>
                        )}
                      </td>
                      <td style={{ ...tdStyle, fontSize: "0.85rem", color: "#f1f5f9", minWidth: "220px" }}>
                        {evt.description}
                      </td>
                      <td style={tdStyle}>
                        <span style={{
                          padding: "0.15rem 0.45rem",
                          borderRadius: "3px",
                          fontSize: "0.75rem",
                          fontWeight: "600",
                          backgroundColor: evt.status === "CONFIRMED" ? "#064e3b" : (evt.status === "BLOCKED" || evt.status === "REJECTED" ? "#450a0a" : "#1e293b"),
                          color: evt.status === "CONFIRMED" ? "#6ee7b7" : (evt.status === "BLOCKED" || evt.status === "REJECTED" ? "#fca5a5" : "#94a3b8")
                        }}>
                          {evt.status}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: "0.78rem" }}>
                        {evt.tx_hash ? (
                          <span title={evt.tx_hash} style={{ color: "#a78bfa" }}>
                            {evt.tx_hash.substring(0, 8)}... (Blk #{evt.block_number})
                          </span>
                        ) : (
                          <span style={{ color: "#475569" }}>—</span>
                        )}
                      </td>
                      <td style={tdStyle}>
                        {evt.reviewed ? (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "0.2rem", color: "#34d399", fontSize: "0.78rem" }} title={`Reviewed by ${evt.reviewed_by} at ${evt.reviewed_at}`}>
                            ✅ Reviewed
                          </span>
                        ) : (
                          <button
                            onClick={() => handleMarkReviewed(evt.id)}
                            style={reviewBtn}
                          >
                            Mark Reviewed
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
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

const successAlert = {
  marginTop: "1rem",
  padding: "0.75rem 1rem",
  borderRadius: "6px",
  background: "#064e3b",
  border: "1px solid #059669",
  color: "#a7f3d0",
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

const filterBar = {
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
  flex: 1,
  background: "#1e293b",
  color: "#f8fafc",
  border: "1px solid #334155",
  borderRadius: "6px",
  padding: "0.5rem 0.75rem",
  fontSize: "0.85rem"
};

const searchBtn = {
  background: "#0284c7",
  color: "#fff",
  border: "none",
  borderRadius: "6px",
  padding: "0.5rem 0.9rem",
  fontWeight: "600",
  cursor: "pointer",
  fontSize: "0.85rem"
};

const tableCard = {
  background: "#0f172a",
  border: "1px solid #1e293b",
  borderRadius: "10px",
  padding: "1.2rem"
};

const tableStyle = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: "0.85rem"
};

const tableHeaderRow = {
  background: "#1e293b",
  borderBottom: "2px solid #334155"
};

const thStyle = {
  padding: "0.75rem 0.85rem",
  textAlign: "left",
  fontWeight: "600",
  color: "#cbd5e1",
  fontSize: "0.75rem",
  textTransform: "uppercase",
  letterSpacing: "0.05em"
};

const tableRow = {
  borderBottom: "1px solid #1e293b"
};

const tdStyle = {
  padding: "0.75rem 0.85rem",
  verticalAlign: "middle"
};

const reviewBtn = {
  background: "#1e293b",
  color: "#38bdf8",
  border: "1px solid #0284c7",
  borderRadius: "4px",
  padding: "0.25rem 0.55rem",
  fontSize: "0.75rem",
  fontWeight: "600",
  cursor: "pointer"
};

const emptyState = {
  padding: "3rem 1rem",
  textAlign: "center"
};
