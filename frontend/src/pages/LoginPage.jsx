import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const DEMO_ACCOUNTS = [
  {
    id: "MCC-001",
    username: "rahul.sharma",
    password: "bank123",
    name: "Rahul Sharma",
    role: "member",
    accountNumber: "1002003001",
    balance: 47250.75,
    savingsBalance: 12800.0,
    fdBalance: 100000.0,
    loanBalance: 45000.0,
    loanStatus: "active",
    cardStatus: "active",
    label: "Rahul Sharma (Member)",
    icon: "👤"
  },
  {
    id: "STAFF-001",
    username: "staff.admin",
    password: "staff123",
    name: "Manjunath Rao",
    role: "staff",
    department: "Member Support",
    employeeId: "EMP-4501",
    label: "Manjunath Rao (Staff)",
    icon: "🛡️"
  }
];

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [showPass, setShowPass] = useState(false);

  async function handleLogin(e) {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError("Please enter your credentials.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const matchedUser = DEMO_ACCOUNTS.find(
        (account) =>
          account.username === username.trim() && account.password === password.trim()
      );

      if (!matchedUser) {
        setError("Invalid username or password.");
        return;
      }

      const { password: _hiddenPassword, label: _label, icon: _icon, ...user } = matchedUser;
      login(user);
      navigate(user.role === "staff" ? "/staff" : "/");
    } catch {
      setError("Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function fillDemo(account) {
    setUsername(account.username);
    setPassword(account.password);
    setError("");
  }

  return (
    <div className="login-page">
      {/* Ambient glow blobs */}
      <div className="login-blob blob-1" />
      <div className="login-blob blob-2" />
      <div className="login-blob blob-3" />

      <div className="login-card">
        {/* Header */}
        <div className="login-header">
          <div className="login-bank-logo">🏦</div>
          <div>
            <p className="eyebrow">MCC Bank</p>
            <h1 className="login-title">CreditAssist AI</h1>
            <p className="login-subtitle">Secure Member Portal</p>
          </div>
        </div>

        {/* Feature pills */}
        <div className="login-feature-pills">
          <span className="login-pill">🤖 AI-Powered Support</span>
          <span className="login-pill">🌐 Multilingual</span>
          <span className="login-pill">🔒 Secure</span>
        </div>

        {/* Form */}
        <form className="login-form" onSubmit={handleLogin} autoComplete="on">
          <div className="login-field">
            <label htmlFor="login-username">Username</label>
            <div className="login-input-wrap">
              <span className="login-input-icon">👤</span>
              <input
                id="login-username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your username"
                autoComplete="username"
                disabled={loading}
              />
            </div>
          </div>

          <div className="login-field">
            <label htmlFor="login-password">Password</label>
            <div className="login-input-wrap">
              <span className="login-input-icon">🔑</span>
              <input
                id="login-password"
                type={showPass ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                autoComplete="current-password"
                disabled={loading}
              />
              <button
                type="button"
                className="login-show-pass"
                onClick={() => setShowPass((v) => !v)}
                tabIndex={-1}
              >
                {showPass ? "🙈" : "👁️"}
              </button>
            </div>
          </div>

          {error && <div className="login-error">{error}</div>}

          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? (
              <span className="login-btn-inner">
                <span className="mini-spinner-inline" />
                Signing in…
              </span>
            ) : (
              <span className="login-btn-inner">
                Sign In  →
              </span>
            )}
          </button>
        </form>

        {/* Demo accounts */}
        <div className="login-demo">
          <p className="login-demo-label">⚡ Quick Demo Login</p>
          <div className="login-demo-grid">
            {DEMO_ACCOUNTS.map((account) => (
              <button
                key={account.username}
                className={`login-demo-btn ${account.role}`}
                onClick={() => fillDemo(account)}
                disabled={loading}
              >
                <span>{account.icon}</span>
                <span>{account.label}</span>
              </button>
            ))}
          </div>
        </div>

      
      </div>
    </div>
  );
}
