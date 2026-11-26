import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  Users,
  Shield,
  Headphones,
  CheckCircle,
  XCircle,
  Search,
  UserCheck,
  Trash2,
  AlertCircle,
  ArrowUpRight,
  Plus,
  RefreshCw,
} from "lucide-react";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";

export default function UsersView() {
  const { user } = useAuth();
  const [data, setData] = useState({ staff: [], role_requests: [], customers: [] });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("staff"); // "staff" | "customers"
  const [search, setSearch] = useState("");
  const [busyAction, setBusyAction] = useState(null);
  const [msg, setMsg] = useState(null);

  // Add staff modal state
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState("agent");
  const [newPassword, setNewPassword] = useState("");

  const loadData = async (query = "") => {
    try {
      const res = await api.getUsersOverview(query);
      setData(res);
    } catch (err) {
      setMsg({ type: "error", text: err.message || "Failed to load users data" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(search);
  }, []);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    loadData(search);
  };

  const handleDecideRole = async (requestId, decision) => {
    setBusyAction(`role-${requestId}`);
    try {
      await api.decideRoleRequest(requestId, decision);
      setMsg({ type: "success", text: `Role request ${decision} successfully!` });
      await loadData(search);
    } catch (err) {
      setMsg({ type: "error", text: err.message || `Failed to ${decision} request` });
    } finally {
      setBusyAction(null);
    }
  };

  const handleRoleChange = async (userId, role) => {
    setBusyAction(`change-${userId}`);
    try {
      await api.updateStaffRole(userId, role);
      setMsg({ type: "success", text: `Staff role updated to ${role}!` });
      await loadData(search);
    } catch (err) {
      setMsg({ type: "error", text: err.message || "Failed to update role" });
    } finally {
      setBusyAction(null);
    }
  };

  const handleDeleteStaff = async (userId, name) => {
    if (!window.confirm(`Are you sure you want to remove ${name} from the staff team?`)) return;
    setBusyAction(`del-${userId}`);
    try {
      await api.deleteStaffUser(userId);
      setMsg({ type: "success", text: `${name} has been removed from staff.` });
      await loadData(search);
    } catch (err) {
      setMsg({ type: "error", text: err.message || "Failed to delete staff" });
    } finally {
      setBusyAction(null);
    }
  };

  const handleAddStaffSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.addTeamMember({
        name: newName,
        email: newEmail,
        role: newRole,
        password: newPassword,
      });
      setAddModalOpen(false);
      setNewName("");
      setNewEmail("");
      setNewRole("agent");
      setNewPassword("");
      setMsg({ type: "success", text: "New staff member added successfully!" });
      await loadData(search);
    } catch (err) {
      alert(err.message || "Could not add staff member");
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Users className="h-6 w-6 text-blue-600" />
            <span>Users & Staff Operations</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            SuperAdmin control plane: Review team roles, approve upgrade requests, and inspect registered CloudNotes customers.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => loadData(search)}
            className="p-2 rounded-xl bg-white border border-[#d4e3f3] text-slate-600 hover:text-slate-900 hover:bg-blue-50 transition shadow-sm"
            title="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          <button
            onClick={() => setAddModalOpen(true)}
            className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 font-semibold text-white text-xs flex items-center gap-1.5 transition shadow-sm"
          >
            <Plus className="h-4 w-4" />
            <span>Add Staff Member</span>
          </button>
        </div>
      </div>

      {msg && (
        <div
          className={`p-3 rounded-xl border text-xs font-medium flex items-center justify-between ${
            msg.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-rose-50 border-rose-200 text-rose-800"
          }`}
        >
          <span>{msg.text}</span>
          <button onClick={() => setMsg(null)} className="text-xs opacity-70 hover:opacity-100">
            Dismiss
          </button>
        </div>
      )}

      {/* Pending Role Upgrade Requests Alert */}
      {data.role_requests && data.role_requests.length > 0 && (
        <div className="bg-amber-50/90 border border-amber-200 rounded-2xl p-4 shadow-sm space-y-3">
          <div className="flex items-center gap-2 text-amber-800 font-bold text-xs uppercase tracking-wider">
            <AlertCircle className="h-4 w-4 text-amber-600" />
            <span>Pending Staff Role Upgrade Requests ({data.role_requests.length})</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {data.role_requests.map((req) => (
              <div
                key={req.id}
                className="p-3.5 rounded-xl bg-white border border-amber-200 flex flex-col justify-between gap-3 shadow-sm"
              >
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-slate-800">{req.staff_name}</span>
                    <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                      Current: {req.current_role}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono mb-2">{req.staff_email}</div>
                  <div className="text-xs text-amber-900 bg-amber-50 p-2.5 rounded-lg border border-amber-200/80">
                    <span className="font-semibold text-slate-800">Requested Role:</span>{" "}
                    <span className="uppercase font-bold text-amber-700">{req.requested_role}</span>
                    {req.reason && <p className="text-[11px] text-slate-600 mt-1 italic">"{req.reason}"</p>}
                  </div>
                </div>

                <div className="flex items-center gap-2 justify-end pt-1">
                  <button
                    disabled={busyAction === `role-${req.id}`}
                    onClick={() => handleDecideRole(req.id, "rejected")}
                    className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-medium text-slate-700 transition disabled:opacity-50"
                  >
                    Decline
                  </button>
                  <button
                    disabled={busyAction === `role-${req.id}`}
                    onClick={() => handleDecideRole(req.id, "approved")}
                    className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-xs font-bold text-white transition shadow-sm disabled:opacity-50"
                  >
                    Approve Upgrade
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex bg-slate-200/70 p-1 rounded-xl border border-[#d4e3f3] max-w-md text-xs font-semibold">
        <button
          onClick={() => setActiveTab("staff")}
          className={`flex-1 py-1.5 rounded-lg transition text-center flex items-center justify-center gap-2 ${
            activeTab === "staff"
              ? "bg-white text-blue-700 shadow-sm font-bold"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <Shield className="h-3.5 w-3.5" />
          <span>Staff Team ({data.staff?.length || 0})</span>
        </button>
        <button
          onClick={() => setActiveTab("customers")}
          className={`flex-1 py-1.5 rounded-lg transition text-center flex items-center justify-center gap-2 ${
            activeTab === "customers"
              ? "bg-white text-blue-700 shadow-sm font-bold"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <Headphones className="h-3.5 w-3.5" />
          <span>CloudNotes Users ({data.customers?.length || 0})</span>
        </button>
      </div>

      {/* Content based on Active Tab */}
      {activeTab === "staff" ? (
        /* Staff Team Table */
        <div className="bg-white border border-[#d4e3f3] rounded-2xl shadow-sm overflow-hidden">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[#d4e3f3] bg-[#f1f6fc] text-slate-600 uppercase text-[10px]">
                <th className="py-3 px-4">Staff Member</th>
                <th className="py-3 px-4">Assigned Role</th>
                <th className="py-3 px-4">Availability</th>
                <th className="py-3 px-4">Last Seen</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#d4e3f3]">
              {data.staff?.map((m) => (
                <tr key={m.id} className="hover:bg-[#f8fafd] transition">
                  <td className="py-3 px-4">
                    <div className="font-semibold text-slate-800">{m.name}</div>
                    <div className="text-[11px] text-slate-500 font-mono">{m.email}</div>
                  </td>
                  <td className="py-3 px-4">
                    {user?.id === m.id ? (
                      <span className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 font-bold uppercase text-[10px] border border-blue-200">
                        {m.role} (You)
                      </span>
                    ) : (
                      <select
                        value={m.role}
                        disabled={busyAction === `change-${m.id}`}
                        onChange={(e) => handleRoleChange(m.id, e.target.value)}
                        className="bg-white border border-[#d4e3f3] rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-700 focus:outline-none focus:border-blue-500 capitalize shadow-sm"
                      >
                        <option value="agent">Agent (Support)</option>
                        <option value="approver">Approver (Finance)</option>
                        <option value="admin">Admin (Manager)</option>
                        <option value="viewer">Viewer (Compliance)</option>
                      </select>
                    )}
                  </td>
                  <td className="py-3 px-4">
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
                  <td className="py-3 px-4 text-slate-500 font-mono text-[11px]">
                    {m.last_seen_at ? new Date(m.last_seen_at).toLocaleTimeString() : "Never"}
                  </td>
                  <td className="py-3 px-4 text-right">
                    {user?.id !== m.id && (
                      <button
                        type="button"
                        onClick={() => handleDeleteStaff(m.id, m.name)}
                        disabled={busyAction === `del-${m.id}`}
                        className="p-1.5 rounded-lg text-rose-600 hover:text-rose-700 hover:bg-rose-50 transition inline-flex items-center gap-1"
                        title="Remove member"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span className="text-[11px]">Remove</span>
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        /* CloudNotes Customers Table */
        <div className="space-y-4">
          {/* Customer Search Bar */}
          <form onSubmit={handleSearchSubmit} className="flex gap-2 max-w-md">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search customers by email or stripe ID…"
                className="w-full bg-white border border-[#d4e3f3] rounded-xl pl-9 pr-3.5 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 shadow-sm"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 bg-white hover:bg-blue-50 border border-[#d4e3f3] text-slate-700 rounded-xl text-xs font-semibold shadow-sm transition"
            >
              Search
            </button>
          </form>

          <div className="bg-white border border-[#d4e3f3] rounded-2xl shadow-sm overflow-hidden">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-[#d4e3f3] bg-[#f1f6fc] text-slate-600 uppercase text-[10px]">
                  <th className="py-3 px-4">Customer Email</th>
                  <th className="py-3 px-4">Stripe Customer ID</th>
                  <th className="py-3 px-4">Registered Date</th>
                  <th className="py-3 px-4 text-center">Support Tickets</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#d4e3f3] font-mono">
                {data.customers?.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-slate-400 font-sans">
                      No customer accounts found matching your search.
                    </td>
                  </tr>
                ) : (
                  data.customers?.map((c) => (
                    <tr key={c.id} className="hover:bg-[#f8fafd] transition">
                      <td className="py-3 px-4 text-slate-800 font-sans font-semibold">{c.email}</td>
                      <td className="py-3 px-4 text-slate-600">
                        {c.stripe_customer_id ? (
                          <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 text-[11px]">
                            {c.stripe_customer_id}
                          </span>
                        ) : (
                          <span className="text-slate-400">None</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-500 text-[11px]">
                        {new Date(c.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4 text-center font-bold text-blue-600">
                        {c.ticket_count || 0}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Staff Modal - Portaled to document.body */}
      {addModalOpen &&
        createPortal(
          <div className="fixed inset-0 z-[9999] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white border border-[#d4e3f3] rounded-2xl max-w-md w-full p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
              <h3 className="text-base font-bold text-slate-900 mb-1">Add Staff Member</h3>
              <p className="text-xs text-slate-500 mb-4">
                Create a new operational staff user with assigned role and credentials.
              </p>
              <form onSubmit={handleAddStaffSubmit} className="space-y-4 text-xs">
                <div>
                  <label className="block text-slate-700 font-medium mb-1">Full Name</label>
                  <input
                    type="text"
                    required
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g. Priya Patel"
                    className="w-full bg-[#f8fafd] border border-[#d4e3f3] rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:border-blue-500 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-medium mb-1">Work Email</label>
                  <input
                    type="email"
                    required
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="priya@company.com"
                    className="w-full bg-[#f8fafd] border border-[#d4e3f3] rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:border-blue-500 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-medium mb-1">Assign Role</label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value)}
                    className="w-full bg-[#f8fafd] border border-[#d4e3f3] rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:border-blue-500 focus:bg-white capitalize"
                  >
                    <option value="agent">Support Agent (Live chats & tickets)</option>
                    <option value="approver">Finance Approver (Refunds & cancellations)</option>
                    <option value="admin">Administrator (Full control)</option>
                    <option value="viewer">Viewer (Compliance Audit)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-medium mb-1">Initial Password</label>
                  <input
                    type="password"
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-[#f8fafd] border border-[#d4e3f3] rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:border-blue-500 focus:bg-white"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setAddModalOpen(false)}
                    className="px-4 py-2 rounded-xl text-slate-500 hover:text-slate-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 rounded-xl font-bold text-white shadow-sm"
                  >
                    Create Staff Account
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
