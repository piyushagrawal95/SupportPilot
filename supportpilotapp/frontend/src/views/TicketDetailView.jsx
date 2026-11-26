import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  User,
  Bot,
  Headphones,
  Shield,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Send,
  Flag,
  RotateCcw,
  Sparkles,
  CreditCard,
  FileText,
  UserCheck,
} from "lucide-react";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";

export default function TicketDetailView({ ticketId, onBack }) {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [flagReason, setFlagReason] = useState("");
  const [flagOpen, setFlagOpen] = useState(false);
  const [takeoverBusy, setTakeoverBusy] = useState(false);

  const fetchTicket = async () => {
    try {
      const res = await api.getTicket(ticketId);
      setData(res);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTicket();
    const interval = setInterval(fetchTicket, 4000);
    return () => clearInterval(interval);
  }, [ticketId]);

  const handleSendReply = async (e) => {
    e.preventDefault();
    if (!replyText.trim() || sending) return;
    setSending(true);
    try {
      await api.replyTicket(ticketId, replyText.trim());
      setReplyText("");
      await fetchTicket();
    } finally {
      setSending(false);
    }
  };

  const handleTakeover = async () => {
    setTakeoverBusy(true);
    try {
      await api.takeoverTicket(ticketId);
      await fetchTicket();
    } finally {
      setTakeoverBusy(false);
    }
  };

  const handleFlagWrong = async (e) => {
    e.preventDefault();
    if (!flagReason.trim()) return;
    try {
      await api.flagTicketWrong(ticketId, flagReason.trim());
      setFlagOpen(false);
      setFlagReason("");
      await fetchTicket();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleStatusChange = async (status) => {
    try {
      await api.updateTicketStatus(ticketId, status);
      await fetchTicket();
    } catch (err) {
      alert(err.message);
    }
  };

  if (loading || !data) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[60vh]">
        <div className="flex items-center gap-3 text-slate-400">
          <div className="h-5 w-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <span>Loading ticket #{ticketId}…</span>
        </div>
      </div>
    );
  }

  const { ticket, messages = [], events = [], actions = [], approvals = [] } = data;

  const statusBadges = {
    resolved_by_ai: "bg-emerald-100 text-emerald-800 border-emerald-300",
    waiting_for_approval: "bg-amber-100 text-amber-800 border-amber-300",
    waiting_for_agent: "bg-rose-100 text-rose-800 border-rose-300 animate-pulse",
    needs_human: "bg-purple-100 text-purple-800 border-purple-300",
    waiting_for_customer: "bg-blue-100 text-blue-800 border-blue-300",
    closed: "bg-slate-100 text-slate-700 border-slate-300",
    open: "bg-sky-100 text-sky-800 border-sky-300",
  };

  const statusLabels = {
    resolved_by_ai: "Resolved by AI",
    waiting_for_approval: "Waiting for approval",
    waiting_for_agent: "Waiting for agent",
    needs_human: "Needs a human",
    waiting_for_customer: "Waiting for customer",
    closed: "Closed",
    open: "Open",
  };

  // Find facts event and rule decision event from timeline
  const factsEvent = events.find((e) => e.kind === "facts_checked");
  const ruleEvent = events.find((e) => e.kind === "rule_decision");
  const understandingEvent = events.find((e) => e.kind === "understanding");

  return (
    <div className="p-6 space-y-5 max-w-7xl mx-auto text-slate-800">
      {/* Top Bar Navigation & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#d4e3f3] pb-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 rounded-xl bg-white border border-[#d4e3f3] hover:bg-blue-50 text-slate-700 transition shadow-sm"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-bold text-slate-900 font-mono">Ticket #{ticket.id}</h1>
              <span
                className={`text-xs px-2.5 py-0.5 rounded-full border font-semibold ${
                  statusBadges[ticket.status] || statusBadges.open
                }`}
              >
                {statusLabels[ticket.status] || ticket.status}
              </span>
              {ticket.flagged_wrong && (
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-rose-100 border border-rose-300 text-rose-800 font-bold flex items-center gap-1">
                  <Flag className="h-3 w-3" /> Flagged Wrong Decision
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Customer: <span className="text-slate-900 font-semibold">{ticket.customer_email || ticket.customer_ref}</span> • Use case:{" "}
              <span className="capitalize text-slate-700 font-medium">{ticket.use_case ? ticket.use_case.replace("_", " ") : "general"}</span>
            </p>
          </div>
        </div>

        {/* Staff Actions */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {!ticket.assigned_agent_id ? (
            <button
              onClick={handleTakeover}
              disabled={takeoverBusy}
              className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-xs font-semibold text-white shadow-md shadow-blue-500/20 transition flex items-center gap-1.5"
            >
              <Headphones className="h-3.5 w-3.5" />
              <span>{takeoverBusy ? "Assigning…" : "Take Over Ticket"}</span>
            </button>
          ) : (
            <span className="text-xs font-medium text-slate-700 bg-white px-3 py-1.5 rounded-xl border border-[#d4e3f3] flex items-center gap-1.5 shadow-sm">
              <Headphones className="h-3.5 w-3.5 text-blue-600" />
              <span>Assigned: <strong className="text-slate-900">{ticket.agent_name || "Agent"}</strong></span>
            </span>
          )}

          {/* Quick status dropdown */}
          <select
            value={ticket.status}
            onChange={(e) => handleStatusChange(e.target.value)}
            className="bg-white border border-[#d4e3f3] rounded-xl px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-blue-500 shadow-sm"
          >
            <option value="open">Open</option>
            <option value="waiting_for_agent">Waiting for Agent</option>
            <option value="waiting_for_approval">Waiting for Approval</option>
            <option value="waiting_for_customer">Waiting for Customer</option>
            <option value="needs_human">Needs a Human</option>
            <option value="resolved_by_ai">Resolved by AI</option>
            <option value="closed">Closed</option>
          </select>

          {/* Flag button */}
          {!ticket.flagged_wrong && (
            <button
              onClick={() => setFlagOpen(true)}
              className="px-3 py-1.5 rounded-xl border border-[#d4e3f3] bg-white hover:border-rose-300 hover:bg-rose-50 text-slate-700 hover:text-rose-700 text-xs font-medium transition flex items-center gap-1.5 shadow-sm"
            >
              <Flag className="h-3.5 w-3.5" />
              <span>Flag Wrong Decision</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Grid: 2 Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Column (7 cols): Full Chat & Reply Box */}
        <div className="lg:col-span-7 space-y-3 flex flex-col h-[720px]">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900 tracking-wide">Chat Transcript</h2>
            <span className="text-xs text-slate-500 font-mono">{messages.length} messages</span>
          </div>

          {/* Messages scroll box */}
          <div className="flex-1 bg-white border border-[#d4e3f3] rounded-2xl p-4 overflow-y-auto space-y-3.5 shadow-sm">
            {messages.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-10">No messages in this ticket.</p>
            ) : (
              messages.map((m) => {
                const isCustomer = m.sender === "customer";
                const isAgent = m.sender === "agent";
                const isSystem = m.sender === "system";
                const isAi = m.sender === "ai";

                if (isSystem) {
                  return (
                    <div key={m.id} className="text-center my-2">
                      <span className="text-[11px] px-3 py-1 rounded-full bg-[#f0f6fc] border border-blue-200/60 text-slate-600 font-mono">
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
                    <div className="flex items-center gap-1.5 mb-1 px-1">
                      {isCustomer ? (
                        <>
                          <User className="h-3 w-3 text-slate-500" />
                          <span className="text-[11px] font-semibold text-slate-600">Customer</span>
                        </>
                      ) : isAgent ? (
                        <>
                          <Headphones className="h-3 w-3 text-blue-600" />
                          <span className="text-[11px] font-semibold text-blue-600">Agent ({ticket.agent_name || "Live"})</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-3 w-3 text-emerald-600" />
                          <span className="text-[11px] font-semibold text-emerald-600">SupportPilot AI</span>
                        </>
                      )}
                      <span className="text-[10px] text-slate-400 font-mono ml-2">
                        {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>

                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-xs leading-relaxed ${
                        isCustomer
                          ? "bg-[#e8f1fa] border border-blue-200 text-slate-900 shadow-sm"
                          : isAgent
                          ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/20"
                          : "bg-emerald-50 border border-emerald-200 text-emerald-950 shadow-sm"
                      }`}
                    >
                      {m.content}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Reply Box */}
          <form onSubmit={handleSendReply} className="flex gap-2.5 bg-white border border-[#d4e3f3] p-2.5 rounded-2xl shadow-sm">
            <input
              type="text"
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder="Type reply to customer as live agent…"
              className="flex-1 bg-transparent px-3 py-1.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none"
            />
            <button
              type="submit"
              disabled={!replyText.trim() || sending}
              className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl text-xs font-semibold shadow-md shadow-blue-500/20 transition disabled:opacity-50 flex items-center gap-1.5"
            >
              <Send className="h-3.5 w-3.5" />
              <span>{sending ? "Sending…" : "Send Reply"}</span>
            </button>
          </form>
        </div>

        {/* Right Column (5 cols): AI Reasoning, Stripe Facts & Audit Timeline */}
        <div className="lg:col-span-5 space-y-4 overflow-y-auto max-h-[720px] pr-1">
          {/* Section 1: What AI Understood */}
          <div className="bg-white border border-[#d4e3f3] rounded-2xl p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-2.5">
              <Sparkles className="h-4 w-4 text-emerald-600" />
              <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">What AI Understood</h2>
            </div>
            {ticket.ai_understanding ? (
              <div className="bg-[#f8fafd] rounded-xl p-3 border border-[#d4e3f3] font-mono text-xs space-y-1.5 text-slate-800">
                <p>
                  <span className="text-slate-500">Intents:</span>{" "}
                  <strong className="text-emerald-700">
                    {JSON.stringify(ticket.ai_understanding.intents || [])}
                  </strong>
                </p>
                {ticket.ai_understanding.wants_immediate_cancel && (
                  <p className="text-amber-700">⚠️ wants_immediate_cancel: true</p>
                )}
                {ticket.ai_understanding.asks_for_human && (
                  <p className="text-rose-700">⚠️ asks_for_human: true</p>
                )}
                {ticket.ai_understanding.very_upset && (
                  <p className="text-rose-700">⚠️ very_upset: true</p>
                )}
                {ticket.ai_understanding.mentions_legal_or_bank && (
                  <p className="text-rose-700">⚠️ mentions_legal_or_bank: true</p>
                )}
                {ticket.ai_understanding.forced_handoff && (
                  <p className="text-rose-700">
                    <span className="text-slate-500">Forced Handoff:</span> {ticket.ai_understanding.forced_handoff}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-xs text-slate-500 italic">No LLM classification needed (direct handoff or Stripe event).</p>
            )}
          </div>

          {/* Section 2: Policy Rule & Decision */}
          {ruleEvent && (
            <div className="bg-white border border-[#d4e3f3] rounded-2xl p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-2.5">
                <Shield className="h-4 w-4 text-blue-600" />
                <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Policy Rule & Decision</h2>
              </div>
              <div className="bg-[#f8fafd] rounded-xl p-3 border border-[#d4e3f3] text-xs space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-500">Outcome:</span>
                  <span className="font-bold text-slate-900 uppercase font-mono px-2 py-0.5 rounded bg-blue-100 text-blue-800">
                    {ruleEvent.data?.outcome}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Rule Applied:</span>
                  <span className="font-bold text-blue-700 font-mono">{ruleEvent.data?.rule}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Amount Evaluated:</span>
                  <span className="font-bold text-emerald-700 font-mono">
                    ${((ruleEvent.data?.amount_cents || 0) / 100).toFixed(2)}
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 pt-1 border-t border-[#d4e3f3]">
                  {ruleEvent.data?.reason}
                </p>
              </div>
            </div>
          )}

          {/* Section 3: Stripe Facts Checked */}
          {factsEvent && (
            <div className="bg-white border border-[#d4e3f3] rounded-2xl p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-2.5">
                <CreditCard className="h-4 w-4 text-amber-600" />
                <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Stripe Facts Checked</h2>
              </div>
              <div className="bg-[#f8fafd] rounded-xl p-3 border border-[#d4e3f3] text-xs space-y-1.5 font-mono text-slate-800">
                <p>
                  <span className="text-slate-500">Customer Exists:</span>{" "}
                  <strong className={factsEvent.data?.customer_exists ? "text-emerald-700" : "text-rose-700"}>
                    {factsEvent.data?.customer_exists ? "Yes" : "No"}
                  </strong>
                </p>
                <p>
                  <span className="text-slate-500">Subscription Status:</span>{" "}
                  <strong className="text-blue-700">
                    {factsEvent.data?.subscription_status || "None"}
                  </strong>
                </p>
                <p>
                  <span className="text-slate-500">Charges Found:</span>{" "}
                  <strong>{factsEvent.data?.recent_charges?.length || 0}</strong>
                </p>
                {factsEvent.data?.recent_charges?.length > 0 && (
                  <p className="text-[11px] text-slate-600 pt-1">
                    Latest: ${(factsEvent.data.recent_charges[0].amount / 100).toFixed(2)} (
                    {factsEvent.data.recent_charges[0].status})
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Section 4: Audit Event Timeline */}
          <div className="bg-white border border-[#d4e3f3] rounded-2xl p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-2.5">
              <Clock className="h-4 w-4 text-slate-500" />
              <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Audit Timeline</h2>
            </div>
            <div className="space-y-2 border-l-2 border-blue-200 pl-3 ml-1 text-xs">
              {events.length === 0 ? (
                <p className="text-slate-500 italic">No events logged.</p>
              ) : (
                events.map((ev, i) => (
                  <div key={i} className="relative group">
                    <span className="absolute -left-[19px] top-1 h-2.5 w-2.5 rounded-full bg-blue-600 ring-4 ring-white" />
                    <p className="font-semibold text-slate-900 capitalize">{ev.kind.replace("_", " ")}</p>
                    <p className="text-[10px] text-slate-500 font-mono">
                      {new Date(ev.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Flag Wrong Decision Modal - Portaled to document.body so it NEVER clips */}
      {flagOpen && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[9999] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-[#d4e3f3] rounded-2xl max-w-md w-full p-6 shadow-2xl text-slate-800 animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-base font-bold text-slate-900 mb-2 flex items-center gap-2">
              <Flag className="h-4 w-4 text-rose-600" />
              <span>Flag Wrong AI Decision</span>
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Explain why the AI's action or response on this ticket was incorrect. This will record a disagreement in the AI Performance metrics for review.
            </p>
            <form onSubmit={handleFlagWrong} className="space-y-4">
              <textarea
                required
                rows={3}
                value={flagReason}
                onChange={(e) => setFlagReason(e.target.value)}
                placeholder="E.g., AI should have classified this as duplicate instead of standard refund..."
                className="w-full bg-[#f8fafd] border border-[#d4e3f3] rounded-xl p-3 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-rose-500 focus:bg-white shadow-inner"
              />
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setFlagOpen(false)}
                  className="px-3.5 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 text-white rounded-xl text-xs font-semibold shadow-md shadow-rose-500/20"
                >
                  Submit Flag
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
