import React, { useState, useEffect } from 'react';

export default function ResultsDashboard({ candidates, onRefresh, loading, contractAddress, totalVotes = 0 }) {
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Auto refresh every 5 seconds if enabled
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      if (onRefresh) onRefresh();
    }, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh, onRefresh]);

  // Determine leading candidate
  const sorted = [...candidates].sort((a, b) => b.vote_count - a.vote_count);
  const leader = sorted.length > 0 && sorted[0].vote_count > 0 ? sorted[0] : null;

  return (
    <div style={cardStyle}>
      <div style={titleHeader}>
        <div>
          <h2 style={cardTitle}>📊 Live Election Tally & Results</h2>
          <p style={subtitle}>Immutable Ledger Standings &bull; Smart Contract Automated Counting</p>
        </div>

        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <label style={toggleLabel}>
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              style={{ marginRight: "6px" }}
            />
            Auto-refresh (5s)
          </label>
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            style={refreshBtn}
          >
            {loading ? "..." : "🔄 Refresh"}
          </button>
        </div>
      </div>

      {/* Stats Bar */}
      <div style={statsBar}>
        <div style={statItem}>
          <span style={statLabel}>Total Ballots Cast</span>
          <span style={statValue}>{totalVotes}</span>
        </div>
        <div style={statItem}>
          <span style={statLabel}>Contesting Candidates</span>
          <span style={statValue}>{candidates.length}</span>
        </div>
        <div style={statItem}>
          <span style={statLabel}>Current Leader</span>
          <span style={{ ...statValue, color: leader ? "#38bdf8" : "#94a3b8" }}>
            {leader ? leader.name : "Tied / No Votes"}
          </span>
        </div>
      </div>

      {/* Winner Banner */}
      {leader && (
        <div style={winnerBanner}>
          <span style={{ fontSize: "1.4rem" }}>🏆</span>
          <div>
            <strong>Current Projected Winner: {leader.name}</strong>
            <div style={{ fontSize: "0.75rem", color: "#6ee7b7" }}>
              Leading with {leader.vote_count} votes ({leader.percentage}%)
            </div>
          </div>
        </div>
      )}

      {/* Candidates List */}
      <div style={{ marginTop: "1rem" }}>
        {candidates.length === 0 ? (
          <div style={emptyBox}>No candidate data available from smart contract.</div>
        ) : (
          <div style={candidateList}>
            {sorted.map((cand) => {
              const isLeading = leader && leader.id === cand.id;
              const pct = cand.percentage || 0;

              return (
                <div key={cand.id} style={candidateRow}>
                  <div style={candInfoRow}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={candidateBadge}>#{cand.id}</span>
                      <span style={{ fontWeight: 600, color: "#f8fafc", fontSize: "1rem" }}>
                        {cand.name}
                      </span>
                      {isLeading && <span style={leadTag}>LEADER</span>}
                    </div>

                    <div style={{ textAlign: "right" }}>
                      <span style={candVoteCount}>{cand.vote_count} votes</span>
                      <span style={candPct}>({pct}%)</span>
                    </div>
                  </div>

                  <div style={progressTrack}>
                    <div
                      style={{
                        ...progressFill,
                        width: `${pct}%`,
                        background: isLeading
                          ? "linear-gradient(90deg, #0284c7, #38bdf8)"
                          : "linear-gradient(90deg, #475569, #64748b)"
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Contract Address Footer */}
      {contractAddress && (
        <div style={contractFooter}>
          <span style={{ fontSize: "0.75rem", color: "#64748b" }}>Smart Contract:</span>
          <code style={contractCode}>{contractAddress}</code>
        </div>
      )}
    </div>
  );
}

const cardStyle = {
  background: "#1e293b",
  border: "1px solid #334155",
  borderRadius: "12px",
  padding: "1.5rem",
  boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.3)"
};

const titleHeader = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem" };
const cardTitle = { margin: 0, fontSize: "1.3rem", color: "#38bdf8", fontWeight: 700 };
const subtitle = { margin: "4px 0 0", fontSize: "0.8rem", color: "#94a3b8" };

const toggleLabel = { fontSize: "0.75rem", color: "#94a3b8", display: "flex", alignItems: "center", cursor: "pointer" };

const refreshBtn = {
  background: "#0f172a",
  border: "1px solid #334155",
  color: "#f8fafc",
  padding: "6px 12px",
  borderRadius: "6px",
  cursor: "pointer",
  fontSize: "0.8rem",
  fontWeight: 600
};

const statsBar = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr 1fr",
  gap: "10px",
  background: "#0f172a",
  padding: "12px",
  borderRadius: "8px",
  border: "1px solid #1e293b",
  marginBottom: "1rem"
};

const statItem = { display: "flex", flexDirection: "column" };
const statLabel = { fontSize: "0.7rem", color: "#94a3b8", textTransform: "uppercase" };
const statValue = { fontSize: "1.2rem", fontWeight: 700, color: "#f8fafc", marginTop: "2px" };

const winnerBanner = {
  display: "flex",
  alignItems: "center",
  gap: "12px",
  background: "#064e3b",
  border: "1px solid #10b981",
  borderRadius: "8px",
  padding: "10px 14px",
  color: "#ecfdf5",
  marginBottom: "1rem"
};

const emptyBox = { padding: "1.5rem", textAlign: "center", color: "#64748b", background: "#0f172a", borderRadius: "8px" };

const candidateList = { display: "flex", flexDirection: "column", gap: "10px" };

const candidateRow = {
  background: "#0f172a",
  border: "1px solid #1e293b",
  borderRadius: "8px",
  padding: "12px"
};

const candInfoRow = { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" };
const candidateBadge = { background: "#334155", color: "#cbd5e1", fontSize: "0.75rem", padding: "2px 6px", borderRadius: "4px" };
const leadTag = { background: "#0284c7", color: "#fff", fontSize: "0.65rem", padding: "2px 6px", borderRadius: "10px", fontWeight: "bold" };
const candVoteCount = { fontSize: "1.05rem", fontWeight: "bold", color: "#f8fafc", marginRight: "6px" };
const candPct = { fontSize: "0.85rem", color: "#94a3b8" };

const progressTrack = {
  height: "8px",
  background: "#1e293b",
  borderRadius: "4px",
  overflow: "hidden"
};

const progressFill = { height: "100%", borderRadius: "4px", transition: "width 0.5s ease" };

const contractFooter = {
  marginTop: "1.2rem",
  display: "flex",
  alignItems: "center",
  gap: "8px",
  borderTop: "1px solid #1e293b",
  paddingTop: "10px"
};

const contractCode = {
  fontSize: "0.75rem",
  fontFamily: "JetBrains Mono, monospace",
  color: "#38bdf8",
  background: "#0f172a",
  padding: "2px 6px",
  borderRadius: "4px"
};
