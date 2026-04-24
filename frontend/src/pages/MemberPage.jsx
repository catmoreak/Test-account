import { useMemo, useState } from "react";
import { sendMemberMessage } from "../api/client";

const quickIssues = [
  "What is my current account balance?",
  "I see a charge I did not make. I want to dispute it.",
  "I applied for a personal loan 5 days ago, any status update?",
  "My debit card got blocked after failed PIN attempts.",
  "I moved recently and need to update my registered address.",
  "I am overcharged for months and this is still unresolved."
];

function MemberPage() {
  const [memberId, setMemberId] = useState("M-10021");
  const [draft, setDraft] = useState("");
  const [history, setHistory] = useState([]);
  const [caseResult, setCaseResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const canSend = useMemo(() => draft.trim().length > 0 && !loading, [draft, loading]);

  async function submitMessage(messageText) {
    setLoading(true);
    setError("");

    try {
      const nextHistory = [...history, { role: "member", message: messageText }];
      const response = await sendMemberMessage({
        memberId,
        message: messageText,
        history
      });

      setHistory([...nextHistory, { role: "assistant", message: response.reply }]);
      setCaseResult(response.case);
      setDraft("");
    } catch (requestError) {
      setError("Could not process request. Please try again.");
      console.error(requestError);
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(event) {
    event.preventDefault();
    if (!canSend) return;
    submitMessage(draft.trim());
  }

  return (
    <section className="grid member-grid">
      <article className="panel chat-panel">
        <div className="panel-head">
          <h2>Member Support Chat</h2>
          <span className="pill">RAG Enabled</span>
        </div>

        <div className="inline-field">
          <label className="field compact">
            Member ID
            <input value={memberId} onChange={(event) => setMemberId(event.target.value)} />
          </label>
        </div>

        <div className="history">
          {history.length === 0 ? (
            <p className="empty">Describe your issue in natural language. CreditAssist will resolve or escalate with context.</p>
          ) : (
            history.map((item, index) => (
              <div key={`${item.role}-${index}`} className={item.role === "member" ? "bubble user" : "bubble bot"}>
                {item.message}
              </div>
            ))
          )}
        </div>

        <form onSubmit={handleSubmit} className="composer">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={4}
            placeholder="Example: My card is blocked after 3 failed PIN attempts, how can I reactivate it?"
          />
          <button disabled={!canSend}>{loading ? "Analyzing..." : "Send Message"}</button>
        </form>

        {error && <p className="error">{error}</p>}
      </article>

      <article className="panel side-panel">
        <div className="panel-head">
          <h3>Issue Shortcuts</h3>
        </div>
        <div className="quick-list tidy">
          {quickIssues.map((issue) => (
            <button key={issue} className="ghost" onClick={() => submitMessage(issue)} disabled={loading}>
              {issue}
            </button>
          ))}
        </div>

        {caseResult && (
          <div className="case-card">
            <h4>Case Confirmation</h4>
            <div className="kv-list">
              <p>
                <strong>ID:</strong> {caseResult.id}
              </p>
              <p>
                <strong>Status:</strong> {caseResult.status}
              </p>
              <p>
                <strong>Intent:</strong> {caseResult.contextSummary.topIntent}
              </p>
              <p>
                <strong>Confidence:</strong> {caseResult.contextSummary.confidence}
              </p>
              <p>
                <strong>Sentiment:</strong> {caseResult.contextSummary.sentiment.label}
              </p>
            </div>
          </div>
        )}
      </article>
    </section>
  );
}

export default MemberPage;
