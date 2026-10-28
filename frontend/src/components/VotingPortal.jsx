import React, { useState, useEffect } from 'react';
import BiometricMatcher from './BiometricMatcher';
import ElectionStatusBanner from './ElectionStatusBanner';

const API_BASE = "http://127.0.0.1:5000";

export default function VotingPortal({ candidates, onVoteCast, accounts = [], preselectedStudent, onSwitchToEnroll }) {
  const [selectedAccount, setSelectedAccount] = useState("");
  const [voterStatus, setVoterStatus] = useState(null);
  const [fingerprintFile, setFingerprintFile] = useState(null);
  const [verificationResult, setVerificationResult] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [voting, setVoting] = useState(false);
  const [voteReceipt, setVoteReceipt] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [electionInfo, setElectionInfo] = useState(null);

  useEffect(() => {
    if (preselectedStudent) {
      const match = accounts.find(a => a.usn === preselectedStudent.usn);
      if (match) {
        setSelectedAccount(match.address);
      } else if (preselectedStudent.assigned_wallet) {
        setSelectedAccount(preselectedStudent.assigned_wallet);
      }
    } else if (accounts.length > 1 && !selectedAccount) {
      setSelectedAccount(accounts[1].address);
    }
  }, [preselectedStudent, accounts]);

  // Fetch voter status whenever account changes
  useEffect(() => {
    if (!selectedAccount) {
      setVoterStatus(null);
      return;
    }
    fetch(`${API_BASE}/api/voter-status/${selectedAccount}`)
      .then(res => res.json())
      .then(data => {
        setVoterStatus(data);
        setVerificationResult(null);
        setSelectedCandidate(null);
        setVoteReceipt(null);
        setErrorMessage("");
      })
      .catch(() => {});
  }, [selectedAccount]);

  const handleVerify = async () => {
    if (!selectedAccount || !fingerprintFile) {
      setErrorMessage("Please select a voter wallet and upload/choose a fingerprint scan.");
      return;
    }

    setVerifying(true);
    setErrorMessage("");
    setVerificationResult(null);

    const formData = new FormData();
    formData.append("voter_address", selectedAccount);
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
        setErrorMessage(data.error || data.message || "Biometric authentication failed.");
      }
    } catch {
      setErrorMessage("Unable to connect to Flask backend.");
    } finally {
      setVerifying(false);
    }
  };

  const handleCastVote = async () => {
    if (!selectedCandidate) {
      setErrorMessage("Please select a candidate to cast your vote.");
      return;
    }
    if (!verificationResult || !verificationResult.biometric_hash) {
      setErrorMessage("Biometric identity must be verified before casting a vote.");
      return;
    }

    setVoting(true);
    setErrorMessage("");

    try {
      const res = await fetch(`${API_BASE}/api/cast-vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          voter_address: selectedAccount,
          candidate_id: selectedCandidate.id,
          biometric_hash: verificationResult.biometric_hash,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setVoteReceipt(data);
        // Refresh voter status
        if (selectedAccount) {
          fetch(`${API_BASE}/api/voter-status/${selectedAccount}`)
            .then(r => r.json())
            .then(d => setVoterStatus(d));
        }
        if (onVoteCast) onVoteCast();
      } else {
        setErrorMessage(data.error || "Transaction reverted by smart contract.");
      }
    } catch {
      setErrorMessage("Blockchain transaction broadcast failed.");
    } finally {
      setVoting(false);
    }
  };

  return (
    <div style={cardStyle}>
      <div style={titleHeader}>
        <div>
          <h2 style={cardTitle}>🗳️ Polling Booth & Ballot Box</h2>
          <p style={subtitle}>Biometric Authentication Gate &bull; Smart Contract Ballot Submission</p>
        </div>
      </div>

      {/* Election Status Banner */}
      <ElectionStatusBanner onElectionInfoLoaded={setElectionInfo} />

      {/* Voting window warning when voting is not currently permitted */}
      {electionInfo && !electionInfo.voting_now && (
        <div style={votingLockedOverlay}>
          {electionInfo.status_label === "NotStarted" && (
            <span>⏸️ <strong>Voting Inactive:</strong> The Election Commissioner has not opened the election yet.</span>
          )}
          {electionInfo.status_label === "Open" && (
            <span>🕐 <strong>Voting Window Inactive:</strong> The election is scheduled but the voting window is currently outside the permitted time range.</span>
          )}
          {electionInfo.status_label === "Closed" && (
            <span>🔒 <strong>Election Closed:</strong> This election has been concluded. No further ballots are accepted.</span>
          )}
        </div>
      )}

      {/* Preselected Student Banner */}
      {preselectedStudent && (
        <div style={preselectedBanner}>
          <span style={{ fontSize: "1.2rem" }}>🎓</span>
          <div>
            <strong>Active Student: {preselectedStudent.name}</strong> ({preselectedStudent.usn}) &bull; Section {preselectedStudent.section} &bull; Room {preselectedStudent.room}
          </div>
        </div>
      )}

      {/* Account Selector */}
      <div style={sectionBox}>
        <label style={fieldLabel}>Select Voter Wallet Account</label>
        <select
          value={selectedAccount}
          onChange={(e) => setSelectedAccount(e.target.value)}
          style={selectStyle}
        >
          <option value="">-- Choose Voter Account --</option>
          {selectedAccount && !accounts.some(a => a.address.toLowerCase() === selectedAccount.toLowerCase()) && (
            <option value={selectedAccount}>
              🎓 {preselectedStudent ? `${preselectedStudent.name} (${preselectedStudent.usn})` : "Student Wallet"}: {selectedAccount.slice(0, 8)}...{selectedAccount.slice(-6)}
            </option>
          )}
          {accounts.map((acc) => (
            <option key={acc.address} value={acc.address}>
              {acc.role} ({acc.address.slice(0, 8)}...{acc.address.slice(-6)}) - {acc.balance}
              {acc.has_voted ? " [ALREADY VOTED]" : acc.is_registered_onchain ? " [REGISTERED]" : " [UNREGISTERED]"}
            </option>
          ))}
        </select>

        {voterStatus && (
          <div style={statusBadgeRow}>
            <span style={{
              ...badgeStyle,
              background: voterStatus.is_enrolled_offchain ? "#064e3b" : "#450a0a",
              color: voterStatus.is_enrolled_offchain ? "#6ee7b7" : "#fca5a5"
            }}>
              Off-Chain Template: {voterStatus.is_enrolled_offchain ? "ENROLLED" : "NOT ENROLLED"}
            </span>

            <span style={{
              ...badgeStyle,
              background: voterStatus.is_registered_onchain ? "#0c4a6e" : "#450a0a",
              color: voterStatus.is_registered_onchain ? "#7dd3fc" : "#fca5a5"
            }}>
              On-Chain Registration: {voterStatus.is_registered_onchain ? "AUTHORIZED" : "NOT REGISTERED"}
            </span>

            <span style={{
              ...badgeStyle,
              background: voterStatus.has_voted ? "#78350f" : "#064e3b",
              color: voterStatus.has_voted ? "#fde68a" : "#6ee7b7"
            }}>
              Ballot Status: {voterStatus.has_voted ? "ALREADY CAST" : "ELIGIBLE TO VOTE"}
            </span>
          </div>
        )}

        {voterStatus && !voterStatus.is_enrolled_offchain && onSwitchToEnroll && (
          <div style={enrollPromptBanner}>
            <span>⚠️ This student voter has not enrolled their biometric template yet.</span>
            <button
              type="button"
              onClick={onSwitchToEnroll}
              style={enrollPromptBtn}
            >
              📝 Go to Voter Enrollment →
            </button>
          </div>
        )}
      </div>

      {/* Biometric Verification */}
      <BiometricMatcher
        title="1. Live Biometric Identity Gate"
        selectedFile={fingerprintFile}
        onFingerprintSelect={(file) => setFingerprintFile(file)}
        verificationResult={verificationResult}
        loading={verifying}
      />

      <button
        type="button"
        onClick={handleVerify}
        disabled={verifying || !fingerprintFile || !selectedAccount || (voterStatus && voterStatus.has_voted)}
        style={{
          ...actionButton,
          background: (voterStatus && voterStatus.has_voted) ? "#334155" : "#0284c7"
        }}
      >
        {verifying ? "Processing Siamese CNN Matching..." : "Verify Biometric Identity"}
      </button>

      {/* Candidate Selection */}
      <div style={{ marginTop: "1.5rem" }}>
        <h3 style={stepTitle}>2. Official Ballot Selection</h3>
        <p style={{ fontSize: "0.8rem", color: "#94a3b8", marginBottom: "10px" }}>
          Select candidate to cast your cryptographic vote on the Ethereum blockchain.
        </p>

        {(!verificationResult || !verificationResult.verified) ? (
          <div style={lockedBanner}>
            🔒 Ballot is locked until biometric verification completes successfully.
          </div>
        ) : (voterStatus && voterStatus.has_voted) ? (
          <div style={alreadyVotedBanner}>
            ⚠️ This citizen has already cast their ballot. Duplicate voting is prevented by smart contract.
          </div>
        ) : (
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
                    background: isSelected ? "rgba(56, 189, 248, 0.1)" : "#0f172a"
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={candidateNumber}>Candidate #{cand.id}</span>
                    {isSelected && <span style={selectedTag}>SELECTED</span>}
                  </div>
                  <div style={candidateName}>{cand.name}</div>
                  <div style={voteTallyHint}>Current Votes: {cand.vote_count}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Cast Vote Button */}
      {verificationResult && verificationResult.verified && !voterStatus?.has_voted && (
        <button
          type="button"
          onClick={handleCastVote}
          disabled={voting || !selectedCandidate}
          style={{
            ...actionButton,
            background: "#16a34a",
            marginTop: "1rem"
          }}
        >
          {voting ? "Broadcasting to Ethereum..." : `Cast Ballot for ${selectedCandidate ? selectedCandidate.name : "Candidate"}`}
        </button>
      )}

      {/* Error Message */}
      {errorMessage && (
        <div style={errorBanner}>
          ⚠️ {errorMessage}
        </div>
      )}

      {/* Vote Receipt Modal / Card */}
      {voteReceipt && (
        <div style={receiptBox}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#10b981", fontWeight: "bold" }}>
            <span style={{ fontSize: "1.4rem" }}>🎉</span>
            <span>Ballot Recorded On-Chain Permanently!</span>
          </div>

          <div style={receiptGrid}>
            <div>
              <span style={receiptLabel}>Transaction Hash</span>
              <div style={receiptHash}>{voteReceipt.tx_hash}</div>
            </div>
            <div>
              <span style={receiptLabel}>Block Number</span>
              <div style={receiptValue}>#{voteReceipt.block_number}</div>
            </div>
            <div>
              <span style={receiptLabel}>Gas Used</span>
              <div style={receiptValue}>{voteReceipt.gas_used} units</div>
            </div>
            <div>
              <span style={receiptLabel}>Candidate Voted</span>
              <div style={receiptValue}>Candidate ID: {voteReceipt.candidate_id}</div>
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

const titleHeader = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem" };
const cardTitle = { margin: 0, fontSize: "1.3rem", color: "#38bdf8", fontWeight: 700 };
const subtitle = { margin: "4px 0 0", fontSize: "0.8rem", color: "#94a3b8" };

const sectionBox = { background: "#0f172a", padding: "12px", borderRadius: "8px", border: "1px solid #1e293b", marginBottom: "1rem" };
const fieldLabel = { display: "block", fontSize: "0.8rem", color: "#94a3b8", marginBottom: "6px", fontWeight: 600 };

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

const statusBadgeRow = { display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "10px" };
const badgeStyle = { padding: "4px 8px", borderRadius: "4px", fontSize: "0.72rem", fontWeight: 600 };

const actionButton = {
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

const stepTitle = { margin: "0 0 4px", fontSize: "1rem", color: "#f8fafc", fontWeight: 600 };
const lockedBanner = { padding: "12px", background: "#0f172a", border: "1px dashed #334155", borderRadius: "8px", color: "#64748b", fontSize: "0.85rem", textAlign: "center" };
const alreadyVotedBanner = { padding: "12px", background: "#451a03", border: "1px solid #b45309", borderRadius: "8px", color: "#fcd34d", fontSize: "0.85rem" };

const candidatesGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "10px" };

const candidateCard = {
  padding: "12px",
  borderRadius: "8px",
  border: "1px solid",
  cursor: "pointer",
  transition: "all 0.2s"
};

const candidateNumber = { fontSize: "0.75rem", color: "#94a3b8", textTransform: "uppercase" };
const selectedTag = { background: "#0284c7", color: "#fff", fontSize: "0.65rem", padding: "2px 6px", borderRadius: "10px", fontWeight: "bold" };
const candidateName = { fontSize: "1.05rem", fontWeight: 700, color: "#f8fafc", margin: "6px 0 2px" };
const voteTallyHint = { fontSize: "0.75rem", color: "#64748b" };

const errorBanner = { marginTop: "1rem", padding: "10px", background: "#450a0a", border: "1px solid #ef4444", borderRadius: "8px", color: "#fca5a5", fontSize: "0.85rem" };

const receiptBox = {
  marginTop: "1rem",
  padding: "1rem",
  background: "#022c22",
  border: "1px solid #059669",
  borderRadius: "8px"
};

const receiptGrid = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginTop: "10px" };
const receiptLabel = { display: "block", fontSize: "0.7rem", color: "#a7f3d0", textTransform: "uppercase" };
const receiptValue = { fontSize: "0.9rem", color: "#ecfdf5", fontWeight: "bold" };
const receiptHash = { fontSize: "0.75rem", fontFamily: "JetBrains Mono, monospace", color: "#6ee7b7", wordBreak: "break-all" };

const preselectedBanner = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
  background: "#082f49",
  border: "1px solid #0284c7",
  borderRadius: "8px",
  padding: "10px 14px",
  marginBottom: "1rem",
  color: "#bae6fd",
  fontSize: "0.85rem"
};

const enrollPromptBanner = {
  marginTop: "12px",
  padding: "10px 14px",
  background: "#451a03",
  border: "1px solid #b45309",
  borderRadius: "8px",
  color: "#fde68a",
  fontSize: "0.85rem",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  flexWrap: "wrap",
  gap: "8px"
};

const enrollPromptBtn = {
  background: "#059669",
  color: "#fff",
  border: "none",
  padding: "5px 10px",
  borderRadius: "6px",
  fontSize: "0.8rem",
  fontWeight: "bold",
  cursor: "pointer"
};

const votingLockedOverlay = {
  marginBottom: "1rem",
  padding: "10px 14px",
  background: "#451a03",
  border: "1px solid #b45309",
  borderRadius: "8px",
  color: "#fde68a",
  fontSize: "0.85rem",
  display: "flex",
  alignItems: "center",
  gap: "8px"
};
