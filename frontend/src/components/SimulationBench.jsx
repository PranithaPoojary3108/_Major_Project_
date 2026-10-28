import React, { useState } from 'react';

const API_BASE = "http://127.0.0.1:5000";

export default function SimulationBench({ onSimulationComplete }) {
  const [runningScenario, setRunningScenario] = useState(null);
  const [simulationResult, setSimulationResult] = useState(null);
  const [error, setError] = useState("");

  const scenarios = [
    {
      id: "legitimate_vote",
      title: "Scenario 1: Legitimate Citizen Voting Flow",
      description: "Demonstrates full legitimate workflow: Extract 128-d biometric template, register on Ethereum smart contract, verify live biometric match, and cast ballot for Candidate #1.",
      badge: "Full End-to-End Success",
      badgeColor: "#10b981",
      buttonText: "Run Legitimate Vote Scenario"
    },
    {
      id: "impostor_attack",
      title: "Scenario 2: Impostor Biometric Attack Prevention",
      description: "Tests biometric security boundary: Impostor presents foreign fingerprint scan. Demonstrates that Siamese CNN Euclidean distance exceeds threshold (τ=0.2385) and blocks transaction before ledger submission.",
      badge: "Security Defense Test",
      badgeColor: "#ef4444",
      buttonText: "Simulate Impostor Attack"
    },
    {
      id: "double_vote",
      title: "Scenario 3: Double Voting Prevention Test",
      description: "Tests smart contract rule enforcement: Citizen who has already voted attempts to submit a second ballot. Smart contract halts transaction with 'You have already cast your ballot.'",
      badge: "Smart Contract Integrity",
      badgeColor: "#f59e0b",
      buttonText: "Attempt Double Vote"
    },
    {
      id: "unregistered_vote",
      title: "Scenario 4: Unregistered Citizen Rejection",
      description: "Tests voter authorization mapping: An unregistered wallet attempts to submit a ballot. Smart contract reverts with 'You are not registered to vote.'",
      badge: "Eligibility Barrier",
      badgeColor: "#8b5cf6",
      buttonText: "Attempt Unregistered Vote"
    }
  ];

  const handleRunScenario = async (scenarioId) => {
    setRunningScenario(scenarioId);
    setError("");
    setSimulationResult(null);

    try {
      const res = await fetch(`${API_BASE}/api/simulate/run-scenario`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenario: scenarioId })
      });
      const data = await res.json();

      if (res.ok) {
        setSimulationResult(data);
        if (onSimulationComplete) onSimulationComplete();
      } else {
        setError(data.error || "Simulation run encountered an error.");
      }
    } catch {
      setError("Unable to communicate with backend simulation engine.");
    } finally {
      setRunningScenario(null);
    }
  };

  return (
    <div style={cardStyle}>
      <div style={titleHeader}>
        <div>
          <h2 style={cardTitle}>🧪 Automated Evaluation & Simulation Test Bench</h2>
          <p style={subtitle}>Fulfilling Project Objective 5: Synthetic Election Simulations & Experimental Verification</p>
        </div>
      </div>

      <div style={scenariosGrid}>
        {scenarios.map((sc) => {
          const isRunning = runningScenario === sc.id;
          return (
            <div key={sc.id} style={scenarioCard}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                <span style={{
                  ...scenarioBadge,
                  background: `${sc.badgeColor}22`,
                  color: sc.badgeColor,
                  borderColor: sc.badgeColor
                }}>
                  {sc.badge}
                </span>
              </div>

              <h3 style={scenarioTitle}>{sc.title}</h3>
              <p style={scenarioDesc}>{sc.description}</p>

              <button
                type="button"
                onClick={() => handleRunScenario(sc.id)}
                disabled={runningScenario !== null}
                style={{
                  ...scenarioBtn,
                  background: isRunning ? "#334155" : sc.badgeColor,
                  color: "#fff"
                }}
              >
                {isRunning ? "Executing Test Scenario..." : sc.buttonText}
              </button>
            </div>
          );
        })}
      </div>

      {error && <div style={errorBanner}>⚠️ {error}</div>}

      {/* Terminal Logs View */}
      {simulationResult && (
        <div style={terminalContainer}>
          <div style={terminalHeader}>
            <div style={{ display: "flex", gap: "6px" }}>
              <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#ef4444", display: "inline-block" }} />
              <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#f59e0b", display: "inline-block" }} />
              <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#10b981", display: "inline-block" }} />
            </div>
            <div style={{ fontSize: "0.8rem", color: "#94a3b8" }}>
              Simulation Audit Console &bull; Status: <strong style={{ color: "#38bdf8" }}>{simulationResult.status}</strong>
            </div>
          </div>

          <div style={terminalBody}>
            {simulationResult.logs?.map((log, i) => (
              <div key={i} style={logLine}>
                <span style={{ color: "#64748b", marginRight: "8px" }}>&gt;</span>
                <span style={{
                  color: log.includes("[DEFENSE SUCCESS]") || log.includes("[Step 4 Result]") ? "#10b981"
                       : log.includes("[Attack Simulation]") || log.includes("[Duplicate Vote Test]") ? "#f59e0b"
                       : log.includes("[ERROR]") ? "#ef4444"
                       : "#f1f5f9"
                }}>
                  {log}
                </span>
              </div>
            ))}

            <div style={summaryBox}>
              <strong>Evaluation Summary:</strong> {simulationResult.summary}
            </div>
          </div>
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

const titleHeader = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.2rem" };
const cardTitle = { margin: 0, fontSize: "1.3rem", color: "#38bdf8", fontWeight: 700 };
const subtitle = { margin: "4px 0 0", fontSize: "0.8rem", color: "#94a3b8" };

const scenariosGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: "1rem"
};

const scenarioCard = {
  background: "#0f172a",
  border: "1px solid #1e293b",
  borderRadius: "10px",
  padding: "1rem",
  display: "flex",
  flexDirection: "column",
  justifyContent: "space-between"
};

const scenarioBadge = { padding: "2px 8px", borderRadius: "12px", fontSize: "0.7rem", fontWeight: "bold", border: "1px solid" };
const scenarioTitle = { fontSize: "0.95rem", color: "#f8fafc", margin: "8px 0 4px", fontWeight: 600 };
const scenarioDesc = { fontSize: "0.78rem", color: "#94a3b8", lineHeight: 1.4, marginBottom: "12px", flex: 1 };

const scenarioBtn = {
  width: "100%",
  padding: "10px",
  border: "none",
  borderRadius: "6px",
  fontWeight: "bold",
  fontSize: "0.85rem",
  cursor: "pointer",
  transition: "opacity 0.2s"
};

const errorBanner = { marginTop: "1rem", padding: "10px", background: "#450a0a", border: "1px solid #ef4444", borderRadius: "8px", color: "#fca5a5", fontSize: "0.85rem" };

const terminalContainer = {
  marginTop: "1.5rem",
  background: "#020617",
  border: "1px solid #334155",
  borderRadius: "8px",
  overflow: "hidden"
};

const terminalHeader = {
  background: "#0f172a",
  padding: "8px 12px",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  borderBottom: "1px solid #1e293b"
};

const terminalBody = {
  padding: "1rem",
  fontFamily: "JetBrains Mono, monospace",
  fontSize: "0.82rem",
  lineHeight: 1.6,
  maxHeight: "350px",
  overflowY: "auto"
};

const logLine = { marginBottom: "4px", wordBreak: "break-all" };

const summaryBox = {
  marginTop: "12px",
  padding: "8px 10px",
  background: "#1e293b",
  borderLeft: "3px solid #38bdf8",
  borderRadius: "4px",
  color: "#cbd5e1",
  fontSize: "0.8rem"
};
