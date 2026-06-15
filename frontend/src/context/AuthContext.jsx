import { createContext, useEffect, useState } from "react";
import api from "@/lib/api";

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem("token"));
  const [role, setRole] = useState(() => localStorage.getItem("role"));
  const [isLoading, setIsLoading] = useState(true);

  // On mount: if we have a token, hydrate the current user from the API.
  useEffect(() => {
    const stored = localStorage.getItem("token");
    if (!stored) {
      setIsLoading(false);
      return;
    }

    let active = true;
    (async () => {
      try {
        const { data } = await api.get("/auth/me");
        const me = data?.data ?? data;
        if (!active) return;
        setUser(me);
        if (me?.role) {
          setRole(me.role);
          localStorage.setItem("role", me.role);
        }
      } catch {
        if (!active) return;
        localStorage.clear();
        setUser(null);
        setToken(null);
        setRole(null);
      } finally {
        if (active) setIsLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  function login(newToken, newRole) {
    localStorage.setItem("token", newToken);
    if (newRole) localStorage.setItem("role", newRole);
    setToken(newToken);
    setRole(newRole ?? null);
  }

  function logout() {
    localStorage.clear();
    setUser(null);
    setToken(null);
    setRole(null);
    window.location.href = "/login";
  }

  const value = { user, token, role, isLoading, login, logout, setUser };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
