import React, { useState, useEffect, useRef } from "react";
import {
  Headphones,
  Radio,
  Clock,
  User,
  Send,
  CheckCircle,
  AlertCircle,
  XCircle,
  MessageSquare,
  Sparkles,
  Volume2,
} from "lucide-react";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";

export default function LiveChatsView({ liveQueue = [], onAcceptHandoff, onSelectTicket }) {
  const { user } = useAuth();
  const [activeChatTicket, setActiveChatTicket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [acceptingId, setAcceptingId] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const messagesEndRef = useRef(null);

  // Poll messages for active chat
  useEffect(() => {
    if (!activeChatTicket) return;

    let isMounted = true;
    const fetchMessages = async () => {
      try {
        const res = await api.getLiveMessages(activeChatTicket.id);
        if (isMounted) {
          setMessages(res.messages || []);
        }
      } catch (err) {
        console.error(err);
      }
    };

    fetchMessages();
    const interval = setInterval(fetchMessages, 2500);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [activeChatTicket]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleAccept = async (ticket) => {
    setAcceptingId(ticket.id);
    setErrorMsg(null);
    try {
      await api.acceptLiveChat(ticket.id);
      setActiveChatTicket(ticket);
    } catch (err) {
      setErrorMsg(err.message || "Failed to accept chat.");
    } finally {
      setAcceptingId(null);
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!replyText.trim() || sending || !activeChatTicket) return;
    setSending(true);
    try {
      await api.sendLiveMessage(activeChatTicket.id, replyText.trim());
      setReplyText("");
      const res = await api.getLiveMessages(activeChatTicket.id);
      setMessages(res.messages || []);
    } catch (err) {
      alert(err.message);
    } finally {
      setSending(false);
    }
  };

  const handleCloseChat = async () => {
    if (!activeChatTicket) return;
    try {
      await api.updateTicketStatus(activeChatTicket.id, "closed");
      setActiveChatTicket(null);
      setMessages([]);
    } catch (err) {
      alert(err.message);
    }
  };

  const isAvailable = user?.availability === "available";

  return (
    <div className="p-6 space-y-5 max-w-7xl mx-auto h-[calc(100vh-6rem)] flex flex-col">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <Headphones className="h-5 w-5 text-blue-600" />
            <span>Live Chat Operations</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time hand-offs from AI when customers ask for a person, are very upset, or dispute payments.
          </p>
        </div>

        {!isAvailable && (
          <div className="p-2.5 px-4 rounded-xl bg-amber-50 border border-amber-300 text-amber-800 text-xs flex items-center gap-2 shadow-sm">
            <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
            <span>You are marked <strong>Away</strong>. Set status to <strong>Available</strong> in header to receive chats.</span>
          </div>
        )}
      </div>

      {errorMsg && (
        <div className="p-3 bg-rose-50 border border-rose-300 rounded-xl text-xs text-rose-800 flex items-center justify-between">
          <span>{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} className="text-rose-600 hover:text-rose-800">✕</button>
        </div>
      )}

      {/* Main Console Split: Left Queue, Right Live Conversation */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 flex-1 min-h-0">
        {/* Left Column (5 cols): Live Hand-off Queue */}
        <div className="lg:col-span-5 bg-white border border-[#d4e3f3] rounded-2xl p-4 flex flex-col shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Radio className="h-4 w-4 text-rose-600 animate-pulse" />
              <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Incoming Hand-offs ({liveQueue.length})
              </h2>
            </div>
            <span className="text-[11px] font-mono text-slate-500">Auto-refreshing</span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
            {liveQueue.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-8 text-slate-500 space-y-2">
                <CheckCircle className="h-8 w-8 text-slate-400" />
                <p className="text-xs font-medium text-slate-700">Queue is clear</p>
                <p className="text-[11px] text-slate-500">
                  No customers currently waiting for a live agent. When AI triggers a hand-off, it will appear here.
                </p>
              </div>
            ) : (
              liveQueue.map((ticket) => (
                <div
                  key={ticket.id}
                  className="p-3.5 rounded-xl bg-[#f8fafd] border border-amber-300/80 hover:border-amber-400 transition shadow-sm space-y-2.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-bold text-amber-700">
                      Ticket #{ticket.id}
                    </span>
                    <span className="text-[11px] font-mono text-slate-500 flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {ticket.seconds_waiting || 0}s waiting
                    </span>
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-slate-900">
                      {ticket.customer_email || "Customer"}
                    </p>
                    <p className="text-[11px] text-rose-700 font-medium mt-0.5">
                      Reason: {ticket.handoff_reason || "Escalated by AI"}
                    </p>
                    {ticket.customer_query && (
                      <p className="text-xs text-slate-700 italic mt-1 bg-white p-2 rounded-lg border border-[#d4e3f3]">
                        "{ticket.customer_query}"
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={() => handleAccept(ticket)}
                      disabled={acceptingId === ticket.id}
                      className="flex-1 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-bold transition shadow-sm disabled:opacity-50"
                    >
                      {acceptingId === ticket.id ? "Connecting…" : "Accept Live Chat"}
                    </button>
                    <button
                      onClick={() => onSelectTicket(ticket.id)}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition border border-slate-200"
                    >
                      View Case
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Column (7 cols): Active Live Chat Room */}
        <div className="lg:col-span-7 bg-white border border-[#d4e3f3] rounded-2xl flex flex-col shadow-sm overflow-hidden">
          {activeChatTicket ? (
            <>
              {/* Active Chat Header */}
              <div className="p-3.5 border-b border-[#d4e3f3] bg-[#f1f6fc] flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                    <h2 className="text-xs font-bold text-slate-900">
                      Live Chat with {activeChatTicket.customer_email || `Customer #${activeChatTicket.id}`}
                    </h2>
                  </div>
                  <p className="text-[11px] text-slate-500 font-mono">
                    Ticket #{activeChatTicket.id} • Handled by {user?.name || "You"}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onSelectTicket(activeChatTicket.id)}
                    className="px-3 py-1.5 rounded-lg bg-white border border-[#d4e3f3] hover:bg-blue-50 text-slate-700 text-xs font-medium shadow-sm"
                  >
                    View Timeline
                  </button>
                  <button
                    onClick={handleCloseChat}
                    className="px-3 py-1.5 rounded-lg bg-rose-50 border border-rose-200 hover:bg-rose-100 text-rose-700 text-xs font-semibold"
                  >
                    Resolve & Close
                  </button>
                </div>
              </div>

              {/* Messages Body */}
              <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-[#edf4fb]/40">
                {messages.map((m) => {
                  const isCustomer = m.sender === "customer";
                  const isAgent = m.sender === "agent";
                  const isSystem = m.sender === "system";

                  if (isSystem) {
                    return (
                      <div key={m.id} className="text-center my-2">
                        <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-white border border-blue-200/60 text-slate-600 shadow-sm">
                          ⚙️ {m.content}
                        </span>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={m.id}
                      className={`flex flex-col ${isCustomer ? "items-start" : "items-end"}`}
                    >
                      <span className="text-[10px] text-slate-500 font-mono mb-0.5 px-1">
                        {isCustomer ? "Customer" : "You (Agent)"}
                      </span>
                      <div
                        className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${
                          isCustomer
                            ? "bg-[#e8f1fa] border border-blue-200 text-slate-900 shadow-sm"
                            : "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/20"
                        }`}
                      >
                        {m.content}
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Live Chat Input */}
              <div className="p-3 border-t border-[#d4e3f3] bg-white">
                {/* Quick canned responses */}
                <div className="flex items-center gap-1.5 mb-2 overflow-x-auto pb-1 text-[11px]">
                  <button
                    onClick={() => setReplyText("Hello! I'm taking a look at your account charges right now.")}
                    className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 whitespace-nowrap"
                  >
                    👋 Greeting
                  </button>
                  <button
                    onClick={() => setReplyText("I have confirmed the charge and am processing the refund for you.")}
                    className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 whitespace-nowrap"
                  >
                    💳 Confirming refund
                  </button>
                  <button
                    onClick={() => setReplyText("Is there anything else I can assist you with today?")}
                    className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 whitespace-nowrap"
                  >
                    ❓ Anything else
                  </button>
                </div>

                <form onSubmit={handleSendMessage} className="flex gap-2">
                  <input
                    type="text"
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Type message directly to customer in CloudNotes…"
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                  <button
                    type="submit"
                    disabled={!replyText.trim() || sending}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-md shadow-indigo-600/30 transition disabled:opacity-50 flex items-center gap-1.5"
                  >
                    <Send className="h-3.5 w-3.5" />
                    <span>Send</span>
                  </button>
                </form>
              </div>
            </>
          ) : (
            <div className="h-full flex flex-col items-center justify-center p-8 text-center text-slate-500 space-y-2">
              <MessageSquare className="h-10 w-10 text-slate-700" />
              <p className="text-sm font-semibold text-slate-300">No active live conversation</p>
              <p className="text-xs text-slate-500 max-w-sm">
                Click "Accept Live Chat" on any waiting ticket in the queue on the left to start typing to the customer in real-time.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
