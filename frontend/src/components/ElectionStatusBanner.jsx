import React, { useState, useEffect } from 'react';

const API_BASE = "http://127.0.0.1:5000";

/**
 * ElectionStatusBanner
 *
 * Props:
 *   onElectionInfoLoaded(info) — called whenever fresh info is fetched
 *   refreshTrigger             — increment to force a re-fetch
 */
export default function ElectionStatusBanner({ onElectionInfoLoaded, refreshTrigger }) {
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchInfo = () => {
    setLoading(true);
    fetch(`${API_BASE}/api/election-info`)
      .then(r => r.json())
      .then(data => {
        setInfo(data);
        if (onElectionInfoLoaded) onElectionInfoLoaded(data);
      })
      .catch(() => setInfo(null))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchInfo();
  }, [refreshTrigger]);

  // Auto-poll every 10 seconds
  useEffect(() => {
    const id = setInterval(fetchInfo, 10_000);
    return () => clearInterval(id);
  }, []);

  if (loading && !info) {
    return (
      <div style={bannerBase}>
        <span style={{ color: "#94a3b8" }}>⏳ Fetching election status from blockchain...</span>
      </div>
    );
  }

  if (!info) {
    return (
      <div style={{ ...bannerBase, borderColor: "#ef4444", background: "#1a0505" }}>
        <span style={{ color: "#fca5a5" }}>⚠️ Could not read election status. Ensure the Hardhat node is running.</span>
      </div>
    );
  }

  const { status_label, start_time, end_time, total_votes, voting_now } = info;

  const config = {
    NotStarted: {
      emoji: "⏸️", label: "NOT STARTED",
      bg: "#1a1a2e", border: "#475569", color: "#94a3b8"
    },
    Open: {
      emoji: "🟢", label: "OPEN",
      bg: voting_now ? "#022c22" : "#1a1a05",
      border: voting_now ? "#10b981" : "#f59e0b",
      color: voting_now ? "#6ee7b7" : "#fde68a"
    },
    Closed: {
      emoji: "🔒", label: "CLOSED",
      bg: "#1a0505", border: "#b91c1c", color: "#fca5a5"
    }
  };

  const c = config[status_label] || config.NotStarted;

  const fmt = (ts) => ts
    ? new Date(ts * 1000).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })
    : "—";

  return (
    <div style={{ ...bannerBase, background: c.bg, borderColor: c.border }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ fontSize: "1.4rem" }}>{c.emoji}</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: "0.95rem", color: c.color }}>
              Election Status: {c.label}
              {status_label === "Open" && !voting_now && (
                <span style={{ fontSize: "0.75rem", color: "#f59e0b", marginLeft: "8px" }}>
                  (Window not yet active)
                </span>
              )}
            </div>
            <div style={{ fontSize: "0.75rem", color: "#94a3b8", marginTop: "2px" }}>
              {status_label === "NotStarted"
                ? "Commissioner has not opened the election yet."
                : status_label === "Closed"
                  ? "Election is permanently closed. No further votes accepted."
                  : voting_now
                    ? "✅ Voting is ACTIVE — ballots are accepted right now."
                    : "🕐 Election opened but voting window not yet reached."}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: "20px", flexWrap: "wrap" }}>
          {start_time && (
            <div style={metaItem}>
              <span style={metaLabel}>Start</span>
              <span style={{ color: "#f8fafc", fontSize: "0.85rem" }}>{fmt(start_time)}</span>
            </div>
          )}
          {end_time && (
            <div style={metaItem}>
              <span style={metaLabel}>End</span>
              <span style={{ color: "#f8fafc", fontSize: "0.85rem" }}>{fmt(end_time)}</span>
            </div>
          )}
          <div style={metaItem}>
            <span style={metaLabel}>Total Votes</span>
            <span style={{ color: "#38bdf8", fontSize: "1rem", fontWeight: 700 }}>{total_votes ?? 0}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

const bannerBase = {
  border: "1px solid",
  borderRadius: "10px",
  padding: "12px 16px",
  marginBottom: "1.2rem",
  transition: "all 0.3s"
};

const metaItem = { display: "flex", flexDirection: "column" };
const metaLabel = { fontSize: "0.68rem", color: "#64748b", textTransform: "uppercase", fontWeight: 600 };
