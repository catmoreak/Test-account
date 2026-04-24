import { useEffect, useState } from "react";
import { getAnalytics } from "../api/client";

const LANG_NAMES = { en: "English", hi: "Hindi", kn: "Kannada", ta: "Tamil" };
const INTENT_ICONS = {
  "balance inquiry": "💰",
  "transaction dispute": "🚨",
  "loan status": "📋",
  "card block": "💳",
  "account update": "📝",
  "policy question": "📖",
  "service charge": "💸",
  "deposit product": "🏦",
  "loan product": "📊",
  "unresolved complaint": "⚠️",
  "account block": "🔒",
  "branch service": "🏢",
  "locker service": "🗄️",
  "privacy question": "🛡️"
};

function BarChart({ data }) {
  if (!data || data.length === 0) return <p style={{ color: "var(--muted)", fontSize: "0.85rem" }}>No data yet.</p>;
  const max = Math.max(...data.map((d) => d.count), 1);
  return (
    <div className="analytics-bar-list">
      {data.map((item, i) => {
        const icon = INTENT_ICONS[item.intent] || "📌";
        const pct = Math.round((item.count / max) * 100);
        return (
          <div key={i} className="analytics-bar-row">
            <div className="analytics-bar-label">
              <span>{icon}</span>
              <span>{item.intent}</span>
            </div>
            <div className="analytics-bar-track">
              <div
                className="analytics-bar-fill"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="analytics-bar-count">{item.count}</span>
          </div>
        );
      })}
    </div>
  );
}

function MiniDonut({ value, label, color, max = 100 }) {
  const pct = Math.min(100, Math.round((value / (max || 1)) * 100));
  const r = 28;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return (
    <div className="analytics-donut-wrap">
      <svg width="72" height="72" viewBox="0 0 72 72">
        <circle cx="36" cy="36" r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8" />
        <circle
          cx="36" cy="36" r={r}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeDasharray={`${dash} ${circ - dash}`}
          strokeLinecap="round"
          transform="rotate(-90 36 36)"
          style={{ transition: "stroke-dasharray 0.8s ease" }}
        />
        <text x="36" y="40" textAnchor="middle" fill={color} fontSize="12" fontWeight="700" fontFamily="Space Grotesk">
          {pct}%
        </text>
      </svg>
      <p className="analytics-donut-label">{label}</p>
    </div>
  );
}

function TrendChart({ data }) {
  if (!data || data.length === 0) return null;
  const max = Math.max(...data.map((d) => d.count), 1);
  const points = data.map((d, i) => {
    const x = (i / (data.length - 1)) * 200;
    const y = 60 - (d.count / max) * 55;
    return `${x},${y}`;
  }).join(" ");
  return (
    <div className="analytics-trend">
      <svg viewBox="0 0 200 70" preserveAspectRatio="none" style={{ width: "100%", height: 60 }}>
        <defs>
          <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(44,195,167,0.5)" />
            <stop offset="100%" stopColor="rgba(44,195,167,0)" />
          </linearGradient>
        </defs>
        {/* Area */}
        <polygon
          points={`0,60 ${points} 200,60`}
          fill="url(#trendGrad)"
        />
        {/* Line */}
        <polyline
          points={points}
          fill="none"
          stroke="#2cc3a7"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <div className="analytics-trend-labels">
        {data.filter((_, i) => i === 0 || i === data.length - 1).map((d, i) => (
          <span key={i} style={{ color: "var(--muted)", fontSize: "0.68rem" }}>
            {d.date.slice(5)}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function AnalyticsPanel() {
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays]     = useState(7);

  useEffect(() => {
    setLoading(true);
    getAnalytics(days)
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [days]);

  if (loading) {
    return (
      <div style={{ padding: "2rem", display: "flex", alignItems: "center", gap: "0.6rem", color: "var(--muted)" }}>
        <span className="mini-spinner" /> Loading analytics…
      </div>
    );
  }

  if (!data) return <p style={{ color: "var(--danger)", padding: "1rem" }}>Failed to load analytics.</p>;

  return (
    <div className="analytics-shell">
      {/* Period selector */}
      <div className="analytics-header">
        <div>
          <h3 className="analytics-title">📊 Analytics Dashboard</h3>
          <p style={{ color: "var(--muted)", fontSize: "0.82rem", marginTop: "0.2rem" }}>
            {data.totalCases} cases in the last {data.periodDays} days
          </p>
        </div>
        <div className="analytics-period-btns">
          {[7, 14, 30].map((d) => (
            <button
              key={d}
              className={`ghost ${days === d ? "active-period" : ""}`}
              onClick={() => setDays(d)}
              style={{ padding: "0.3rem 0.75rem", fontSize: "0.8rem" }}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {/* KPI row */}
      <div className="analytics-kpi-row">
        <div className="analytics-kpi-card">
          <p className="analytics-kpi-num" style={{ color: "var(--teal-bright)" }}>{data.totalCases}</p>
          <p className="analytics-kpi-label">Total Cases</p>
        </div>
        <div className="analytics-kpi-card">
          <p className="analytics-kpi-num" style={{ color: "var(--danger)" }}>{data.p1Count}</p>
          <p className="analytics-kpi-label">P1 Escalations</p>
        </div>
        <div className="analytics-kpi-card">
          <p className="analytics-kpi-num" style={{ color: "var(--ok)" }}>{data.autoResolved}</p>
          <p className="analytics-kpi-label">Auto-Resolved</p>
        </div>
        <div className="analytics-kpi-card">
          <p className="analytics-kpi-num" style={{ color: "var(--warn)" }}>{Math.round(data.avgConfidence * 100)}%</p>
          <p className="analytics-kpi-label">Avg Confidence</p>
        </div>
      </div>

      {/* Main grid */}
      <div className="analytics-main-grid">
        {/* Top issues */}
        <div className="panel analytics-section">
          <h4 className="analytics-section-title">🔥 Top 5 Issue Types</h4>
          <BarChart data={data.topIssues} />
        </div>

        {/* Donut rates */}
        <div className="panel analytics-section">
          <h4 className="analytics-section-title">📈 Resolution Rates</h4>
          <div className="analytics-donuts">
            <MiniDonut value={data.autoResolveRate} label="Auto-Resolve" color="var(--ok)" />
            <MiniDonut value={data.escalationRate} label="Escalation" color="var(--danger)" />
            <MiniDonut
              value={data.sentimentBreakdown?.distressed || 0}
              max={data.totalCases || 1}
              label="Distressed"
              color="var(--warn)"
            />
          </div>
        </div>

        {/* Volume trend */}
        <div className="panel analytics-section">
          <h4 className="analytics-section-title">📅 Daily Volume</h4>
          <TrendChart data={data.dailyTrend} />
        </div>

        {/* Language breakdown */}
        <div className="panel analytics-section">
          <h4 className="analytics-section-title">🌐 Languages Used</h4>
          <div className="analytics-lang-list">
            {Object.entries(data.languageBreakdown || {}).map(([lang, count]) => (
              <div key={lang} className="analytics-lang-row">
                <span>{LANG_NAMES[lang] || lang}</span>
                <span className="analytics-lang-count">{count}</span>
              </div>
            ))}
            {Object.keys(data.languageBreakdown || {}).length === 0 && (
              <p style={{ color: "var(--muted)", fontSize: "0.82rem" }}>No data yet.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
