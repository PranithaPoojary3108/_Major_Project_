import React, { useState, useEffect } from 'react';

const API_BASE = "http://127.0.0.1:5000";

export default function StudentRoster({ onSelectStudent, refreshTrigger }) {
  const [students, setStudents] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSection, setSelectedSection] = useState("ALL");
  const [loading, setLoading] = useState(false);

  const fetchStudents = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/students`);
      const data = await res.json();
      if (data.students) setStudents(data.students);
    } catch (err) {
      console.error("Failed to load student roster", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStudents();
    const interval = setInterval(fetchStudents, 4000);
    return () => clearInterval(interval);
  }, [refreshTrigger]);

  const filtered = students.filter(s => {
    const matchesSection = selectedSection === "ALL" || s.section === selectedSection;
    const matchesSearch = !searchTerm ||
      s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.usn.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSection && matchesSearch;
  });

  return (
    <div style={cardStyle}>
      <div style={titleHeader}>
        <div>
          <h2 style={cardTitle}>📋 Official Student Electoral Roll (235 Registered Students)</h2>
          <p style={subtitle}>Department of Information Science and Engineering &bull; VII Semester (VII A, VII B, VII C)</p>
        </div>
        <button
          type="button"
          onClick={fetchStudents}
          disabled={loading}
          style={refreshBtn}
        >
          {loading ? "..." : "🔄 Refresh Roll"}
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div style={filterBar}>
        <div style={{ flex: 1 }}>
          <input
            type="text"
            placeholder="🔍 Search by Student Name or USN (e.g. NNM23IS134, Pranitha, Akash)..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={searchInput}
          />
        </div>

        <div style={sectionTabs}>
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

      {/* Roster Summary Counter */}
      <div style={counterBar}>
        <div>
          <span>Showing <strong>{filtered.length}</strong> of <strong>{students.length}</strong> registered students</span>
          <span style={{ marginLeft: "14px", color: "#10b981", fontWeight: "bold" }}>
            ✓ Enrolled: {students.filter(s => s.is_enrolled_offchain).length}
          </span>
          <span style={{ marginLeft: "10px", color: "#f59e0b", fontWeight: "bold" }}>
            ○ Pending: {students.filter(s => !s.is_enrolled_offchain).length}
          </span>
        </div>
        {searchTerm && <span style={{ color: "#38bdf8" }}>Filtered by: "{searchTerm}"</span>}
      </div>

      {/* Student Table */}
      <div style={tableContainer}>
        {loading ? (
          <div style={emptyBox}>Loading student electoral roll...</div>
        ) : filtered.length === 0 ? (
          <div style={emptyBox}>No students found matching your search.</div>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr style={theadRow}>
                <th style={thStyle}>#</th>
                <th style={thStyle}>USN</th>
                <th style={thStyle}>Student Name</th>
                <th style={thStyle}>Section</th>
                <th style={thStyle}>Exam Hall / Room</th>
                <th style={thStyle}>Biometrics</th>
                <th style={thStyle}>Assigned Wallet</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s, idx) => {
                const isEnrolled = s.is_enrolled_offchain;
                return (
                  <tr key={s.usn} style={trStyle}>
                    <td style={tdStyle}>{s.roll_no || idx + 1}</td>
                    <td style={{ ...tdStyle, fontFamily: "JetBrains Mono, monospace", color: "#38bdf8", fontWeight: 600 }}>
                      {s.usn}
                    </td>
                    <td style={{ ...tdStyle, fontWeight: 600, color: "#f8fafc" }}>
                      {s.name}
                    </td>
                    <td style={tdStyle}>
                      <span style={sectionBadge}>{s.section}</span>
                    </td>
                    <td style={tdStyle}>
                      <span style={roomBadge}>{s.room}</span>
                    </td>
                    <td style={tdStyle}>
                      <span style={{
                        ...statusPill,
                        background: isEnrolled ? "rgba(16, 185, 129, 0.15)" : "rgba(245, 158, 11, 0.15)",
                        color: isEnrolled ? "#6ee7b7" : "#fde68a",
                        borderColor: isEnrolled ? "#10b981" : "#f59e0b"
                      }}>
                        {isEnrolled ? "✓ Enrolled" : "○ Not Enrolled"}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, fontFamily: "JetBrains Mono, monospace", fontSize: "0.75rem", color: "#94a3b8" }}>
                      {s.assigned_wallet.slice(0, 8)}...{s.assigned_wallet.slice(-6)}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right" }}>
                      <div style={{ display: "inline-flex", gap: "6px" }}>
                        {!isEnrolled ? (
                          <button
                            type="button"
                            onClick={() => onSelectStudent && onSelectStudent(s, "enrollment")}
                            style={enrollBtn}
                            title="Enroll biometric fingerprint template"
                          >
                            📝 Enroll
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => onSelectStudent && onSelectStudent(s, "voting")}
                          style={selectVoterBtn}
                          title="Proceed to voting booth"
                        >
                          🗳️ Vote
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
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

const refreshBtn = {
  background: "#0f172a",
  border: "1px solid #334155",
  color: "#38bdf8",
  padding: "6px 12px",
  borderRadius: "6px",
  cursor: "pointer",
  fontSize: "0.8rem",
  fontWeight: 600
};

const filterBar = { display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap", marginBottom: "1rem" };
const searchInput = {
  width: "100%",
  padding: "10px 14px",
  borderRadius: "8px",
  border: "1px solid #334155",
  background: "#0f172a",
  color: "#f8fafc",
  fontSize: "0.85rem",
  boxSizing: "border-box"
};

const sectionTabs = { display: "flex", gap: "6px" };
const secBtn = {
  padding: "8px 14px",
  borderRadius: "6px",
  border: "1px solid",
  cursor: "pointer",
  fontSize: "0.8rem",
  fontWeight: 600
};

const counterBar = {
  display: "flex",
  justifyContent: "space-between",
  fontSize: "0.78rem",
  color: "#94a3b8",
  marginBottom: "10px"
};

const tableContainer = {
  maxHeight: "520px",
  overflowY: "auto",
  background: "#0f172a",
  border: "1px solid #1e293b",
  borderRadius: "8px"
};

const tableStyle = { width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.82rem" };
const theadRow = { background: "#020617", borderBottom: "2px solid #334155", position: "sticky", top: 0, zIndex: 1 };
const thStyle = { padding: "10px 12px", color: "#94a3b8", fontWeight: 600, fontSize: "0.75rem", textTransform: "uppercase" };
const trStyle = { borderBottom: "1px solid #1e293b", transition: "background 0.15s ease" };
const tdStyle = { padding: "9px 12px", color: "#cbd5e1" };

const sectionBadge = { background: "#0369a1", color: "#bae6fd", padding: "2px 6px", borderRadius: "4px", fontSize: "0.72rem", fontWeight: 600 };
const roomBadge = { background: "#334155", color: "#e2e8f0", padding: "2px 6px", borderRadius: "4px", fontSize: "0.72rem" };
const statusPill = { padding: "2px 8px", borderRadius: "10px", fontSize: "0.72rem", border: "1px solid", fontWeight: 600 };

const enrollBtn = {
  background: "#059669",
  color: "#fff",
  border: "none",
  padding: "4px 8px",
  borderRadius: "4px",
  fontSize: "0.72rem",
  fontWeight: 600,
  cursor: "pointer"
};

const selectVoterBtn = {
  background: "#0284c7",
  color: "#fff",
  border: "none",
  padding: "4px 8px",
  borderRadius: "4px",
  fontSize: "0.72rem",
  fontWeight: 600,
  cursor: "pointer"
};

const emptyBox = { padding: "2rem", textAlign: "center", color: "#64748b" };
