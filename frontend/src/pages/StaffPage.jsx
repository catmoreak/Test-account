import { useEffect, useMemo, useState, useCallback } from "react";
import { getCaseById, getCases, updateCaseStatus, addCaseNote, searchKnowledge } from "../api/client";
import AnalyticsPanel from "../components/AnalyticsPanel";

// ── Priority badge ───────────────────────────────────────────────────────────
function PriorityBadge({ priority }) {
  return (
    <span className={`priority-badge ${priority === "P1" ? "p1" : "p2"}`}>
      {priority}
    </span>
  );
}

// ── Status chip ──────────────────────────────────────────────────────────────
function StatusChip({ status }) {
  const cls =
    status === "needs-attention" ? "flag high"
    : status === "in-progress"  ? "flag warn"
    : status === "resolved"     ? "flag ok"
    : "flag";
  return <span className={cls}>{status}</span>;
}

// ── Sentiment dot ────────────────────────────────────────────────────────────
function SentimentDot({ label }) {
  const color =
    label === "distressed" ? "var(--danger)"
    : label === "concerned" ? "var(--accent)"
    : "var(--teal)";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
      <span style={{
        width: 8, height: 8, borderRadius: "50%",
        background: color, display: "inline-block"
      }} />
      {label}
    </span>
  );
}

// ── Agentic Pipeline trace ───────────────────────────────────────────────────
function PipelineTrace({ pipeline }) {
  if (!pipeline || pipeline.length === 0) return null;
  const stepIcons = {
    intake_normalization: "📥",
    intent_classification: "🧠",
    query_planning: "🔍",
    semantic_retrieval: "📡",
    evidence_grading: "⚖️",
    grounded_generation: "✍️",
    resolution_or_escalation: "🎯"
  };

  return (
    <div className="pipeline-trace">
      {pipeline.map((step, idx) => (
        <div key={step.step} className="pipeline-step">
          <div className="step-connector">
            <div className="step-dot done" />
            {idx < pipeline.length - 1 && <div className="step-line" />}
          </div>
          <div className="step-body">
            <div className="step-name">
              <span className="step-icon">{stepIcons[step.step] || "⚙️"}</span>
              <strong>{step.step.replace(/_/g, " ")}</strong>
              {step.model && <span className="step-meta">via {step.model}</span>}
              {step.confidence !== undefined && (
                <span className="step-meta">conf: {(step.confidence * 100).toFixed(0)}%</span>
              )}
            </div>
            <div className="step-output">
              {Array.isArray(step.output)
                ? step.output.join(", ")
                : step.output}
              {step.signals && step.signals.length > 0 && (
                <div className="step-signals">
                  {step.signals.map((s) => <code key={s}>{s}</code>)}
                </div>
              )}
              {step.topScore !== undefined && (
                <span className="step-meta"> top-score: {step.topScore}</span>
              )}
              {step.reason && (
                <div className="step-reason">{step.reason}</div>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Knowledge Search Modal ──────────────────────────────────────────────────
function KnowledgeSearchModal({ onClose }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);

  async function doSearch(e) {
    e.preventDefault();
    if (!query.trim() || query.trim().length < 3) return;
    setSearching(true);
    try {
      const data = await searchKnowledge(query.trim());
      setResults(data.hits || []);
      setSearched(true);
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>🔍 Semantic Knowledge Base Search</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <p className="modal-subtitle">Powered by Mistral Embeddings + Pinecone Vector DB</p>
        <form onSubmit={doSearch} className="search-form">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. block account, FD interest rate, locker key lost..."
            autoFocus
          />
          <button type="submit" disabled={searching || query.trim().length < 3}>
            {searching ? "Searching…" : "Search"}
          </button>
        </form>

        {searched && results.length === 0 && (
          <p className="empty" style={{ marginTop: "1rem" }}>No results found for that query.</p>
        )}

        <div className="search-results">
          {results.map((hit) => (
            <div key={hit.id} className="search-hit">
              <div className="hit-head">
                <strong>[{hit.id}]</strong>
                <span className="hit-score">score: {hit.score}</span>
                <span className="pill" style={{ fontSize: "0.72rem" }}>{hit.category}</span>
              </div>
              <div className="hit-title">{hit.title}</div>
              <p className="hit-content">{hit.content.substring(0, 280)}…</p>
              {hit.tags && hit.tags.length > 0 && (
                <div className="hit-tags">
                  {hit.tags.slice(0, 5).map((t) => <code key={t}>{t}</code>)}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main Staff Page ─────────────────────────────────────────────────────────
const STATUS_FILTERS = [
  { label: "All Cases", value: "all" },
  { label: "🔴 Needs Attention", value: "needs-attention" },
  { label: "🟡 In Progress", value: "in-progress" },
  { label: "✅ Resolved", value: "resolved" },
  { label: "🤖 Auto-resolved", value: "auto-resolved" }
];

function StaffPage() {
  const [mainTab, setMainTab] = useState("cases"); // "cases" | "analytics"
  const [filter, setFilter] = useState("all");
  const [cases, setCases] = useState([]);
  const [stats, setStats] = useState({
    total: 0, autoResolved: 0, needsAttention: 0,
    inProgress: 0, resolved: 0, distressed: 0, p1Count: 0, queueBreakdown: {}
  });
  const [selectedId, setSelectedId] = useState(null);
  const [selectedCase, setSelectedCase] = useState(null);
  const [activePanel, setActivePanel] = useState("overview");
  const [loading, setLoading] = useState(true);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [submittingNote, setSubmittingNote] = useState(false);
  const [showKBSearch, setShowKBSearch] = useState(false);
  const [pollingTimer, setPollingTimer] = useState(null);

  const loadCases = useCallback(async (targetFilter = filter, silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await getCases(targetFilter);
      setCases(data.cases);
      setStats(data.stats);
      if (!selectedId && data.cases[0]) {
        setSelectedId(data.cases[0].id);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [filter, selectedId]);

  useEffect(() => {
    loadCases(filter);
    // Poll every 30s for new cases
    const timer = setInterval(() => loadCases(filter, true), 30000);
    setPollingTimer(timer);
    return () => clearInterval(timer);
  }, [filter]);

  useEffect(() => {
    if (!selectedId) { setSelectedCase(null); return; }
    getCaseById(selectedId).then(setSelectedCase).catch(() => setSelectedCase(null));
  }, [selectedId]);

  async function handleStatusChange(id, status) {
    setUpdatingStatus(true);
    try {
      await updateCaseStatus(id, status);
      await loadCases(filter);
      if (selectedId === id) {
        const updated = await getCaseById(id);
        setSelectedCase(updated);
      }
    } finally {
      setUpdatingStatus(false);
    }
  }

  async function handleAddNote(e) {
    e.preventDefault();
    if (!noteText.trim() || !selectedId) return;
    setSubmittingNote(true);
    try {
      const updated = await addCaseNote(selectedId, noteText.trim());
      setSelectedCase(updated);
      setNoteText("");
    } finally {
      setSubmittingNote(false);
    }
  }

  const summaryCards = useMemo(() => [
    { title: "Total Cases", value: stats.total, icon: "📋", color: "var(--teal)" },
    { title: "Needs Attention", value: stats.needsAttention, icon: "🔴", color: "var(--danger)" },
    { title: "P1 Priority", value: stats.p1Count, icon: "🚨", color: "#ff4444" },
    { title: "Distressed Members", value: stats.distressed, icon: "😟", color: "var(--accent)" },
    { title: "Auto-resolved", value: stats.autoResolved, icon: "🤖", color: "var(--teal)" },
    { title: "Resolved by Staff", value: stats.resolved, icon: "✅", color: "#4CAF50" },
  ], [stats]);

  return (
    <div className="staff-shell">
      {showKBSearch && <KnowledgeSearchModal onClose={() => setShowKBSearch(false)} />}

      {/* ── Header bar ─────────────────────────────────────────────────── */}
      <div className="staff-header">
        <div>
          <h2 className="staff-title">⚡ Operations Dashboard</h2>
          <p className="staff-subtitle">Live case management · AI escalation routing · Semantic knowledge search</p>
        </div>
        <div className="staff-actions">
          {/* Main tab switch */}
          <div className="staff-main-tabs">
            <button
              className={`ghost ${mainTab === "cases" ? "active-period" : ""}`}
              onClick={() => setMainTab("cases")}
              style={{ padding: "0.35rem 0.9rem", fontSize: "0.85rem" }}
            >
              📋 Cases
            </button>
            <button
              className={`ghost ${mainTab === "analytics" ? "active-period" : ""}`}
              onClick={() => setMainTab("analytics")}
              style={{ padding: "0.35rem 0.9rem", fontSize: "0.85rem" }}
            >
              📊 Analytics
            </button>
          </div>
          <button className="ghost search-kb-btn" onClick={() => setShowKBSearch(true)}>
            🔍 Search Knowledge Base
          </button>
          <button className="ghost" onClick={() => loadCases(filter)}>
            ↺ Refresh
          </button>
        </div>
      </div>

      {/* ── Analytics tab ─────────────────────────────────────────────── */}
      {mainTab === "analytics" && <AnalyticsPanel />}

      {/* ── Cases tab content ──────────────────────────────────────────── */}
      {mainTab === "cases" && <>

      {/* ── Stats row ──────────────────────────────────────────────────── */}
      <div className="stats-grid-wide">
        {summaryCards.map((card) => (
          <div key={card.title} className="stat-card-wide">
            <div className="stat-icon">{card.icon}</div>
            <div className="stat-body">
              <h3 style={{ color: card.color }}>{card.value}</h3>
              <p>{card.title}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Queue breakdown ─────────────────────────────────────────────── */}
      {Object.keys(stats.queueBreakdown || {}).length > 0 && (
        <div className="queue-bar">
          <span className="queue-label">Escalation Queues:</span>
          {Object.entries(stats.queueBreakdown).map(([queue, count]) => (
            <span key={queue} className="queue-chip">
              {queue} <strong>{count}</strong>
            </span>
          ))}
        </div>
      )}

      {/* ── Main 2-col layout ──────────────────────────────────────────── */}
      <div className="staff-main-grid">

        {/* ── Left: Case list ────────────────────────────────────────── */}
        <article className="panel case-list-panel">
          <div className="filter-bar">
            {STATUS_FILTERS.map((opt) => (
              <button
                key={opt.value}
                className={filter === opt.value ? "chip active" : "chip"}
                onClick={() => setFilter(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="case-table clean-table">
            {loading ? (
              <div className="loading-cases">
                <div className="mini-spinner" />
                <span>Loading cases…</span>
              </div>
            ) : cases.length === 0 ? (
              <p className="empty">No cases for this filter yet.</p>
            ) : (
              cases.map((item) => {
                const isP1 = item.escalationPacket?.priority === "P1";
                const isEscalated = !!item.escalationPacket;
                return (
                  <button
                    key={item.id}
                    className={`case-row ${selectedId === item.id ? "active" : ""} ${isP1 ? "p1-row" : ""}`}
                    onClick={() => { setSelectedId(item.id); setActivePanel("overview"); }}
                  >
                    <div className="case-row-left">
                      <div className="case-row-id">
                        <strong>{item.id}</strong>
                        {isP1 && <PriorityBadge priority="P1" />}
                        {isEscalated && <span className="escalated-dot" title="Escalated">🔺</span>}
                      </div>
                      <p className="case-intent">{item.contextSummary?.topIntent?.replace(/_/g, " ")}</p>
                      <p className="case-queue">{item.escalationPacket?.recommendedQueue || "—"}</p>
                    </div>
                    <div className="case-row-right">
                      <StatusChip status={item.status} />
                      <SentimentDot label={item.contextSummary?.sentiment?.label || "neutral"} />
                      <p className="case-ts">{new Date(item.createdAt).toLocaleTimeString()}</p>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </article>

        {/* ── Right: Case detail ─────────────────────────────────────── */}
        <article className="panel detail-panel">
          {selectedCase ? (
            <>
              <div className="panel-head">
                <div>
                  <h3 style={{ margin: 0 }}>{selectedCase.id}</h3>
                  <p style={{ margin: "0.2rem 0 0", color: "var(--muted)", fontSize: "0.82rem" }}>
                    Member: {selectedCase.memberId} · {new Date(selectedCase.createdAt).toLocaleString()}
                  </p>
                </div>
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                  {selectedCase.escalationPacket?.priority && (
                    <PriorityBadge priority={selectedCase.escalationPacket.priority} />
                  )}
                  <select
                    className="status-select"
                    value={selectedCase.status}
                    disabled={updatingStatus}
                    onChange={(e) => handleStatusChange(selectedCase.id, e.target.value)}
                  >
                    <option value="needs-attention">Needs Attention</option>
                    <option value="in-progress">In Progress</option>
                    <option value="auto-resolved">Auto-resolved</option>
                    <option value="resolved">Resolved</option>
                  </select>
                </div>
              </div>

              <div className="tab-row">
                {["overview", "conversation", "ai-pipeline", "knowledge", "notes"].map((tab) => (
                  <button
                    key={tab}
                    className={activePanel === tab ? "chip active" : "chip"}
                    onClick={() => setActivePanel(tab)}
                  >
                    {tab === "overview"      ? "📋 Overview"
                    : tab === "conversation"  ? "💬 Chat"
                    : tab === "ai-pipeline"  ? "🧠 AI Pipeline"
                    : tab === "knowledge"    ? "📚 Knowledge"
                    : "📝 Notes"}
                  </button>
                ))}
              </div>

              {/* OVERVIEW TAB */}
              {activePanel === "overview" && (
                <div className="detail-stack">
                  <div className="info-grid-3">
                    <div className="info-card">
                      <p>Intent</p>
                      <h4>{selectedCase.contextSummary?.topIntent?.replace(/_/g, " ")}</h4>
                    </div>
                    <div className="info-card">
                      <p>Confidence</p>
                      <h4>{Math.round((selectedCase.contextSummary?.confidence || 0) * 100)}%</h4>
                    </div>
                    <div className="info-card">
                      <p>Sentiment</p>
                      <h4><SentimentDot label={selectedCase.contextSummary?.sentiment?.label || "neutral"} /></h4>
                    </div>
                    <div className="info-card">
                      <p>Evidence Grade</p>
                      <h4 className={`grade-${selectedCase.contextSummary?.evidenceGrade?.label}`}>
                        {selectedCase.contextSummary?.evidenceGrade?.label || "—"}
                      </h4>
                    </div>
                    <div className="info-card">
                      <p>Language</p>
                      <h4>{selectedCase.language === "hi" ? "Hindi" : selectedCase.language === "kn" ? "Kannada" : "English"}</h4>
                    </div>
                    <div className="info-card">
                      <p>Evidence Score</p>
                      <h4>{selectedCase.contextSummary?.evidenceGrade?.topScore || "—"}</h4>
                    </div>
                  </div>

                  {selectedCase.escalationPacket ? (
                    <div className="focus-card escalation-card">
                      <div className="escalation-header">
                        <h4>🔺 Escalation Packet</h4>
                        <PriorityBadge priority={selectedCase.escalationPacket.priority} />
                      </div>
                      <div className="info-grid-2">
                        <div>
                          <p className="card-label">Queue</p>
                          <div className="queue-highlight">{selectedCase.escalationPacket.recommendedQueue}</div>
                        </div>
                        <div>
                          <p className="card-label">Reason</p>
                          <p className="card-value">{selectedCase.escalationPacket.reason}</p>
                        </div>
                      </div>
                      {selectedCase.escalationPacket.structuredSummary && (
                        <div className="escalation-context">
                          <p className="card-label">Member Ask</p>
                          <blockquote className="member-ask">
                            "{selectedCase.escalationPacket.structuredSummary.memberAsk}"
                          </blockquote>
                          <p className="card-label">Intent Signals</p>
                          <div className="signal-chips">
                            {(selectedCase.escalationPacket.structuredSummary.matchedIntentSignals || []).map((s) => (
                              <code key={s}>{s}</code>
                            ))}
                          </div>
                          <p className="card-label" style={{ marginTop: "0.6rem" }}>Action Required</p>
                          <p className="card-value outcome-note">
                            {selectedCase.escalationPacket.structuredSummary.requestedOutcome}
                          </p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="focus-card resolved-card">
                      <h4>✅ Auto-Resolved</h4>
                      <p style={{ color: "var(--muted)", margin: "0.3rem 0 0" }}>
                        This case was resolved by the AI using grounded knowledge base evidence. No staff action required.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* CONVERSATION TAB */}
              {activePanel === "conversation" && (
                <div className="detail-stack">
                  <div className="history tall">
                    {(selectedCase.conversation || []).map((entry, idx) => (
                      <div
                        key={`${entry.role}-${idx}`}
                        className={`bubble ${entry.role === "member" ? "user" : "bot"}`}
                      >
                        <div className="bubble-role">{entry.role === "member" ? "👤 Member" : "🤖 CreditAssist AI"}</div>
                        {entry.message}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* AI PIPELINE TAB */}
              {activePanel === "ai-pipeline" && (
                <div className="detail-stack">
                  <div className="focus-card">
                    <h4>🧠 Agentic RAG Pipeline Trace</h4>
                    <p className="pipeline-desc">
                      Every member message goes through these 7 steps. This is how the AI made its decision.
                    </p>
                    <PipelineTrace pipeline={selectedCase.contextSummary?.agenticPipeline} />
                  </div>

                  <div className="focus-card">
                    <h4>📊 Intent Probabilities</h4>
                    <div className="prob-list">
                      {Object.entries(selectedCase.contextSummary?.intentProbabilities || {})
                        .sort((a, b) => b[1] - a[1])
                        .slice(0, 8)
                        .map(([intent, score]) => (
                          <div key={intent} className="prob-item">
                            <div className="prob-head">
                              <span>{intent.replace(/_/g, " ")}</span>
                              <span>{(score * 100).toFixed(1)}%</span>
                            </div>
                            <div className="prob-track">
                              <span style={{ width: `${Math.max(2, score * 100)}%` }} />
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
              )}

              {/* KNOWLEDGE TAB */}
              {activePanel === "knowledge" && (
                <div className="detail-stack">
                  <div className="focus-card">
                    <h4>📚 Retrieved Knowledge Sources</h4>
                    <p className="pipeline-desc">
                      These documents were retrieved via semantic vector search (Mistral Embeddings + Pinecone) and used to ground the AI's response.
                    </p>
                    <div className="source-list-rich">
                      {(selectedCase.contextSummary?.citedKnowledge || []).map((source, i) => (
                        <div key={source.id} className={`source-card ${i === 0 ? "top-source" : ""}`}>
                          <div className="source-card-head">
                            <div>
                              <strong>[{source.id}]</strong>
                              <span className="pill" style={{ marginLeft: "0.4rem", fontSize: "0.7rem" }}>
                                {source.category}
                              </span>
                            </div>
                            <span className="score-badge">
                              {(source.score * 100).toFixed(1)}% match
                            </span>
                          </div>
                          <div className="source-title">{source.title}</div>
                          {source.snippet && (
                            <p className="source-snippet">{source.snippet.substring(0, 220)}…</p>
                          )}
                          {source.retrievalSignals?.expandedQuery && (
                            <div className="expanded-query-note">
                              🔄 Query expanded: <em>{source.retrievalSignals.expandedQuery.substring(0, 80)}…</em>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* NOTES TAB */}
              {activePanel === "notes" && (
                <div className="detail-stack">
                  <div className="focus-card">
                    <h4>📝 Staff Notes</h4>
                    <div className="notes-list">
                      {(!selectedCase.notes || selectedCase.notes.length === 0) ? (
                        <p className="empty">No notes yet. Add one below.</p>
                      ) : (
                        (selectedCase.notes || []).map((n, i) => (
                          <div key={i} className="note-item">
                            <div className="note-meta">
                              <span className="note-staff">{n.staffId}</span>
                              <span className="note-time">{new Date(n.timestamp).toLocaleString()}</span>
                            </div>
                            <p className="note-text">{n.note}</p>
                          </div>
                        ))
                      )}
                    </div>
                    <form onSubmit={handleAddNote} className="note-form">
                      <textarea
                        value={noteText}
                        onChange={(e) => setNoteText(e.target.value)}
                        rows={3}
                        placeholder="Add a staff note, action taken, or follow-up required…"
                      />
                      <button type="submit" disabled={submittingNote || !noteText.trim()}>
                        {submittingNote ? "Saving…" : "Add Note"}
                      </button>
                    </form>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="empty-state">
              <div className="empty-icon">📋</div>
              <h3>Select a case</h3>
              <p>Click any case from the list to see full AI context, pipeline trace, and knowledge sources.</p>
            </div>
          )}
        </article>
      </div>

      </>}
    </div>
  );
}

export default StaffPage;
