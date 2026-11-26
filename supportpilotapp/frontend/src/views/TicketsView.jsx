import React, { useState, useEffect } from "react";
import {
  Search,
  Filter,
  CheckCircle2,
  Clock,
  Headphones,
  User,
  Inbox,
  AlertCircle,
  Sparkles,
  ArrowUpDown,
  RefreshCw,
} from "lucide-react";
import { api } from "../api";

export default function TicketsView({ onSelectTicket }) {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [useCaseFilter, setUseCaseFilter] = useState("all");
  const [search, setSearch] = useState("");

  const fetchTickets = async () => {
    setLoading(true);
    try {
      const params = {};
      if (statusFilter !== "all") params.status = statusFilter;
      if (useCaseFilter !== "all") params.use_case = useCaseFilter;
      if (search.trim()) params.q = search.trim();
      const data = await api.getTickets(params);
      setTickets(data);
    } catch (err) {
      console.error("Failed to load tickets", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTickets();
  }, [statusFilter, useCaseFilter]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchTickets();
  };

  const statusTabs = [
    { id: "all", label: "All" },
    { id: "resolved_by_ai", label: "Resolved by AI" },
    { id: "waiting_for_approval", label: "Waiting for approval" },
    { id: "waiting_for_agent", label: "Waiting for agent" },
    { id: "needs_human", label: "Needs a human" },
    { id: "waiting_for_customer", label: "Waiting for customer" },
    { id: "closed", label: "Closed" },
  ];

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

  const countsByStatus = tickets.reduce((acc, t) => {
    acc[t.status] = (acc[t.status] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="p-6 space-y-5 max-w-7xl mx-auto text-slate-800">
      {/* Top Header & Search Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <span>Support Tickets</span>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 font-bold font-mono">
              {tickets.length} total
            </span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Every customer chat and Stripe event captured with full audit evidence.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <form onSubmit={handleSearchSubmit} className="relative w-64 md:w-80">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by ticket # or email…"
              className="w-full bg-white border border-[#d4e3f3] rounded-xl pl-9 pr-3.5 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 shadow-sm"
            />
          </form>

          <button
            onClick={fetchTickets}
            title="Refresh list"
            className="p-2 rounded-xl border border-[#d4e3f3] bg-white text-slate-600 hover:text-slate-900 hover:bg-blue-50 shadow-sm transition"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin text-blue-600" : ""}`} />
          </button>
        </div>
      </div>

      {/* Status Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1.5 border-b border-[#d4e3f3]">
        {statusTabs.map((tab) => {
          const isActive = statusFilter === tab.id;
          const count = tab.id === "all" ? tickets.length : (countsByStatus[tab.id] || 0);

          return (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition flex items-center gap-1.5 ${
                isActive
                  ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/20"
                  : "bg-white border border-[#d4e3f3] text-slate-600 hover:text-slate-900 hover:bg-blue-50/70"
              }`}
            >
              <span>{tab.label}</span>
              {count > 0 && (
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                    isActive ? "bg-white/20 text-white" : "bg-blue-50 text-blue-700 border border-blue-200"
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}

        {/* Use Case Dropdown */}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-slate-500 font-medium hidden sm:inline">Use Case:</span>
          <select
            value={useCaseFilter}
            onChange={(e) => setUseCaseFilter(e.target.value)}
            className="bg-white border border-[#d4e3f3] rounded-xl px-3 py-1.5 text-xs text-slate-700 focus:outline-none focus:border-blue-500 shadow-sm"
          >
            <option value="all">All Use Cases</option>
            <option value="duplicate_charge">Duplicate Charge</option>
            <option value="refund">Refund Request</option>
            <option value="cancellation">Cancellation</option>
            <option value="failed_payment">Failed Payment</option>
            <option value="dispute">Dispute (Chargeback)</option>
          </select>
        </div>
      </div>

      {/* Ticket Table */}
      <div className="bg-white border border-[#d4e3f3] rounded-2xl shadow-sm overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-[#d4e3f3] bg-[#f1f6fc] text-[11px] font-semibold uppercase tracking-wider text-slate-700">
              <th className="py-3 px-4 w-20">ID</th>
              <th className="py-3 px-4">Customer</th>
              <th className="py-3 px-4">Use Case</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4">Last Message</th>
              <th className="py-3 px-4 text-right">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#edf4fb] text-xs">
            {loading ? (
              <tr>
                <td colSpan={6} className="py-12 text-center text-slate-500">
                  <div className="flex items-center justify-center gap-2">
                    <div className="h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                    <span>Loading tickets…</span>
                  </div>
                </td>
              </tr>
            ) : tickets.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-12 text-center text-slate-500">
                  No tickets found matching the selected filters.
                </td>
              </tr>
            ) : (
              tickets.map((t) => (
                <tr
                  key={t.id}
                  onClick={() => onSelectTicket(t.id)}
                  className="hover:bg-blue-50/60 cursor-pointer transition group"
                >
                  <td className="py-3 px-4 font-mono font-bold text-blue-600 group-hover:underline">
                    #{t.id}
                  </td>
                  <td className="py-3 px-4">
                    <p className="font-semibold text-slate-900">{t.customer_email || t.customer_ref || "Customer"}</p>
                    <p className="text-[10px] text-slate-500 font-mono">
                      {t.source === "stripe_event" ? "⚡ Stripe Webhook" : "💬 Chat Widget"}
                    </p>
                  </td>
                  <td className="py-3 px-4">
                    <span className="text-slate-700 capitalize font-medium">
                      {t.use_case ? t.use_case.replace("_", " ") : "—"}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`text-[11px] px-2.5 py-0.5 rounded-full border font-medium inline-block ${
                        statusBadges[t.status] || statusBadges.open
                      }`}
                    >
                      {statusLabels[t.status] || t.status}
                    </span>
                  </td>
                  <td className="py-3 px-4 max-w-xs truncate text-slate-600">
                    {t.last_message || <span className="text-slate-400 italic">No message text</span>}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-slate-500 text-[11px]">
                    {new Date(t.created_at).toLocaleString([], {
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
      </div>
    </div>
  );
}
