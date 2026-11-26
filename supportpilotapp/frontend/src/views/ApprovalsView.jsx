import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  CreditCard,
  FileText,
  User,
  Shield,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";

export default function ApprovalsView({ onSelectTicket }) {
  const { user, isApprover } = useAuth();
  const [approvals, setApprovals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("pending");
  const [decidingId, setDecidingId] = useState(null);
  const [decisionModal, setDecisionModal] = useState(null); // { id, decision: 'approved' | 'rejected', defaultReason: '' }
  const [reason, setReason] = useState("");
  const [errorMsg, setErrorMsg] = useState(null);

  const fetchApprovals = async () => {
    setLoading(true);
    try {
      const data = await api.getApprovals(statusFilter);
      setApprovals(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchApprovals();
  }, [statusFilter]);

  const openDecisionModal = (approval, decision) => {
    const defaultReason =
      decision === "approved"
        ? `Confirmed facts for $${((approval.amount_cents || 0) / 100).toFixed(2)} refund`
        : "Does not meet approval guidelines";
    setReason(defaultReason);
    setDecisionModal({ id: approval.id, decision, approval });
  };

  const handleConfirmDecision = async (e) => {
    e.preventDefault();
    if (!decisionModal || !reason.trim() || decidingId) return;
    setDecidingId(decisionModal.id);
    setErrorMsg(null);
    try {
      await api.decideApproval(decisionModal.id, decisionModal.decision, reason.trim());
      setDecisionModal(null);
      setReason("");
      await fetchApprovals();
    } catch (err) {
      setErrorMsg(err.message || "Failed to submit decision.");
    } finally {
      setDecidingId(null);
    }
  };

  return (
    <div className="p-6 space-y-5 max-w-7xl mx-auto text-slate-800">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            <span>Human-in-the-Loop Approvals</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Risky financial actions (refunds &gt; $50, watching mode, repeat requests) waiting for finance verification.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex bg-white border border-[#d4e3f3] rounded-xl p-1 text-xs shadow-sm">
            <button
              onClick={() => setStatusFilter("pending")}
              className={`px-3 py-1.5 rounded-lg font-semibold transition ${
                statusFilter === "pending"
                  ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Pending Decisions
            </button>
            <button
              onClick={() => setStatusFilter("all")}
              className={`px-3 py-1.5 rounded-lg font-semibold transition ${
                statusFilter === "all"
                  ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              All Records
            </button>
          </div>

          <button
            onClick={fetchApprovals}
            title="Refresh"
            className="p-2 rounded-xl border border-[#d4e3f3] bg-white text-slate-600 hover:text-slate-900 hover:bg-blue-50 shadow-sm transition"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin text-blue-600" : ""}`} />
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="p-3 bg-rose-50 border border-rose-300 rounded-xl text-xs text-rose-800 flex items-center justify-between">
          <span>{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} className="text-rose-600 hover:text-rose-800">✕</button>
        </div>
      )}

      {/* Approvals Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {loading ? (
          <div className="col-span-full py-16 text-center text-slate-500 flex items-center justify-center gap-2">
            <div className="h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <span>Loading approval queue…</span>
          </div>
        ) : approvals.length === 0 ? (
          <div className="col-span-full py-16 text-center text-slate-500 bg-white rounded-2xl border border-[#d4e3f3] p-8 space-y-2 shadow-sm">
            <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto" />
            <p className="text-sm font-semibold text-slate-900">No pending approvals</p>
            <p className="text-xs text-slate-500">
              All risky actions have been reviewed or none are pending.
            </p>
          </div>
        ) : (
          approvals.map((ap) => {
            const isPending = ap.status === "pending";
            const amountFormatted = `$${((ap.amount_cents || 0) / 100).toFixed(2)}`;

            return (
              <div
                key={ap.id}
                className="bg-white border border-[#d4e3f3] rounded-2xl p-5 shadow-sm flex flex-col justify-between space-y-3.5 hover:border-blue-300 transition"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-mono font-bold text-blue-600">
                      Approval #{ap.id}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                        ap.status === "pending"
                          ? "bg-amber-100 text-amber-800 border border-amber-300 animate-pulse"
                          : ap.status === "approved"
                          ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                          : "bg-rose-100 text-rose-800 border border-rose-300"
                      }`}
                    >
                      {ap.status}
                    </span>
                  </div>

                  <div className="bg-[#f8fafd] rounded-xl p-3 border border-[#d4e3f3] space-y-1.5 mb-3">
                    <div className="flex justify-between items-baseline">
                      <span className="text-xs text-slate-600 font-medium capitalize">
                        {ap.action_type.replace("_", " ")}
                      </span>
                      <span className="text-lg font-black text-amber-600 font-mono">
                        {amountFormatted}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 font-mono truncate">
                      Customer: <strong className="text-slate-800">{ap.customer_email || ap.customer_ref}</strong>
                    </p>
                    {ap.stripe_charge_id && (
                      <p className="text-[10px] text-slate-400 font-mono">
                        Charge ID: {ap.stripe_charge_id}
                      </p>
                    )}
                  </div>

                  {/* AI Suggestion & Evidence */}
                  <div className="space-y-1.5 text-xs">
                    <div className="flex items-center gap-1.5 text-emerald-700 font-semibold text-[11px]">
                      <Sparkles className="h-3 w-3" />
                      <span>AI Suggestion:</span>
                    </div>
                    <p className="text-slate-700 bg-[#f0f6fc] p-2.5 rounded-lg border border-blue-100 text-[11px] leading-relaxed">
                      {ap.ai_suggestion || "Refund requested by policy rule."}
                    </p>

                    {ap.evidence?.rule && (
                      <p className="text-[10px] text-slate-500 font-mono">
                        Rule: <strong className="text-blue-700">{ap.evidence.rule}</strong>
                      </p>
                    )}

                    {ap.decided_by_name && (
                      <p className="text-[10px] text-slate-500 pt-1 border-t border-[#d4e3f3]">
                        Decided by: <strong className="text-slate-800">{ap.decided_by_name}</strong>
                        {ap.decision_reason && ` ("${ap.decision_reason}")`}
                      </p>
                    )}
                  </div>
                </div>

                {/* Footer Controls */}
                <div className="pt-3 border-t border-[#edf4fb] flex items-center justify-between gap-2">
                  <button
                    onClick={() => onSelectTicket(ap.ticket_id)}
                    className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                  >
                    View Ticket #{ap.ticket_id}
                  </button>

                  {isPending && isApprover && (
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => openDecisionModal(ap, "rejected")}
                        className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-semibold transition"
                      >
                        Reject
                      </button>
                      <button
                        onClick={() => openDecisionModal(ap, "approved")}
                        className="px-3.5 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-bold transition shadow-sm"
                      >
                        Approve
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Decision Modal - Portaled to document.body so it NEVER clips */}
      {decisionModal && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[9999] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-[#d4e3f3] rounded-2xl max-w-md w-full p-6 shadow-2xl text-slate-800 animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-base font-bold text-slate-900 mb-2 flex items-center gap-2">
              {decisionModal.decision === "approved" ? (
                <>
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <span>Confirm Approval of Refund</span>
                </>
              ) : (
                <>
                  <XCircle className="h-4 w-4 text-rose-600" />
                  <span>Reject Refund Request</span>
                </>
              )}
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              {decisionModal.decision === "approved"
                ? "This will re-check facts with Stripe and immediately issue the refund. The customer will receive an email confirmation."
                : "This will decline the refund and update the ticket status. Reason will be recorded in audit log."}
            </p>

            <form onSubmit={handleConfirmDecision} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Decision Reason / Note</label>
                <textarea
                  required
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full bg-[#f8fafd] border border-[#d4e3f3] rounded-xl p-3 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:bg-white shadow-inner"
                />
              </div>

              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setDecisionModal(null)}
                  className="px-3.5 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={decidingId !== null}
                  className={`px-4 py-2 rounded-xl text-xs font-bold text-white shadow-md transition ${
                    decisionModal.decision === "approved"
                      ? "bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-emerald-500/20"
                      : "bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 shadow-rose-500/20"
                  }`}
                >
                  {decidingId ? "Processing…" : `Confirm ${decisionModal.decision === "approved" ? "Approval" : "Rejection"}`}
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
