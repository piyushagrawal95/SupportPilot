import React, { createContext, useContext, useState, useEffect } from "react";
import { api, getToken, setToken } from "../api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadUser() {
      const token = getToken();
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const me = await api.getMe();
        setUser(me);
      } catch {
        setToken(null);
        setUser(null);
      } finally {
        setLoading(false);
      }
    }

    loadUser();

    const handleExpired = () => {
      setUser(null);
    };
    window.addEventListener("supportpilot_auth_expired", handleExpired);
    return () => window.removeEventListener("supportpilot_auth_expired", handleExpired);
  }, []);

  const login = async (email, password) => {
    const res = await api.login(email, password);
    setToken(res.token);
    setUser(res.user);
    return res.user;
  };

  const registerAdmin = async (name, email, password) => {
    const res = await api.registerAdmin(name, email, password);
    setToken(res.token);
    setUser(res.user);
    return res.user;
  };

  const registerStaff = async (name, email, password) => {
    const res = await api.registerStaff(name, email, password);
    setToken(res.token);
    setUser(res.user);
    return res.user;
  };

  const logout = () => {
    setToken(null);
    setUser(null);
  };

  const updateAvailability = async (newAvailability) => {
    await api.setAvailability(newAvailability);
    setUser((prev) => (prev ? { ...prev, availability: newAvailability } : null));
  };

  const isRole = (...roles) => {
    if (!user) return false;
    return roles.includes(user.role);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        registerAdmin,
        registerStaff,
        logout,
        updateAvailability,
        isRole,
        isAdmin: user?.role === "admin",
        isApprover: user?.role === "approver" || user?.role === "admin",
        isAgent: user?.role === "agent" || user?.role === "admin",
        isViewer: user?.role === "viewer",
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
