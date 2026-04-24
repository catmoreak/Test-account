import { useMemo, useState } from "react";
import { sendMemberMessage } from "../api/client";

const copy = {
  en: {
    title: "Member Support Chat",
    memberId: "Member ID",
    placeholder: "Enter your issue here",
    send: "Send Message",
    analyzing: "Analyzing...",
    helperTitle: "Live Input",
    helperBody: "Enter the member issue.",
    caseTitle: "Case Confirmation",
    labels: { id: "ID", status: "Status", intent: "Intent", confidence: "Confidence", sentiment: "Sentiment" }
  },
  hi: {
    title: "सदस्य सहायता चैट",
    memberId: "सदस्य आईडी",
    placeholder: "अपनी वास्तविक समस्या अपने शब्दों में लिखें।",
    send: "संदेश भेजें",
    analyzing: "विश्लेषण हो रहा है...",
    helperTitle: "लाइव इनपुट",
    helperBody: "सदस्य की समस्या दर्ज करें।",
    caseTitle: "केस पुष्टि",
    labels: { id: "आईडी", status: "स्थिति", intent: "इरादा", confidence: "विश्वास", sentiment: "भावना" }
  },
  kn: {
    title: "ಸದಸ್ಯ ಬೆಂಬಲ ಚಾಟ್",
    memberId: "ಸದಸ್ಯ ಐಡಿ",
    placeholder: "ನಿಮ್ಮ ನಿಜವಾದ ಸಮಸ್ಯೆಯನ್ನು ನಿಮ್ಮದೇ ಪದಗಳಲ್ಲಿ ಬರೆಯಿರಿ.",
    send: "ಸಂದೇಶ ಕಳುಹಿಸಿ",
    analyzing: "ವಿಶ್ಲೇಷಿಸಲಾಗುತ್ತಿದೆ...",
    helperTitle: "ಲೈವ್ ಇನ್‌ಪುಟ್",
    helperBody: "ಸದಸ್ಯರ ಸಮಸ್ಯೆ ನಮೂದಿಸಿ.",
    caseTitle: "ಕೇಸ್ ದೃಢೀಕರಣ",
    labels: { id: "ಐಡಿ", status: "ಸ್ಥಿತಿ", intent: "ಉದ್ದೇಶ", confidence: "ವಿಶ್ವಾಸ", sentiment: "ಭಾವನೆ" }
  }
};

function MemberPage({ language = "en" }) {
  const t = copy[language] || copy.en;
  const [memberId, setMemberId] = useState("");
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
        history,
        language
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
          <h2>{t.title}</h2>
          <span className="pill">RAG Enabled</span>
        </div>

        <div className="inline-field">
          <label className="field compact">
            {t.memberId}
            <input value={memberId} onChange={(event) => setMemberId(event.target.value)} />
          </label>
        </div>

        {history.length > 0 && (
          <div className="history">
            {history.map((item, index) => (
              <div key={`${item.role}-${index}`} className={item.role === "member" ? "bubble user" : "bubble bot"}>
                {item.message}
              </div>
            ))}
          </div>
        )}

        <form onSubmit={handleSubmit} className="composer">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={4}
            placeholder={t.placeholder}
          />
          <button disabled={!canSend}>{loading ? t.analyzing : t.send}</button>
        </form>

        {error && <p className="error">{error}</p>}
      </article>

      <article className="panel side-panel">
        <div className="panel-head">
          <h3>{t.helperTitle}</h3>
        </div>
        <p className="helper-note">{t.helperBody}</p>

        {caseResult && (
          <div className="case-card">
            <h4>{t.caseTitle}</h4>
            <div className="kv-list">
              <p>
                <strong>{t.labels.id}:</strong> {caseResult.id}
              </p>
              <p>
                <strong>{t.labels.status}:</strong> {caseResult.status}
              </p>
              <p>
                <strong>{t.labels.intent}:</strong> {caseResult.contextSummary.topIntent}
              </p>
              <p>
                <strong>{t.labels.confidence}:</strong> {caseResult.contextSummary.confidence}
              </p>
              <p>
                <strong>{t.labels.sentiment}:</strong> {caseResult.contextSummary.sentiment.label}
              </p>
            </div>
          </div>
        )}
      </article>
    </section>
  );
}

export default MemberPage;
