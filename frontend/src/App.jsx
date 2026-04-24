import { useState, useEffect } from "react";
import { Link, Route, Routes, useLocation, Navigate, useNavigate } from "react-router-dom";
import { loginUser } from "./api/client";
import MemberPage from "./pages/MemberPage";
import StaffPage from "./pages/StaffPage";
import LoginPage from "./pages/LoginPage";
import LoadingScreen from "./components/LoadingScreen";
import { useAuth } from "./context/AuthContext";

const uiCopy = {
  en: {
    title: "CreditAssist Member Support",
    subhead: "Ask, resolve, or escalate quickly.",
    nav: { member: "My Support", staff: "Staff Dashboard" },
    languageLabel: "Language"
  },
  hi: {
    title: "क्रेडिटअसिस्ट सदस्य सहायता",
    subhead: "जल्दी पूछें, समाधान पाएं, या एस्केलेट करें।",
    nav: { member: "मेरी सहायता", staff: "स्टाफ डैशबोर्ड" },
    languageLabel: "भाषा"
  },
  kn: {
    title: "ಕ್ರೆಡಿಟ್‌ಅಸಿಸ್ಟ್ ಸದಸ್ಯ ಬೆಂಬಲ",
    subhead: "ತ್ವರಿತವಾಗಿ ಕೇಳಿ, ಪರಿಹರಿಸಿ ಅಥವಾ ಎಸ್ಕಲೇಟ್ ಮಾಡಿ.",
    nav: { member: "ನನ್ನ ಬೆಂಬಲ", staff: "ಸ್ಟಾಫ್ ಡ್ಯಾಶ್‌ಬೋರ್ಡ್" },
    languageLabel: "ಭಾಷೆ"
  },
  ta: {
    title: "கிரெடிட்அசிஸ்ட் உறுப்பினர் ஆதரவு",
    subhead: "விரைவாக கேளுங்கள், தீர்க்கவும் அல்லது எஸ்கலேட் செய்யவும்.",
    nav: { member: "என் ஆதரவு", staff: "பணியாளர் டேஷ்போர்டு" },
    languageLabel: "மொழி"
  }
};

const languageOptions = [
  { value: "en", label: "English" },
  { value: "hi", label: "Hindi" },
  { value: "kn", label: "Kannada" },
  { value: "ta", label: "Tamil" }
];

function ProtectedRoute({ children, allowedRole }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (allowedRole && user.role !== allowedRole) {
    // Let staff access member routes for testing/usage
    if (user.role === "staff" && allowedRole === "member") {
      return children;
    }
    return <Navigate to={user.role === "staff" ? "/staff" : "/"} replace />;
  }
  return children;
}

function AppShell({ language, setLanguage }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, login, logout } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const copy = uiCopy[language] || uiCopy.en;

  useEffect(() => {
    setIsLoading(true);
    const timer = setTimeout(() => setIsLoading(false), 600);
    return () => clearTimeout(timer);
  }, [location.pathname]);

  if (isLoading) return <LoadingScreen />;

  const isStaff = user?.role === "staff";

  return (
    <div className="app-shell">
      <header className="hero">
        <div>
          <h1>{copy.title}</h1>
        </div>
        <div className="hero-tools">
          {/* User info */}
          {user && (
            <div className="hero-user-info">
              <div className="hero-avatar">{user.name?.[0] || "?"}</div>
              <div>
                <p className="hero-user-name">{user.name}</p>
                <p className="hero-user-role">{user.role === "staff" ? `Staff · ${user.department}` : `Member · ${user.id}`}</p>
              </div>
              <button className="logout-btn" onClick={logout} title="Sign out">↩ Sign Out</button>
            </div>
          )}

          <div className="hero-bottom-row">
            {/* Language switcher — only for members */}
            {!isStaff && (
              <label className="language-switcher">
                <span>{copy.languageLabel}</span>
                <select className="glass-select" value={language} onChange={(e) => setLanguage(e.target.value)}>
                  {languageOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
            )}

            {/* Navigation */}
            <nav className="top-nav">
              {!isStaff ? (
                <button
                  className="nav-link"
                  style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: "1rem", color: "inherit", fontWeight: "inherit", fontFamily: "inherit" }}
                  onClick={async () => {
                    try {
                      const { user: staffUser } = await loginUser("staff.admin", "staff123");
                      login(staffUser);
                      navigate("/staff");
                    } catch (err) {
                      console.error("Staff login failed:", err);
                    }
                  }}
                >
                  Staff Login
                </button>
              ) : (
                <Link to="/" className={location.pathname === "/" ? "nav-link active" : "nav-link"}>
                  {copy.nav.member}
                </Link>
              )}
              {isStaff && (
                <Link to="/staff" className={location.pathname === "/staff" ? "nav-link active" : "nav-link"}>
                  {copy.nav.staff}
                </Link>
              )}
            </nav>
          </div>
        </div>
      </header>

      <main>
        <Routes>
          <Route
            path="/"
            element={
              <ProtectedRoute allowedRole="member">
                <MemberPage language={language} setLanguage={setLanguage} />
              </ProtectedRoute>
            }
          />
          <Route
            path="/staff"
            element={
              <ProtectedRoute allowedRole="staff">
                <StaffPage />
              </ProtectedRoute>
            }
          />
          <Route path="/login" element={<LoginPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

function App() {
  const { user } = useAuth();
  const location = useLocation();
  const [language, setLanguage] = useState(() => user?.preferredLanguage || "en");

  // Update language when user changes
  useEffect(() => {
    if (user?.preferredLanguage) setLanguage(user.preferredLanguage);
  }, [user]);

  // If on login page, just render it without the shell
  if (location.pathname === "/login") {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
      </Routes>
    );
  }

  return <AppShell language={language} setLanguage={setLanguage} />;
}

export default App;
