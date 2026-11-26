import React, { useState, useEffect } from "react";
import { CheckCircle2, XCircle, AlertCircle, Shield, ArrowRight, Loader2 } from "lucide-react";
import { api } from "../api";

export default function ApproveTokenView({ token }) {
  const [loading, setLoading] = useState(true);
  const [approval, setApproval] = useState(null);
  const [error, setError] = useState(null);
  const [reason, setReason] = useState("");
  const [approverEmail, setApproverEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(null);

  useEffect(() => {
    if (!token) {
      setError("No approval token found in link.");
      setLoading(false);
      return;
    }
    api
      .getApprovalByToken(token)
      .then((data) => {
        setApproval(data);
        setReason(data.ai_suggestion ? `Approved based on AI policy check: ${data.ai_suggestion}` : "Approved via 1-click email authorization.");
      })
      .catch((err) => {
        setError(err.message || "Invalid or expired approval token.");
      })
      .finally(() => setLoading(false));
  }, [token]);

  const handleDecision = async (decision) => {
    if (!reason.trim()) {
      alert("Please provide a brief reason for this decision.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.decideApprovalByToken(token, decision, reason, approverEmail || null);
      setCompleted({
        decision,
        message: decision === "approved"
          ? "Action approved and executed successfully! The customer and system audit logs have been updated."
          : "Action rejected. The request has been flagged for human review.",
      });
    } catch (err) {
      alert(err.message || "Failed to submit approval decision.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 text-slate-200">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500 mb-3" />
        <p className="text-sm">Verifying secure approval token…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-xl p-6 text-center shadow-xl">
          <AlertCircle className="h-12 w-12 text-rose-500 mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-white mb-2">Approval Link Invalid or Expired</h2>
          <p className="text-sm text-slate-400 mb-6">{error}</p>
          <a
            href="/"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition"
          >
            Go to Staff Portal <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </div>
    );
  }

  if (completed) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-xl p-6 text-center shadow-xl">
          {completed.decision === "approved" ? (
            <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto mb-3" />
          ) : (
            <XCircle className="h-12 w-12 text-rose-500 mx-auto mb-3" />
          )}
          <h2 className="text-lg font-semibold text-white mb-2">
            Decision Recorded: {completed.decision.toUpperCase()}
          </h2>
          <p className="text-sm text-slate-400 mb-6">{completed.message}</p>
          <a
            href="/"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium transition"
          >
            Open SupportPilot Console <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </div>
    );
  }

  const amt = (approval?.amount_cents || 0) / 100;
  const isExpired = approval?.status === "expired" || new Date(approval?.expires_at) < new Date();

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
      <div className="max-w-xl w-full bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-5">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-white">SupportPilot 1-Click Authorization</h1>
              <p className="text-xs text-slate-400">Ticket #{approval.ticket_id} • High-Value Decision Gate</p>
            </div>
          </div>
          <span className="text-xs px-2.5 py-1 rounded bg-amber-500/10 border border-amber-500/20 text-amber-300 font-medium">
            Pending Decision
          </span>
        </div>

        {/* Details Grid */}
        <div className="grid grid-cols-2 gap-3 mb-5">
          <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80">
            <span className="text-[11px] text-slate-400 block mb-0.5">Action Type</span>
            <span className="text-sm font-medium text-slate-200 capitalize">
              {approval.action_type === "cancel_subscription" ? "Cancel Subscription" : "Stripe Refund"}
            </span>
          </div>
          <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80">
            <span className="text-[11px] text-slate-400 block mb-0.5">Amount</span>
            <span className="text-sm font-semibold text-emerald-400">
              {amt > 0 ? `$${amt.toFixed(2)} USD` : "$0.00 (Period-End)"}
            </span>
          </div>
          <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80">
            <span className="text-[11px] text-slate-400 block mb-0.5">Customer Email</span>
            <span className="text-sm text-slate-200 truncate block">{approval.customer_email || "N/A"}</span>
          </div>
          <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80">
            <span className="text-[11px] text-slate-400 block mb-0.5">Use Case</span>
            <span className="text-sm text-slate-200 capitalize">{approval.use_case || "Support Inquiry"}</span>
          </div>
        </div>

        {/* AI Suggestion */}
        <div className="mb-5 p-3.5 rounded-lg bg-indigo-500/5 border border-indigo-500/20">
          <span className="text-xs font-semibold text-indigo-300 block mb-1">AI Recommendation & Evidence</span>
          <p className="text-xs text-slate-300 leading-relaxed">{approval.ai_suggestion}</p>
        </div>

        {/* Form Inputs */}
        <div className="space-y-3 mb-6">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Approver Email (Optional, defaults to assigned approver)
            </label>
            <input
              type="email"
              value={approverEmail}
              onChange={(e) => setApproverEmail(e.target.value)}
              placeholder="e.g. anita@cloudnotes.com"
              className="w-full text-xs bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Decision Reason / Audit Note
            </label>
            <textarea
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full text-xs bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-indigo-500"
              placeholder="State the justification for approving or declining this action..."
            />
          </div>
        </div>

        {/* Decision Actions */}
        <div className="flex gap-3">
          <button
            disabled={submitting || isExpired}
            onClick={() => handleDecision("approved")}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold shadow-lg shadow-emerald-900/20 transition"
          >
            <CheckCircle2 className="h-4 w-4" />
            {submitting ? "Processing…" : "Approve Action"}
          </button>
          <button
            disabled={submitting || isExpired}
            onClick={() => handleDecision("rejected")}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-slate-800 hover:bg-rose-600 hover:text-white disabled:opacity-50 text-slate-300 text-xs font-semibold border border-slate-700/60 transition"
          >
            <XCircle className="h-4 w-4" />
            Reject Request
          </button>
        </div>
      </div>
    </div>
  );
}
