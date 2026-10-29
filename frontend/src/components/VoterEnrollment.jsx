import React, { useState, useEffect } from 'react';
import BiometricMatcher from './BiometricMatcher';
import { authenticatedFetch } from '../utils/auth';

const API_BASE = "http://127.0.0.1:5000";

export default function VoterEnrollment({ onEnrollSuccess, accounts = [], preselectedStudent, onSwitchToVote }) {
  const [studentsList, setStudentsList] = useState([]);
  const [selectedStudentUSN, setSelectedStudentUSN] = useState("");
  const [selectedAccount, setSelectedAccount] = useState("");
  const [activeStudent, setActiveStudent] = useState(null);

  const [fingerprintFile, setFingerprintFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [enrollmentResult, setEnrollmentResult] = useState(null);
  const [voterStatus, setVoterStatus] = useState(null);
  const [statusMessage, setStatusMessage] = useState(null);
  const [studentSearch, setStudentSearch] = useState("");

  // Load all 235 students from electoral roll
  const loadStudents = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/students`);
      const data = await res.json();
      if (data.students) setStudentsList(data.students);
    } catch {}
  };

  useEffect(() => {
    loadStudents();
  }, []);

  // Handle preselected student prop from Roster
  useEffect(() => {
    if (preselectedStudent) {
      setSelectedStudentUSN(preselectedStudent.usn);
      setActiveStudent(preselectedStudent);
      setSelectedAccount(preselectedStudent.assigned_wallet);
    } else if (studentsList.length > 0 && !selectedAccount) {
      const first = studentsList[0];
      setSelectedStudentUSN(first.usn);
      setActiveStudent(first);
      setSelectedAccount(first.assigned_wallet);
    }
  }, [preselectedStudent, studentsList]);

  // Fetch live voter status whenever the active wallet address changes
  const fetchLiveStatus = async (address) => {
    if (!address) {
      setVoterStatus(null);
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/api/voter-status/${address}`);
      const data = await res.json();
      setVoterStatus(data);
    } catch {
      setVoterStatus(null);
    }
  };

  useEffect(() => {
    if (selectedAccount) {
      fetchLiveStatus(selectedAccount);
    }
  }, [selectedAccount]);

  // Handle student selection from dropdown or search
  const handleSelectStudent = (usn) => {
    setSelectedStudentUSN(usn);
    setEnrollmentResult(null);
    setStatusMessage(null);
    setFingerprintFile(null);

    const s = studentsList.find(item => item.usn === usn);
    if (s) {
      setActiveStudent(s);
      setSelectedAccount(s.assigned_wallet);
    } else {
      // Check accounts list
      const acc = accounts.find(a => a.address.toLowerCase() === usn.toLowerCase());
      if (acc) {
        setActiveStudent(null);
        setSelectedAccount(acc.address);
      }
    }
  };

  // 1-Click Unified Enrollment: Extract + Hash + DB Save + On-Chain Register
  const handleUnifiedEnroll = async () => {
    if (!selectedAccount || !fingerprintFile) {
      setStatusMessage({
        type: "error",
        msg: "Please select a citizen and load a fingerprint scan before enrolling."
      });
      return;
    }

    setLoading(true);
    setStatusMessage({
      type: "info",
      msg: "Extracting 128-d Siamese CNN embedding, computing SHA-256 hash & committing to Ethereum ledger..."
    });
    setEnrollmentResult(null);

    const formData = new FormData();
    formData.append("voter_address", selectedAccount);
    formData.append("fingerprint", fingerprintFile);

    try {
      const res = await authenticatedFetch(`${API_BASE}/api/enroll-voter`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setEnrollmentResult(data);
        setStatusMessage({
          type: "success",
          msg: data.already_registered
            ? "✅ Biometric template updated off-chain! Citizen was already registered on blockchain."
            : `✅ Citizen successfully enrolled and registered on Ethereum! Block #${data.block_number}`
        });

        // Immediately update live voter status locally
        setVoterStatus({
          is_enrolled_offchain: true,
          is_registered_onchain: true,
          has_voted: false,
          biometric_hash_offchain: data.biometric_hash,
          biometric_hash_onchain: data.biometric_hash
        });

        // Refresh global state across both tabs & app
        if (onEnrollSuccess) onEnrollSuccess();
        loadStudents();
      } else {
        setStatusMessage({
          type: "error",
          msg: data.error || "Enrollment failed. Verify blockchain node is connected."
        });
      }
    } catch {
      setStatusMessage({
        type: "error",
        msg: "Could not reach Flask backend service. Ensure server is running on :5000."
      });
    } finally {
      setLoading(false);
    }
  };

  const filteredStudents = studentsList.filter(s =>
    !studentSearch.trim() ||
    s.name.toLowerCase().includes(studentSearch.toLowerCase()) ||
    s.usn.toLowerCase().includes(studentSearch.toLowerCase())
  );

  return (
    <div style={cardStyle}>
      <div style={titleHeader}>
        <div>
          <h2 style={cardTitle}>📝 Pre-Election Voter Biometric Enrollment</h2>
          <p style={subtitle}>
            Admin Enrollment Desk: Siamese Residual CNN (128-d Embedding) &bull; Ethereum Smart Contract Ledger
          </p>
        </div>
      </div>

      {/* Student / Account Selector Box */}
      <div style={sectionBox}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
          <label style={fieldLabel}>Select Citizen from Official Electoral Roll (235 Students)</label>
          <span style={{ fontSize: "0.75rem", color: "#38bdf8" }}>
            Total Registered: {studentsList.length} Students
          </span>
        </div>

        {/* Quick Search Input */}
        <input
          type="text"
          placeholder="🔍 Filter student by Name or USN (e.g. NNM23IS134, Pranitha, Srajan)..."
          value={studentSearch}
          onChange={(e) => setStudentSearch(e.target.value)}
          style={searchInput}
        />

        {/* Dropdown with all 235 students */}
        <select
          value={selectedStudentUSN || selectedAccount}
          onChange={(e) => handleSelectStudent(e.target.value)}
          style={{ ...selectStyle, marginTop: "8px" }}
        >
          <option value="">-- Choose Student Voter --</option>
          <optgroup label="Official 7th Sem ISE Student Electoral Roll">
            {filteredStudents.map((s) => (
              <option key={s.usn} value={s.usn}>
                {s.name} ({s.usn}) &bull; Sec {s.section} &bull; Room {s.room}
                {s.is_enrolled_offchain ? " [ALREADY ENROLLED]" : " [READY TO ENROLL]"}
              </option>
            ))}
          </optgroup>
          {accounts.length > 0 && (
            <optgroup label="Unlocked Hardhat Node Test Accounts">
              {accounts.map((acc) => (
                <option key={acc.address} value={acc.address}>
                  {acc.role} ({acc.address.slice(0, 8)}...{acc.address.slice(-6)}) - {acc.balance}
                </option>
              ))}
            </optgroup>
          )}
        </select>

        {/* Active Voter Dossier Card with Live Status */}
        {activeStudent && (
          <div style={studentCard}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "10px" }}>
              <div>
                <div style={studentCardName}>🎓 {activeStudent.name}</div>
                <div style={studentCardSub}>
                  USN: <strong>{activeStudent.usn}</strong> &bull; Section: <strong>{activeStudent.section}</strong> &bull; Exam Hall: <strong>{activeStudent.room}</strong>
                </div>
                <div style={studentCardWallet}>
                  Assigned Wallet: <code>{activeStudent.assigned_wallet}</code>
                </div>
              </div>

              {/* Live Status Badges */}
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <span style={{
                  ...statusPill,
                  background: voterStatus?.is_enrolled_offchain ? "rgba(16, 185, 129, 0.2)" : "rgba(245, 158, 11, 0.2)",
                  color: voterStatus?.is_enrolled_offchain ? "#6ee7b7" : "#fde68a",
                  borderColor: voterStatus?.is_enrolled_offchain ? "#10b981" : "#f59e0b"
                }}>
                  Biometric: {voterStatus?.is_enrolled_offchain ? "✓ ENROLLED" : "○ UNENROLLED"}
                </span>

                <span style={{
                  ...statusPill,
                  background: voterStatus?.is_registered_onchain ? "rgba(56, 189, 248, 0.2)" : "rgba(148, 163, 184, 0.2)",
                  color: voterStatus?.is_registered_onchain ? "#7dd3fc" : "#cbd5e1",
                  borderColor: voterStatus?.is_registered_onchain ? "#38bdf8" : "#64748b"
                }}>
                  Ledger: {voterStatus?.is_registered_onchain ? "✓ ON-CHAIN REGISTERED" : "○ NOT REGISTERED"}
                </span>
              </div>
            </div>

            {voterStatus?.is_registered_onchain && (
              <div style={alreadyEnrolledNote}>
                ℹ️ This citizen is already registered on the Ethereum smart contract. If re-enrolled with a new fingerprint scan, their biometric template will be safely updated off-chain without blockchain errors.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Biometric Fingerprint Upload / Scanner */}
      <BiometricMatcher
        title="Enrollment Fingerprint Scanner"
        selectedFile={fingerprintFile}
        onFingerprintSelect={(file) => {
          setFingerprintFile(file);
          setEnrollmentResult(null);
          setStatusMessage(null);
        }}
        loading={loading}
      />

      {/* 1-Click Complete Enrollment Button */}
      <div style={{ marginTop: "1.2rem" }}>
        <button
          type="button"
          onClick={handleUnifiedEnroll}
          disabled={loading || !selectedAccount || !fingerprintFile}
          style={{
            ...primaryEnrollBtn,
            background: loading ? "#334155" : (!selectedAccount || !fingerprintFile) ? "#1e293b" : "#059669",
            cursor: (!selectedAccount || !fingerprintFile) ? "not-allowed" : "pointer"
          }}
        >
          {loading
            ? "Extracting CNN Biometrics & Registering on Blockchain..."
            : "📝 Complete Biometric Enrollment (Extract & Commit to Blockchain)"}
        </button>
      </div>

      {/* Status Alert Banner */}
      {statusMessage && (
        <div style={{
          ...statusBox,
          background: statusMessage.type === "success" ? "#064e3b" : statusMessage.type === "error" ? "#450a0a" : "#1e3a8a",
          borderColor: statusMessage.type === "success" ? "#10b981" : statusMessage.type === "error" ? "#ef4444" : "#3b82f6",
          color: statusMessage.type === "success" ? "#6ee7b7" : statusMessage.type === "error" ? "#fca5a5" : "#93c5fd"
        }}>
          {statusMessage.msg}
        </div>
      )}

      {/* Enrollment Result Card */}
      {enrollmentResult && (
        <div style={resultCard}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <span style={{ fontWeight: "bold", color: "#10b981", fontSize: "0.95rem" }}>
              🎉 Enrollment Process Completed Successfully
            </span>
            <span style={{ fontSize: "0.75rem", color: "#6ee7b7" }}>
              Status: <strong>PERMANENTLY COMMITTED</strong>
            </span>
          </div>

          <div style={featureRow}>
            <span style={featureKey}>SHA-256 Biometric Vector Hash (On-Chain Identifier):</span>
            <code style={codeBlock}>{enrollmentResult.biometric_hash}</code>
          </div>

          <div style={{ ...featureRow, marginTop: "6px" }}>
            <span style={featureKey}>Normalized 128-d Embedding (Sample Preview):</span>
            <code style={codeBlock}>
              [{enrollmentResult.embedding_preview?.join(", ")}...]
            </code>
          </div>

          {enrollmentResult.tx_hash && (
            <div style={{ ...featureRow, marginTop: "6px" }}>
              <span style={featureKey}>Ethereum Transaction Hash (Block #{enrollmentResult.block_number}):</span>
              <code style={{ ...codeBlock, color: "#6ee7b7" }}>{enrollmentResult.tx_hash}</code>
            </div>
          )}

          <div style={{ marginTop: "1rem", display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => {
                setFingerprintFile(null);
                setEnrollmentResult(null);
                setStatusMessage(null);
              }}
              style={nextStudentBtn}
            >
              ➕ Enroll Another Student
            </button>

            <a
              href="http://localhost:3000"
              target="_blank"
              rel="noreferrer"
              style={openBoothBtn}
            >
              🗳️ Test Voter in Booth Station (Port 3000) ↗
            </a>
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

const titleHeader = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem" };
const cardTitle = { margin: 0, fontSize: "1.3rem", color: "#38bdf8", fontWeight: 700 };
const subtitle = { margin: "4px 0 0", fontSize: "0.8rem", color: "#94a3b8" };

const sectionBox = { background: "#0f172a", padding: "14px", borderRadius: "8px", border: "1px solid #1e293b", marginBottom: "1rem" };
const fieldLabel = { display: "block", fontSize: "0.85rem", color: "#f8fafc", fontWeight: 600 };

const searchInput = {
  width: "100%",
  padding: "8px 12px",
  borderRadius: "6px",
  border: "1px solid #334155",
  background: "#020617",
  color: "#f8fafc",
  fontSize: "0.82rem",
  boxSizing: "border-box",
  marginTop: "6px"
};

const selectStyle = {
  width: "100%",
  padding: "10px",
  borderRadius: "6px",
  border: "1px solid #334155",
  background: "#020617",
  color: "#f8fafc",
  fontSize: "0.85rem",
  boxSizing: "border-box"
};

const studentCard = {
  marginTop: "10px",
  background: "#020617",
  border: "1px solid #334155",
  borderRadius: "8px",
  padding: "12px"
};

const studentCardName = { fontSize: "1.05rem", fontWeight: 700, color: "#38bdf8" };
const studentCardSub = { fontSize: "0.8rem", color: "#cbd5e1", marginTop: "2px" };
const studentCardWallet = { fontSize: "0.72rem", fontFamily: "JetBrains Mono, monospace", color: "#94a3b8", marginTop: "4px" };
const statusPill = { padding: "3px 8px", borderRadius: "6px", fontSize: "0.72rem", fontWeight: 700, border: "1px solid" };

const alreadyEnrolledNote = {
  marginTop: "8px",
  padding: "8px 10px",
  background: "rgba(56, 189, 248, 0.1)",
  border: "1px solid rgba(56, 189, 248, 0.3)",
  borderRadius: "6px",
  fontSize: "0.75rem",
  color: "#bae6fd"
};

const primaryEnrollBtn = {
  width: "100%",
  padding: "14px",
  color: "#fff",
  border: "none",
  borderRadius: "8px",
  fontWeight: "bold",
  fontSize: "1rem",
  transition: "all 0.2s",
  boxShadow: "0 4px 12px rgba(5, 150, 105, 0.3)"
};

const statusBox = {
  marginTop: "1rem",
  padding: "10px 14px",
  borderRadius: "8px",
  border: "1px solid",
  fontSize: "0.85rem",
  fontWeight: 600
};

const resultCard = {
  marginTop: "1rem",
  padding: "14px",
  background: "#022c22",
  border: "1px solid #059669",
  borderRadius: "8px"
};

const featureRow = { display: "flex", flexDirection: "column", gap: "2px" };
const featureKey = { fontSize: "0.72rem", color: "#a7f3d0", textTransform: "uppercase" };
const codeBlock = {
  background: "#020617",
  padding: "6px 8px",
  borderRadius: "4px",
  fontSize: "0.75rem",
  color: "#6ee7b7",
  wordBreak: "break-all",
  border: "1px solid #064e3b"
};

const nextStudentBtn = {
  background: "#0f172a",
  color: "#38bdf8",
  border: "1px solid #38bdf8",
  padding: "8px 14px",
  borderRadius: "6px",
  fontSize: "0.82rem",
  fontWeight: 600,
  cursor: "pointer"
};

const openBoothBtn = {
  background: "#0284c7",
  color: "#fff",
  padding: "8px 14px",
  borderRadius: "6px",
  fontSize: "0.82rem",
  fontWeight: 600,
  textDecoration: "none",
  display: "flex",
  alignItems: "center"
};
