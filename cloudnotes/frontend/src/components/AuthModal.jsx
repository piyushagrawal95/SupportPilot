import { useState, useEffect } from "react";
import { supabase } from "../supabase";

export default function AuthModal({ isOpen, onClose, initialMode = "login", recovery, onRecovered }) {
  const [mode, setMode] = useState(initialMode); // "login" | "signup" | "forgot"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setMode(initialMode);
    setMsg(null);
  }, [initialMode, isOpen]);

  if (!isOpen) return null;

  async function signInWithGoogle() {
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin,
        queryParams: { prompt: "select_account" },
      },
    });
    if (error) {
      setMsg({ ok: false, text: error.message });
      setBusy(false);
    }
    // On success the browser redirects to Google, so no further code runs here.
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    let error = null;

    if (recovery) {
      ({ error } = await supabase.auth.updateUser({ password }));
      if (!error) {
        setMsg({ ok: true, text: "Password updated successfully! You can now sign in." });
        onRecovered();
        setTimeout(() => onClose(), 1500);
      }
    } else if (mode === "signup") {
      ({ error } = await supabase.auth.signUp({ email, password }));
      if (!error) {
        setMsg({ ok: true, text: "If you are new, a new confirmation link has been sent to your email.If you already have an account, please sign in." });
      }
    } else if (mode === "forgot") {
      ({ error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
      }));
      if (!error) {
        setMsg({ ok: true, text: "If that email has an account, password recovery instructions are on the way." });
      }
    } else {
      ({ error } = await supabase.auth.signInWithPassword({ email, password }));
      if (!error) {
        onClose();
      }
    }

    if (error) {
      setMsg({ ok: false, text: error.message });
    }
    setBusy(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-white border border-line rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-muted hover:text-ink p-1.5 rounded-full hover:bg-paper transition"
          aria-label="Close dialog"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Brand & Title */}
        <div className="text-center space-y-1 pt-2">
          <div className="inline-flex h-11 w-11 rounded-2xl bg-accent text-white items-center justify-center font-display font-black text-xl shadow-md shadow-accent/25 mb-2">
            C
          </div>
          <h2 className="font-display text-2xl font-bold text-ink">
            {recovery
              ? "Set New Password"
              : mode === "signup"
              ? "Join CloudNotes"
              : mode === "forgot"
              ? "Reset Password"
              : "Welcome Back"}
          </h2>
          <p className="text-xs text-muted">
            {recovery
              ? "Enter your new account password below"
              : mode === "signup"
              ? "Start capturing your thoughts with zero lag"
              : mode === "forgot"
              ? "Enter your email to receive recovery instructions"
              : "Sign in to access your notes workspace"}
          </p>
        </div>

        {/* Tab Switcher (if not recovery and not forgot) */}
        {!recovery && mode !== "forgot" && (
          <div className="flex rounded-xl bg-paper p-1 border border-line text-xs font-semibold">
            <button
              type="button"
              onClick={() => {
                setMode("login");
                setMsg(null);
              }}
              className={`flex-1 py-2 rounded-lg transition ${
                mode === "login" ? "bg-white text-ink shadow-sm" : "text-muted hover:text-ink"
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("signup");
                setMsg(null);
              }}
              className={`flex-1 py-2 rounded-lg transition ${
                mode === "signup" ? "bg-white text-ink shadow-sm" : "text-muted hover:text-ink"
              }`}
            >
              Create Account
            </button>
          </div>
        )}

        {/* Feedback message */}
        {msg && (
          <div
            className={`p-3 rounded-xl text-xs font-medium border ${
              msg.ok ? "bg-emerald-50 text-emerald-900 border-emerald-200" : "bg-rose-50 text-rose-900 border-rose-200"
            }`}
          >
            {msg.text}
          </div>
        )}

        {/* Continue with Google */}
        {!recovery && mode !== "forgot" && (
          <>
            <button
              type="button"
              onClick={signInWithGoogle}
              disabled={busy}
              className="w-full flex items-center justify-center gap-2.5 rounded-xl border border-line bg-white py-3 px-4 text-sm font-semibold text-ink hover:bg-paper transition disabled:opacity-50"
            >
              <svg className="w-4 h-4" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
              </svg>
              <span>Continue with Google</span>
            </button>

            <div className="flex items-center gap-3 text-[11px] text-muted">
              <span className="h-px flex-1 bg-line" />
              <span>or use email</span>
              <span className="h-px flex-1 bg-line" />
            </div>
          </>
        )}

        {/* Form */}
        <form onSubmit={submit} className="space-y-4">
          {!recovery && (
            <div>
              <label className="block text-xs font-semibold text-ink mb-1.5">Email address</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                placeholder="name@example.com"
                className="w-full rounded-xl border border-line bg-paper/50 px-3.5 py-2.5 text-sm text-ink focus:outline-none focus:border-accent focus:bg-white transition"
              />
            </div>
          )}

          {mode !== "forgot" && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-ink">
                  {recovery ? "New password" : "Password"}
                </label>
                {mode === "login" && (
                  <button
                    type="button"
                    onClick={() => {
                      setMode("forgot");
                      setMsg(null);
                    }}
                    className="text-xs text-accent hover:underline font-medium"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === "signup" || recovery ? "new-password" : "current-password"}
                placeholder="••••••••"
                className="w-full rounded-xl border border-line bg-paper/50 px-3.5 py-2.5 text-sm text-ink focus:outline-none focus:border-accent focus:bg-white transition"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-accent py-3 px-4 font-bold text-white text-sm hover:bg-accent-dark transition disabled:opacity-50 shadow-md shadow-accent/25 hover:scale-[1.01] active:scale-[0.99]"
          >
            {busy
              ? "Please wait…"
              : recovery
              ? "Save Password"
              : mode === "signup"
              ? "Create Free Account"
              : mode === "forgot"
              ? "Send Recovery Link"
              : "Sign In"}
          </button>
        </form>

        {/* Footer Navigation */}
        {!recovery && mode === "forgot" && (
          <div className="text-center pt-2">
            <button
              type="button"
              onClick={() => {
                setMode("login");
                setMsg(null);
              }}
              className="text-xs text-muted hover:text-ink font-medium underline"
            >
              Back to Sign In
            </button>
          </div>
        )}
      </div>
    </div>
  );
}