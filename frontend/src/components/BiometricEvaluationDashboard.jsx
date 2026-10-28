import React, { useState, useEffect } from 'react';

const API_BASE = "http://127.0.0.1:5000";

export default function BiometricEvaluationDashboard() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [evalPairs, setEvalPairs] = useState(150);
  const [error, setError] = useState("");

  const fetchSummary = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/biometrics/evaluation-summary`);
      const data = await res.json();
      if (res.ok) {
        setSummary(data);
      } else {
        setError(data.error || "Failed to fetch evaluation summary.");
      }
    } catch {
      setError("Could not reach backend service.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSummary();
  }, []);

  const handleRunEvaluation = async () => {
    setEvaluating(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/api/biometrics/evaluate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          num_genuine: parseInt(evalPairs, 10),
          num_impostor: parseInt(evalPairs, 10)
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSummary(data.summary);
      } else {
        setError(data.error || "Evaluation failed to complete.");
      }
    } catch {
      setError("Evaluation request failed. Ensure Flask backend is running.");
    } finally {
      setEvaluating(false);
    }
  };

  const metrics = summary?.metrics_at_threshold;
  const protocol = summary?.evaluation_protocol;
  const eer = summary?.eer_analysis;
  const latency = summary?.latency_analysis;
  const thresholdCurve = summary?.threshold_curve || [];
  const distanceDistribution = summary?.distance_distribution || [];

  return (
    <div style={containerStyle}>
      {/* Header Banner */}
      <div style={headerCard}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
          <div>
            <div style={badgeStyle}>BIOMETRIC PERFORMANCE BENCHMARK &bull; SIAMESE RESIDUAL CNN</div>
            <h2 style={titleStyle}>🔬 Biometric Verification Performance Evaluation</h2>
            <p style={subtitleStyle}>
              Empirical Evaluation using SOCOFing Real Dataset (600 Subjects, 6000 Fingerprints).
              Evaluates Genuine vs. Impostor Discrimination on Disjoint Identity Partitions.
            </p>
          </div>

          <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
            <a
              href={`${API_BASE}/api/biometrics/export/csv`}
              download="biometric_comparison_pairs.csv"
              style={exportBtn}
              title="Export all evaluated pair comparisons to CSV"
            >
              📥 Export CSV
            </a>
            <a
              href={`${API_BASE}/api/biometrics/export/json`}
              download="biometric_evaluation_report.json"
              style={exportBtn}
              title="Export comprehensive evaluation metrics report in JSON format"
            >
              📥 Export JSON
            </a>
          </div>
        </div>

        {/* Evaluation Controls */}
        <div style={controlBar}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "0.85rem", color: "#94a3b8", fontWeight: 600 }}>Test Comparisons:</span>
            <select
              value={evalPairs}
              onChange={(e) => setEvalPairs(e.target.value)}
              style={selectStyle}
              disabled={evaluating}
            >
              <option value="50">50 Genuine + 50 Impostor Pairs (Quick)</option>
              <option value="150">150 Genuine + 150 Impostor Pairs (Recommended)</option>
              <option value="300">300 Genuine + 300 Impostor Pairs (Deep)</option>
              <option value="500">500 Genuine + 500 Impostor Pairs (Comprehensive)</option>
            </select>
          </div>

          <button
            type="button"
            onClick={handleRunEvaluation}
            disabled={evaluating}
            style={runBtn}
          >
            {evaluating ? "⏳ Running Siamese Inference & Benchmark..." : "⚡ Run Real-Time Biometric Evaluation"}
          </button>
        </div>

        {error && (
          <div style={errorBanner}>
            ⚠️ {error}
          </div>
        )}
      </div>

      {loading && !summary && (
        <div style={loadingBox}>
          <span>⏳ Loading latest biometric evaluation metrics from model inference engine...</span>
        </div>
      )}

      {/* Summary KPI Cards */}
      {metrics && (
        <div style={kpiGrid}>
          {/* GAR */}
          <div style={kpiCard}>
            <span style={kpiLabel}>Genuine Acceptance (GAR)</span>
            <div style={{ ...kpiValue, color: "#10b981" }}>{metrics.gar_pct}%</div>
            <span style={kpiSub}>1 - FRR ({metrics.tp} verified / {metrics.tp + metrics.fn})</span>
          </div>

          {/* FAR */}
          <div style={kpiCard}>
            <span style={kpiLabel}>False Acceptance (FAR)</span>
            <div style={{ ...kpiValue, color: metrics.far_pct <= 1.0 ? "#10b981" : "#ef4444" }}>
              {metrics.far_pct}%
            </div>
            <span style={kpiSub}>Impostors accepted: {metrics.fp} / {metrics.fp + metrics.tn}</span>
          </div>

          {/* FRR */}
          <div style={kpiCard}>
            <span style={kpiLabel}>False Rejection (FRR)</span>
            <div style={{ ...kpiValue, color: metrics.frr_pct <= 2.0 ? "#38bdf8" : "#f59e0b" }}>
              {metrics.frr_pct}%
            </div>
            <span style={kpiSub}>Legitimate denied: {metrics.fn} / {metrics.tp + metrics.fn}</span>
          </div>

          {/* EER */}
          <div style={kpiCard}>
            <span style={kpiLabel}>Equal Error Rate (EER)</span>
            <div style={{ ...kpiValue, color: "#8b5cf6" }}>{eer?.eer_pct}%</div>
            <span style={kpiSub}>Optimal Operating &tau; = {eer?.optimal_threshold}</span>
          </div>

          {/* Pairwise Accuracy */}
          <div style={kpiCard}>
            <span style={kpiLabel}>Pairwise Accuracy</span>
            <div style={{ ...kpiValue, color: "#f8fafc" }}>{metrics.accuracy_pct}%</div>
            <span style={kpiSub}>Precision: {metrics.precision_pct}% | F1: {metrics.f1_score}</span>
          </div>

          {/* Inference Latency */}
          <div style={kpiCard}>
            <span style={kpiLabel}>Average Comparison Latency</span>
            <div style={{ ...kpiValue, color: "#38bdf8" }}>{latency?.average_ms} ms</div>
            <span style={kpiSub}>Median: {latency?.median_ms} ms &bull; Real Inference</span>
          </div>
        </div>
      )}

      {/* Protocol & Rigor Notice */}
      {protocol && (
        <div style={protocolBanner}>
          <span style={{ fontSize: "1.4rem" }}>📋</span>
          <div style={{ flex: 1 }}>
            <strong>Evaluation Protocol: {protocol.test_split_strategy}</strong>
            <div style={{ fontSize: "0.78rem", color: "#cbd5e1", marginTop: "3px" }}>
              Evaluated on <strong>{protocol.tested_identities_count} distinct voter subjects</strong> ({protocol.tested_genuine_pairs} genuine comparisons + {protocol.tested_impostor_pairs} impostor comparisons = {protocol.total_evaluations} total decisions).
              Configured Operational Threshold: <code style={codePill}>&tau; = {metrics?.threshold}</code> (Distances &le; &tau; are accepted as legitimate citizen matches).
            </div>
          </div>
        </div>
      )}

      {/* Visual Charts Grid */}
      <div style={chartsGrid}>
        {/* Chart 1: Threshold Trade-off Curve (FAR, FRR, GAR) */}
        <div style={chartCard}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
            <div>
              <h3 style={chartTitle}>📈 Threshold Trade-off Curve (FAR, FRR, GAR)</h3>
              <p style={chartSub}>Operating characteristic curve across Euclidean distance thresholds &tau; &isin; [0.05, 1.00]</p>
            </div>
            <div style={legendBox}>
              <span style={{ color: "#ef4444", fontSize: "0.75rem", fontWeight: 700 }}>&mdash; FAR</span>
              <span style={{ color: "#f59e0b", fontSize: "0.75rem", fontWeight: 700 }}>&mdash; FRR</span>
              <span style={{ color: "#10b981", fontSize: "0.75rem", fontWeight: 700 }}>&mdash; GAR</span>
              <span style={{ color: "#38bdf8", fontSize: "0.75rem", fontWeight: 700 }}>| Configured &tau; (0.2385)</span>
            </div>
          </div>

          {/* SVG Threshold Curve */}
          <div style={{ width: "100%", height: "240px", position: "relative" }}>
            <svg viewBox="0 0 600 220" style={{ width: "100%", height: "100%", overflow: "visible" }}>
              {/* Grid lines */}
              <line x1="40" y1="20" x2="580" y2="20" stroke="#1e293b" strokeDasharray="3,3" />
              <line x1="40" y1="65" x2="580" y2="65" stroke="#1e293b" strokeDasharray="3,3" />
              <line x1="40" y1="110" x2="580" y2="110" stroke="#1e293b" strokeDasharray="3,3" />
              <line x1="40" y1="155" x2="580" y2="155" stroke="#1e293b" strokeDasharray="3,3" />
              <line x1="40" y1="200" x2="580" y2="200" stroke="#334155" />
              <line x1="40" y1="20" x2="40" y2="200" stroke="#334155" />

              {/* Y Axis Labels */}
              <text x="32" y="24" fill="#64748b" fontSize="10" textAnchor="end">100%</text>
              <text x="32" y="69" fill="#64748b" fontSize="10" textAnchor="end">75%</text>
              <text x="32" y="114" fill="#64748b" fontSize="10" textAnchor="end">50%</text>
              <text x="32" y="159" fill="#64748b" fontSize="10" textAnchor="end">25%</text>
              <text x="32" y="204" fill="#64748b" fontSize="10" textAnchor="end">0%</text>

              {/* Threshold Curve Lines */}
              {thresholdCurve.length > 1 && (
                <>
                  {/* FAR Path */}
                  <polyline
                    fill="none"
                    stroke="#ef4444"
                    strokeWidth="2.5"
                    points={thresholdCurve.map((pt, idx) => {
                      const x = 40 + (idx / (thresholdCurve.length - 1)) * 540;
                      const y = 200 - (pt.far / 100.0) * 180;
                      return `${x},${y}`;
                    }).join(" ")}
                  />

                  {/* FRR Path */}
                  <polyline
                    fill="none"
                    stroke="#f59e0b"
                    strokeWidth="2.5"
                    points={thresholdCurve.map((pt, idx) => {
                      const x = 40 + (idx / (thresholdCurve.length - 1)) * 540;
                      const y = 200 - (pt.frr / 100.0) * 180;
                      return `${x},${y}`;
                    }).join(" ")}
                  />

                  {/* GAR Path */}
                  <polyline
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="2.5"
                    points={thresholdCurve.map((pt, idx) => {
                      const x = 40 + (idx / (thresholdCurve.length - 1)) * 540;
                      const y = 200 - (pt.gar / 100.0) * 180;
                      return `${x},${y}`;
                    }).join(" ")}
                  />

                  {/* Operational Threshold Marker (0.2385) */}
                  <line
                    x1={40 + ((0.2385 - 0.05) / (1.00 - 0.05)) * 540}
                    y1="10"
                    x2={40 + ((0.2385 - 0.05) / (1.00 - 0.05)) * 540}
                    y2="200"
                    stroke="#38bdf8"
                    strokeWidth="2"
                    strokeDasharray="4,4"
                  />
                  <text
                    x={40 + ((0.2385 - 0.05) / (1.00 - 0.05)) * 540}
                    y="12"
                    fill="#38bdf8"
                    fontSize="10"
                    fontWeight="bold"
                    textAnchor="middle"
                  >
                    &tau;=0.2385
                  </text>
                </>
              )}
            </svg>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: "8px", fontSize: "0.75rem", color: "#64748b", paddingLeft: "40px" }}>
            <span>&tau; = 0.05 (High Security)</span>
            <span>&tau; = 0.50</span>
            <span>&tau; = 1.00 (High Leniency)</span>
          </div>
        </div>

        {/* Chart 2: Genuine vs. Impostor Distance Histogram */}
        <div style={chartCard}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
            <div>
              <h3 style={chartTitle}>📊 Distance Separation Distribution</h3>
              <p style={chartSub}>Histogram showing genuine match cluster vs. impostor separation</p>
            </div>
            <div style={legendBox}>
              <span style={{ color: "#10b981", fontSize: "0.75rem", fontWeight: 700 }}>■ Genuine Pairs</span>
              <span style={{ color: "#ef4444", fontSize: "0.75rem", fontWeight: 700 }}>■ Impostor Pairs</span>
            </div>
          </div>

          {/* SVG Distance Histogram */}
          <div style={{ width: "100%", height: "240px", position: "relative" }}>
            <svg viewBox="0 0 600 220" style={{ width: "100%", height: "100%", overflow: "visible" }}>
              <line x1="40" y1="200" x2="580" y2="200" stroke="#334155" />
              <line x1="40" y1="20" x2="40" y2="200" stroke="#334155" />

              {/* Render Distribution Bars */}
              {distanceDistribution.map((bin, idx) => {
                const totalInBin = Math.max(1, Math.max(...distanceDistribution.map(b => Math.max(b.genuine_count, b.impostor_count))));
                const maxBarH = 170;
                const barW = 12;
                const x = 50 + idx * 17;

                const genH = (bin.genuine_count / totalInBin) * maxBarH;
                const impH = (bin.impostor_count / totalInBin) * maxBarH;

                return (
                  <g key={bin.range}>
                    {/* Genuine Bar */}
                    {genH > 0 && (
                      <rect
                        x={x}
                        y={200 - genH}
                        width={barW / 2}
                        height={genH}
                        fill="#10b981"
                        opacity="0.85"
                        rx="1"
                      />
                    )}
                    {/* Impostor Bar */}
                    {impH > 0 && (
                      <rect
                        x={x + barW / 2}
                        y={200 - impH}
                        width={barW / 2}
                        height={impH}
                        fill="#ef4444"
                        opacity="0.85"
                        rx="1"
                      />
                    )}
                  </g>
                );
              })}

              {/* Threshold line on Histogram */}
              <line
                x1={50 + (0.2385 / 1.5) * 510}
                y1="20"
                x2={50 + (0.2385 / 1.5) * 510}
                y2="200"
                stroke="#38bdf8"
                strokeWidth="2"
                strokeDasharray="4,4"
              />
              <text
                x={50 + (0.2385 / 1.5) * 510}
                y="15"
                fill="#38bdf8"
                fontSize="10"
                fontWeight="bold"
                textAnchor="middle"
              >
                Threshold &tau;=0.2385
              </text>
            </svg>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: "8px", fontSize: "0.75rem", color: "#64748b", paddingLeft: "40px" }}>
            <span>d = 0.0 (Identical)</span>
            <span>d = 0.75 (Boundary)</span>
            <span>d = 1.50 (Far Impostor)</span>
          </div>
        </div>
      </div>

      {/* Confusion Matrix & Verification Decision Breakdown */}
      {metrics && (
        <div style={confusionCard}>
          <h3 style={chartTitle}>🔢 Biometric Verification Decision Matrix (&tau; = {metrics.threshold})</h3>
          <div style={matrixGrid}>
            <div style={{ ...matrixCell, borderColor: "#10b981", background: "rgba(16, 185, 129, 0.08)" }}>
              <span style={matrixLabel}>True Accept (TP - Genuine Verified)</span>
              <div style={{ ...matrixValue, color: "#10b981" }}>{metrics.tp}</div>
              <span style={matrixDesc}>Citizens correctly authenticated to cast ballots</span>
            </div>
            <div style={{ ...matrixCell, borderColor: "#ef4444", background: "rgba(239, 68, 68, 0.08)" }}>
              <span style={matrixLabel}>False Accept (FP - Impostor Accepted)</span>
              <div style={{ ...matrixValue, color: "#ef4444" }}>{metrics.fp}</div>
              <span style={matrixDesc}>Fraudulent attempts erroneously accepted (Security Risk)</span>
            </div>
            <div style={{ ...matrixCell, borderColor: "#f59e0b", background: "rgba(245, 158, 11, 0.08)" }}>
              <span style={matrixLabel}>False Reject (FN - Genuine Denied)</span>
              <div style={{ ...matrixValue, color: "#f59e0b" }}>{metrics.fn}</div>
              <span style={matrixDesc}>Eligible citizens incorrectly rejected at booth (Inconvenience)</span>
            </div>
            <div style={{ ...matrixCell, borderColor: "#38bdf8", background: "rgba(56, 189, 248, 0.08)" }}>
              <span style={matrixLabel}>True Reject (TN - Impostor Blocked)</span>
              <div style={{ ...matrixValue, color: "#38bdf8" }}>{metrics.tn}</div>
              <span style={matrixDesc}>Impostor scans correctly blocked before blockchain mempool</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────

const containerStyle = {
  display: "flex",
  flexDirection: "column",
  gap: "1.2rem"
};

const headerCard = {
  background: "#1e293b",
  border: "1px solid #334155",
  borderRadius: "12px",
  padding: "1.5rem",
  boxShadow: "0 10px 25px -5px rgba(0,0,0,0.3)"
};

const badgeStyle = { fontSize: "0.72rem", color: "#38bdf8", fontWeight: 700, letterSpacing: "0.5px" };
const titleStyle = { margin: "4px 0 6px", fontSize: "1.35rem", color: "#f8fafc", fontWeight: 800 };
const subtitleStyle = { margin: 0, fontSize: "0.82rem", color: "#94a3b8" };

const exportBtn = {
  background: "#0f172a",
  border: "1px solid #334155",
  color: "#38bdf8",
  padding: "8px 12px",
  borderRadius: "6px",
  fontSize: "0.8rem",
  fontWeight: 600,
  textDecoration: "none",
  display: "inline-block"
};

const controlBar = {
  marginTop: "1.2rem",
  paddingTop: "1rem",
  borderTop: "1px solid #334155",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  flexWrap: "wrap",
  gap: "12px"
};

const selectStyle = {
  padding: "7px 12px",
  background: "#020617",
  border: "1px solid #334155",
  borderRadius: "6px",
  color: "#f8fafc",
  fontSize: "0.85rem"
};

const runBtn = {
  background: "linear-gradient(90deg, #0284c7, #2563eb)",
  color: "#fff",
  border: "none",
  padding: "10px 18px",
  borderRadius: "8px",
  fontWeight: "bold",
  fontSize: "0.88rem",
  cursor: "pointer",
  boxShadow: "0 4px 12px rgba(2, 132, 199, 0.3)"
};

const loadingBox = {
  padding: "2rem",
  textAlign: "center",
  background: "#1e293b",
  borderRadius: "10px",
  color: "#94a3b8",
  border: "1px solid #334155"
};

const kpiGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: "12px"
};

const kpiCard = {
  background: "#1e293b",
  border: "1px solid #334155",
  borderRadius: "10px",
  padding: "1rem"
};

const kpiLabel = { fontSize: "0.72rem", color: "#94a3b8", textTransform: "uppercase", fontWeight: 700 };
const kpiValue = { fontSize: "1.6rem", fontWeight: 800, margin: "4px 0" };
const kpiSub = { fontSize: "0.72rem", color: "#64748b" };

const protocolBanner = {
  background: "#082f49",
  border: "1px solid #0284c7",
  borderRadius: "8px",
  padding: "12px 16px",
  color: "#bae6fd",
  display: "flex",
  alignItems: "center",
  gap: "12px"
};

const codePill = {
  background: "#0f172a",
  padding: "2px 6px",
  borderRadius: "4px",
  color: "#38bdf8",
  fontFamily: "JetBrains Mono, monospace"
};

const chartsGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))",
  gap: "1.2rem"
};

const chartCard = {
  background: "#1e293b",
  border: "1px solid #334155",
  borderRadius: "12px",
  padding: "1.2rem"
};

const chartTitle = { margin: 0, fontSize: "1rem", color: "#f8fafc", fontWeight: 700 };
const chartSub = { margin: "2px 0 0", fontSize: "0.75rem", color: "#64748b" };
const legendBox = { display: "flex", gap: "10px", flexWrap: "wrap" };

const confusionCard = {
  background: "#1e293b",
  border: "1px solid #334155",
  borderRadius: "12px",
  padding: "1.2rem"
};

const matrixGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
  gap: "12px",
  marginTop: "1rem"
};

const matrixCell = {
  border: "1px solid",
  borderRadius: "8px",
  padding: "12px"
};

const matrixLabel = { fontSize: "0.72rem", color: "#94a3b8", textTransform: "uppercase", fontWeight: 700 };
const matrixValue = { fontSize: "1.5rem", fontWeight: 800, margin: "4px 0" };
const matrixDesc = { fontSize: "0.72rem", color: "#64748b" };

const errorBanner = {
  marginTop: "1rem",
  padding: "10px 14px",
  background: "#450a0a",
  border: "1px solid #ef4444",
  borderRadius: "8px",
  color: "#fca5a5",
  fontSize: "0.85rem"
};
