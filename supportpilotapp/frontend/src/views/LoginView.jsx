import React, { useState } from "react";
import { createPortal } from "react-dom";
import { Lock, Mail, ArrowRight, Shield, User, KeyRound } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";

export default function LoginView() {
  const { login, registerStaff } = useAuth();
  const [mode, setMode] = useState("signin"); // "signin" | "register_agent"
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotMsg, setForgotMsg] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "register_agent") {
        if (password !== confirmPassword) {
          throw new Error("Passwords do not match");
        }
        if (password.length < 6) {
          throw new Error("Password must be at least 6 characters long");
        }
        await registerStaff(name, email, password);
      } else {
        await login(email, password);
      }
    } catch (err) {
      setError(err.message || "Authentication failed. Please check your credentials.");
    } finally {
      setBusy(false);
    }
  };

  const handleForgotSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.forgotPassword(forgotEmail);
      setForgotMsg("If this email is registered, a password reset link has been dispatched.");
    } catch (err) {
      setForgotMsg(err.message || "Could not request password reset.");
    }
  };

  return (
    <div className="min-h-screen bg-[#edf4fb] text-slate-800 flex flex-col justify-center items-center p-6 relative overflow-hidden">
      {/* Background glow effects */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-300/25 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-indigo-200/30 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md z-10">
        {/* Brand */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center h-12 w-12 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 shadow-lg shadow-blue-500/25 mb-3">
            <span className="text-2xl font-black text-white">S</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">SupportPilot</h1>
          <p className="text-sm text-slate-500 mt-1">Staff & AI Autonomous Operations Portal</p>
        </div>

        {/* Card */}
        <div className="bg-white border border-[#d4e3f3] rounded-2xl p-6 shadow-xl">
          {/* Tabs */}
          <div className="flex bg-slate-100 p-1 rounded-xl border border-[#d4e3f3] mb-5 text-xs font-semibold">
            <button
              type="button"
              onClick={() => {
                setMode("signin");
                setError(null);
              }}
              className={`flex-1 py-2 rounded-lg transition text-center ${
                mode === "signin"
                  ? "bg-white text-blue-700 shadow-sm font-bold"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Staff Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("register_agent");
                setError(null);
              }}
              className={`flex-1 py-2 rounded-lg transition text-center flex items-center justify-center gap-1.5 ${
                mode === "register_agent"
                  ? "bg-white text-blue-700 shadow-sm font-bold"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Shield className="h-3.5 w-3.5" />
              <span>Join as Staff (Agent)</span>
            </button>
          </div>

          <div className="mb-4">
            <h2 className="text-base font-semibold text-slate-900">
              {mode === "register_agent" ? "Join Support Team as Agent" : "Sign in to your account"}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {mode === "register_agent"
                ? "New staff join with Agent access. You can request role upgrades to Approver or Admin from your dashboard."
                : "Enter your registered staff email and password."}
            </p>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "register_agent" && (
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">Full Name</label>
                <div className="relative">
                  <User className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Rahul Sharma"
                    className="w-full bg-[#f8fafd] border border-[#d4e3f3] rounded-xl pl-9 pr-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:bg-white transition"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                {mode === "register_agent" ? "Work Email Address" : "Email address"}
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="w-full bg-[#f8fafd] border border-[#d4e3f3] rounded-xl pl-9 pr-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:bg-white transition"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-medium text-slate-700">Password</label>
                {mode === "signin" && (
                  <button
                    type="button"
                    onClick={() => setForgotOpen(true)}
                    className="text-xs text-blue-600 hover:text-blue-700 hover:underline"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-[#f8fafd] border border-[#d4e3f3] rounded-xl pl-9 pr-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:bg-white transition"
                />
              </div>
            </div>

            {mode === "register_agent" && (
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">Confirm Password</label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <input
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-[#f8fafd] border border-[#d4e3f3] rounded-xl pl-9 pr-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:bg-white transition"
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 font-semibold text-white text-sm transition shadow-md shadow-blue-600/20 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <span>{busy ? "Processing…" : mode === "register_agent" ? "Register as Agent & Enter" : "Sign In"}</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>
        </div>

        {/* Customer Site Link */}
        <div className="text-center mt-6">
          <p className="text-xs text-slate-500">
            Looking for CloudNotes customer app?{" "}
            <a
              href="http://localhost:5173"
              target="_blank"
              rel="noreferrer"
              className="text-blue-600 hover:text-blue-700 underline font-medium"
            >
              Open CloudNotes (Port 5173)
            </a>
          </p>
        </div>
      </div>

      {/* Forgot Password Modal */}
      {forgotOpen &&
        createPortal(
          <div className="fixed inset-0 z-[9999] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white border border-[#d4e3f3] rounded-2xl max-w-sm w-full p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
              <h3 className="text-base font-bold text-slate-900 mb-2">Reset Password</h3>
              <p className="text-xs text-slate-500 mb-4">
                Enter your email address and we'll send you password recovery instructions.
              </p>
              {forgotMsg ? (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl mb-4">
                  {forgotMsg}
                </div>
              ) : (
                <form onSubmit={handleForgotSubmit} className="space-y-4">
                  <input
                    type="email"
                    required
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    placeholder="name@cloudnotes.com"
                    className="w-full bg-[#f8fafd] border border-[#d4e3f3] rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white"
                  />
                  <div className="flex gap-2 justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        setForgotOpen(false);
                        setForgotMsg(null);
                      }}
                      className="px-3 py-2 text-xs text-slate-500 hover:text-slate-800"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 rounded-xl text-xs font-semibold text-white shadow-sm"
                    >
                      Send Reset Link
                    </button>
                  </div>
                </form>
              )}
              {forgotMsg && (
                <button
                  onClick={() => {
                    setForgotOpen(false);
                    setForgotMsg(null);
                  }}
                  className="w-full py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs text-slate-700 font-semibold mt-2"
                >
                  Close
                </button>
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
