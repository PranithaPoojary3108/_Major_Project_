import React, { useState } from 'react';
import ElectionStatusBanner from './ElectionStatusBanner';
import { authenticatedFetch } from '../utils/auth';

const API_BASE = "http://127.0.0.1:5000";

const padZero = (n) => String(n).padStart(2, '0');

const toDatetimeLocal = (date) => {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = padZero(d.getMonth() + 1);
  const day = padZero(d.getDate());
  const hours = padZero(d.getHours());
  const minutes = padZero(d.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

const getInitialScheduleTimes = () => {
  const now = new Date();
  // Round up to next 5 minutes
  now.setMinutes(Math.ceil(now.getMinutes() / 5) * 5, 0, 0);
  const startStr = toDatetimeLocal(now);
  const end = new Date(now.getTime() + 4 * 3600 * 1000);
  const endStr = toDatetimeLocal(end);
  return { startStr, endStr };
};

/**
 * ElectionControl
 *
 * Commissioner administrative desk to:
 *   1. Toggle between Demo Mode (instant open) and Scheduled Mode (date & time selection)
 *   2. Open or Schedule the election window on the Ethereum blockchain
 *   3. Close the election early
 *   4. Factory Reset System (deploy fresh contract, clear off-chain DB)
 */
export default function ElectionControl({ onElectionChanged }) {
  // Mode toggle: true = Demo Mode (same as before), false = Scheduled Mode (Date & Time)
  const [isDemoMode, setIsDemoMode] = useState(true);

  // Demo mode duration
  const [durationHours, setDurationHours] = useState(4);

  // Scheduled mode dates
  const initialTimes = getInitialScheduleTimes();
  const [scheduledStart, setScheduledStart] = useState(initialTimes.startStr);
  const [scheduledEnd, setScheduledEnd] = useState(initialTimes.endStr);

  // Results & status
  const [openResult,  setOpenResult]  = useState(null);
  const [closeResult, setCloseResult] = useState(null);
  const [resetResult, setResetResult] = useState(null);
  const [openLoading,  setOpenLoading]  = useState(false);
  const [closeLoading, setCloseLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [error, setError] = useState("");
  const [bannerRefresh, setBannerRefresh] = useState(0);

  const refreshAll = () => {
    setBannerRefresh(prev => prev + 1);
    if (onElectionChanged) onElectionChanged();
  };

  // ── Preset Helpers for Scheduled Mode ────────────────────────────────────
  const setPresetTimes = (startOffsetMs, durationMs) => {
    const s = new Date(Date.now() + startOffsetMs);
    const e = new Date(s.getTime() + durationMs);
    setScheduledStart(toDatetimeLocal(s));
    setScheduledEnd(toDatetimeLocal(e));
    setError("");
  };

  const applyPresetNow = () => setPresetTimes(60 * 1000, 2 * 3600 * 1000); // starts in 1 min, 2 hrs
  const applyPreset15Min = () => setPresetTimes(15 * 60 * 1000, 2 * 3600 * 1000); // starts in 15 mins, 2 hrs
  const applyPresetTomorrow = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    const tomorrowEnd = new Date(tomorrow);
    tomorrowEnd.setHours(17, 0, 0, 0);
    setScheduledStart(toDatetimeLocal(tomorrow));
    setScheduledEnd(toDatetimeLocal(tomorrowEnd));
    setError("");
  };

  // ── 1. Demo Mode Open (Instant) ───────────────────────────────────────────
  const handleOpenNow = async () => {
    setError("");
    setOpenResult(null);
    setResetResult(null);
    setOpenLoading(true);

    try {
      const start = Math.floor(Date.now() / 1000);
      const end = start + Math.max(1, parseInt(durationHours, 10)) * 3600;

      const res = await authenticatedFetch(`${API_BASE}/api/open-election`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start_time: start, end_time: end })
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setOpenResult(data);
        refreshAll();
      } else {
        setError(data.error || "Failed to open election.");
      }
    } catch {
      setError("Could not reach Flask backend.");
    } finally {
      setOpenLoading(false);
    }
  };

  // ── 2. Scheduled Mode Open (Custom Date & Time) ───────────────────────────
  const handleScheduleElection = async () => {
    setError("");
    setOpenResult(null);
    setResetResult(null);

    if (!scheduledStart || !scheduledEnd) {
      setError("Please select both a Start Date/Time and an End Date/Time.");
      return;
    }

    const startDateObj = new Date(scheduledStart);
    const endDateObj = new Date(scheduledEnd);

    if (isNaN(startDateObj.getTime()) || isNaN(endDateObj.getTime())) {
      setError("Invalid date or time entered. Please select valid dates.");
      return;
    }

    const startUnix = Math.floor(startDateObj.getTime() / 1000);
    const endUnix = Math.floor(endDateObj.getTime() / 1000);
    const nowUnix = Math.floor(Date.now() / 1000);

    if (endUnix <= startUnix) {
      setError("Invalid Timing: End Date & Time must be strictly after Start Date & Time.");
      return;
    }

    if (startUnix < nowUnix - 120) {
      setError("Invalid Timing: Start Date & Time cannot be in the past.");
      return;
    }

    setOpenLoading(true);
    try {
      const res = await authenticatedFetch(`${API_BASE}/api/open-election`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start_time: startUnix, end_time: endUnix })
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setOpenResult(data);
        refreshAll();
      } else {
        setError(data.error || "Failed to schedule election.");
      }
    } catch {
      setError("Could not reach Flask backend.");
    } finally {
      setOpenLoading(false);
    }
  };

  // ── 3. Close Election Early ───────────────────────────────────────────────
  const handleCloseElection = async () => {
    if (!window.confirm("Are you sure you want to close the election? Once closed, no more votes can be cast.")) return;

    setError("");
    setCloseResult(null);
    setResetResult(null);
    setCloseLoading(true);

    try {
      const res = await authenticatedFetch(`${API_BASE}/api/close-election`, { method: "POST" });
      const data = await res.json();

      if (res.ok && data.success) {
        setCloseResult(data);
        refreshAll();
      } else {
        setError(data.error || "Failed to close election.");
      }
    } catch {
      setError("Could not reach Flask backend.");
    } finally {
      setCloseLoading(false);
    }
  };

  // ── 4. Factory Reset System ──────────────────────────────────────────────
  const handleFactoryReset = async () => {
    const confirmation = window.prompt(
      "⚠️ FACTORY RESET WARNING:\n\n" +
      "This will:\n" +
      "1. Deploy a fresh, clean Voting contract to the blockchain (0 votes, NotStarted).\n" +
      "2. Clear all enrolled fingerprint templates from the local database.\n\n" +
      "Type 'RESET' to confirm:"
    );

    if (confirmation !== "RESET") {
      return;
    }

    setError("");
    setOpenResult(null);
    setCloseResult(null);
    setResetResult(null);
    setResetLoading(true);

    try {
      const res = await authenticatedFetch(`${API_BASE}/api/reset-all`, { method: "POST" });
      const data = await res.json();

      if (res.ok && data.success) {
        setResetResult(data);
        refreshAll();
      } else {
        setError(data.error || "Failed to perform factory reset.");
      }
    } catch {
      setError("Could not connect to Flask backend.");
    } finally {
      setResetLoading(false);
    }
  };

  const fmt = (ts) => ts
    ? new Date(ts * 1000).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })
    : "—";

  const getDurationText = () => {
    if (!scheduledStart || !scheduledEnd) return "—";
    const s = new Date(scheduledStart).getTime();
    const e = new Date(scheduledEnd).getTime();
    if (isNaN(s) || isNaN(e) || e <= s) return "Invalid";
    const diffMins = Math.round((e - s) / 60000);
    const hrs = Math.floor(diffMins / 60);
    const mins = diffMins % 60;
    return `${hrs}h ${mins > 0 ? `${mins}m` : ""}`.trim();
  };

  return (
    <div style={cardStyle}>
      {/* Top Banner: Current Blockchain Status */}
      <ElectionStatusBanner refreshTrigger={bannerRefresh} />

      {/* Header with Title and Factory Reset */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "12px", marginBottom: "1rem" }}>
        <div>
          <h2 style={cardTitle}>⚡ Election Lifecycle Control</h2>
          <p style={subtitle}>
            Commissioner Administrative Desk &bull; Enforces on-chain timing, voting window, and system resets
          </p>
        </div>

        {/* FACTORY RESET BUTTON */}
        <button
          type="button"
          onClick={handleFactoryReset}
          disabled={resetLoading}
          style={factoryResetBtn}
          title="Reset contract and database to start a fresh demonstration"
        >
          {resetLoading ? "🔄 Resetting Entire System..." : "🔄 Factory Reset System"}
        </button>
      </div>

      {resetResult && (
        <div style={resetSuccessBanner}>
          <span style={{ fontSize: "1.3rem" }}>✨</span>
          <div>
            <strong>Factory Reset Complete!</strong>
            <div style={{ fontSize: "0.78rem", color: "#a7f3d0", marginTop: "2px" }}>
              New Voting.sol deployed to: <code>{resetResult.contract_address}</code>. All biometric stores and vote tallies reset to zero.
            </div>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────────── */}
      {/* 🎛️ DEMO MODE TOGGLE BAR */}
      {/* ────────────────────────────────────────────────────────────────────────── */}
      <div style={demoModeContainer}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={modeIndicatorIcon(isDemoMode)}>
            {isDemoMode ? "🚀" : "🗓️"}
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontWeight: 800, fontSize: "0.95rem", color: "#f8fafc" }}>
                Operation Mode:
              </span>
              <span style={modeBadge(isDemoMode)}>
                {isDemoMode ? "DEMO MODE (ON)" : "DEMO MODE (OFF) — SCHEDULED"}
              </span>
            </div>
            <div style={{ fontSize: "0.76rem", color: "#94a3b8", marginTop: "2px" }}>
              {isDemoMode
                ? "Exhibition Demo Mode is ON: Instantly opens election for quick voting demonstrations."
                : "Scheduled Production Mode: Specify custom calendar date & time to schedule the voting window."}
            </div>
          </div>
        </div>

        {/* Toggle Button */}
        <button
          type="button"
          onClick={() => { setIsDemoMode(!isDemoMode); setError(""); }}
          style={demoToggleBtn(isDemoMode)}
          title={isDemoMode ? "Click to switch to Scheduled Mode (Date & Time)" : "Click to switch back to Instant Demo Mode"}
        >
          <span style={{ marginRight: "6px" }}>{isDemoMode ? "Switch to: 🗓️ Scheduled Mode" : "Switch to: 🚀 Demo Mode"}</span>
          <span style={switchSlider(isDemoMode)}>
            {isDemoMode ? "ON" : "OFF"}
          </span>
        </button>
      </div>

      {/* ────────────────────────────────────────────────────────────────────────── */}
      {/* 🟢 MODE A: DEMO MODE (SAME AS BEFORE) */}
      {/* ────────────────────────────────────────────────────────────────────────── */}
      {isDemoMode && (
        <div style={sectionBox}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px", marginBottom: "6px" }}>
            <h3 style={sectionTitle}>🟢 Open Election for Voting (Demo Mode)</h3>
            <span style={demoPill}>⚡ Fast Demo Mode Active</span>
          </div>

          <p style={hint}>
            Opens the ballot box immediately on the Ethereum blockchain. Voters can submit biometric ballots right away.
          </p>

          <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap", marginBottom: "1rem" }}>
            <label style={fieldLabel}>Voting Window Duration:</label>
            <select
              value={durationHours}
              onChange={(e) => setDurationHours(e.target.value)}
              style={selectInput}
            >
              <option value="1">1 Hour</option>
              <option value="2">2 Hours</option>
              <option value="4">4 Hours (Recommended for Demo)</option>
              <option value="8">8 Hours (Full Polling Day)</option>
              <option value="24">24 Hours</option>
            </select>
          </div>

          <button
            type="button"
            onClick={handleOpenNow}
            disabled={openLoading}
            style={{ ...actionBtn, background: "#16a34a" }}
          >
            {openLoading ? "Broadcasting to Ethereum..." : "🟢 Open Election Now (Activate Voting)"}
          </button>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────────────── */}
      {/* 🗓️ MODE B: SCHEDULED MODE (CUSTOM DATE & TIME) */}
      {/* ────────────────────────────────────────────────────────────────────────── */}
      {!isDemoMode && (
        <div style={{ ...sectionBox, borderColor: "#6366f1" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px", marginBottom: "6px" }}>
            <h3 style={{ ...sectionTitle, color: "#a5b4fc" }}>🗓️ Schedule Election (Date &amp; Time Selection)</h3>
            <span style={schedulePill}>🗓️ Custom Schedule Window</span>
          </div>

          <p style={hint}>
            Specify the exact Start and End date/time. The smart contract enforces that ballots cannot be cast before the start time or after the end time.
          </p>

          {/* Date & Time Picker Grid */}
          <div style={dateTimeGrid}>
            <div style={inputGroup}>
              <label style={inputLabel}>
                <span>📅 Voting Start Date &amp; Time</span>
                <span style={reqStar}>*</span>
              </label>
              <input
                type="datetime-local"
                value={scheduledStart}
                onChange={(e) => setScheduledStart(e.target.value)}
                style={dateTimeInput}
              />
              <span style={inputHelp}>Local Date/Time (IST)</span>
            </div>

            <div style={inputGroup}>
              <label style={inputLabel}>
                <span>🏁 Voting End Date &amp; Time</span>
                <span style={reqStar}>*</span>
              </label>
              <input
                type="datetime-local"
                value={scheduledEnd}
                onChange={(e) => setScheduledEnd(e.target.value)}
                style={dateTimeInput}
              />
              <span style={inputHelp}>Local Date/Time (IST)</span>
            </div>
          </div>

          {/* Quick Schedule Presets */}
          <div style={{ marginTop: "10px", marginBottom: "14px" }}>
            <span style={{ fontSize: "0.75rem", color: "#94a3b8", marginRight: "10px", fontWeight: 600 }}>Quick Presets:</span>
            <div style={{ display: "inline-flex", gap: "6px", flexWrap: "wrap" }}>
              <button type="button" onClick={applyPresetNow} style={presetBtn}>
                ⚡ Start Now (+2 hrs)
              </button>
              <button type="button" onClick={applyPreset15Min} style={presetBtn}>
                🕒 In 15 Mins (+2 hrs)
              </button>
              <button type="button" onClick={applyPresetTomorrow} style={presetBtn}>
                🌅 Tomorrow 9am – 5pm
              </button>
            </div>
          </div>

          {/* Schedule Summary Preview Card */}
          <div style={schedulePreviewCard}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
              <div>
                <span style={previewLabel}>Scheduled Window:</span>
                <div style={{ fontSize: "0.85rem", color: "#f8fafc", fontWeight: 700, marginTop: "2px" }}>
                  {scheduledStart ? new Date(scheduledStart).toLocaleString("en-IN") : "—"} &nbsp;➔&nbsp; {scheduledEnd ? new Date(scheduledEnd).toLocaleString("en-IN") : "—"}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <span style={previewLabel}>Total Duration:</span>
                <div style={{ fontSize: "0.95rem", color: "#38bdf8", fontWeight: 800 }}>
                  {getDurationText()}
                </div>
              </div>
            </div>

            {scheduledStart && new Date(scheduledStart).getTime() > Date.now() + 60000 && (
              <div style={futureNotice}>
                ℹ️ <strong>Future Start Time:</strong> Once scheduled, the contract will be registered as Open on-chain, but voting will remain locked until this date/time arrives.
              </div>
            )}
          </div>

          {/* Schedule Submit Button */}
          <button
            type="button"
            onClick={handleScheduleElection}
            disabled={openLoading}
            style={{ ...actionBtn, background: "#4f46e5", marginTop: "12px" }}
          >
            {openLoading ? "Broadcasting Schedule to Ethereum..." : "🗓️ Schedule Election On-Chain"}
          </button>
        </div>
      )}

      {/* Broadcast Receipt Box */}
      {openResult && (
        <div style={receiptBox}>
          <div style={{ color: "#10b981", fontWeight: "bold", marginBottom: "8px" }}>
            ✅ Election {isDemoMode ? "Opened" : "Scheduled"} Successfully on Blockchain!
          </div>
          <div style={receiptGrid}>
            <div><span style={rLabel}>Tx Hash</span><div style={rHash}>{openResult.tx_hash}</div></div>
            <div><span style={rLabel}>Block</span><div style={rVal}>#{openResult.block_number}</div></div>
            <div><span style={rLabel}>Start Time</span><div style={rVal}>{fmt(openResult.start_time)}</div></div>
            <div><span style={rLabel}>End Time</span><div style={rVal}>{fmt(openResult.end_time)}</div></div>
          </div>
        </div>
      )}

      {/* 🔒 Close Election Early */}
      <div style={{ ...sectionBox, borderColor: "#7f1d1d", marginTop: "1rem" }}>
        <h3 style={{ ...sectionTitle, color: "#fca5a5" }}>🔒 Close Election Early</h3>
        <p style={hint}>
          Permanently concludes voting on-chain. Smart contract emits <code>ElectionClosed</code> event and blocks any further ballot submission.
        </p>

        <button
          type="button"
          onClick={handleCloseElection}
          disabled={closeLoading}
          style={{ ...actionBtn, background: "#b91c1c" }}
        >
          {closeLoading ? "Broadcasting to Ethereum..." : "🔒 Conclude Election (Finalize Standings)"}
        </button>

        {closeResult && (
          <div style={{ ...receiptBox, borderColor: "#b91c1c", background: "#1a0505" }}>
            <div style={{ color: "#fca5a5", fontWeight: "bold", marginBottom: "8px" }}>
              🔒 Election Concluded &amp; Permanently Closed
            </div>
            <div style={receiptGrid}>
              <div><span style={rLabel}>Tx Hash</span><div style={rHash}>{closeResult.tx_hash}</div></div>
              <div><span style={rLabel}>Block</span><div style={rVal}>#{closeResult.block_number}</div></div>
              <div><span style={rLabel}>Total Final Ballots</span><div style={rVal}>{closeResult.total_votes}</div></div>
            </div>
          </div>
        )}
      </div>

      {/* Error Banner */}
      {error && (
        <div style={errorBox}>
          <span>⚠️ {error}</span>
        </div>
      )}
    </div>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────

const cardStyle = {
  background: "#1e293b",
  border: "1px solid #334155",
  borderRadius: "12px",
  padding: "1.5rem",
  boxShadow: "0 10px 25px -5px rgba(0,0,0,0.3)"
};

const cardTitle = { margin: "0 0 4px", fontSize: "1.3rem", color: "#38bdf8", fontWeight: 700 };
const subtitle  = { margin: "0 0 1.2rem", fontSize: "0.8rem", color: "#94a3b8" };

const factoryResetBtn = {
  background: "#4c0519",
  color: "#fecdd3",
  border: "1px solid #be123c",
  padding: "8px 14px",
  borderRadius: "8px",
  fontSize: "0.82rem",
  fontWeight: "bold",
  cursor: "pointer",
  transition: "all 0.2s"
};

const resetSuccessBanner = {
  background: "#022c22",
  border: "1px solid #059669",
  borderRadius: "8px",
  padding: "12px 16px",
  color: "#ecfdf5",
  marginBottom: "1rem",
  display: "flex",
  alignItems: "center",
  gap: "12px"
};

const demoModeContainer = {
  background: "#0b1329",
  border: "1px solid #1e3a8a",
  borderRadius: "10px",
  padding: "14px 18px",
  marginBottom: "1.2rem",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  flexWrap: "wrap",
  gap: "14px"
};

const modeIndicatorIcon = (isDemo) => ({
  fontSize: "1.5rem",
  background: isDemo ? "#0c4a6e" : "#3b0764",
  border: `1px solid ${isDemo ? "#0284c7" : "#7c3aed"}`,
  borderRadius: "10px",
  padding: "8px 10px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center"
});

const modeBadge = (isDemo) => ({
  background: isDemo ? "#065f46" : "#581c87",
  color: isDemo ? "#6ee7b7" : "#e9d5ff",
  fontSize: "0.72rem",
  fontWeight: 800,
  padding: "2px 8px",
  borderRadius: "6px",
  letterSpacing: "0.5px"
});

const demoToggleBtn = (isDemo) => ({
  background: isDemo ? "#0369a1" : "#6d28d9",
  color: "#fff",
  border: `1px solid ${isDemo ? "#38bdf8" : "#a855f7"}`,
  borderRadius: "8px",
  padding: "8px 14px",
  fontSize: "0.85rem",
  fontWeight: 700,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  gap: "8px",
  boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
  transition: "all 0.2s"
});

const switchSlider = (isDemo) => ({
  background: isDemo ? "#22c55e" : "#ec4899",
  color: "#fff",
  padding: "2px 8px",
  borderRadius: "12px",
  fontSize: "0.75rem",
  fontWeight: 800
});

const sectionBox = {
  background: "#0f172a",
  border: "1px solid #1e293b",
  borderRadius: "8px",
  padding: "1rem",
  marginBottom: "1rem"
};

const sectionTitle = { margin: "0 0 6px", fontSize: "1rem", color: "#f8fafc", fontWeight: 600 };
const hint = { margin: "0 0 12px", fontSize: "0.78rem", color: "#64748b" };

const demoPill = {
  background: "#064e3b",
  color: "#34d399",
  fontSize: "0.7rem",
  padding: "2px 8px",
  borderRadius: "10px",
  fontWeight: 700
};

const schedulePill = {
  background: "#312e81",
  color: "#a5b4fc",
  fontSize: "0.7rem",
  padding: "2px 8px",
  borderRadius: "10px",
  fontWeight: 700
};

const fieldLabel = { fontSize: "0.85rem", color: "#94a3b8", fontWeight: 600 };
const selectInput = {
  padding: "6px 12px",
  background: "#020617",
  border: "1px solid #334155",
  borderRadius: "6px",
  color: "#f8fafc",
  fontSize: "0.85rem"
};

const actionBtn = {
  width: "100%",
  padding: "11px",
  color: "#fff",
  border: "none",
  borderRadius: "8px",
  fontWeight: "bold",
  fontSize: "0.9rem",
  cursor: "pointer",
  transition: "opacity 0.2s"
};

const dateTimeGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: "14px",
  marginBottom: "12px"
};

const inputGroup = {
  display: "flex",
  flexDirection: "column",
  gap: "6px"
};

const inputLabel = {
  fontSize: "0.82rem",
  color: "#cbd5e1",
  fontWeight: 600,
  display: "flex",
  alignItems: "center",
  gap: "4px"
};

const reqStar = { color: "#f43f5e", fontWeight: "bold" };

const dateTimeInput = {
  padding: "8px 12px",
  background: "#020617",
  border: "1px solid #475569",
  borderRadius: "6px",
  color: "#f8fafc",
  fontSize: "0.88rem",
  fontFamily: "inherit"
};

const inputHelp = {
  fontSize: "0.7rem",
  color: "#64748b"
};

const presetBtn = {
  background: "#1e293b",
  color: "#93c5fd",
  border: "1px solid #3b82f6",
  borderRadius: "6px",
  padding: "4px 8px",
  fontSize: "0.74rem",
  fontWeight: 600,
  cursor: "pointer"
};

const schedulePreviewCard = {
  background: "#090d16",
  border: "1px solid #334155",
  borderRadius: "8px",
  padding: "10px 14px",
  marginTop: "10px"
};

const previewLabel = {
  fontSize: "0.68rem",
  color: "#94a3b8",
  textTransform: "uppercase",
  fontWeight: 700
};

const futureNotice = {
  marginTop: "8px",
  padding: "8px 10px",
  background: "#1e1b4b",
  border: "1px solid #4338ca",
  borderRadius: "6px",
  color: "#c7d2fe",
  fontSize: "0.76rem"
};

const receiptBox  = { marginTop: "12px", padding: "12px", background: "#022c22", border: "1px solid #059669", borderRadius: "8px" };
const receiptGrid = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginTop: "6px" };
const rLabel = { display: "block", fontSize: "0.68rem", color: "#a7f3d0", textTransform: "uppercase" };
const rVal   = { fontSize: "0.85rem", color: "#ecfdf5", fontWeight: "bold" };
const rHash  = { fontSize: "0.72rem", fontFamily: "JetBrains Mono, monospace", color: "#6ee7b7", wordBreak: "break-all" };

const errorBox = {
  marginTop: "10px",
  padding: "10px",
  background: "#450a0a",
  border: "1px solid #ef4444",
  borderRadius: "8px",
  color: "#fca5a5",
  fontSize: "0.85rem"
};
