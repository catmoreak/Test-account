import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Volume2 } from "lucide-react";
import { Mic } from "lucide-react";
import { sendMemberMessage, synthesizeSpeech } from "../api/client";
import { useAuth } from "../context/AuthContext";
import VoiceInput from "../components/VoiceInput";

const QUICK_PROMPTS = {
  en: [
    "What is my account balance?",
    
    "What is my loan status?",
    "How do I block my card?",
    "What is the FD interest rate for 456 days?",
    "I want to dispute a transaction"
  ],
  hi: [
    "मेरा खाता शेष क्या है?",
   
    "मेरी ऋण स्थिति क्या है?",
    "मैं अपना कार्ड कैसे ब्लॉक करूं?",
    "456 दिनों के लिए FD ब्याज दर क्या है?",
    "मुझे एक लेनदेन पर विवाद करना है"
  ],
  kn: [
    "ನನ್ನ ಖಾತೆ ಬ್ಯಾಲೆನ್ಸ್ ಎಷ್ಟು?",
    
    "ನನ್ನ ಸಾಲದ ಸ್ಥಿತಿ ಏನು?",
    "ಕಾರ್ಡ್ ಹೇಗೆ ಬ್ಲಾಕ್ ಮಾಡಬಹುದು?",
    "456 ದಿನಗಳಿಗೆ FD ಬಡ್ಡಿ ದರ ಎಷ್ಟು?",
    "ನಾನು ಒಂದು ವ್ಯವಹಾರವನ್ನು ವಿವಾದ ಮಾಡಬೇಕು"
  ],
  ta: [
    "என் கணக்கு இருப்பு என்ன?",
   
    "எனது கடன் நிலை என்ன?",
    "எனது கார்டை எப்படி முடக்குவது?",
    "456 நாட்களுக்கான FD வட்டி விகிதம் என்ன?",
    "நான் ஒரு பரிவர்த்தனையை மறுக்க விரும்புகிறேன்"
  ]
};

const copy = {
  en: {
    title: "Member Support Chat",
    subtitle: "Ask anything about MCC Bank services",
    memberId: "Member ID (optional)",
    placeholder: "Describe your issue or speak your query…",
    send: "Send",
    analyzing: "Analyzing…",
    quickTitle: "Quick Questions",
    caseTitle: "Case Created",
    escalated: "🔺 Escalated to Staff",
    autoResolved: "✅ Auto-resolved",
    language: "Language",
    balanceHint: "Ask about your balance, transactions, or loan status."
  },
  hi: {
    title: "सदस्य सहायता चैट",
    subtitle: "MCC Bank सेवाओं के बारे में कुछ भी पूछें",
    memberId: "सदस्य आईडी (वैकल्पिक)",
    placeholder: "अपनी समस्या या प्रश्न बताएं…",
    send: "भेजें",
    analyzing: "विश्लेषण हो रहा है…",
    quickTitle: "त्वरित प्रश्न",
    caseTitle: "केस बनाया",
    escalated: "🔺 स्टाफ को एस्केलेट",
    autoResolved: "✅ स्वतः हल",
    language: "भाषा",
    balanceHint: "अपना शेष, लेनदेन या ऋण स्थिति पूछें।"
  },
  kn: {
    title: "ಸದಸ್ಯ ಬೆಂಬಲ ಚಾಟ್",
    subtitle: "MCC Bank ಸೇವೆಗಳ ಬಗ್ಗೆ ಏನಾದರೂ ಕೇಳಿ",
    memberId: "ಸದಸ್ಯ ಐಡಿ (ಐಚ್ಛಿಕ)",
    placeholder: "ನಿಮ್ಮ ಸಮಸ್ಯೆ ಅಥವಾ ಪ್ರಶ್ನೆ ವಿವರಿಸಿ…",
    send: "ಕಳುಹಿಸಿ",
    analyzing: "ವಿಶ್ಲೇಷಣೆ ಆಗುತ್ತಿದೆ…",
    quickTitle: "ತ್ವರಿತ ಪ್ರಶ್ನೆಗಳು",
    caseTitle: "ಕೇಸ್ ತೆರೆಯಲಾಗಿದೆ",
    escalated: "🔺 ಸಿಬ್ಬಂದಿಗೆ ಎಸ್ಕಲೇಟ್",
    autoResolved: "✅ ಸ್ವಯಂ ಪರಿಹಾರ",
    language: "ಭಾಷೆ",
    balanceHint: "ನಿಮ್ಮ ಬ್ಯಾಲೆನ್ಸ್, ವ್ಯವಹಾರ ಅಥವಾ ಸಾಲ ಸ್ಥಿತಿ ಕೇಳಿ."
  },
  ta: {
    title: "உறுப்பினர் ஆதரவு",
    subtitle: "MCC வங்கி சேவைகள் பற்றி தகவல் கேளுங்கள்",
    memberId: "உறுப்பினர் ஐடி (விருப்பத்தேர்வு)",
    placeholder: "உங்கள் பிரச்சினையை விவரிக்கவும் அல்லது உங்கள் கேள்வியை கேளுங்கள்...",
    send: "அனுப்பு",
    analyzing: "பகுப்பாய்வு...",
    quickTitle: "விரைவான கேள்விகள்",
    caseTitle: "வழக்கு உருவாக்கப்பட்டது",
    escalated: "🔺 பணியாளர்களுக்கு மாற்றப்பட்டது",
    autoResolved: "✅ தானாகத் தீர்க்கப்பட்டது",
    language: "மொழி",
    balanceHint: "உங்கள் கணக்கு இருப்பு, பரிவர்த்தனைகள் அல்லது கடன் நிலை பற்றி கேளுங்கள்."
  }
};

function TypingIndicator() {
  return (
    <div className="bubble bot typing-bubble">
      <div className="bubble-role">🤖 CreditAssist AI</div>
      <div className="typing-dots">
        <span /><span /><span />
      </div>
    </div>
  );
}

function AccountBanner({ user }) {
  if (!user || user.role === "staff") return null;
  const fmt = (n) => `₹${Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
  return (
    <div className="account-banner">
      <div className="account-banner-left">
        <div className="account-avatar">{user.name?.[0] || "M"}</div>
        <div>
          <p className="account-name">{user.name}</p>
          <p className="account-id">A/C: {user.accountNumber} • {user.id}</p>
        </div>
      </div>
      <div className="account-banner-right">
        <div className="account-balance-pill">
          <span className="account-balance-label">Balance</span>
          <span className="account-balance-amount">{fmt(user.balance)}</span>
        </div>
        {user.cardStatus === "blocked" && (
          <span className="account-card-blocked">🔴 Card Blocked</span>
        )}
        {user.loanStatus === "pending" && (
          <span className="account-loan-pending">⏳ Loan Pending</span>
        )}
      </div>
    </div>
  );
}

export default function MemberPage({ language = "en" }) {
  const { user } = useAuth();
  const t = copy[language] || copy.en;
  const prompts = QUICK_PROMPTS[language] || QUICK_PROMPTS.en;

  const [draft, setDraft]         = useState("");
  const [history, setHistory]     = useState([]);
  const [caseResult, setCaseResult] = useState(null);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState("");
  const [voiceError, setVoiceError] = useState("");
  const [speakingIndex, setSpeakingIndex] = useState(null);
  const historyRef                = useRef(null);
  const audioRef = useRef(null);

  const canSend = useMemo(() => draft.trim().length > 0 && !loading, [draft, loading]);

  useEffect(() => {
    if (historyRef.current) {
      historyRef.current.scrollTop = historyRef.current.scrollHeight;
    }
  }, [history, loading]);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  async function submitMessage(messageText) {
    if (!messageText?.trim()) return;
    const text = messageText.trim();

    setLoading(true);
    setError("");
    const memberTurn = { role: "member", message: text };
    setHistory((prev) => [...prev, memberTurn]);
    setDraft("");

    try {
      const response = await sendMemberMessage({
        memberId: user?.id || "anonymous",
        userId: user?.id || null,   // for account context resolution
        message: text,
        history,
        language
      });

      setHistory((prev) => [...prev, { role: "assistant", message: response.reply }]);
      setCaseResult(response.case);
    } catch (requestError) {
      setError("Could not process request. Please try again.");
      setHistory((prev) => prev.slice(0, -1));
      console.error(requestError);
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!canSend) return;
    submitMessage(draft.trim());
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (canSend) submitMessage(draft.trim());
    }
  }

  function handleVoiceTranscript(text) {
    setVoiceError("");
    setDraft((prev) => (prev ? `${prev} ${text}` : text));
  }

  function handleVoiceError(message) {
    setVoiceError(message);
  }

  async function handleListen(text, index) {
    if (!text || speakingIndex !== null) return;

    setVoiceError("");
    setSpeakingIndex(index);

    try {
      const result = await synthesizeSpeech(text, language);
      if (!result?.audioBase64) {
        throw new Error("No audio returned");
      }

      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }

      const audio = new Audio(`data:${result.mimeType || "audio/wav"};base64,${result.audioBase64}`);
      audioRef.current = audio;

      audio.onended = () => {
        setSpeakingIndex(null);
      };

      await audio.play();
    } catch (ttsError) {
      console.warn("[TTS] Playback failed:", ttsError);
      setVoiceError("Text-to-speech is unavailable right now. Please try again.");
      setSpeakingIndex(null);
    }
  }

  return (
    <section className="member-layout">
      {/* ── Chat panel ───────────────────────────────────────────── */}
      <article className="panel chat-panel">
        {/* Account banner */}
        <AccountBanner user={user} />

        <div className="panel-head" style={{ borderBottom: "1px solid var(--border)", paddingBottom: "1rem", marginBottom: "1rem" }}>
          <div>
            <h2 style={{ margin: 0, fontWeight: 600, display: "flex", alignItems: "center", gap: "0.45rem" }}>
              <Mic size={18} aria-hidden="true" />
              {t.title}
            </h2>
          </div>
        </div>

        {/* Chat history */}
        <div className="history chat-history" ref={historyRef}>
          {history.length === 0 && (
            <div className="chat-welcome" style={{ textAlign: "center", paddingTop: "2rem" }}>
              <div className="welcome-icon" style={{ fontSize: "2.5rem", marginBottom: "0.5rem" }}>🏦</div>
              <h3 style={{ margin: "0 0 0.5rem 0" }}>MCC Bank Support</h3>
              <p style={{ color: "var(--muted)", margin: 0 }}>
                {user
                  ? `Hi ${user.name?.split(" ")[0]}, how can we assist you today?`
                  : "How can we assist you today?"}
              </p>
            </div>
          )}
          {history.map((item, index) => (
            <div key={`${item.role}-${index}`} className={`bubble ${item.role === "member" ? "user" : "bot"}`}>
              <div className="bubble-role">
                {item.role === "member" ? `👤 ${user?.name || "You"}` : "🤖 CreditAssist AI"}
              </div>
              <div className="bubble-content-row">
                <span style={{ whiteSpace: "pre-wrap", flex: 1 }}>{item.message}</span>
                {item.role === "assistant" && (
                  <button
                    type="button"
                    className="tts-btn"
                    onClick={() => handleListen(item.message, index)}
                    disabled={speakingIndex !== null}
                    title="Listen to response"
                    aria-label="Listen to response"
                  >
                    {speakingIndex === index ? (
                      <Loader2 size={16} className="icon-spin" aria-hidden="true" />
                    ) : (
                      <Volume2 size={16} aria-hidden="true" />
                    )}
                  </button>
                )}
              </div>
            </div>
          ))}
          {loading && <TypingIndicator />}
        </div>

        {error && <p className="error" style={{ marginTop: "0.5rem" }}>{error}</p>}

        {/* Composer */}
        <form onSubmit={handleSubmit} className="composer">
          <div className="composer-row">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={3}
              placeholder={t.placeholder}
            />
          </div>
          <div className="composer-actions">
            <VoiceInput
              onTranscript={handleVoiceTranscript}
              onError={handleVoiceError}
              disabled={loading}
              language={language}
            />
            <button type="submit" className="send-btn" disabled={!canSend}>
              {loading ? (
                <span style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  <span className="mini-spinner-inline" />
                  {t.analyzing}
                </span>
              ) : (
                `${t.send} ↗`
              )}
            </button>
          </div>
          {voiceError && <p className="error" style={{ marginTop: "0.5rem" }}>{voiceError}</p>}
        </form>
        <p className="composer-hint" style={{ textAlign: "center", fontSize: "0.75rem", color: "var(--muted)", marginTop: "0.5rem" }}>
          Bank intelligently. Enter to send, Shift+Enter for new line.
        </p>
      </article>

      {/* ── Side panel ───────────────────────────────────────────── */}
      <aside className="side-panel-col">

        {/* Quick prompts */}
        <article className="panel">
          <div className="panel-head">
            <h3 style={{ margin: 0, fontSize: "0.94rem" }}>⚡ {t.quickTitle}</h3>
          </div>
          <div className="quick-list" style={{ marginTop: "0.7rem" }}>
            {prompts.map((prompt) => (
              <button
                key={prompt}
                className="ghost quick-btn"
                onClick={() => submitMessage(prompt)}
                disabled={loading}
              >
                {prompt}
              </button>
            ))}
          </div>
        </article>

        {/* Conversation memory indicator */}
        {history.length > 0 && (
          <article className="panel" style={{ padding: "0.75rem 1rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
                🧠 Memory: {history.length} turn{history.length !== 1 ? "s" : ""} remembered
              </span>
              <button
                className="ghost"
                style={{ fontSize: "0.75rem", padding: "0.2rem 0.6rem", color: "var(--danger)" }}
                onClick={() => { setHistory([]); setCaseResult(null); setError(""); }}
              >
                Clear
              </button>
            </div>
          </article>
        )}

        {/* Case card */}
        {caseResult && (
          <article className="panel case-result-card">
            <div className="panel-head">
              <h3 style={{ margin: 0, fontSize: "0.94rem" }}>{t.caseTitle}</h3>
              {caseResult.status === "needs-attention"
                ? <span className="flag high">{t.escalated}</span>
                : <span className="flag ok">{t.autoResolved}</span>}
            </div>

            <div className="case-meta-grid">
              <div className="case-meta-item">
                <p>Case ID</p>
                <strong>{caseResult.id}</strong>
              </div>
              <div className="case-meta-item">
                <p>Intent</p>
                <strong>{caseResult.contextSummary?.topIntent?.replace(/_/g, " ")}</strong>
              </div>
              <div className="case-meta-item">
                <p>Confidence</p>
                <strong>{Math.round((caseResult.contextSummary?.confidence || 0) * 100)}%</strong>
              </div>
              <div className="case-meta-item">
                <p>Sentiment</p>
                <strong>{caseResult.contextSummary?.sentiment?.label}</strong>
              </div>
            </div>

            {caseResult.contextSummary?.sarvamTranslated && (
              <div style={{ marginTop: "0.5rem", padding: "0.4rem 0.6rem", background: "rgba(44,195,167,0.07)", borderRadius: "8px", fontSize: "0.78rem", color: "var(--teal)" }}>
                🌐 Response translated by Sarvam AI
              </div>
            )}

            {caseResult.escalationPacket && (
              <div className="escalation-mini">
                <div className="esc-mini-head">
                  <span>🔺 Escalated to {caseResult.escalationPacket.recommendedQueue}</span>
                  <span className="priority-badge p1" style={caseResult.escalationPacket.priority !== "P1" ? { background: "rgba(255,159,90,0.2)", color: "var(--accent)" } : {}}>
                    {caseResult.escalationPacket.priority}
                  </span>
                </div>
                <p className="esc-reason">{caseResult.escalationPacket.reason}</p>
              </div>
            )}

            {/* Vector sources */}
            {(caseResult.contextSummary?.citedKnowledge || []).length > 0 && (
              <div style={{ marginTop: "0.8rem" }}>
                <p style={{ color: "var(--muted)", fontSize: "0.78rem", margin: "0 0 0.4rem" }}>
                  📡 Knowledge sources retrieved
                </p>
                {(caseResult.contextSummary.citedKnowledge || []).slice(0, 3).map((src) => (
                  <div key={src.id} className="source-mini">
                    <span className="source-id">[{src.id}]</span>
                    <span className="source-name">{src.title}</span>
                    <span className="source-score">{(src.score * 100).toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            )}
          </article>
        )}
      </aside>
    </section>
  );
}
