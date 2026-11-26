import React, { useState, useEffect } from "react";
import {
  TrendingUp,
  Sparkles,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  ShieldAlert,
  ArrowRight,
  Flag,
} from "lucide-react";
import { api } from "../api";

export default function AIPerformanceView({ onSelectTicket }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchPerformance = async () => {
    setLoading(true);
    try {
      const res = await api.getPerformance();
      setData(res);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPerformance();
  }, []);

  if (loading || !data) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[50vh]">
        <div className="flex items-center gap-3 text-slate-400">
          <div className="h-5 w-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <span>Analyzing AI accuracy and telemetry…</span>
        </div>
      </div>
    );
  }

  const aiOwn = data.ai_own_actions || { count: 0, total_dollars: 0 };
  const approved = data.approved_actions || { count: 0, total_dollars: 0 };
  const rejected = data.rejected_actions || { count: 0 };
  const disagreementRate = data.disagreement_rate_pct || 0;
  const flaggedCount = data.flagged_wrong_count || 0;
  const avgTimeSeconds = data.average_resolution_seconds || 0;

  return (
    <div className="p-8 space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
          <TrendingUp className="h-5 w-5 text-blue-600" />
          <span>AI Governance & Trust Telemetry</span>
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Rigorous metrics measuring whether the AI can be trusted: human agreement rate, payout breakdown, and hand-off reasons.
        </p>
      </div>

      {/* Top 4 Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Metric 1: Autonomous AI Actions */}
        <div className="bg-gradient-to-br from-emerald-50/70 via-white to-white border border-emerald-100 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">AI on its own</span>
            <div className="p-2 rounded-xl bg-emerald-100 text-emerald-700">
              <Sparkles className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-3xl font-black text-slate-900 font-mono">{aiOwn.count}</span>
            <p className="text-xs text-emerald-700 font-mono font-semibold mt-0.5">${aiOwn.total_dollars.toFixed(2)} refunded automatically</p>
          </div>
        </div>

        {/* Metric 2: Actions Approved by Humans */}
        <div className="bg-gradient-to-br from-blue-50/70 via-white to-white border border-blue-100 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Approved by Human</span>
            <div className="p-2 rounded-xl bg-blue-100 text-blue-700">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-3xl font-black text-blue-700 font-mono">{approved.count}</span>
            <p className="text-xs text-slate-500 font-mono mt-0.5">${approved.total_dollars.toFixed(2)} approved payout</p>
          </div>
        </div>

        {/* Metric 3: Human Disagreement Rate */}
        <div className="bg-gradient-to-br from-rose-50/70 via-white to-white border border-rose-100 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Disagreement Rate</span>
            <div className={`p-2 rounded-xl ${disagreementRate > 10 ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"}`}>
              <ShieldAlert className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className={`text-3xl font-black font-mono ${disagreementRate > 10 ? "text-rose-600" : "text-slate-900"}`}>
              {disagreementRate}%
            </span>
            <p className="text-xs text-slate-500 mt-0.5">
              {rejected.count} rejected + {flaggedCount} flagged wrong
            </p>
          </div>
        </div>

        {/* Metric 4: Average Resolution Time */}
        <div className="bg-gradient-to-br from-indigo-50/70 via-white to-white border border-indigo-100 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Avg Resolution Time</span>
            <div className="p-2 rounded-xl bg-indigo-100 text-indigo-700">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-3xl font-black text-slate-900 font-mono">
              {avgTimeSeconds > 60 ? `${Math.round(avgTimeSeconds / 60)}m` : `${avgTimeSeconds}s`}
            </span>
            <p className="text-xs text-slate-500 mt-0.5">from first message to resolution</p>
          </div>
        </div>
      </div>

      {/* Middle Section: Money Refunded Auto vs With Approval & Hand-off Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Money Refunded Comparison */}
        <div className="bg-white border border-[#d4e3f3] rounded-2xl p-6 shadow-sm">
          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4">
            Financial Exposure: Autonomous vs Approved
          </h2>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-xs font-medium mb-1">
                <span className="text-slate-700">Autonomous AI Payouts (Under $50)</span>
                <span className="text-emerald-700 font-mono font-bold">${aiOwn.total_dollars.toFixed(2)}</span>
              </div>
              <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                  style={{
                    width: `${
                      aiOwn.total_dollars + approved.total_dollars > 0
                        ? (aiOwn.total_dollars / (aiOwn.total_dollars + approved.total_dollars)) * 100
                        : 50
                    }%`,
                  }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs font-medium mb-1">
                <span className="text-slate-700">Human-Approved Payouts (Over $50 / Risk)</span>
                <span className="text-blue-700 font-mono font-bold">${approved.total_dollars.toFixed(2)}</span>
              </div>
              <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-600 rounded-full transition-all duration-500"
                  style={{
                    width: `${
                      aiOwn.total_dollars + approved.total_dollars > 0
                        ? (approved.total_dollars / (aiOwn.total_dollars + approved.total_dollars)) * 100
                        : 50
                    }%`,
                  }}
                />
              </div>
            </div>

            <p className="text-xs text-slate-500 pt-2 border-t border-[#d4e3f3] leading-relaxed">
              Every automated payout is strictly governed by the <strong>$50 single limit</strong> and <strong>$500 daily safety cap</strong> in code.
            </p>
          </div>
        </div>

        {/* Hand-off to Humans Breakdown */}
        <div className="bg-white border border-[#d4e3f3] rounded-2xl p-6 shadow-sm">
          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4">
            Hand-offs to Humans ({data.total_handoffs} total)
          </h2>
          <div className="space-y-2.5">
            {data.handoff_reasons?.length === 0 ? (
              <p className="text-xs text-slate-500 py-4 text-center">No hand-offs recorded yet.</p>
            ) : (
              data.handoff_reasons?.map((h, i) => (
                <div key={i} className="flex items-center justify-between p-2.5 rounded-xl bg-[#f8fafd] border border-[#d4e3f3] text-xs">
                  <span className="text-slate-700 font-medium">{h.reason}</span>
                  <span className="font-mono font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                    {h.count}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Breakdown by Use Case Table */}
      <div className="bg-white border border-[#d4e3f3] rounded-2xl p-6 shadow-sm overflow-hidden">
        <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4">
          Breakdown by Use Case
        </h2>
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-[#d4e3f3] bg-[#f1f6fc] text-[11px] font-semibold uppercase tracking-wider text-slate-600">
              <th className="py-3 px-4">Use Case</th>
              <th className="py-3 px-4">Total Volume</th>
              <th className="py-3 px-4">Resolved by AI</th>
              <th className="py-3 px-4">Pending or Human</th>
              <th className="py-3 px-4 text-right">Avg Resolution</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#d4e3f3]">
            {data.use_case_breakdown?.map((u, i) => (
              <tr key={i} className="hover:bg-[#f8fafd] transition">
                <td className="py-3 px-4 font-semibold text-slate-800 capitalize">
                  {u.use_case.replace("_", " ")}
                </td>
                <td className="py-3 px-4 font-mono text-slate-700">{u.total}</td>
                <td className="py-3 px-4 font-mono text-emerald-700 font-bold">{u.resolved_by_ai}</td>
                <td className="py-3 px-4 font-mono text-amber-700">{u.pending_or_human}</td>
                <td className="py-3 px-4 font-mono text-slate-500 text-right">
                  {u.avg_seconds > 60 ? `${Math.round(u.avg_seconds / 60)}m` : `${u.avg_seconds}s`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Spot-Checked Flagged Wrong Tickets */}
      {flaggedCount > 0 && (
        <div className="bg-white border border-rose-200 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Flag className="h-4 w-4 text-rose-500" />
            <h2 className="text-sm font-bold text-rose-800 uppercase tracking-wider">
              Spot-Checked Decisions Flagged as Incorrect ({flaggedCount})
            </h2>
          </div>
          <div className="space-y-3">
            {data.flagged_tickets?.map((t) => (
              <div
                key={t.id}
                onClick={() => onSelectTicket(t.id)}
                className="p-3.5 rounded-xl bg-[#f8fafd] border border-[#d4e3f3] flex items-center justify-between hover:border-blue-300 hover:bg-blue-50/50 cursor-pointer transition shadow-sm"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-blue-700 text-xs">Ticket #{t.id}</span>
                    <span className="text-xs text-slate-800 font-semibold">{t.customer_email}</span>
                  </div>
                  <p className="text-xs text-rose-600 mt-1">Reason: "{t.flag_reason || "Flagged in review"}"</p>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <span>Inspect</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
