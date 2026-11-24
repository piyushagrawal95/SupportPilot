import { useState, useEffect, useRef } from "react";

const API = import.meta.env.VITE_API_URL;

const GREETING = { from: "bot", text: "Hi, I can help with billing questions. What do you need?" };

// Backend ke ticket status -> customer ko dikhne wala label
const STATUS_LABEL = {
  waiting_for_approval: "Waiting for approval",
  waiting_for_agent: "Connecting you to an agent",
  needs_human: "Passed to our team",
  resolved_by_ai: "Resolved",
};

async function readStream(res, onEvent) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const parts = buf.split("\n\n");
    buf = parts.pop();                       // aakhri adhura hissa agle round ke liye
    for (const part of parts) {
      const line = part.split("\n").find((l) => l.startsWith("data: "));
      if (!line) continue;
      try { onEvent(JSON.parse(line.slice(6))); } catch { /* kharab event ignore */ }
    }
  }
}

export default function ChatWidget({ session }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [ticketId, setTicketId] = useState(null);
  const [messages, setMessages] = useState([GREETING]);
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, open]);

  // Logout ho jaye to chat saaf, taaki agla login purani chat na dekhe
  useEffect(() => {
    if (!session) {
      setTicketId(null);
      setMessages([GREETING]);
    }
  }, [session]);

  // Sirf aakhri message badalta hai (bot ka jawab ek hi bubble me banta jaata hai)
  const patchLast = (fn) =>
    setMessages((m) => {
      const c = m.slice();
      c[c.length - 1] = fn(c[c.length - 1]);
      return c;
    });

  async function send(e) {
    e.preventDefault();
    const t = text.trim();
    if (!t || sending || !session) return;

    setText("");
    setSending(true);
    // user ka message + bot ka khali "likh raha hai" message
    setMessages((m) => [...m, { from: "you", text: t }, { from: "bot", text: "", pending: true, note: "Sending…" }]);

    try {
      const res = await fetch(`${API}/chat/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ message: t, ticket_id: ticketId }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const msg = res.status === 401
          ? "Your session expired. Please log in again."
          : data.detail || "Something went wrong. Please try again.";
        patchLast(() => ({ from: "bot", text: msg }));
      } else {
        await readStream(res, (ev) => {
          if (ev.type === "ticket") setTicketId(ev.ticket_id);
          else if (ev.type === "status") patchLast((msg) => ({ ...msg, note: ev.text }));
          else if (ev.type === "token") patchLast((msg) => ({ ...msg, note: null, text: msg.text + ev.text }));
          else if (ev.type === "done")
            patchLast((msg) => ({ ...msg, pending: false, note: null, badge: STATUS_LABEL[ev.ticket_status] }));
        });
        // Stream bina "done" ke khatam hua (network gaya): jhooth nahi, sach bolo
        patchLast((msg) =>
          msg.pending
            ? { ...msg, pending: false, note: null,
                text: msg.text || "I couldn't finish answering. Your message is saved, please try again in a moment." }
            : msg);
      }
    } catch {
      patchLast(() => ({ from: "bot", text: "Could not reach support. Check your connection and try again." }));
    }
    setSending(false);
  }

  return (
    <div className="fixed bottom-5 right-5 z-50">
      {open && (
        <div role="dialog" aria-label="Support chat"
          className="mb-3 flex h-[28rem] w-[min(22rem,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-xl border border-line bg-white shadow-lg">
          <div className="border-b border-line px-4 py-3">
            <p className="font-display text-lg font-bold">CloudNotes support</p>
            <p className="text-xs text-muted">
              {session ? `Signed in as ${session.user.email}` : "Log in to chat with support"}
            </p>
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3" aria-live="polite">
            {messages.map((m, i) => (
              <div key={i} className={m.from === "you" ? "flex justify-end" : "flex flex-col items-start"}>
                <p className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                    m.from === "you" ? "bg-accent text-white" : "bg-paper text-ink"}`}>
                  {m.text || (m.pending && <span className="italic text-muted">{m.note}</span>)}
                </p>
                {m.pending && m.text && m.note && (
                  <span className="mt-1 text-xs italic text-muted">{m.note}</span>
                )}
                {m.badge && (
                  <span className="mt-1 rounded-full border border-line px-2 py-0.5 text-xs text-muted">
                    {m.badge}
                  </span>
                )}
              </div>
            ))}
            <div ref={endRef} />
          </div>

          <form onSubmit={send} className="flex gap-2 border-t border-line p-3">
            <input value={text} onChange={(e) => setText(e.target.value)} disabled={!session || sending}
              aria-label="Message" placeholder={session ? "Type your message" : "Log in first"}
              maxLength={2000}
              className="min-w-0 flex-1 rounded-lg border border-line px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-accent disabled:bg-paper" />
            <button type="submit" disabled={!session || sending || !text.trim()}
              className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white hover:bg-accent-dark disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
              {sending ? "Sending…" : "Send"}
            </button>
          </form>
        </div>
      )}

      <button onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className="ml-auto block rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white shadow-lg hover:bg-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
        {open ? "Close chat" : "Need help?"}
      </button>
    </div>
  );
}