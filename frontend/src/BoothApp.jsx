import React, { useState, useEffect } from 'react';
import BiometricMatcher from './components/BiometricMatcher';
import ElectionStatusBanner from './components/ElectionStatusBanner';

const API_BASE = "http://127.0.0.1:5000";

export default function BoothApp() {
  const [students, setStudents] = useState([]);
  const [filteredStudents, setFilteredStudents] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSection, setSelectedSection] = useState("ALL");
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [voterStatus, setVoterStatus] = useState(null);

  const [candidates, setCandidates] = useState([]);
  const [selectedCandidate, setSelectedCandidate] = useState(null);

  const [fingerprintFile, setFingerprintFile] = useState(null);
  const [verificationResult, setVerificationResult] = useState(null);
  const [verifying, setVerifying] = useState(false);

  const [voting, setVoting] = useState(false);
  const [voteReceipt, setVoteReceipt] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");

  const [systemStatus, setSystemStatus] = useState(null);
  const [loadingStudents, setLoadingStudents] = useState(false);

  // Fetch initial data
  const fetchStatus = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/status`);
      const data = await res.json();
      setSystemStatus(data);
    } catch {
      setSystemStatus({ status: "offline", blockchain_connected: false });
    }
  };

  const fetchCandidates = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/candidates`);
      const data = await res.json();
      if (data.candidates) setCandidates(data.candidates);
    } catch {}
  };

  const fetchStudents = async () => {
    setLoadingStudents(true);
    try {
      const res = await fetch(`${API_BASE}/api/students`);
      const data = await res.json();
      if (data.students) {
        setStudents(data.students);
        setFilteredStudents(data.students);
      }
    } catch {}
    finally {
      setLoadingStudents(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    fetchCandidates();
    fetchStudents();

    // Auto-sync student roster every 4 seconds to immediately reflect enrollments from Port 3001
    const interval = setInterval(() => {
      fetchStatus();
      fetchCandidates();
      fetch(`${API_BASE}/api/students`)
        .then(r => r.json())
        .then(d => {
          if (d.students) {
            setStudents(d.students);
          }
        })
        .catch(() => {});
    }, 4000);

    return () => clearInterval(interval);
  }, []);

  // Filter students based on search and section
  useEffect(() => {
    let result = students;
    if (selectedSection !== "ALL") {
      result = result.filter(s => s.section === selectedSection);
    }
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      result = result.filter(s =>
        s.name.toLowerCase().includes(q) ||
        s.usn.toLowerCase().includes(q)
      );
    }
    setFilteredStudents(result);
  }, [searchTerm, selectedSection, students]);

  // Fetch voter on-chain and off-chain status dynamically when student is selected
  const handleSelectStudent = async (student) => {
    setSelectedStudent(student);
    setVerificationResult(null);
    setSelectedCandidate(null);
    setVoteReceipt(null);
    setErrorMessage("");
    setFingerprintFile(null);

    try {
      const res = await fetch(`${API_BASE}/api/voter-status/${student.assigned_wallet}?t=${Date.now()}`);
      const data = await res.json();
      setVoterStatus(data);

      // Immediately sync this student's enrolled badge in the list if changed
      if (data && data.is_enrolled_offchain !== student.is_enrolled_offchain) {
        setStudents(prev => prev.map(s => s.usn === student.usn ? { ...s, is_enrolled_offchain: data.is_enrolled_offchain } : s));
      }
    } catch {
      setVoterStatus(null);
    }
  };

  // Step 2 & 3: Biometric Verification Gate
  const handleVerifyBiometrics = async () => {
    if (!selectedStudent || !fingerprintFile) {
      setErrorMessage("Please ensure a student is selected and a fingerprint scan is loaded.");
      return;
    }

    setVerifying(true);
    setErrorMessage("");
    setVerificationResult(null);

    const formData = new FormData();
    formData.append("voter_address", selectedStudent.assigned_wallet);
    formData.append("fingerprint", fingerprintFile);

    try {
      const res = await fetch(`${API_BASE}/api/verify-and-vote`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (res.ok && data.verified) {
        setVerificationResult(data);
      } else {
        setVerificationResult(data);
        setErrorMessage(data.message || data.error || "Biometric authentication failed. Access denied.");
      }
    } catch {
      setErrorMessage("Failed to connect to backend biometric service.");
    } finally {
      setVerifying(false);
    }
  };

  // Step 4: Cast Ballot on Blockchain
  const handleCastBallot = async () => {
    if (!selectedCandidate) {
      setErrorMessage("Please choose a candidate to cast your vote.");
      return;
    }
    if (!verificationResult || !verificationResult.verified || !verificationResult.biometric_hash) {
      setErrorMessage("Biometric identity must be verified before ballot can be cast.");
      return;
    }

    setVoting(true);
    setErrorMessage("");

    try {
      const res = await fetch(`${API_BASE}/api/cast-vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          voter_address: selectedStudent.assigned_wallet,
          candidate_id: selectedCandidate.id,
          biometric_hash: verificationResult.biometric_hash,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setVoteReceipt(data);
        // Refresh voter status to reflect hasVoted
        if (selectedStudent) {
          fetch(`${API_BASE}/api/voter-status/${selectedStudent.assigned_wallet}`)
            .then(r => r.json())
            .then(d => setVoterStatus(d));
        }
        fetchStudents();
        fetchCandidates();
      } else {
        setErrorMessage(data.error || "Transaction denied by smart contract.");
      }
    } catch {
      setErrorMessage("Blockchain transaction broadcast failed. Check Hardhat node.");
    } finally {
      setVoting(false);
    }
  };

  // Reset station for next voter in queue
  const handleResetForNextVoter = () => {
    setSelectedStudent(null);
    setVoterStatus(null);
    setFingerprintFile(null);
    setVerificationResult(null);
    setSelectedCandidate(null);
    setVoteReceipt(null);
    setErrorMessage("");
    setSearchTerm("");
    fetchStudents();
    fetchCandidates();
  };

  const isEligibleToScan = voterStatus && voterStatus.is_enrolled_offchain && !voterStatus.has_voted;

  return (
    <div style={appContainer}>
      {/* Booth Header */}
      <header style={topBar}>
        <div style={topBarInner}>
          <div style={brandBadge}>
            <span style={{ fontSize: "1.7rem" }}>🗳️</span>
            <div>
              <div style={instTitle}>N.M.A.M. INSTITUTE OF TECHNOLOGY, NITTE</div>
              <div style={deptTitle}>DEPARTMENT OF INFORMATION SCIENCE & ENGINEERING &bull; MAJOR PROJECT (CODE 08)</div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <div style={projectTitleBlock}>
              <div style={boothBadge}>📍 POLLING BOOTH LEVEL TERMINAL</div>
              <h1 style={mainTitle}>Election Incharge & Voter Authentication Station</h1>
            </div>

            {/* Link to Admin Portal */}
            <a
              href="http://localhost:3001"
              target="_blank"
              rel="noreferrer"
              style={adminLinkBtn}
              title="Open Admin Enrollment Portal on Port 3001"
            >
              <span>🛡️ Admin Portal (:3001) ↗</span>
            </a>
          </div>
        </div>
      </header>

      {/* Booth Status Bar */}
      <div style={statusBar}>
        <div style={statusBarInner}>
          <div style={statusItem}>
            <span style={{
              ...statusDot,
              background: systemStatus?.status === "healthy" ? "#10b981" : "#ef4444"
            }} />
            <span>Booth REST API: <strong>{systemStatus?.status === "healthy" ? "ONLINE" : "OFFLINE"}</strong></span>
          </div>

          <div style={statusItem}>
            <span style={{
              ...statusDot,
              background: systemStatus?.blockchain_connected ? "#10b981" : "#f59e0b"
            }} />
            <span>Ethereum Blockchain Ledger: <strong>{systemStatus?.blockchain_connected ? "CONNECTED (:8545)" : "OFFLINE"}</strong></span>
          </div>

          <div style={statusItem}>
            <span>Siamese CNN Security Gate: <strong>τ ≤ {systemStatus?.operational_threshold ?? "0.2385"}</strong></span>
          </div>

          <div style={statusItem}>
            <span>Official Nominees: <strong>{candidates.length}</strong></span>
          </div>

          <div style={statusItem}>
            <span style={portPill}>PORT: 3000</span>
          </div>
        </div>
      </div>

      {/* Main Polling Station Content */}
      <main style={mainContent}>
        {/* Election Status & Voting Window Banner */}
        <ElectionStatusBanner />

        {errorMessage && (
          <div style={errorAlert}>
            <span>⚠️ {errorMessage}</span>
            <button type="button" onClick={() => setErrorMessage("")} style={closeAlertBtn}>✕</button>
          </div>
        )}

        {/* Voting Completed Success View */}
        {voteReceipt ? (
          <div style={receiptCard}>
            <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
              <span style={{ fontSize: "3rem" }}>🎉</span>
              <h2 style={{ color: "#10b981", margin: "10px 0 4px", fontSize: "1.6rem" }}>
                BALLOT SUCCESSFULLY CAST & MINED ON-CHAIN!
              </h2>
              <p style={{ color: "#94a3b8", fontSize: "0.9rem" }}>
                Voter <strong>{selectedStudent?.name}</strong> ({selectedStudent?.usn}) has officially cast their vote.
              </p>
            </div>

            <div style={receiptGrid}>
              <div style={receiptField}>
                <span style={receiptLabel}>Confirmed Block Height</span>
                <span style={receiptValue}>#{voteReceipt.block_number}</span>
              </div>
              <div style={receiptField}>
                <span style={receiptLabel}>Gas Consumed</span>
                <span style={receiptValue}>{voteReceipt.gas_used} units</span>
              </div>
              <div style={receiptField}>
                <span style={receiptLabel}>Candidate Chosen</span>
                <span style={receiptValue}>Candidate #{voteReceipt.candidate_id}: {selectedCandidate?.name}</span>
              </div>
              <div style={receiptField}>
                <span style={receiptLabel}>Blockchain Mempool Status</span>
                <span style={{ ...receiptValue, color: "#10b981" }}>PERMANENTLY SEALED</span>
              </div>
            </div>

            <div style={txHashBox}>
              <span style={{ fontSize: "0.75rem", color: "#6ee7b7", textTransform: "uppercase" }}>
                Immutable Ethereum Transaction Hash:
              </span>
              <div style={txHashText}>{voteReceipt.tx_hash}</div>
            </div>

            <div style={{ textAlign: "center", marginTop: "1.5rem" }}>
              <button
                type="button"
                onClick={handleResetForNextVoter}
                style={nextVoterBtn}
              >
                🔄 Ready for Next Voter in Queue →
              </button>
            </div>
          </div>
        ) : (
          <div style={workflowLayout}>
            {/* Left Panel: Election Incharge Voter Lookup */}
            <section style={inchargePanel}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem" }}>
                <div>
                  <h2 style={panelTitle}>👤 Step 1: Election Incharge Voter Lookup</h2>
                  <span style={panelHint}>Official 7th Sem ISE Electoral Roll (235 Students)</span>
                </div>
                <button
                  type="button"
                  onClick={fetchStudents}
                  style={{
                    background: "#0f172a",
                    border: "1px solid #38bdf8",
                    color: "#38bdf8",
                    padding: "4px 10px",
                    borderRadius: "6px",
                    cursor: "pointer",
                    fontSize: "0.75rem",
                    fontWeight: 600
                  }}
                  title="Force re-fetch student statuses from server"
                >
                  🔄 Refresh Roll
                </button>
              </div>

              {/* Search & Section Filter */}
              <div style={searchRow}>
                <input
                  type="text"
                  placeholder="🔍 Search Student Name or USN..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={searchInput}
                />
                <div style={sectionBtnGroup}>
                  {["ALL", "VII A", "VII B", "VII C"].map(sec => (
                    <button
                      key={sec}
                      type="button"
                      onClick={() => setSelectedSection(sec)}
                      style={{
                        ...secBtn,
                        background: selectedSection === sec ? "#0284c7" : "#0f172a",
                        color: selectedSection === sec ? "#fff" : "#94a3b8",
                        borderColor: selectedSection === sec ? "#38bdf8" : "#334155"
                      }}
                    >
                      {sec}
                    </button>
                  ))}
                </div>
              </div>

              {/* Roster Scroll List */}
              <div style={rosterScrollBox}>
                {loadingStudents ? (
                  <div style={loadingBox}>Loading student roll...</div>
                ) : filteredStudents.length === 0 ? (
                  <div style={loadingBox}>No student found matching query.</div>
                ) : (
                  filteredStudents.map((s) => {
                    const isSelected = selectedStudent && selectedStudent.usn === s.usn;
                    const isEnrolled = s.is_enrolled_offchain;
                    return (
                      <div
                        key={s.usn}
                        onClick={() => handleSelectStudent(s)}
                        style={{
                          ...rosterItem,
                          borderColor: isSelected ? "#38bdf8" : "#1e293b",
                          background: isSelected ? "rgba(56, 189, 248, 0.12)" : "#0f172a"
                        }}
                      >
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <span style={usnTag}>{s.usn}</span>
                            <span style={studentName}>{s.name}</span>
                          </div>
                          <div style={studentSubDetails}>
                            <span>Section: {s.section}</span> &bull; <span>Room: {s.room}</span>
                          </div>
                        </div>

                        <div style={{ textAlign: "right" }}>
                          <span style={{
                            ...statusPill,
                            background: isEnrolled ? "rgba(16, 185, 129, 0.2)" : "rgba(239, 68, 68, 0.2)",
                            color: isEnrolled ? "#6ee7b7" : "#fca5a5",
                            borderColor: isEnrolled ? "#10b981" : "#ef4444"
                          }}>
                            {isEnrolled ? "✓ Enrolled" : "○ Unenrolled"}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Selected Voter Profile Card */}
              {selectedStudent && (
                <div style={profileCard}>
                  <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                    <div style={avatarBox}>🎓</div>
                    <div style={{ flex: 1 }}>
                      <div style={profileName}>{selectedStudent.name}</div>
                      <div style={profileUsn}>{selectedStudent.usn} &bull; Section {selectedStudent.section} &bull; Room {selectedStudent.room}</div>
                      <div style={walletText}>Wallet: {selectedStudent.assigned_wallet}</div>
                    </div>
                  </div>

                  {voterStatus && (
                    <div style={eligibilityRow}>
                      {!voterStatus.is_enrolled_offchain ? (
                        <div style={blockedAlert}>
                          <strong>🛑 VOTER NOT ENROLLED:</strong> This citizen must first register their fingerprint with the Admin on Port 3001 before entering the voting booth.
                        </div>
                      ) : voterStatus.has_voted ? (
                        <div style={alreadyVotedAlert}>
                          <strong>🛑 BALLOT ALREADY CAST:</strong> This citizen has already submitted their ballot. Smart contract prevents double voting.
                        </div>
                      ) : (
                        <div style={eligibleSuccess}>
                          <strong>✅ CITIZEN ELIGIBLE:</strong> Enrolled in biometric registry. Ready for live fingerprint scan.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* Right Panel: Biometric Gate & Electronic Ballot Box */}
            <section style={boothPanel}>
              {!selectedStudent ? (
                <div style={standbyBox}>
                  <span style={{ fontSize: "3.5rem", opacity: 0.6 }}>👈</span>
                  <h3 style={{ color: "#38bdf8", margin: "14px 0 6px" }}>Election Incharge: Select Voter</h3>
                  <p style={{ color: "#94a3b8", fontSize: "0.85rem", maxWidth: "420px", margin: "0 auto" }}>
                    Search and select the voter's name from the official student electoral roll on the left to begin the biometric authentication process.
                  </p>
                </div>
              ) : !isEligibleToScan ? (
                <div style={standbyBox}>
                  <span style={{ fontSize: "3.5rem" }}>🔒</span>
                  <h3 style={{ color: "#ef4444", margin: "14px 0 6px" }}>Voting Terminal Locked</h3>
                  <p style={{ color: "#94a3b8", fontSize: "0.85rem", maxWidth: "420px", margin: "0 auto" }}>
                    {!voterStatus?.is_enrolled_offchain
                      ? "The selected student is not enrolled. Send them to the Admin Enrollment Desk (Port 3001) to capture their biometric template."
                      : "The selected student has already voted. Duplicate voting is prevented by the Ethereum smart contract."}
                  </p>
                </div>
              ) : (
                <div>
                  {/* Step 2: Biometric Scan */}
                  <div style={boothStepCard}>
                    <div style={stepHeader}>
                      <span style={stepNumber}>Step 2</span>
                      <div>
                        <h3 style={stepHeading}>Voter Biometric Fingerprint Scan</h3>
                        <p style={stepSub}>Place voter's registered finger on the scanner for identity verification</p>
                      </div>
                    </div>

                    <BiometricMatcher
                      title="Booth Optical Fingerprint Scanner"
                      selectedFile={fingerprintFile}
                      onFingerprintSelect={(file) => {
                        setFingerprintFile(file);
                        setVerificationResult(null);
                        setErrorMessage("");
                      }}
                      verificationResult={verificationResult}
                      loading={verifying}
                    />

                    <div style={{ marginTop: "1rem" }}>
                      <button
                        type="button"
                        onClick={handleVerifyBiometrics}
                        disabled={verifying || !fingerprintFile}
                        style={{
                          ...verifyBtn,
                          background: verifying ? "#334155" : "#0284c7"
                        }}
                      >
                        {verifying ? "Processing Siamese CNN Matching..." : "🔍 Authenticate Biometrics with Siamese CNN"}
                      </button>
                    </div>
                  </div>

                  {/* Step 3: Biometric Gate Outcome */}
                  {verificationResult && (
                    <div style={{
                      ...gateResultBox,
                      background: verificationResult.verified ? "rgba(16, 185, 129, 0.12)" : "rgba(239, 68, 68, 0.12)",
                      borderColor: verificationResult.verified ? "#10b981" : "#ef4444"
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <span style={{ fontSize: "1.8rem" }}>
                          {verificationResult.verified ? "🎉" : "🚨"}
                        </span>
                        <div>
                          <div style={{
                            fontWeight: "bold",
                            fontSize: "1rem",
                            color: verificationResult.verified ? "#10b981" : "#ef4444"
                          }}>
                            {verificationResult.verified
                              ? `AUTHENTICATION GRANTED (${verificationResult.similarity_pct}% Similarity)`
                              : "AUTHENTICATION DENIED &bull; IMPOSTOR ALERT"}
                          </div>
                          <div style={{ fontSize: "0.8rem", color: "#cbd5e1", marginTop: "2px" }}>
                            Euclidean Distance: <strong>{verificationResult.distance}</strong> &bull; Security Threshold: <strong>τ ≤ {verificationResult.threshold}</strong>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Step 4: Electronic Ballot Box */}
                  <div style={{
                    ...boothStepCard,
                    opacity: verificationResult && verificationResult.verified ? 1 : 0.5,
                    pointerEvents: verificationResult && verificationResult.verified ? "auto" : "none"
                  }}>
                    <div style={stepHeader}>
                      <span style={{
                        ...stepNumber,
                        background: verificationResult && verificationResult.verified ? "#10b981" : "#334155"
                      }}>
                        Step 3
                      </span>
                      <div>
                        <h3 style={stepHeading}>Official Electronic Ballot Box</h3>
                        <p style={stepSub}>Select candidate to record your secret ballot on the Ethereum blockchain</p>
                      </div>
                    </div>

                    {!verificationResult?.verified ? (
                      <div style={lockedBanner}>
                        🔒 Ballot Box is locked until biometric verification completes successfully.
                      </div>
                    ) : (
                      <>
                        <div style={candidatesGrid}>
                          {candidates.map((cand) => {
                            const isSelected = selectedCandidate && selectedCandidate.id === cand.id;
                            return (
                              <div
                                key={cand.id}
                                onClick={() => setSelectedCandidate(cand)}
                                style={{
                                  ...candidateCard,
                                  borderColor: isSelected ? "#38bdf8" : "#334155",
                                  background: isSelected ? "rgba(56, 189, 248, 0.15)" : "#0f172a"
                                }}
                              >
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                  <span style={candidateNumber}>Candidate #{cand.id}</span>
                                  {isSelected && <span style={selectedPill}>SELECTED</span>}
                                </div>
                                <div style={candidateName}>{cand.name}</div>
                              </div>
                            );
                          })}
                        </div>

                        <div style={{ marginTop: "1.2rem" }}>
                          <button
                            type="button"
                            onClick={handleCastBallot}
                            disabled={voting || !selectedCandidate}
                            style={{
                              ...castBallotBtn,
                              background: !selectedCandidate || voting ? "#334155" : "#059669"
                            }}
                          >
                            {voting ? "Mining Vote on Ethereum Blockchain..." : "🗳️ Cast Secret Ballot on Blockchain"}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}
            </section>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer style={footerStyle}>
        <div>
          NMAMIT Major Project: <strong>Pranitha C Poojary (NNM23IS134), Pranjali N (NNM23IS135), Raksha S Suvarna (NNM23IS143), Nireeksha (NNM23IS111)</strong>
        </div>
        <div style={{ marginTop: "4px", color: "#64748b" }}>
          Project Guide: <strong>Ms. Tanzila Nargis</strong> &bull; Dept of Information Science & Engineering &bull; NMAMIT Nitte
        </div>
      </footer>
    </div>
  );
}

const appContainer = { minHeight: "100vh", display: "flex", flexDirection: "column", background: "#090d16" };

const topBar = {
  background: "#0c1527",
  borderBottom: "1px solid #1e293b",
  padding: "1rem 2rem"
};

const topBarInner = {
  maxWidth: "1400px",
  margin: "0 auto",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  flexWrap: "wrap",
  gap: "1rem"
};

const brandBadge = { display: "flex", alignItems: "center", gap: "12px" };
const instTitle = { fontSize: "0.85rem", fontWeight: 800, color: "#f8fafc", letterSpacing: "0.5px" };
const deptTitle = { fontSize: "0.7rem", color: "#38bdf8", fontWeight: 600 };

const projectTitleBlock = { textAlign: "right" };
const boothBadge = { fontSize: "0.72rem", color: "#38bdf8", fontWeight: 700, letterSpacing: "0.5px" };
const mainTitle = { margin: 0, fontSize: "1.25rem", color: "#f8fafc", fontWeight: 800, letterSpacing: "0.5px" };

const adminLinkBtn = {
  background: "#0284c7",
  color: "#fff",
  padding: "8px 14px",
  borderRadius: "8px",
  fontSize: "0.8rem",
  fontWeight: "bold",
  textDecoration: "none",
  display: "flex",
  alignItems: "center",
  boxShadow: "0 4px 12px rgba(2, 132, 199, 0.3)"
};

const statusBar = {
  background: "#020617",
  borderBottom: "1px solid #1e293b",
  padding: "8px 2rem",
  fontSize: "0.78rem",
  color: "#cbd5e1"
};

const statusBarInner = {
  maxWidth: "1400px",
  margin: "0 auto",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  flexWrap: "wrap",
  gap: "1rem"
};

const statusItem = { display: "flex", alignItems: "center", gap: "6px" };
const statusDot = { width: "8px", height: "8px", borderRadius: "50%", display: "inline-block" };
const portPill = { background: "#1e293b", color: "#10b981", border: "1px solid #10b981", padding: "2px 8px", borderRadius: "10px", fontWeight: "bold" };

const mainContent = {
  maxWidth: "1400px",
  width: "100%",
  margin: "0 auto",
  padding: "1.5rem 1rem",
  flex: 1
};

const errorAlert = {
  background: "#450a0a",
  border: "1px solid #ef4444",
  borderRadius: "8px",
  padding: "10px 14px",
  color: "#fca5a5",
  fontSize: "0.85rem",
  marginBottom: "1rem",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center"
};

const closeAlertBtn = { background: "none", border: "none", color: "#fca5a5", fontSize: "1rem", cursor: "pointer" };

const workflowLayout = {
  display: "grid",
  gridTemplateColumns: "1.2fr 1.8fr",
  gap: "1.5rem"
};

const inchargePanel = {
  background: "#111827",
  border: "1px solid #1f2937",
  borderRadius: "12px",
  padding: "1.2rem",
  display: "flex",
  flexDirection: "column"
};

const panelHeader = { marginBottom: "1rem" };
const panelTitle = { margin: 0, fontSize: "1.1rem", color: "#38bdf8", fontWeight: 700 };
const panelHint = { fontSize: "0.75rem", color: "#9ca3af", marginTop: "2px", display: "block" };

const searchRow = { display: "flex", flexDirection: "column", gap: "8px", marginBottom: "12px" };
const searchInput = {
  width: "100%",
  padding: "10px 12px",
  background: "#030712",
  border: "1px solid #374151",
  borderRadius: "8px",
  color: "#f3f4f6",
  fontSize: "0.85rem",
  boxSizing: "border-box"
};

const sectionBtnGroup = { display: "flex", gap: "6px" };
const secBtn = {
  padding: "6px 12px",
  borderRadius: "6px",
  border: "1px solid",
  fontSize: "0.75rem",
  fontWeight: 600,
  cursor: "pointer"
};

const rosterScrollBox = {
  maxHeight: "340px",
  overflowY: "auto",
  border: "1px solid #1f2937",
  borderRadius: "8px",
  background: "#030712",
  display: "flex",
  flexDirection: "column",
  gap: "4px",
  padding: "4px"
};

const rosterItem = {
  padding: "8px 10px",
  borderRadius: "6px",
  border: "1px solid",
  cursor: "pointer",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  transition: "all 0.15s"
};

const usnTag = { fontSize: "0.75rem", fontFamily: "JetBrains Mono, monospace", color: "#38bdf8", fontWeight: 700 };
const studentName = { fontSize: "0.85rem", fontWeight: 600, color: "#f3f4f6" };
const studentSubDetails = { fontSize: "0.72rem", color: "#9ca3af", marginTop: "2px" };
const statusPill = { padding: "2px 8px", borderRadius: "10px", fontSize: "0.7rem", fontWeight: 700, border: "1px solid" };

const loadingBox = { padding: "2rem", textAlign: "center", color: "#6b7280", fontSize: "0.85rem" };

const profileCard = {
  marginTop: "1rem",
  background: "#030712",
  border: "1px solid #374151",
  borderRadius: "8px",
  padding: "12px"
};

const avatarBox = {
  width: "44px",
  height: "44px",
  borderRadius: "8px",
  background: "#1f2937",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "1.5rem"
};

const profileName = { fontSize: "1rem", fontWeight: 700, color: "#f9fafb" };
const profileUsn = { fontSize: "0.75rem", color: "#9ca3af", marginTop: "2px" };
const walletText = { fontSize: "0.7rem", fontFamily: "JetBrains Mono, monospace", color: "#6b7280", marginTop: "4px" };

const eligibilityRow = { marginTop: "10px" };
const blockedAlert = { background: "#450a0a", border: "1px solid #ef4444", borderRadius: "6px", padding: "8px", color: "#fca5a5", fontSize: "0.78rem" };
const alreadyVotedAlert = { background: "#451a03", border: "1px solid #b45309", borderRadius: "6px", padding: "8px", color: "#fde68a", fontSize: "0.78rem" };
const eligibleSuccess = { background: "#064e3b", border: "1px solid #10b981", borderRadius: "6px", padding: "8px", color: "#6ee7b7", fontSize: "0.78rem" };

const boothPanel = {
  display: "flex",
  flexDirection: "column",
  gap: "1.2rem"
};

const standbyBox = {
  background: "#111827",
  border: "1px dashed #374151",
  borderRadius: "12px",
  padding: "4rem 2rem",
  textAlign: "center"
};

const boothStepCard = {
  background: "#111827",
  border: "1px solid #1f2937",
  borderRadius: "12px",
  padding: "1.2rem"
};

const stepHeader = { display: "flex", alignItems: "center", gap: "10px", marginBottom: "1rem" };
const stepNumber = { background: "#0284c7", color: "#fff", padding: "4px 8px", borderRadius: "6px", fontSize: "0.75rem", fontWeight: 700 };
const stepHeading = { margin: 0, fontSize: "1.1rem", color: "#f9fafb", fontWeight: 700 };
const stepSub = { margin: "2px 0 0", fontSize: "0.75rem", color: "#9ca3af" };

const verifyBtn = {
  width: "100%",
  padding: "12px",
  color: "#fff",
  border: "none",
  borderRadius: "8px",
  fontWeight: "bold",
  fontSize: "0.95rem",
  cursor: "pointer",
  transition: "opacity 0.2s"
};

const gateResultBox = {
  padding: "12px 16px",
  borderRadius: "8px",
  border: "1px solid"
};

const lockedBanner = {
  padding: "16px",
  background: "#030712",
  border: "1px dashed #374151",
  borderRadius: "8px",
  color: "#6b7280",
  textAlign: "center",
  fontSize: "0.85rem"
};

const candidatesGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "10px"
};

const candidateCard = {
  padding: "12px",
  borderRadius: "8px",
  border: "1px solid",
  cursor: "pointer",
  transition: "all 0.15s"
};

const candidateNumber = { fontSize: "0.75rem", color: "#9ca3af", textTransform: "uppercase" };
const selectedPill = { background: "#0284c7", color: "#fff", fontSize: "0.65rem", padding: "2px 6px", borderRadius: "10px", fontWeight: "bold" };
const candidateName = { fontSize: "1rem", fontWeight: 700, color: "#f9fafb", margin: "6px 0 0" };

const castBallotBtn = {
  width: "100%",
  padding: "14px",
  color: "#fff",
  border: "none",
  borderRadius: "8px",
  fontWeight: "bold",
  fontSize: "1.05rem",
  cursor: "pointer"
};

const receiptCard = {
  background: "#111827",
  border: "1px solid #10b981",
  borderRadius: "12px",
  padding: "2rem",
  maxWidth: "800px",
  margin: "0 auto",
  boxShadow: "0 10px 30px rgba(16, 185, 129, 0.15)"
};

const receiptGrid = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "12px",
  background: "#030712",
  padding: "1rem",
  borderRadius: "8px",
  border: "1px solid #1f2937"
};

const receiptField = { display: "flex", flexDirection: "column" };
const receiptLabel = { fontSize: "0.72rem", color: "#9ca3af", textTransform: "uppercase" };
const receiptValue = { fontSize: "0.95rem", color: "#f9fafb", fontWeight: 700, marginTop: "2px" };

const txHashBox = {
  marginTop: "1rem",
  background: "#030712",
  border: "1px solid #059669",
  borderRadius: "8px",
  padding: "12px"
};

const txHashText = {
  fontFamily: "JetBrains Mono, monospace",
  fontSize: "0.8rem",
  color: "#6ee7b7",
  wordBreak: "break-all",
  marginTop: "4px"
};

const nextVoterBtn = {
  background: "#0284c7",
  color: "#fff",
  border: "none",
  padding: "12px 24px",
  borderRadius: "8px",
  fontWeight: "bold",
  fontSize: "1rem",
  cursor: "pointer",
  boxShadow: "0 4px 14px rgba(2, 132, 199, 0.3)"
};

const footerStyle = {
  background: "#0c1527",
  borderTop: "1px solid #1e293b",
  padding: "1.2rem 2rem",
  textAlign: "center",
  fontSize: "0.8rem",
  color: "#94a3b8"
};
