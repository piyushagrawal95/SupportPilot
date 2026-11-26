import React, { useState } from "react";
import { KeyRound, CheckCircle2, AlertCircle, ArrowRight, Loader2 } from "lucide-react";
import { api } from "../api";

export default function ResetPasswordView({ token }) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!password || password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setError(null);
    setLoading(true);

    try {
      await api.resetPassword(token, password);
      setSuccess(true);
    } catch (err) {
      setError(err.message || "Failed to reset password. The token may be invalid or expired.");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-xl p-6 text-center shadow-xl">
          <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-white mb-2">Password Reset Complete</h2>
          <p className="text-sm text-slate-400 mb-6">
            Your SupportPilot staff password has been updated securely. You can now log in with your new credentials.
          </p>
          <a
            href="/"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-900/20 transition"
          >
            Sign In to Staff Console <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl">
        <div className="flex items-center gap-2.5 mb-5 pb-4 border-b border-slate-800">
          <div className="h-9 w-9 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
            <KeyRound className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-white">Reset Staff Password</h1>
            <p className="text-xs text-slate-400">Enter a secure new password for your account</p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center gap-2 text-rose-300 text-xs">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">New Password</label>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              className="w-full text-xs bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-slate-200 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Confirm New Password</label>
            <input
              type="password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••••••"
              className="w-full text-xs bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-slate-200 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold shadow-lg shadow-indigo-900/20 transition flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save New Password"}
          </button>
        </form>
      </div>
    </div>
  );
}
