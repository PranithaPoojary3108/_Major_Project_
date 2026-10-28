import React, { useState, useEffect } from 'react';

export default function BiometricMatcher({
  onFingerprintSelect,
  selectedFile,
  verificationResult,
  loading,
  title = "Biometric Fingerprint Scanner"
}) {
  const [samples, setSamples] = useState([]);
  const [previewSrc, setPreviewSrc] = useState(null);

  useEffect(() => {
    fetch("http://127.0.0.1:5000/api/sample-fingerprints")
      .then(res => res.json())
      .then(data => {
        if (data.samples) setSamples(data.samples);
      })
      .catch(() => {});
  }, []);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setPreviewSrc(url);
      onFingerprintSelect(file, file.name);
    }
  };

  const handleSelectSample = async (sample) => {
    try {
      const response = await fetch(`http://127.0.0.1:5000${sample.preview_url}`);
      const blob = await response.blob();
      const file = new File([blob], sample.filename, { type: "image/bmp" });
      setPreviewSrc(`http://127.0.0.1:5000${sample.preview_url}`);
      onFingerprintSelect(file, sample.label);
    } catch (err) {
      console.error("Failed to load sample", err);
    }
  };

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <span style={iconStyle}>🧬</span>
        <h3 style={titleStyle}>{title}</h3>
      </div>

      <div style={contentRow}>
        <div style={previewBox}>
          {previewSrc ? (
            <img src={previewSrc} alt="Fingerprint preview" style={fingerprintImg} />
          ) : (
            <div style={placeholderBox}>
              <span style={{ fontSize: "2.5rem", opacity: 0.5 }}>🖐️</span>
              <span style={{ fontSize: "0.75rem", color: "#64748b", marginTop: "4px" }}>No Scan Loaded</span>
            </div>
          )}
        </div>

        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Upload Fingerprint (.BMP / .PNG)</label>
          <input
            type="file"
            accept=".bmp,image/bmp,.png,image/png"
            onChange={handleFileChange}
            style={fileInputStyle}
            disabled={loading}
          />

          <div style={{ marginTop: "8px" }}>
            <span style={sampleLabelStyle}>Or Quick-Select Dataset Sample:</span>
            <div style={sampleButtonGrid}>
              {samples.map((s, idx) => {
                const isImpostor = s.role === "impostor_attack";
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSelectSample(s)}
                    style={{
                      ...sampleBtn,
                      borderColor: isImpostor ? "#ef4444" : "#0284c7",
                      color: isImpostor ? "#fca5a5" : "#bae6fd"
                    }}
                    title={s.description}
                  >
                    {isImpostor ? "🚨 " : "👤 "} {s.finger} ({s.role.includes("impostor") ? "Impostor" : `Voter ${s.voter_id}`})
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {verificationResult && (
        <div style={{
          ...resultBox,
          background: verificationResult.verified ? "#064e3b" : "#450a0a",
          borderColor: verificationResult.verified ? "#10b981" : "#ef4444"
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontWeight: 600, fontSize: "0.95rem" }}>
              {verificationResult.verified ? "✅ Biometric Identity Verified" : "❌ Biometric Match Rejected"}
            </div>
            <div style={similarityTag}>
              {verificationResult.similarity_pct ?? 0}% Match
            </div>
          </div>

          <div style={metricRow}>
            <span>Euclidean Distance: <strong>{verificationResult.distance}</strong></span>
            <span>Security Threshold (τ): <strong>≤ {verificationResult.threshold}</strong></span>
          </div>

          <div style={meterTrack}>
            <div
              style={{
                ...meterFill,
                width: `${Math.min(100, Math.max(5, verificationResult.similarity_pct || 0))}%`,
                background: verificationResult.verified ? "#10b981" : "#ef4444"
              }}
            />
          </div>

          <div style={{ fontSize: "0.8rem", marginTop: "6px", opacity: 0.9 }}>
            {verificationResult.message}
          </div>
        </div>
      )}
    </div>
  );
}

const containerStyle = {
  background: "#0f172a",
  border: "1px solid #1e293b",
  borderRadius: "10px",
  padding: "1rem",
  marginBottom: "1rem"
};

const headerStyle = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  marginBottom: "12px",
  borderBottom: "1px solid #1e293b",
  paddingBottom: "8px"
};

const iconStyle = { fontSize: "1.2rem" };
const titleStyle = { margin: 0, fontSize: "1rem", color: "#38bdf8", fontWeight: 600 };
const contentRow = { display: "flex", gap: "1rem", alignItems: "flex-start" };

const previewBox = {
  width: "110px",
  height: "110px",
  background: "#020617",
  border: "1px dashed #334155",
  borderRadius: "8px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  overflow: "hidden",
  flexShrink: 0
};

const fingerprintImg = { width: "100%", height: "100%", objectFit: "cover" };
const placeholderBox = { display: "flex", flexDirection: "column", alignItems: "center" };
const labelStyle = { display: "block", fontSize: "0.8rem", color: "#94a3b8", marginBottom: "4px", fontWeight: 500 };

const fileInputStyle = {
  width: "100%",
  padding: "6px 8px",
  fontSize: "0.8rem",
  background: "#020617",
  border: "1px solid #334155",
  borderRadius: "6px",
  color: "#cbd5e1",
  boxSizing: "border-box"
};

const sampleLabelStyle = { display: "block", fontSize: "0.75rem", color: "#64748b", marginBottom: "4px" };

const sampleButtonGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
  gap: "6px"
};

const sampleBtn = {
  background: "#1e293b",
  border: "1px solid",
  padding: "5px 8px",
  borderRadius: "6px",
  fontSize: "0.75rem",
  cursor: "pointer",
  textAlign: "left",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  transition: "all 0.15s ease"
};

const resultBox = {
  marginTop: "12px",
  padding: "10px",
  borderRadius: "8px",
  border: "1px solid"
};

const similarityTag = {
  background: "rgba(0,0,0,0.3)",
  padding: "2px 8px",
  borderRadius: "12px",
  fontSize: "0.8rem",
  fontWeight: "bold"
};

const metricRow = {
  display: "flex",
  justifyContent: "space-between",
  fontSize: "0.8rem",
  marginTop: "6px",
  color: "#cbd5e1"
};

const meterTrack = {
  height: "6px",
  background: "rgba(0,0,0,0.4)",
  borderRadius: "3px",
  marginTop: "8px",
  overflow: "hidden"
};

const meterFill = { height: "100%", transition: "width 0.4s ease" };
