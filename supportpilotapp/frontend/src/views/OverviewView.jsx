import React from "react";
import {
  Inbox,
  CheckCircle2,
  Clock,
  Headphones,
  DollarSign,
  Power,
  Eye,
  AlertTriangle,
  ArrowRight,
  TrendingUp,
  Sparkles,
} from "lucide-react";

export default function OverviewView({ overview, onNavigate, onSelectTicket }) {
  if (!overview) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[50vh]">
        <div className="flex items-center gap-3 text-slate-400">
          <div className="h-5 w-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <span>Loading overview telemetry…</span>
        </div>
      </div>
    );
  }

  const dailyRefunded = overview.refunded_today_dollars || 0;
  const dailyCap = overview.daily_cap_dollars || 500;
  const capPercent = Math.min(Math.round((dailyRefunded / dailyCap) * 100), 100);

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

  return (
    <div className="p-6 space-y-5 max-w-7xl mx-auto text-slate-800">
      {/* Top Banner if Emergency Pause or Off */}
      {(!overview.ai_enabled || overview.auto_refunds_paused) && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-300 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-rose-600 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-rose-900">
                {!overview.ai_enabled
                  ? "Emergency Off Switch Active: AI automation is globally disabled."
                  : "Daily $500 Refund Cap Reached: Automatic refunds paused until reset by admin."}
              </p>
              <p className="text-xs text-rose-700">
                All incoming actions will be routed to human approvers.
              </p>
            </div>
          </div>
          <button
            onClick={() => onNavigate("settings")}
            className="px-3.5 py-1.5 rounded-xl bg-rose-100 hover:bg-rose-200 text-rose-800 text-xs font-semibold transition"
          >
            Review Settings
          </button>
        </div>
      )}

      {/* Hero Telemetry Grid - Modern Mixed Palette */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Metric 1: Tickets Today (Indigo / Violet Theme) */}
        <div className="bg-gradient-to-br from-blue-50 via-white to-indigo-50/70 border border-blue-200/90 shadow-sm shadow-blue-900/5 rounded-2xl p-5 hover:border-blue-300 transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-blue-900/80 uppercase tracking-wider">Tickets Today</span>
            <div className="p-2.5 rounded-xl bg-blue-100 text-blue-700 border border-blue-200 shadow-sm">
              <Inbox className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-slate-900 font-mono">{overview.tickets_today}</span>
            <span className="text-xs text-slate-500">new today</span>
          </div>
          <button
            onClick={() => onNavigate("tickets")}
            className="mt-4 flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-semibold transition"
          >
            <span>View all tickets</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Metric 2: Resolved by AI (Emerald / Mint Theme) */}
        <div className="bg-gradient-to-br from-emerald-50 via-white to-teal-50/70 border border-emerald-200/90 shadow-sm shadow-emerald-900/5 rounded-2xl p-5 hover:border-emerald-300 transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-emerald-900/80 uppercase tracking-wider">Resolved by AI</span>
            <div className="p-2.5 rounded-xl bg-emerald-100 text-emerald-700 border border-emerald-200 shadow-sm">
              <Sparkles className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-emerald-600 font-mono">
              {overview.resolved_by_ai_today}
            </span>
            <span className="text-xs text-slate-500">({overview.resolved_by_ai_total} all-time)</span>
          </div>
          <button
            onClick={() => onNavigate("performance")}
            className="mt-4 flex items-center gap-1.5 text-xs text-emerald-600 hover:text-emerald-700 font-semibold transition"
          >
            <span>AI Performance analytics</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Metric 3: Waiting for Approval (Amber / Gold Theme) */}
        <div
          onClick={() => onNavigate("approvals")}
          className="bg-gradient-to-br from-amber-50 via-white to-orange-50/70 border border-amber-200/90 shadow-sm shadow-amber-900/5 rounded-2xl p-5 hover:border-amber-300 transition cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-900/80 uppercase tracking-wider">
              Waiting for Approval
            </span>
            <div className="p-2.5 rounded-xl bg-amber-100 text-amber-700 border border-amber-200 shadow-sm">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-amber-600 font-mono">
              {overview.waiting_for_approval}
            </span>
            <span className="text-xs text-slate-500">cases &gt; $50</span>
          </div>
          <div className="mt-4 flex items-center gap-1.5 text-xs text-amber-600 hover:text-amber-700 font-semibold transition">
            <span>Review approval queue</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </div>
        </div>

        {/* Metric 4: Live Chats Waiting (Rose / Coral Theme) */}
        <div
          onClick={() => onNavigate("live")}
          className={`bg-gradient-to-br from-rose-50 via-white to-pink-50/70 border rounded-2xl p-5 shadow-sm shadow-rose-900/5 transition cursor-pointer ${
            overview.waiting_for_agent > 0
              ? "border-rose-400"
              : "border-rose-200 hover:border-rose-300"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-rose-900/80 uppercase tracking-wider">
              Live Chats Waiting
            </span>
            <div
              className={`p-2.5 rounded-xl border ${
                overview.waiting_for_agent > 0
                  ? "bg-rose-500 text-white border-rose-600 animate-pulse"
                  : "bg-rose-100 text-rose-700 border border-rose-200"
              }`}
            >
              <Headphones className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span
              className={`text-3xl font-black font-mono ${
                overview.waiting_for_agent > 0 ? "text-rose-600" : "text-slate-800"
              }`}
            >
              {overview.waiting_for_agent}
            </span>
            <span className="text-xs text-slate-500">hand-offs pending</span>
          </div>
          <div className="mt-4 flex items-center gap-1.5 text-xs text-rose-600 hover:text-rose-700 font-semibold transition">
            <span>Open live queue</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </div>
        </div>
      </div>

      {/* Secondary Row: Daily Cap Progress & AI Mode Status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Cap Meter */}
        <div className="lg:col-span-2 bg-white border border-[#d4e3f3] rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold text-slate-900 tracking-wide">
                Daily Automatic Refund Safety Cap
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Resets daily at 00:00 Kolkata time. Pauses automatic payouts if exceeded.
              </p>
            </div>
            <div className="text-right">
              <span className="text-2xl font-black text-slate-900 font-mono">${dailyRefunded.toFixed(2)}</span>
              <span className="text-xs text-slate-500"> / ${dailyCap.toFixed(2)}</span>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-[#ebf3fa] rounded-full h-3.5 overflow-hidden p-0.5 border border-[#d4e3f3] shadow-inner">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                capPercent > 90
                  ? "bg-rose-500"
                  : capPercent > 60
                  ? "bg-amber-500"
                  : "bg-gradient-to-r from-blue-600 via-indigo-600 to-emerald-500"
              }`}
              style={{ width: `${Math.max(capPercent, 3)}%` }}
            />
          </div>

          <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
            <span className="font-mono text-slate-700 font-semibold">{capPercent}% of cap utilized today</span>
            <span>Single automatic refund limit: <strong className="text-blue-700 font-mono">${overview.auto_refund_limit_dollars}</strong></span>
          </div>
        </div>

        {/* AI System State Controls */}
        <div className="bg-white border border-[#d4e3f3] rounded-2xl p-5 shadow-sm flex flex-col justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-900 tracking-wide mb-1">AI Governance Status</h2>
            <p className="text-xs text-slate-500">Operational switches configured in policy</p>

            <div className="mt-3 space-y-2.5">
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#f8fafd] border border-[#d4e3f3]">
                <span className="text-xs text-slate-700 font-medium">Emergency AI Switch</span>
                <span
                  className={`text-[11px] font-bold px-2 py-0.5 rounded font-mono ${
                    overview.ai_enabled
                      ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                      : "bg-rose-100 text-rose-800 border border-rose-300"
                  }`}
                >
                  {overview.ai_enabled ? "ENABLED" : "OFF"}
                </span>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#f8fafd] border border-[#d4e3f3]">
                <span className="text-xs text-slate-700 font-medium">Watching Mode</span>
                <span
                  className={`text-[11px] font-bold px-2 py-0.5 rounded font-mono ${
                    overview.watching_mode
                      ? "bg-amber-100 text-amber-800 border border-amber-300"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {overview.watching_mode ? "ACTIVE (SUGGEST ONLY)" : "OFF (AUTO ACTS)"}
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={() => onNavigate("settings")}
            className="mt-4 w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition border border-slate-200"
          >
            Manage Safety & Limits
          </button>
        </div>
      </div>

      {/* Bottom Section: Recent Tickets & Active Agents */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Recent Tickets Table */}
        <div className="lg:col-span-2 bg-white border border-[#d4e3f3] rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-slate-900 tracking-wide">Recent Tickets</h2>
            <button
              onClick={() => onNavigate("tickets")}
              className="text-xs text-blue-600 hover:text-blue-700 font-semibold flex items-center gap-1"
            >
              <span>View all</span>
              <ArrowRight className="h-3 w-3" />
            </button>
          </div>

          <div className="divide-y divide-[#edf4fb] overflow-hidden">
            {overview.recent_tickets?.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center">No recent tickets logged yet.</p>
            ) : (
              overview.recent_tickets?.map((t) => (
                <div
                  key={t.id}
                  onClick={() => onSelectTicket(t.id)}
                  className="py-2.5 px-2 flex items-center justify-between hover:bg-blue-50/60 rounded-xl cursor-pointer transition"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono font-bold text-blue-600">#{t.id}</span>
                    <div>
                      <p className="text-xs font-semibold text-slate-900">
                        {t.customer_email || t.customer_ref || "Customer"}
                      </p>
                      <p className="text-[11px] text-slate-500 capitalize">
                        {t.use_case ? t.use_case.replace("_", " ") : t.source}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span
                      className={`text-[10px] px-2.5 py-0.5 rounded-full border font-medium ${
                        statusBadges[t.status] || statusBadges.open
                      }`}
                    >
                      {statusLabels[t.status] || t.status}
                    </span>
                    <span className="text-[10px] font-mono text-slate-400 hidden sm:inline">
                      {new Date(t.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Available Staff Agents */}
        <div className="bg-white border border-[#d4e3f3] rounded-2xl p-5 shadow-sm flex flex-col justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-900 tracking-wide mb-3">
              Live Support Roster
            </h2>
            <div className="space-y-2.5">
              {overview.available_agents?.length === 0 ? (
                <p className="text-xs text-slate-500 py-4 text-center">
                  No agents currently marked Available. (Toggle in top header).
                </p>
              ) : (
                overview.available_agents?.map((a) => (
                  <div
                    key={a.id}
                    className="p-2.5 rounded-xl bg-[#f8fafd] border border-[#d4e3f3] flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="h-7 w-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs border border-blue-200">
                        {a.name[0]}
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-800">{a.name}</p>
                        <p className="text-[10px] text-slate-500 capitalize">{a.role}</p>
                      </div>
                    </div>
                    <span className="flex items-center gap-1.5 text-[10px] text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Available
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="mt-5 pt-4 border-t border-[#edf4fb]">
            <button
              onClick={() => onNavigate("users")}
              className="w-full py-2.5 rounded-xl border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold flex items-center justify-center gap-2 transition shadow-sm"
            >
              <span>Manage Users & Staff Portal</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
