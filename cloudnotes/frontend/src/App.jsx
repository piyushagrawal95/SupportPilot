import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import AuthCard from "./components/AuthCard";
import ChatWidget from "./components/ChatWidget";

const API = import.meta.env.VITE_API_URL;

function readCheckoutNotice() {
  const c = new URLSearchParams(window.location.search).get("checkout");
  if (c === "success") return { tone: "ok", text: "Checkout complete. Your subscription will show up in your account shortly." };
  if (c === "cancelled") return { tone: "warn", text: "Checkout cancelled. You were not charged." };
  return null;
}

export default function App() {
  const [session, setSession] = useState(null);
  const [recovery, setRecovery] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(readCheckoutNotice);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  async function subscribe() {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(`${API}/checkout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json();
      if (res.ok) {
        window.location.href = data.url;
        return;
      }
      setNotice({ tone: "warn", text: data.detail || "Could not start checkout. Try again." });
    } catch {
      setNotice({ tone: "warn", text: "Could not reach the server. Check that the backend is running." });
    }
    setBusy(false);
  }

  const toneClass = notice?.tone === "ok"
    ? "border-green-700/30 bg-green-50 text-green-900"
    : "border-accent/40 bg-orange-50 text-ink";

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
        <span className="font-display text-2xl font-bold">CloudNotes</span>
        {session && (
          <button
            onClick={() => supabase.auth.signOut()}
            className="rounded-md px-3 py-1.5 text-sm text-muted underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-accent"
          >
            Log out
          </button>
        )}
      </header>

      <main className="mx-auto grid max-w-5xl gap-12 px-6 pb-24 pt-8 md:grid-cols-[1.1fr_1fr] md:items-start">
        <section>
          <h1 className="font-display text-5xl font-bold leading-[1.05] md:text-6xl">
            Notes that follow you everywhere.
          </h1>
          <p className="mt-5 max-w-md text-lg leading-relaxed text-muted">
            Write once, find it on every device. Search across everything you have ever typed.
          </p>
          <p className="mt-8 font-display text-3xl font-bold">
            $20<span className="text-lg font-medium text-muted"> / month</span>
          </p>
          <p className="mt-1 text-sm text-muted">Cancel any time from the support chat.</p>
        </section>

        <section aria-live="polite">
          {notice && (
            <p className={`mb-4 rounded-lg border px-4 py-3 text-sm ${toneClass}`}>{notice.text}</p>
          )}

          {!session || recovery ? (
            <AuthCard recovery={recovery} onRecovered={() => setRecovery(false)} />
          ) : (
            <div className="rounded-xl border border-line bg-white p-6">
              <h2 className="font-display text-2xl font-bold">Your account</h2>
              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-muted">Email</dt>
                  <dd className="font-medium">{session.user.email}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted">User ID</dt>
                  <dd className="font-mono text-xs">{session.user.id.slice(0, 8)}…</dd>
                </div>
              </dl>
              <button
                onClick={subscribe}
                disabled={busy}
                className="mt-6 w-full rounded-lg bg-accent px-4 py-3 font-semibold text-white hover:bg-accent-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60"
              >
                {busy ? "Opening checkout…" : "Subscribe for $20/month"}
              </button>
              <p className="mt-3 text-xs text-muted">Test mode: use card 4242 4242 4242 4242.</p>
            </div>
          )}
        </section>
      </main>

      <ChatWidget session={session} />
    </div>
  );
}