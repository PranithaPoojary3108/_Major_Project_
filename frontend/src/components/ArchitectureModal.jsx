import React from 'react';

export default function ArchitectureModal() {
  const layers = [
    {
      num: "Layer 1",
      name: "User Interface Layer (Client)",
      tech: "React 18, Vite, Modern Web3 UI",
      desc: "Provides citizens and election administrators with intuitive portals for voter enrollment, live biometric scanning at the voting booth, real-time results dashboards, and blockchain ledger auditing."
    },
    {
      num: "Layer 2",
      name: "Authentication Layer (ML Biometric Engine)",
      tech: "TensorFlow, Keras 3, OpenCV, CLAHE, FVC2002 Dataset",
      desc: "Deep Siamese Residual CNN extracting 128-dimensional unit-normalized biometric embeddings. Euclidean distance matching verifies identity against the calibrated operational threshold (tau = 0.2385)."
    },
    {
      num: "Layer 3",
      name: "Blockchain Layer (Distributed Ledger)",
      tech: "Ethereum EVM, Hardhat Private Test Network, Web3.py",
      desc: "Decentralized consensus network maintaining an unalterable, cryptographically signed ledger of voting transactions. Provides censorship resistance, zero single-point-of-failure, and public auditability."
    },
    {
      num: "Layer 4",
      name: "Smart Contract Layer (Governance Rules)",
      tech: "Solidity ^0.8.20 (Voting.sol)",
      desc: "Autonomous smart contract automatically enforcing election rules: commissioner authorization, voter eligibility, one-vote-per-voter policy, and automated instant vote tallying with zero human intervention."
    }
  ];

  return (
    <div style={cardStyle}>
      <div style={titleHeader}>
        <div>
          <h2 style={cardTitle}>📐 System Architecture & Cryptographic Privacy Model</h2>
          <p style={subtitle}>N.M.A.M. Institute of Technology &bull; Major Project Work Synopsis (Project Code 08)</p>
        </div>
      </div>

      {/* 4 Layers Grid */}
      <div style={layersGrid}>
        {layers.map((l, idx) => (
          <div key={idx} style={layerCard}>
            <div style={layerBadge}>{l.num}</div>
            <h3 style={layerName}>{l.name}</h3>
            <div style={techTag}>{l.tech}</div>
            <p style={layerDesc}>{l.desc}</p>
          </div>
        ))}
      </div>

      {/* Privacy Model Callout */}
      <div style={privacyBox}>
        <div style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
          <span style={{ fontSize: "1.5rem" }}>🛡️</span>
          <div>
            <h4 style={privacyTitle}>Zero-Biometric-Leakage Privacy Guarantee</h4>
            <p style={privacyText}>
              In traditional systems, storing raw biometric scans exposes citizens to identity theft. In our system:
            </p>
            <ul style={privacyList}>
              <li><strong>Raw Images Never Leave Client Unhashed:</strong> The raw fingerprint scan (.BMP) is strictly processed in memory and never written to the blockchain.</li>
              <li><strong>Irreversible Feature Extraction:</strong> The Siamese CNN maps fingerprint ridge minutiae into a compact 128-dimensional floating-point embedding on a unit hypersphere.</li>
              <li><strong>Cryptographic Template Protection:</strong> The embedding is hashed using SHA-256 into a 32-byte hash (<code>bytes32</code>). Only this irreversible cryptographic digest is stored on the Ethereum ledger.</li>
              <li><strong>Biometric Template Unlinkability:</strong> It is computationally infeasible to reconstruct the original fingerprint image from the on-chain SHA-256 hash or the off-chain embedding.</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Project Credits Footer */}
      <div style={creditsBox}>
        <div style={creditsTitle}>Department of Information Science & Engineering &bull; NMAMIT Nitte</div>
        <div style={teamGrid}>
          <div>
            <span style={creditRole}>Project Guide:</span>
            <span style={creditName}>Ms. Tanzila Nargis</span>
          </div>
          <div>
            <span style={creditRole}>Student Researchers:</span>
            <span style={creditName}>Pranitha C Poojary (NNM23IS134), Pranjali N (NNM23IS135), Raksha S Suvarna (NNM23IS143), Nireeksha (NNM23IS111)</span>
          </div>
        </div>
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

const titleHeader = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.2rem" };
const cardTitle = { margin: 0, fontSize: "1.3rem", color: "#38bdf8", fontWeight: 700 };
const subtitle = { margin: "4px 0 0", fontSize: "0.8rem", color: "#94a3b8" };

const layersGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: "1rem"
};

const layerCard = {
  background: "#0f172a",
  border: "1px solid #1e293b",
  borderRadius: "10px",
  padding: "1rem"
};

const layerBadge = {
  display: "inline-block",
  background: "#0369a1",
  color: "#bae6fd",
  padding: "2px 8px",
  borderRadius: "10px",
  fontSize: "0.7rem",
  fontWeight: "bold",
  marginBottom: "8px"
};

const layerName = { fontSize: "0.95rem", color: "#f8fafc", margin: "0 0 4px", fontWeight: 600 };
const techTag = { fontSize: "0.72rem", color: "#38bdf8", marginBottom: "8px", fontWeight: 500 };
const layerDesc = { fontSize: "0.78rem", color: "#94a3b8", lineHeight: 1.4 };

const privacyBox = {
  marginTop: "1.5rem",
  background: "#022c22",
  border: "1px solid #059669",
  borderRadius: "10px",
  padding: "1.2rem"
};

const privacyTitle = { margin: 0, fontSize: "1rem", color: "#6ee7b7", fontWeight: 700 };
const privacyText = { margin: "6px 0 8px", fontSize: "0.82rem", color: "#d1fae5" };
const privacyList = { margin: "0 0 0 1.2rem", fontSize: "0.8rem", color: "#a7f3d0", lineHeight: 1.5 };

const creditsBox = {
  marginTop: "1.5rem",
  background: "#0f172a",
  border: "1px solid #1e293b",
  borderRadius: "8px",
  padding: "1rem"
};

const creditsTitle = { fontSize: "0.8rem", color: "#38bdf8", fontWeight: 700, textTransform: "uppercase", marginBottom: "8px" };
const teamGrid = { display: "grid", gridTemplateColumns: "1fr 2fr", gap: "10px", fontSize: "0.8rem" };
const creditRole = { display: "block", color: "#64748b", fontSize: "0.7rem" };
const creditName = { color: "#f8fafc", fontWeight: 500 };
