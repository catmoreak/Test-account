import { createContext, useContext, useState, useEffect } from "react";

const AuthContext = createContext(null);

const SESSION_KEY = "creditassist_session";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Restore session from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(SESSION_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        setUser(parsed);
      }
    } catch {
      // ignore
    }
    setLoading(false);
  }, []);

  function login(userData) {
    setUser(userData);
    localStorage.setItem(SESSION_KEY, JSON.stringify(userData));
  }

  function logout() {
    setUser(null);
    localStorage.removeItem(SESSION_KEY);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
