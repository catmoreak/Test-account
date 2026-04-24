import { Link, Route, Routes, useLocation } from "react-router-dom";
import MemberPage from "./pages/MemberPage";
import StaffPage from "./pages/StaffPage";

const navItems = [
  { to: "/", label: "Member Interface" },
  { to: "/staff", label: "Staff Dashboard" }
];

function App() {
  const location = useLocation();

  return (
    <div className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">CreditAssist AI</p>
          <h1>AI-Powered Member Support & Resolution Assistant</h1>
          <p className="subhead">
            RAG-grounded responses, probability-driven intent routing, and structured escalations for credit union operations.
          </p>
        </div>
        <nav className="top-nav">
          {navItems.map((item) => (
            <Link key={item.to} to={item.to} className={location.pathname === item.to ? "nav-link active" : "nav-link"}>
              {item.label}
            </Link>
          ))}
        </nav>
      </header>

      <main>
        <Routes>
          <Route path="/" element={<MemberPage />} />
          <Route path="/staff" element={<StaffPage />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
