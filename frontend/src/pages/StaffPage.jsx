import { useEffect, useMemo, useState } from "react";
import { getCaseById, getCases, updateCaseStatus } from "../api/client";

const filters = [
  { label: "All", value: "all" },
  { label: "Auto-resolved", value: "auto-resolved" },
  { label: "Needs Attention", value: "needs-attention" }
];

function StaffPage() {
  const [filter, setFilter] = useState("all");
  const [cases, setCases] = useState([]);
  const [stats, setStats] = useState({ total: 0, autoResolved: 0, needsAttention: 0, distressed: 0 });
  const [selectedId, setSelectedId] = useState(null);
  const [selectedCase, setSelectedCase] = useState(null);
  const [activePanel, setActivePanel] = useState("overview");
  const [loading, setLoading] = useState(true);

  async function loadCases(targetFilter = filter) {
    setLoading(true);
    try {
      const data = await getCases(targetFilter);
      setCases(data.cases);
      setStats(data.stats);
      if (!selectedId && data.cases[0]) {
        setSelectedId(data.cases[0].id);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCases(filter);
  }, [filter]);

  useEffect(() => {
    if (!selectedId) {
      setSelectedCase(null);
      return;
    }

    getCaseById(selectedId).then(setSelectedCase).catch(() => setSelectedCase(null));
  }, [selectedId]);

  const summaryCards = useMemo(
    () => [
      { title: "Total Cases", value: stats.total },
      { title: "Auto-resolved", value: stats.autoResolved },
      { title: "Needs Attention", value: stats.needsAttention },
      { title: "Distressed Members", value: stats.distressed }
    ],
    [stats]
  );

  async function handleStatusChange(id, status) {
    await updateCaseStatus(id, status);
    await loadCases(filter);
    if (selectedId === id) {
      const updated = await getCaseById(id);
      setSelectedCase(updated);
    }
  }

  return (
    <section className="grid staff-grid">
      <article className="panel">
        <div className="stats-grid">
          {summaryCards.map((item) => (
            <div key={item.title} className="stat-card">
              <p>{item.title}</p>
              <h3>{item.value}</h3>
            </div>
          ))}
        </div>

        <div className="filter-bar">
          {filters.map((option) => (
            <button
              key={option.value}
              className={filter === option.value ? "chip active" : "chip"}
              onClick={() => setFilter(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="case-table clean-table">
          {loading ? (
            <p className="empty">Loading cases...</p>
          ) : cases.length === 0 ? (
            <p className="empty">No cases for this filter yet.</p>
          ) : (
            cases.map((item) => (
              <button
                key={item.id}
                className={selectedId === item.id ? "case-row active" : "case-row"}
                onClick={() => {
                  setSelectedId(item.id);
                  setActivePanel("overview");
                }}
              >
                <div>
                  <strong>{item.id}</strong>
                  <p>{item.contextSummary.topIntent}</p>
                </div>
                <div>
                  <span className={item.status === "needs-attention" ? "flag high" : "flag"}>{item.status}</span>
                  <p>{item.contextSummary.sentiment.label}</p>
                </div>
              </button>
            ))
          )}
        </div>
      </article>

      <article className="panel detail-panel">
        {selectedCase ? (
          <>
            <div className="panel-head">
              <h3>{selectedCase.id}</h3>
              <select value={selectedCase.status} onChange={(event) => handleStatusChange(selectedCase.id, event.target.value)}>
                <option value="auto-resolved">auto-resolved</option>
                <option value="needs-attention">needs-attention</option>
                <option value="in-progress">in-progress</option>
                <option value="resolved">resolved</option>
              </select>
            </div>

            <div className="tab-row">
              <button className={activePanel === "overview" ? "chip active" : "chip"} onClick={() => setActivePanel("overview")}>
                Overview
              </button>
              <button className={activePanel === "conversation" ? "chip active" : "chip"} onClick={() => setActivePanel("conversation")}>
                Conversation
              </button>
              <button className={activePanel === "intelligence" ? "chip active" : "chip"} onClick={() => setActivePanel("intelligence")}>
                Intelligence
              </button>
            </div>

            {activePanel === "overview" && (
              <div className="detail-stack">
                <div className="info-grid">
                  <div className="info-card">
                    <p>Intent</p>
                    <h4>{selectedCase.contextSummary.topIntent}</h4>
                  </div>
                  <div className="info-card">
                    <p>Confidence</p>
                    <h4>{selectedCase.contextSummary.confidence}</h4>
                  </div>
                  <div className="info-card">
                    <p>Sentiment</p>
                    <h4>{selectedCase.contextSummary.sentiment.label}</h4>
                  </div>
                </div>

                <div className="focus-card">
                  <h4>Escalation Summary</h4>
                  {selectedCase.escalationPacket ? (
                    <div className="kv-list">
                      <p>
                        <strong>Reason:</strong> {selectedCase.escalationPacket.reason}
                      </p>
                      <p>
                        <strong>Priority:</strong> {selectedCase.escalationPacket.priority}
                      </p>
                      <p>
                        <strong>Queue:</strong> {selectedCase.escalationPacket.recommendedQueue}
                      </p>
                    </div>
                  ) : (
                    <p className="empty">No escalation required. Case was auto-resolved.</p>
                  )}
                </div>
              </div>
            )}

            {activePanel === "conversation" && (
              <div className="history compact">
                {selectedCase.conversation.map((entry, idx) => (
                  <div key={`${entry.role}-${idx}`} className={entry.role === "member" ? "bubble user" : "bubble bot"}>
                    {entry.message}
                  </div>
                ))}
              </div>
            )}

            {activePanel === "intelligence" && (
              <div className="detail-stack">
                <div className="focus-card">
                  <h4>Intent Probabilities</h4>
                  <div className="prob-list">
                    {Object.entries(selectedCase.contextSummary.intentProbabilities).map(([intent, score]) => (
                      <div key={intent} className="prob-item">
                        <div className="prob-head">
                          <span>{intent}</span>
                          <span>{score}</span>
                        </div>
                        <div className="prob-track">
                          <span style={{ width: `${Math.max(4, score * 100)}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="focus-card">
                  <h4>Retrieved Policy Sources</h4>
                  <div className="source-list">
                    {(selectedCase.contextSummary.citedKnowledge || []).map((source) => (
                      <div key={source.id} className="source-chip">
                        <strong>{source.id}</strong>
                        <span>{source.title}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          <p className="empty">Select a case to inspect full context.</p>
        )}
      </article>
    </section>
  );
}

export default StaffPage;
