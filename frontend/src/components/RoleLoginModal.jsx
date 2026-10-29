import React, { useState } from 'react';

const API_BASE = "http://127.0.0.1:5000";

export default function RoleLoginModal({ isOpen, onClose, onLoginSuccess, currentRole }) {
  const [activeMode, setActiveMode] = useState("quick"); // "quick" | "custom"
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleQuickLogin = async (roleKey) => {
    setLoading(true);
    setError("");
    try {
      let credentials = {};
      if (roleKey === "COMMISSIONER") {
        credentials = { username: "commissioner", password: "admin123" };
      } else if (roleKey === "AUDITOR") {
        credentials = { username: "auditor", password: "audit123" };
      } else if (roleKey === "VOTER") {
        credentials = { wallet_address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" };
      }

      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Authentication failed");

      onLoginSuccess(data.token, data.user);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCustomLogin = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError("Username and password are required.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password: password.trim() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Invalid username or password");

      onLoginSuccess(data.token, data.user);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <div style={headerStyle}>
          <div>
            <div style={badgeStyle}>🛡️ ROLE-BASED ACCESS CONTROL (RBAC)</div>
            <h3 style={titleStyle}>Authenticate & Switch Institutional Role</h3>
          </div>
          <button style={closeBtn} onClick={onClose}>✕</button>
        </div>

        <p style={{ margin: "0.5rem 0 1rem 0", color: "#94a3b8", fontSize: "0.85rem" }}>
          Current Role: <strong style={{ color: "#38bdf8" }}>{currentRole}</strong> &bull; All administrative operations enforce server-side cryptographic token validation.
        </p>

        {error && (
          <div style={errorAlert}>
            ⚠️ {error}
          </div>
        )}

        {/* Mode Selector */}
        <div style={tabSwitcher}>
          <button
            style={{ ...modeBtn, background: activeMode === "quick" ? "#0284c7" : "transparent", color: activeMode === "quick" ? "#fff" : "#94a3b8" }}
            onClick={() => setActiveMode("quick")}
          >
            ⚡ 1-Click Role Switcher
          </button>
          <button
            style={{ ...modeBtn, background: activeMode === "custom" ? "#0284c7" : "transparent", color: activeMode === "custom" ? "#fff" : "#94a3b8" }}
            onClick={() => setActiveMode("custom")}
          >
            🔑 Custom Credentials Login
          </button>
        </div>

        {activeMode === "quick" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginTop: "1rem" }}>
            {/* Commissioner Card */}
            <div
              style={{ ...roleCard, borderColor: currentRole === "COMMISSIONER" ? "#0284c7" : "#334155" }}
              onClick={() => handleQuickLogin("COMMISSIONER")}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                  <span style={{ fontSize: "1.4rem" }}>👑</span>
                  <div>
                    <strong style={{ color: "#f8fafc" }}>Election Commissioner</strong>
                    <div style={{ fontSize: "0.75rem", color: "#6ee7b7" }}>Account #0 &bull; Ms. Tanzila Nargis</div>
                  </div>
                </div>
                <button disabled={loading} style={selectRoleBtn}>
                  {loading ? "..." : (currentRole === "COMMISSIONER" ? "✓ Active" : "Select")}
                </button>
              </div>
              <div style={{ fontSize: "0.78rem", color: "#94a3b8", marginTop: "0.4rem" }}>
                Permissions: Smart contract lifecycle management, voter enrollment, biometric verification, factory reset, audit oversight.
              </div>
            </div>

            {/* Auditor Card */}
            <div
              style={{ ...roleCard, borderColor: currentRole === "AUDITOR" ? "#0284c7" : "#334155" }}
              onClick={() => handleQuickLogin("AUDITOR")}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                  <span style={{ fontSize: "1.4rem" }}>🔍</span>
                  <div>
                    <strong style={{ color: "#f8fafc" }}>Independent Electoral Auditor</strong>
                    <div style={{ fontSize: "0.75rem", color: "#fcd34d" }}>Read-Only Oversight & Compliance</div>
                  </div>
                </div>
                <button disabled={loading} style={selectRoleBtn}>
                  {loading ? "..." : (currentRole === "AUDITOR" ? "✓ Active" : "Select")}
                </button>
              </div>
              <div style={{ fontSize: "0.78rem", color: "#94a3b8", marginTop: "0.4rem" }}>
                Permissions: View tamper detection reports, inspect transaction receipts, review security logs, export compliance CSV/JSON. Restricted from modifying election or enrolling voters.
              </div>
            </div>

            {/* Voter Card */}
            <div
              style={{ ...roleCard, borderColor: currentRole === "VOTER" ? "#0284c7" : "#334155" }}
              onClick={() => handleQuickLogin("VOTER")}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                  <span style={{ fontSize: "1.4rem" }}>👤</span>
                  <div>
                    <strong style={{ color: "#f8fafc" }}>Registered Voter</strong>
                    <div style={{ fontSize: "0.75rem", color: "#38bdf8" }}>Account #1 &bull; Pranitha C Poojary (NNM23IS134)</div>
                  </div>
                </div>
                <button disabled={loading} style={selectRoleBtn}>
                  {loading ? "..." : (currentRole === "VOTER" ? "✓ Active" : "Select")}
                </button>
              </div>
              <div style={{ fontSize: "0.78rem", color: "#94a3b8", marginTop: "0.4rem" }}>
                Permissions: View voter registration eligibility, biometric authentication, cast single ballot during active window, verify receipt. All admin routes restricted.
              </div>
            </div>
          </div>
        ) : (
          <form onSubmit={handleCustomLogin} style={{ display: "flex", flexDirection: "column", gap: "1rem", marginTop: "1rem" }}>
            <div>
              <label style={labelStyle}>Username / Identifier</label>
              <input
                type="text"
                placeholder="e.g. commissioner or auditor"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Password / PIN</label>
              <input
                type="password"
                placeholder="Enter password (default: admin123 / audit123)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={inputStyle}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              style={submitBtn}
            >
              {loading ? "Authenticating..." : "🔐 Log In with Credentials"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

const overlayStyle = {
  position: "fixed",
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  background: "rgba(0, 0, 0, 0.75)",
  backdropFilter: "blur(4px)",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  zIndex: 9999,
  padding: "1rem"
};

const modalStyle = {
  background: "#0f172a",
  border: "1px solid #334155",
  borderRadius: "14px",
  width: "100%",
  maxWidth: "560px",
  padding: "1.75rem",
  boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.04)"
};

const headerStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start"
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
  fontSize: "1.25rem",
  fontWeight: "700",
  color: "#f8fafc"
};

const closeBtn = {
  background: "transparent",
  border: "none",
  color: "#94a3b8",
  fontSize: "1.2rem",
  cursor: "pointer",
  padding: "0.2rem 0.5rem"
};

const tabSwitcher = {
  display: "flex",
  background: "#1e293b",
  borderRadius: "8px",
  padding: "4px",
  gap: "4px"
};

const modeBtn = {
  flex: 1,
  border: "none",
  borderRadius: "6px",
  padding: "0.5rem",
  fontSize: "0.82rem",
  fontWeight: "600",
  cursor: "pointer",
  transition: "all 0.2s"
};

const roleCard = {
  background: "#1e293b",
  border: "1px solid #334155",
  borderRadius: "8px",
  padding: "0.9rem 1rem",
  cursor: "pointer",
  transition: "border-color 0.2s"
};

const selectRoleBtn = {
  background: "#0284c7",
  color: "#fff",
  border: "none",
  borderRadius: "4px",
  padding: "0.35rem 0.75rem",
  fontSize: "0.75rem",
  fontWeight: "700",
  cursor: "pointer"
};

const labelStyle = {
  display: "block",
  fontSize: "0.8rem",
  fontWeight: "600",
  color: "#cbd5e1",
  marginBottom: "0.35rem"
};

const inputStyle = {
  width: "100%",
  background: "#1e293b",
  color: "#f8fafc",
  border: "1px solid #334155",
  borderRadius: "6px",
  padding: "0.55rem 0.75rem",
  fontSize: "0.85rem",
  boxSizing: "border-box"
};

const submitBtn = {
  background: "#0284c7",
  color: "#fff",
  border: "none",
  borderRadius: "6px",
  padding: "0.65rem",
  fontSize: "0.85rem",
  fontWeight: "700",
  cursor: "pointer"
};

const errorAlert = {
  padding: "0.65rem 0.85rem",
  borderRadius: "6px",
  background: "#450a0a",
  border: "1px solid #dc2626",
  color: "#fecaca",
  fontSize: "0.82rem",
  marginBottom: "0.75rem"
};
