import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  Settings,
  Power,
  Eye,
  DollarSign,
  AlertTriangle,
  Users,
  CreditCard,
  Save,
  CheckCircle,
  Plus,
  Shield,
  Headphones,
  UserCheck,
  Trash2,
} from "lucide-react";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";

export default function SettingsView() {
  const { isAdmin, user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  // Form states
  const [aiEnabled, setAiEnabled] = useState(true);
  const [watchingMode, setWatchingMode] = useState(false);
  const [autoLimitDollars, setAutoLimitDollars] = useState(50);
  const [dailyCapDollars, setDailyCapDollars] = useState(500);
  const [autoPaused, setAutoPaused] = useState(false);
  const [approverEmails, setApproverEmails] = useState("");
  const [autoMode, setAutoMode] = useState({
    duplicate_charge: true,
    refund: true,
    cancellation: false,
    failed_payment: false,
  });

  // Team Member modal
  const [memberModal, setMemberModal] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState("agent");
  const [newPassword, setNewPassword] = useState("");

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const res = await api.getSettings();
      setData(res);
      const s = res.settings;
      setAiEnabled(s.ai_enabled);
      setWatchingMode(s.watching_mode);
      setAutoLimitDollars(Math.round(s.auto_refund_limit_cents / 100));
      setDailyCapDollars(Math.round(s.daily_cap_cents / 100));
      setAutoPaused(s.auto_refunds_paused);
      setApproverEmails((s.approver_emails || []).join(", "));
      setAutoMode(s.auto_mode || {});
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!isAdmin || saving) return;
    setSaving(true);
    setErrorMsg(null);
    setSaveSuccess(false);

    try {
      const emails = approverEmails
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      await api.updateSettings({
        ai_enabled: aiEnabled,
        watching_mode: watchingMode,
        auto_refund_limit_cents: autoLimitDollars * 100,
        daily_cap_cents: dailyCapDollars * 100,
        auto_refunds_paused: autoPaused,
        approver_emails: emails,
        auto_mode: autoMode,
      });

      setSaveSuccess(true);
      await fetchSettings();
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      setErrorMsg(err.message || "Failed to save settings.");
    } finally {
      setSaving(false);
    }
  };

  const handleAddMember = async (e) => {
    e.preventDefault();
    try {
      await api.addTeamMember({
        name: newName,
        email: newEmail,
        role: newRole,
        password: newPassword,
      });
      setMemberModal(false);
      setNewName("");
      setNewEmail("");
      setNewPassword("");
      await fetchSettings();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDeleteMember = async (id, memberName) => {
    if (!window.confirm(`Are you sure you want to remove ${memberName} from the team?`)) return;
    try {
      await api.deleteTeamMember(id);
      setData((prev) => ({
        ...prev,
        team: prev.team.filter((m) => m.id !== id),
      }));
    } catch (err) {
      alert(err.message || "Failed to delete team member");
    }
  };

  if (!isAdmin) {
    return (
      <div className="p-8 max-w-lg mx-auto text-center space-y-4 pt-20">
        <Shield className="h-12 w-12 text-rose-500 mx-auto" />
        <h2 className="text-lg font-bold text-slate-900">Administrator Access Required</h2>
        <p className="text-xs text-slate-500">
          Only Rahul (Support Manager) or users with the <strong>Admin</strong> role can view and adjust system switches, limits, and team access.
        </p>
      </div>
    );
  }

  if (loading || !data) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[50vh]">
        <div className="flex items-center gap-3 text-slate-500">
          <div className="h-5 w-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <span>Loading system configuration…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#d4e3f3] pb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <Settings className="h-5 w-5 text-blue-600" />
            <span>SupportPilot Governance & Policies</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Emergency switches, hard code financial caps, automated mode per use case, and team roles.
          </p>
        </div>

        {saveSuccess && (
          <span className="flex items-center gap-1.5 text-xs text-emerald-700 font-bold bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-xl shadow-sm">
            <CheckCircle className="h-4 w-4 text-emerald-600" /> Settings Saved!
          </span>
        )}
      </div>

      {errorMsg && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700">
          {errorMsg}
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-8">
        {/* Section 1: Emergency & Safety Switches */}
        <div className="bg-white border border-[#d4e3f3] rounded-2xl p-6 shadow-sm space-y-6">
          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
            <Power className="h-4 w-4 text-rose-500" />
            <span>Emergency Kill Switch & Mode Switches</span>
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Kill Switch */}
            <div className={`p-4 rounded-xl border transition ${aiEnabled ? "bg-[#f8fafd] border-[#d4e3f3]" : "bg-rose-50 border-rose-300"}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-800">Emergency AI Kill Switch</span>
                <button
                  type="button"
                  onClick={() => setAiEnabled(!aiEnabled)}
                  className={`px-3 py-1 rounded-full text-xs font-bold font-mono transition ${
                    aiEnabled ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm" : "bg-rose-600 text-white animate-pulse"
                  }`}
                >
                  {aiEnabled ? "ENABLED" : "AI OFF"}
                </button>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                When switched OFF, the bot still chats with customers, but <strong>every single action</strong> stops and routes to human approvers.
              </p>
            </div>

            {/* Watching Mode */}
            <div className={`p-4 rounded-xl border transition ${watchingMode ? "bg-amber-50 border-amber-300" : "bg-[#f8fafd] border-[#d4e3f3]"}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-800">Watching Mode (Shadow AI)</span>
                <button
                  type="button"
                  onClick={() => setWatchingMode(!watchingMode)}
                  className={`px-3 py-1 rounded-full text-xs font-bold font-mono transition ${
                    watchingMode ? "bg-amber-500 text-slate-900 font-extrabold shadow-sm" : "bg-slate-200 text-slate-700 hover:bg-slate-300"
                  }`}
                >
                  {watchingMode ? "WATCHING ON" : "WATCHING OFF"}
                </button>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                When ON, the AI only generates suggested decisions; humans must approve everything so agreement rate can be measured safely.
              </p>
            </div>
          </div>
        </div>

        {/* Section 2: Financial Limits & Daily Cap */}
        <div className="bg-white border border-[#d4e3f3] rounded-2xl p-6 shadow-sm space-y-6">
          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-emerald-600" />
            <span>Refund Limits & Safety Caps</span>
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Single Auto Refund Limit ($)
              </label>
              <input
                type="number"
                min={0}
                max={1000}
                value={autoLimitDollars}
                onChange={(e) => setAutoLimitDollars(Number(e.target.value))}
                className="w-full bg-[#f8fafd] border border-[#d4e3f3] rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white"
              />
              <p className="text-[11px] text-slate-500 mt-1">Default $50. Anything above goes to Anita.</p>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Daily Safety Cap ($)
              </label>
              <input
                type="number"
                min={0}
                max={10000}
                value={dailyCapDollars}
                onChange={(e) => setDailyCapDollars(Number(e.target.value))}
                className="w-full bg-[#f8fafd] border border-[#d4e3f3] rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white"
              />
              <p className="text-[11px] text-slate-500 mt-1">Default $500 total automatic payouts/day.</p>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Daily Cap Paused State
              </label>
              <div className="flex items-center justify-between p-2 rounded-xl bg-[#f8fafd] border border-[#d4e3f3]">
                <span className="text-xs text-slate-600 font-mono font-semibold">
                  {autoPaused ? "PAUSED" : "ACTIVE"}
                </span>
                <button
                  type="button"
                  onClick={() => setAutoPaused(!autoPaused)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold ${
                    autoPaused
                      ? "bg-amber-500 hover:bg-amber-400 text-slate-900"
                      : "bg-slate-200 hover:bg-slate-300 text-slate-700"
                  }`}
                >
                  {autoPaused ? "Unpause / Reset" : "Force Pause"}
                </button>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">Auto pauses when daily cap is reached.</p>
            </div>
          </div>
        </div>

        {/* Section 3: Automatic Mode per Case Type */}
        <div className="bg-white border border-[#d4e3f3] rounded-2xl p-6 shadow-sm space-y-4">
          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-blue-600" />
            <span>Automatic Mode by Case Type</span>
          </h2>
          <p className="text-xs text-slate-500">
            Turn autonomous action ON or OFF individually for each use case:
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { id: "duplicate_charge", label: "Duplicate Charges" },
              { id: "refund", label: "Standard Refunds" },
              { id: "cancellation", label: "Cancellations" },
              { id: "failed_payment", label: "Failed Payments" },
            ].map((c) => {
              const enabled = autoMode[c.id] || false;
              return (
                <div
                  key={c.id}
                  onClick={() => setAutoMode({ ...autoMode, [c.id]: !enabled })}
                  className={`p-3.5 rounded-xl border cursor-pointer select-none transition ${
                    enabled
                      ? "bg-blue-50/80 border-blue-400 text-blue-900 shadow-sm"
                      : "bg-[#f8fafd] border-[#d4e3f3] text-slate-500 hover:border-slate-400"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold">{c.label}</span>
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${
                        enabled ? "bg-blue-600" : "bg-slate-300"
                      }`}
                    />
                  </div>
                  <span className="text-[10px] font-mono uppercase font-semibold">
                    {enabled ? "Auto: ON" : "Auto: OFF (Human)"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Save Settings Button */}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-600/20 transition flex items-center gap-2"
          >
            <Save className="h-4 w-4" />
            <span>{saving ? "Saving Changes…" : "Save Policy Changes"}</span>
          </button>
        </div>
      </form>

      {/* Section 4: Team Members & Roles Management */}
      <div className="bg-white border border-[#d4e3f3] rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
            <Users className="h-4 w-4 text-indigo-600" />
            <span>Team Members & Roles</span>
          </h2>
          <button
            onClick={() => setMemberModal(true)}
            className="px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 text-xs font-semibold flex items-center gap-1.5 transition"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add Member</span>
          </button>
        </div>

        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-[#d4e3f3] bg-[#f1f6fc] text-slate-600 uppercase text-[10px]">
              <th className="py-2.5 px-3">Name</th>
              <th className="py-2.5 px-3">Email</th>
              <th className="py-2.5 px-3">Role</th>
              <th className="py-2.5 px-3">Availability</th>
              <th className="py-2.5 px-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#d4e3f3] font-mono">
            {data.team?.map((m) => (
              <tr key={m.id} className="hover:bg-[#f8fafd] transition">
                <td className="py-2.5 px-3 text-slate-800 font-sans font-semibold">{m.name}</td>
                <td className="py-2.5 px-3 text-slate-500">{m.email}</td>
                <td className="py-2.5 px-3">
                  <span className="capitalize font-bold text-blue-600">{m.role}</span>
                </td>
                <td className="py-2.5 px-3">
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${
                      m.availability === "available"
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        : "bg-slate-100 text-slate-500 border border-slate-200"
                    }`}
                  >
                    {m.availability}
                  </span>
                </td>
                <td className="py-2.5 px-3 text-right font-sans">
                  {user?.id !== m.id && (
                    <button
                      type="button"
                      onClick={() => handleDeleteMember(m.id, m.name)}
                      className="p-1 rounded-lg text-rose-600 hover:text-rose-700 hover:bg-rose-50 transition inline-flex items-center gap-1 text-[11px]"
                      title="Remove member"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Remove</span>
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Section 5: Stripe Integration Connection */}
      <div className="bg-white border border-[#d4e3f3] rounded-2xl p-6 shadow-sm space-y-3">
        <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-amber-500" />
          <span>Stripe Gateway Connection</span>
        </h2>
        <div className="p-4 rounded-xl bg-[#f8fafd] border border-[#d4e3f3] flex items-center justify-between text-xs">
          <div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <strong className="text-slate-800">Stripe Test Mode</strong>
              <span className="font-mono text-slate-500">sk_test_••••••••••••</span>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Test mode active. No real credit cards or currency charged.
            </p>
          </div>
          <span className="px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold uppercase text-[10px]">
            {data.stripe?.status}
          </span>
        </div>
      </div>

      {/* Add Member Modal - Portaled to document.body */}
      {memberModal &&
        createPortal(
          <div className="fixed inset-0 z-[9999] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white border border-[#d4e3f3] rounded-2xl max-w-sm w-full p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
              <h3 className="text-base font-bold text-slate-900 mb-4">Add Team Member</h3>
              <form onSubmit={handleAddMember} className="space-y-3 text-xs">
                <div>
                  <label className="block text-slate-700 font-medium mb-1">Full Name</label>
                  <input
                    type="text"
                    required
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g. John Doe"
                    className="w-full bg-[#f8fafd] border border-[#d4e3f3] rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:border-blue-500 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-medium mb-1">Email</label>
                  <input
                    type="email"
                    required
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="name@cloudnotes.com"
                    className="w-full bg-[#f8fafd] border border-[#d4e3f3] rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:border-blue-500 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-medium mb-1">Role</label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value)}
                    className="w-full bg-[#f8fafd] border border-[#d4e3f3] rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:border-blue-500 focus:bg-white capitalize"
                  >
                    <option value="agent">Support Agent (Live Chats)</option>
                    <option value="approver">Approver (Finance & Refunds)</option>
                    <option value="admin">Admin (Manager & Controls)</option>
                    <option value="viewer">Viewer (Auditor Read-only)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-medium mb-1">Password</label>
                  <input
                    type="password"
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-[#f8fafd] border border-[#d4e3f3] rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:border-blue-500 focus:bg-white"
                  />
                </div>

                <div className="flex gap-2 justify-end pt-3">
                  <button
                    type="button"
                    onClick={() => setMemberModal(false)}
                    className="px-3 py-2 text-slate-500 hover:text-slate-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 rounded-xl font-bold text-white shadow-sm"
                  >
                    Add Member
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
