import React, { useState, useEffect } from "react";
import { ScrollText, RefreshCw, Filter, Sparkles, UserCheck, User, Mail, DollarSign } from "lucide-react";
import { api } from "../api";

export default function ActivityLogView({ onSelectTicket }) {
  const [data, setData] = useState({ actions: [], emails: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [executedByFilter, setExecutedByFilter] = useState("all");
  const [actionTypeFilter, setActionTypeFilter] = useState("all");
  const [tab, setTab] = useState("actions"); // 'actions' | 'emails'

  const fetchActivity = async () => {
    setLoading(true);
    try {
      const params = {};
      if (executedByFilter !== "all") params.executed_by = executedByFilter;
      if (actionTypeFilter !== "all") params.action_type = actionTypeFilter;
      const res = await api.getActivity(params);
      setData(res);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchActivity();
  }, [executedByFilter, actionTypeFilter]);

  const executorBadges = {
    ai_auto: {
      label: "AI on its own",
      color: "bg-emerald-50 text-emerald-700 border-emerald-200",
      icon: Sparkles,
    },
    ai_after_approval: {
      label: "AI after approval",
      color: "bg-amber-50 text-amber-700 border-amber-200",
      icon: UserCheck,
    },
    human: {
      label: "Human manually",
      color: "bg-blue-50 text-blue-700 border-blue-200",
      icon: User,
    },
  };

  return (
    <div className="p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <ScrollText className="h-5 w-5 text-blue-600" />
            <span>Activity & Audit Log</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Immutable log of every refund, cancellation, and customer email dispatched.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex bg-slate-200/70 border border-[#d4e3f3] rounded-xl p-1 text-xs">
            <button
              onClick={() => setTab("actions")}
              className={`px-3 py-1.5 rounded-lg font-semibold transition ${
                tab === "actions"
                  ? "bg-white text-blue-700 shadow-sm font-bold"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Financial Actions ({data.actions.length})
            </button>
            <button
              onClick={() => setTab("emails")}
              className={`px-3 py-1.5 rounded-lg font-semibold transition ${
                tab === "emails"
                  ? "bg-white text-blue-700 shadow-sm font-bold"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Email Outbox ({data.emails.length})
            </button>
          </div>

          <button
            onClick={fetchActivity}
            title="Refresh"
            className="p-2 rounded-xl border border-[#d4e3f3] bg-white text-slate-600 hover:text-slate-900 hover:bg-blue-50 shadow-sm transition"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin text-blue-600" : ""}`} />
          </button>
        </div>
      </div>

      {/* Filter Row */}
      {tab === "actions" && (
        <div className="flex items-center gap-3 overflow-x-auto pb-2 border-b border-[#d4e3f3] text-xs">
          <div className="flex items-center gap-2">
            <span className="text-slate-600 font-medium">Executed By:</span>
            <select
              value={executedByFilter}
              onChange={(e) => setExecutedByFilter(e.target.value)}
              className="bg-white border border-[#d4e3f3] rounded-xl px-3 py-1.5 text-slate-700 focus:outline-none focus:border-blue-500 shadow-sm"
            >
              <option value="all">All Actors</option>
              <option value="ai_auto">AI on its own</option>
              <option value="ai_after_approval">AI after approval</option>
              <option value="human">Human manually</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-slate-600 font-medium">Action Type:</span>
            <select
              value={actionTypeFilter}
              onChange={(e) => setActionTypeFilter(e.target.value)}
              className="bg-white border border-[#d4e3f3] rounded-xl px-3 py-1.5 text-slate-700 focus:outline-none focus:border-blue-500 shadow-sm"
            >
              <option value="all">All Actions</option>
              <option value="refund">Refunds</option>
              <option value="cancel_subscription">Cancellations</option>
              <option value="send_update_card_link">Update Card Link</option>
            </select>
          </div>
        </div>
      )}

      {/* Table Section */}
      <div className="bg-white border border-[#d4e3f3] rounded-2xl shadow-sm overflow-hidden">
        {tab === "actions" ? (
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[#d4e3f3] bg-[#f1f6fc] text-[11px] font-semibold uppercase tracking-wider text-slate-600">
                <th className="py-3.5 px-4 w-16">ID</th>
                <th className="py-3.5 px-4">Action</th>
                <th className="py-3.5 px-4">Ticket / Customer</th>
                <th className="py-3.5 px-4">Amount</th>
                <th className="py-3.5 px-4">Who Took It</th>
                <th className="py-3.5 px-4">Status / Stripe Ref</th>
                <th className="py-3.5 px-4 text-right">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#d4e3f3]">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    Loading activity records…
                  </td>
                </tr>
              ) : data.actions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    No actions match the criteria.
                  </td>
                </tr>
              ) : (
                data.actions.map((a) => {
                  const exec = executorBadges[a.executed_by] || executorBadges.ai_auto;
                  const ExecIcon = exec.icon;

                  return (
                    <tr key={a.id} className="hover:bg-[#f8fafd] transition">
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-400">
                        #{a.id}
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-slate-800 capitalize">
                        {a.action_type.replace("_", " ")}
                      </td>
                      <td className="py-3.5 px-4">
                        <button
                          onClick={() => onSelectTicket(a.ticket_id)}
                          className="font-mono text-blue-600 hover:underline font-bold"
                        >
                          Ticket #{a.ticket_id}
                        </button>
                        <p className="text-[10px] text-slate-500 truncate">{a.customer_email}</p>
                      </td>
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-800">
                        {a.amount_cents > 0 ? `$${(a.amount_cents / 100).toFixed(2)}` : "—"}
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`text-[11px] px-2.5 py-1 rounded-full border font-medium inline-flex items-center gap-1.5 ${exec.color}`}
                        >
                          <ExecIcon className="h-3 w-3" />
                          <span>{exec.label}</span>
                        </span>
                        {a.decided_by_name && (
                          <p className="text-[10px] text-slate-500 mt-0.5">By {a.decided_by_name}</p>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded font-mono ${
                            a.status === "done"
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : "bg-rose-50 text-rose-700 border border-rose-200"
                          }`}
                        >
                          {a.status}
                        </span>
                        {a.stripe_ref && (
                          <p className="font-mono text-[10px] text-slate-500 mt-0.5">{a.stripe_ref}</p>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-slate-500 text-[11px]">
                        {new Date(a.created_at).toLocaleString([], {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[#d4e3f3] bg-[#f1f6fc] text-[11px] font-semibold uppercase tracking-wider text-slate-600">
                <th className="py-3.5 px-4 w-16">ID</th>
                <th className="py-3.5 px-4">Recipient</th>
                <th className="py-3.5 px-4">Subject</th>
                <th className="py-3.5 px-4">Provider</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4 text-right">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#d4e3f3]">
              {data.emails.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    No emails logged in outbox.
                  </td>
                </tr>
              ) : (
                data.emails.map((e) => (
                  <tr key={e.id} className="hover:bg-[#f8fafd] transition">
                    <td className="py-3.5 px-4 font-mono font-bold text-slate-400">#{e.id}</td>
                    <td className="py-3.5 px-4 font-mono text-slate-700">{e.to_email}</td>
                    <td className="py-3.5 px-4 font-medium text-slate-800">{e.subject}</td>
                    <td className="py-3.5 px-4 uppercase font-mono text-slate-500 text-[10px]">{e.provider}</td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded font-mono ${
                          e.status === "sent"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : "bg-rose-50 text-rose-700 border border-rose-200"
                        }`}
                      >
                        {e.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-slate-500 text-[11px]">
                      {new Date(e.created_at).toLocaleString([], {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
