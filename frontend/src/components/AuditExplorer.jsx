import React, { useState, useEffect } from 'react';

const API_BASE = "http://127.0.0.1:5000";

export default function AuditExplorer() {
  const [auditData, setAuditData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchAudit = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/audit-trail`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load audit trail");
      setAuditData(data);
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAudit();
  }, []);

  const events = auditData?.events || [];

  return (
    <div style={cardStyle}>
      <div style={titleHeader}>
        <div>
          <h2 style={cardTitle}>⛓️ Blockchain Public Ledger & Audit Explorer</h2>
          <p style={subtitle}>Verifiable Transparency &bull; Cryptographic Audit Trail &bull; Tamper-Proof Blocks</p>
        </div>
        <button
          type="button"
          onClick={fetchAudit}
          disabled={loading}
          style={refreshBtn}
        >
          {loading ? "..." : "🔄 Refresh Ledger"}
        </button>
      </div>

      {/* Overview Stats */}
      <div style={statsGrid}>
        <div style={statBox}>
          <span style={statLabel}>Latest Block Height</span>
          <span style={statValue}>#{auditData?.latest_block ?? 0}</span>
        </div>
        <div style={statBox}>
          <span style={statLabel}>Total Audited Events</span>
          <span style={statValue}>{events.length}</span>
        </div>
        <div style={statBox}>
          <span style={statLabel}>Smart Contract Address</span>
          <span style={statAddress}>
            {auditData?.contract_address ? `${auditData.contract_address.slice(0, 10)}...${auditData.contract_address.slice(-8)}` : "Not Deployed"}
          </span>
        </div>
      </div>

      {error && <div style={errorBanner}>⚠️ {error}</div>}

      {/* Events Stream */}
      <div style={{ marginTop: "1.5rem" }}>
        <h3 style={sectionTitle}>Immutable Transaction History</h3>

        {events.length === 0 ? (
          <div style={emptyBox}>
            No on-chain events found. Enroll voters or cast ballots to generate immutable transaction records.
          </div>
        ) : (
          <div style={eventsList}>
            {events.map((evt, idx) => {
              const isVote = evt.type === "VOTE_CASTED";
              return (
                <div key={idx} style={eventCard}>
                  <div style={eventTopRow}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{
                        ...typeBadge,
                        background: isVote ? "#064e3b" : "#0c4a6e",
                        color: isVote ? "#6ee7b7" : "#7dd3fc",
                        borderColor: isVote ? "#10b981" : "#0284c7"
                      }}>
                        {isVote ? "🗳️ VOTE_CASTED" : "📝 VOTER_REGISTERED"}
                      </span>
                      <span style={blockBadge}>Block #{evt.block_number}</span>
                    </div>

                    <span style={timeTag}>Confirmed On-Chain</span>
                  </div>

                  <div style={detailsGrid}>
                    <div>
                      <span style={detailLabel}>Voter Address:</span>
                      <code style={addressCode}>{evt.voter}</code>
                    </div>

                    {isVote ? (
                      <div>
                        <span style={detailLabel}>Candidate Voted:</span>
                        <span style={{ fontWeight: "bold", color: "#f8fafc" }}>
                          Candidate #{evt.candidate_id}
                        </span>
                      </div>
                    ) : (
                      <div>
                        <span style={detailLabel}>Biometric Template Hash (bytes32):</span>
                        <code style={hashCode}>{evt.biometric_hash}</code>
                      </div>
                    )}

                    <div style={{ gridColumn: "1 / -1" }}>
                      <span style={detailLabel}>Transaction Hash:</span>
                      <code style={txHashCode}>{evt.transaction_hash}</code>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
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

const statsGrid = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr 1fr",
  gap: "10px",
  background: "#0f172a",
  padding: "12px",
  borderRadius: "8px",
  border: "1px solid #1e293b"
};

const statBox = { display: "flex", flexDirection: "column" };
const statLabel = { fontSize: "0.7rem", color: "#94a3b8", textTransform: "uppercase" };
const statValue = { fontSize: "1.2rem", fontWeight: 700, color: "#f8fafc", marginTop: "2px" };
const statAddress = { fontSize: "0.85rem", fontFamily: "JetBrains Mono, monospace", color: "#38bdf8", marginTop: "4px" };

const errorBanner = { marginTop: "1rem", padding: "10px", background: "#450a0a", border: "1px solid #ef4444", borderRadius: "8px", color: "#fca5a5", fontSize: "0.85rem" };

const sectionTitle = { margin: "0 0 10px", fontSize: "1rem", color: "#f8fafc", fontWeight: 600 };
const emptyBox = { padding: "1.5rem", textAlign: "center", color: "#64748b", background: "#0f172a", borderRadius: "8px" };

const eventsList = { display: "flex", flexDirection: "column", gap: "10px" };

const eventCard = {
  background: "#0f172a",
  border: "1px solid #1e293b",
  borderRadius: "8px",
  padding: "12px"
};

const eventTopRow = { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" };
const typeBadge = { padding: "2px 8px", borderRadius: "4px", fontSize: "0.75rem", fontWeight: "bold", border: "1px solid" };
const blockBadge = { background: "#1e293b", color: "#94a3b8", padding: "2px 6px", borderRadius: "4px", fontSize: "0.75rem" };
const timeTag = { fontSize: "0.75rem", color: "#10b981", fontWeight: 500 };

const detailsGrid = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", fontSize: "0.8rem" };
const detailLabel = { display: "block", fontSize: "0.7rem", color: "#64748b", textTransform: "uppercase" };
const addressCode = { fontSize: "0.8rem", color: "#f8fafc", wordBreak: "break-all" };
const hashCode = { fontSize: "0.75rem", color: "#38bdf8", wordBreak: "break-all" };
const txHashCode = { fontSize: "0.75rem", color: "#94a3b8", wordBreak: "break-all" };
