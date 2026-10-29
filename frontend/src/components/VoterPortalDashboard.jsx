import React, { useState, useEffect } from 'react';

const API_BASE = "http://127.0.0.1:5000";

export default function VoterPortalDashboard({ currentUser, onSwitchToBooth }) {
  const [voterAddress, setVoterAddress] = useState(currentUser?.wallet_address || "0x70997970C51812dc3A010C7d01b50e0d17dc79C8");
  const [voterStatus, setVoterStatus] = useState(null);
  const [electionInfo, setElectionInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchVoterInfo = async (addr) => {
    const clean = addr.trim().toLowerCase();
    if (!clean.startsWith("0x")) return;
    setLoading(true);
    setError("");
    try {
      // 1. Fetch Voter Status
      const resVoter = await fetch(`${API_BASE}/api/voter-status/${clean}`);
      const dataVoter = await resVoter.json();
      setVoterStatus(dataVoter);

      // 2. Fetch Election Lifecycle Info
      const resElec = await fetch(`${API_BASE}/api/election-info`);
      const dataElec = await resElec.json();
      setElectionInfo(dataElec);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (voterAddress) {
      fetchVoterInfo(voterAddress);
    }
  }, [voterAddress]);

  const handleLookup = (e) => {
    e.preventDefault();
    fetchVoterInfo(voterAddress);
  };

  const isRegistered = voterStatus?.is_enrolled_offchain || voterStatus?.onchain?.isRegistered;
  const hasVoted = voterStatus?.has_voted_offchain || voterStatus?.onchain?.hasVoted;
  const isElectionOpen = electionInfo?.voting_now;

  return (
    <div style={containerStyle}>
      {/* Header */}
      <div style={headerCard}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
          <div>
            <div style={badgeStyle}>👤 VOTER ROLE &bull; SELF-SERVICE PORTAL</div>
            <h2 style={titleStyle}>Voter Eligibility & Verification Center</h2>
            <p style={subtitleStyle}>
              Check your biometric enrollment, smart contract registration status, voting window, and personal ballot confirmation.
            </p>
          </div>

          <button
            onClick={() => window.open("http://localhost:3000", "_blank")}
            style={boothBtn}
          >
            🗳️ Launch Voting Booth Client (:3000) ↗
          </button>
        </div>

        {error && (
          <div style={errorAlert}>
            ⚠️ {error}
          </div>
        )}
      </div>

      {/* Wallet Lookup Toolbar */}
      <div style={lookupCard}>
        <form onSubmit={handleLookup} style={{ display: "flex", gap: "0.8rem", alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: "280px" }}>
            <label style={labelStyle}>Your Ethereum Voter Wallet Address</label>
            <input
              type="text"
              value={voterAddress}
              onChange={(e) => setVoterAddress(e.target.value)}
              placeholder="0x..."
              style={inputStyle}
            />
          </div>
          <button type="submit" disabled={loading} style={lookupBtn}>
            {loading ? "Checking..." : "🔍 Check Status"}
          </button>
        </form>
      </div>

      {/* Status Summary Banners */}
      {hasVoted ? (
        <div style={votedBanner}>
          <span style={{ fontSize: "1.6rem" }}>✅</span>
          <div>
            <strong style={{ fontSize: "1.05rem", color: "#6ee7b7" }}>BALLOT CONFIRMED ON BLOCKCHAIN LEDGER</strong>
            <div style={{ fontSize: "0.85rem", color: "#a7f3d0", marginTop: "2px" }}>
              Your vote has been permanently mined and immutably recorded. Under democratic single-vote rules, you cannot vote again.
            </div>
            {voterStatus?.ballot_record?.tx_hash && (
              <div style={{ fontSize: "0.78rem", color: "#6ee7b7", fontFamily: "monospace", marginTop: "4px" }}>
                Receipt: {voterStatus.ballot_record.tx_hash} (Block #{voterStatus.ballot_record.block_number})
              </div>
            )}
          </div>
        </div>
      ) : !isRegistered ? (
        <div style={warningBanner}>
          <span style={{ fontSize: "1.5rem" }}>⚠️</span>
          <div>
            <strong style={{ color: "#fcd34d" }}>VOTER NOT ENROLLED</strong>
            <div style={{ fontSize: "0.85rem", color: "#fef08a", marginTop: "2px" }}>
              This wallet address is not enrolled in the biometric registry. Please visit the Pre-Election Voter Enrollment station to extract your biometric fingerprint template.
            </div>
          </div>
        </div>
      ) : !isElectionOpen ? (
        <div style={noticeBanner}>
          <span style={{ fontSize: "1.5rem" }}>⏳</span>
          <div>
            <strong style={{ color: "#7dd3fc" }}>ELECTION IS CURRENTLY NOT OPEN FOR VOTING</strong>
            <div style={{ fontSize: "0.85rem", color: "#bae6fd", marginTop: "2px" }}>
              Status: <strong>{electionInfo?.status_label || "Not Started"}</strong>. The voting booth will unlock once the Election Commissioner officially opens the voting window.
            </div>
          </div>
        </div>
      ) : (
        <div style={readyBanner}>
          <span style={{ fontSize: "1.5rem" }}>🎉</span>
          <div>
            <strong style={{ color: "#6ee7b7" }}>ELIGIBLE TO VOTE &bull; ELECTION ACTIVE</strong>
            <div style={{ fontSize: "0.85rem", color: "#a7f3d0", marginTop: "2px" }}>
              Your biometric template is registered and the voting window is currently active. Open the Voting Booth to complete fingerprint authentication and cast your ballot.
            </div>
          </div>
        </div>
      )}

      {/* Details Grid */}
      <div style={detailsGrid}>
        <div style={cardSection}>
          <h3 style={sectionHeading}>📋 Voter Registry Status</h3>
          <div style={itemRow}>
            <span style={itemLabel}>Biometric Template Stored</span>
            <span style={{ fontWeight: "700", color: voterStatus?.is_enrolled_offchain ? "#34d399" : "#f43f5e" }}>
              {voterStatus?.is_enrolled_offchain ? "YES (Enrolled)" : "NO"}
            </span>
          </div>
          <div style={itemRow}>
            <span style={itemLabel}>Smart Contract Registered</span>
            <span style={{ fontWeight: "700", color: voterStatus?.onchain?.isRegistered ? "#34d399" : "#f43f5e" }}>
              {voterStatus?.onchain?.isRegistered ? "YES (On-Chain)" : "NO"}
            </span>
          </div>
          <div style={itemRow}>
            <span style={itemLabel}>Ballot Cast Status</span>
            <span style={{ fontWeight: "700", color: hasVoted ? "#c084fc" : "#f59e0b" }}>
              {hasVoted ? "BALLOT CAST" : "ELIGIBLE / PENDING"}
            </span>
          </div>
          <div style={itemRow}>
            <span style={itemLabel}>Biometric Hash</span>
            <span style={{ fontFamily: "monospace", fontSize: "0.78rem", color: "#38bdf8" }}>
              {voterStatus?.biometric_hash ? `${voterStatus.biometric_hash.substring(0, 16)}...` : "None"}
            </span>
          </div>
        </div>

        <div style={cardSection}>
          <h3 style={sectionHeading}>⚡ Election Timing Window</h3>
          <div style={itemRow}>
            <span style={itemLabel}>Election Status</span>
            <span style={{ fontWeight: "700", color: isElectionOpen ? "#34d399" : "#f59e0b" }}>
              {electionInfo?.status_label || "Not Started"}
            </span>
          </div>
          <div style={itemRow}>
            <span style={itemLabel}>Voting Permitted Now</span>
            <span style={{ fontWeight: "700", color: isElectionOpen ? "#34d399" : "#f43f5e" }}>
              {isElectionOpen ? "YES (Active)" : "NO"}
            </span>
          </div>
          <div style={itemRow}>
            <span style={itemLabel}>Start Time (UTC)</span>
            <span style={{ fontSize: "0.82rem", color: "#cbd5e1" }}>
              {electionInfo?.start_time ? new Date(electionInfo.start_time * 1000).toLocaleString() : "TBD"}
            </span>
          </div>
          <div style={itemRow}>
            <span style={itemLabel}>End Time (UTC)</span>
            <span style={{ fontSize: "0.82rem", color: "#cbd5e1" }}>
              {electionInfo?.end_time ? new Date(electionInfo.end_time * 1000).toLocaleString() : "TBD"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

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
  padding: "0.2rem 0.55rem",
  borderRadius: "4px",
  fontSize: "0.72rem",
  fontWeight: "700",
  letterSpacing: "0.05em",
  marginBottom: "0.3rem"
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

const boothBtn = {
  background: "#0284c7",
  color: "#fff",
  border: "none",
  borderRadius: "6px",
  padding: "0.6rem 1.1rem",
  fontWeight: "700",
  fontSize: "0.85rem",
  cursor: "pointer"
};

const lookupCard = {
  background: "#0f172a",
  border: "1px solid #1e293b",
  borderRadius: "10px",
  padding: "1.2rem"
};

const labelStyle = {
  display: "block",
  fontSize: "0.75rem",
  fontWeight: "600",
  color: "#94a3b8",
  marginBottom: "0.35rem"
};

const inputStyle = {
  width: "100%",
  background: "#1e293b",
  color: "#f8fafc",
  border: "1px solid #334155",
  borderRadius: "6px",
  padding: "0.55rem 0.75rem",
  fontSize: "0.88rem",
  boxSizing: "border-box"
};

const lookupBtn = {
  background: "#334155",
  color: "#38bdf8",
  border: "1px solid #0284c7",
  borderRadius: "6px",
  padding: "0.55rem 1rem",
  fontWeight: "600",
  fontSize: "0.85rem",
  cursor: "pointer"
};

const votedBanner = {
  display: "flex",
  alignItems: "center",
  gap: "1rem",
  background: "#064e3b",
  border: "1px solid #059669",
  borderRadius: "10px",
  padding: "1.2rem"
};

const warningBanner = {
  display: "flex",
  alignItems: "center",
  gap: "1rem",
  background: "#422006",
  border: "1px solid #f59e0b",
  borderRadius: "10px",
  padding: "1.2rem"
};

const noticeBanner = {
  display: "flex",
  alignItems: "center",
  gap: "1rem",
  background: "#082f49",
  border: "1px solid #0284c7",
  borderRadius: "10px",
  padding: "1.2rem"
};

const readyBanner = {
  display: "flex",
  alignItems: "center",
  gap: "1rem",
  background: "#064e3b",
  border: "1px solid #10b981",
  borderRadius: "10px",
  padding: "1.2rem"
};

const detailsGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
  gap: "1.2rem"
};

const cardSection = {
  background: "#0f172a",
  border: "1px solid #1e293b",
  borderRadius: "10px",
  padding: "1.4rem"
};

const sectionHeading = {
  margin: "0 0 1rem 0",
  fontSize: "1.1rem",
  fontWeight: "700",
  color: "#f8fafc"
};

const itemRow = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "0.6rem 0",
  borderBottom: "1px solid #1e293b"
};

const itemLabel = {
  fontSize: "0.85rem",
  color: "#94a3b8"
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
