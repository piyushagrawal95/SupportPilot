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
  const [lastMsgId, setLastMsgId] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, open]);

  // Reset unread count when chat is opened
  useEffect(() => {
    if (open) {
      setUnreadCount(0);
    }
  }, [open]);

  // Logout ho jaye to chat saaf, taaki agla login purani chat na dekhe
  useEffect(() => {
    if (!session) {
      setTicketId(null);
      setMessages([GREETING]);
      setLastMsgId(0);
      setUnreadCount(0);
    }
  }, [session]);

  // Polling for live human agent messages (Bug 26 fix: polls in background even when widget is closed)
  useEffect(() => {
    if (!ticketId || !session) return;

    let isMounted = true;
    const pollAgentMessages = async () => {
      try {
        const res = await fetch(`${API}/chat/poll?ticket_id=${ticketId}&after_id=${lastMsgId}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!isMounted || !data.messages || data.messages.length === 0) return;

        let maxId = lastMsgId;
        const newItems = [];

        for (const m of data.messages) {
          if (m.id > maxId) maxId = m.id;
          // Only append agent or system/ai messages (customer's own messages are added immediately in UI)
          if (m.sender === "agent") {
            newItems.push({
              id: m.id,
              from: "agent",
              agentName: data.agent_name || "Support Team",
              text: m.content,
            });
          } else if (m.sender === "system" || m.sender === "ai") {
            newItems.push({
              id: m.id,
              from: m.sender === "system" ? "system" : "bot",
              text: m.content,
            });
          }
        }

        if (maxId > lastMsgId) {
          setLastMsgId(maxId);
        }

        if (newItems.length > 0) {
          setMessages((prev) => {
            const existingIds = new Set(prev.map((p) => p.id).filter(Boolean));
            const updated = [...prev];
            const toAppend = [];

            for (const item of newItems) {
              if (existingIds.has(item.id)) continue;

              // Check if an existing message without ID matches this content (e.g. streamed bot message)
              const matchIdx = updated.findIndex(
                (p) => !p.id && (p.from === item.from || (p.from === "bot" && item.from === "bot")) && p.text.trim() === item.text.trim()
              );

              if (matchIdx !== -1) {
                updated[matchIdx] = { ...updated[matchIdx], id: item.id };
                existingIds.add(item.id);
              } else {
                toAppend.push(item);
                existingIds.add(item.id);
              }
            }

            if (!open && toAppend.length > 0) {
              setUnreadCount((c) => c + toAppend.length);
            }

            return toAppend.length > 0 ? [...updated, ...toAppend] : updated;
          });
        }
      } catch {
        // Silently ignore poll errors
      }
    };

    const interval = setInterval(pollAgentMessages, 2500);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [ticketId, session, open, lastMsgId]);


  // Sirf aakhri message badalta hai (bot ka jawab ek hi bubble me banta jaata hai)
  const patchLast = (fn) =>
    setMessages((m) => {
      const c = m.slice();
      c[c.length - 1] = fn(c[c.length - 1]);
      return c;
    });

  async function send(e, overrideText) {
    if (e && e.preventDefault) e.preventDefault();
    const t = (overrideText || text).trim();
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
          else if (ev.type === "done") {
            patchLast((msg) => ({
              ...msg,
              id: ev.message_id || msg.id,
              pending: false,
              note: null,
              badge: STATUS_LABEL[ev.ticket_status],
            }));
            if (ev.message_id) {
              setLastMsgId((prev) => Math.max(prev, ev.message_id));
            }
          }
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

  const samplePrompts = [
    "I think I was charged twice this month",
    "I want to cancel my subscription",
    "Can I get a refund for my payment?",
    "I want to speak to a person",
  ];

  return (
    <div className="fixed bottom-5 right-5 z-50">
      {open && (
        <div role="dialog" aria-label="Support chat"
          className="mb-3 flex h-[32rem] w-[min(24rem,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-2xl transition-all">
          <div className="border-b border-line bg-paper px-4 py-3 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <p className="font-display text-base font-bold text-ink">CloudNotes Support</p>
                {ticketId && (
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-line/60 text-muted">
                    #{ticketId}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted">
                {session ? "We reply instantly with AI & live support" : "Sign in to chat with support"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {ticketId && (
                <button
                  onClick={() => {
                    setTicketId(null);
                    setMessages([GREETING]);
                    setLastMsgId(0);
                  }}
                  title="Start a new support conversation"
                  className="text-[11px] px-2 py-0.5 rounded bg-line/60 hover:bg-line text-ink font-medium transition"
                >
                  + New Chat
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="text-muted hover:text-ink text-sm p-1 rounded hover:bg-line/40 transition"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
          </div>

          <div className="flex-1 space-y-2.5 overflow-y-auto px-4 py-3" aria-live="polite">
            {messages.map((m, i) => {
              if (m.from === "system") {
                return (
                  <div key={i} className="text-center my-2">
                    <span className="text-[11px] px-3 py-1 rounded-full bg-line/40 text-muted font-medium inline-block">
                      {m.text}
                    </span>
                  </div>
                );
              }

              const isUser = m.from === "you";
              const isAgent = m.from === "agent";

              return (
                <div key={i} className={isUser ? "flex justify-end" : "flex flex-col items-start"}>
                  {isAgent && (
                    <span className="text-[10px] font-semibold text-accent mb-0.5 ml-1">
                      {m.agentName || "Support Team"}
                    </span>
                  )}
                  <p className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-xs leading-relaxed ${
                      isUser
                        ? "bg-accent text-white shadow-sm"
                        : isAgent
                        ? "bg-amber-50 border border-amber-200 text-ink"
                        : "bg-paper text-ink border border-line/60"}`}>
                    {m.text || (m.pending && <span className="italic text-muted">{m.note}</span>)}
                  </p>
                  {m.pending && m.text && m.note && (
                    <span className="mt-1 text-[11px] italic text-muted">{m.note}</span>
                  )}
                  {m.badge && (
                    <span className="mt-1 rounded-full border border-line px-2 py-0.5 text-[10px] font-medium text-muted bg-paper">
                      {m.badge}
                    </span>
                  )}
                </div>
              );
            })}
            <div ref={endRef} />
          </div>

          {/* Quick Prompt Suggestions */}
          {messages.length <= 2 && session && (
            <div className="p-2 border-t border-line/50 bg-paper/60 flex items-center gap-1.5 overflow-x-auto text-[11px]">
              {samplePrompts.map((p, idx) => (
                <button
                  key={idx}
                  onClick={() => send(null, p)}
                  className="px-2.5 py-1 bg-white border border-line rounded-lg text-muted hover:text-ink hover:border-accent whitespace-nowrap transition"
                >
                  {p}
                </button>
              ))}
            </div>
          )}

          <form onSubmit={send} className="flex gap-2 border-t border-line p-3 bg-white">
            <input value={text} onChange={(e) => setText(e.target.value)} disabled={!session || sending}
              aria-label="Message" placeholder={session ? "Type your message…" : "Log in first"}
              maxLength={2000}
              className="min-w-0 flex-1 rounded-xl border border-line px-3.5 py-2 text-xs focus-visible:outline-2 focus-visible:outline-accent disabled:bg-paper" />
            <button type="submit" disabled={!session || sending || !text.trim()}
              className="rounded-xl bg-accent px-4 py-2 text-xs font-semibold text-white hover:bg-accent-dark disabled:opacity-50 transition shadow-sm">
              {sending ? "Sending…" : "Send"}
            </button>
          </form>
        </div>
      )}

      <button onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className="ml-auto relative flex items-center gap-2 rounded-full bg-ink px-5 py-3 text-xs font-bold text-white shadow-xl hover:bg-black transition-all hover:scale-105 active:scale-95">
        <span className="h-2 w-2 rounded-full bg-accent animate-pulse" />
        <span>{open ? "Close Chat" : "Need Help? Chat Support"}</span>
        {!open && unreadCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white font-black text-[10px] h-5 min-w-5 px-1.5 rounded-full flex items-center justify-center border-2 border-paper animate-bounce shadow">
            {unreadCount}
          </span>
        )}
      </button>
    </div>
  );
}
