import { useState } from "react";
import { Link, Route, Routes, useLocation } from "react-router-dom";
import MemberPage from "./pages/MemberPage";
import StaffPage from "./pages/StaffPage";

const navItems = [
  { to: "/", label: "Member Interface" },
  { to: "/staff", label: "Staff Dashboard" }
];

const uiCopy = {
  en: {
    title: "CreditAssist Member Support",
    subhead: "Ask, resolve, or escalate quickly.",
    nav: { member: "Member Interface", staff: "Staff Dashboard" },
    languageLabel: "Language"
  },
  hi: {
    title: "क्रेडिटअसिस्ट सदस्य सहायता",
    subhead: "जल्दी पूछें, समाधान पाएं, या एस्केलेट करें।",
    nav: { member: "सदस्य इंटरफेस", staff: "स्टाफ डैशबोर्ड" },
    languageLabel: "भाषा"
  },
  kn: {
    title: "ಕ್ರೆಡಿಟ್‌ಅಸಿಸ್ಟ್ ಸದಸ್ಯ ಬೆಂಬಲ",
    subhead: "ತ್ವರಿತವಾಗಿ ಕೇಳಿ, ಪರಿಹರಿಸಿ ಅಥವಾ ಎಸ್ಕಲೇಟ್ ಮಾಡಿ.",
    nav: { member: "ಸದಸ್ಯ ಇಂಟರ್‌ಫೇಸ್", staff: "ಸ್ಟಾಫ್ ಡ್ಯಾಶ್‌ಬೋರ್ಡ್" },
    languageLabel: "ಭಾಷೆ"
  }
};

const languageOptions = [
  { value: "en", label: "English" },
  { value: "hi", label: "Hindi" },
  { value: "kn", label: "Kannada" }
];

function App() {
  const location = useLocation();
  const [language, setLanguage] = useState("en");
  const copy = uiCopy[language] || uiCopy.en;

  return (
    <div className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">CreditAssist AI</p>
          <h1>{copy.title}</h1>
          <p className="subhead">{copy.subhead}</p>
        </div>
        <div className="hero-tools">
          <label className="language-switcher">
            <span>{copy.languageLabel}</span>
            <select value={language} onChange={(event) => setLanguage(event.target.value)}>
              {languageOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <nav className="top-nav">
            {navItems.map((item) => (
              <Link key={item.to} to={item.to} className={location.pathname === item.to ? "nav-link active" : "nav-link"}>
                {item.to === "/" ? copy.nav.member : copy.nav.staff}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main>
        <Routes>
          <Route path="/" element={<MemberPage language={language} setLanguage={setLanguage} />} />
          <Route path="/staff" element={<StaffPage />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
