import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  Volume2,
  VolumeX,
  Radio,
  Power,
  Eye,
  AlertCircle,
  Bell,
  CheckCircle,
  User,
  Shield,
  UserCheck,
  Headphones,
  ChevronDown,
  LogOut,
  ArrowUpRight,
  Sparkles,
  Ticket,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";

export default function Header({
  title,
  overview,
  soundEnabled,
  setSoundEnabled,
  liveQueueCount = 0,
  unreadTicketsCount = 0,
  onNavigate,
}) {
  const { user, logout, updateAvailability, isAgent } = useAuth();
  const [updatingAvail, setUpdatingAvail] = useState(false);

  // Profile Dropdown & Role Upgrade Modal state
  const [profileOpen, setProfileOpen] = useState(false);
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const [targetRole, setTargetRole] = useState("approver");
  const [upgradeReason, setUpgradeReason] = useState("");
  const [submittingUpgrade, setSubmittingUpgrade] = useState(false);
  const [upgradeSuccess, setUpgradeSuccess] = useState(null);

  const menuRef = useRef(null);
  const closeTimeoutRef = useRef(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleMouseEnter = () => {
    if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    setProfileOpen(true);
  };

  const handleMouseLeave = () => {
    closeTimeoutRef.current = setTimeout(() => {
      setProfileOpen(false);
    }, 200);
  };

  const toggleAvailability = async () => {
    if (updatingAvail || !user) return;
    setUpdatingAvail(true);
    const next = user.availability === "available" ? "away" : "available";
    try {
      await updateAvailability(next);
    } finally {
      setUpdatingAvail(false);
    }
  };

  const handleUpgradeSubmit = async (e) => {
    e.preventDefault();
    setSubmittingUpgrade(true);
    setUpgradeSuccess(null);
    try {
      await api.requestRoleUpgrade(targetRole, upgradeReason);
      setUpgradeSuccess("Upgrade request sent to Administrator!");
      setTimeout(() => {
        setUpgradeModalOpen(false);
        setUpgradeSuccess(null);
        setUpgradeReason("");
      }, 1800);
    } catch (err) {
      alert(err.message || "Failed to submit upgrade request");
    } finally {
      setSubmittingUpgrade(false);
    }
  };

  const isAvailable = user?.availability === "available";

  const roleColors = {
    admin: "bg-purple-100 text-purple-800 border-purple-200",
    agent: "bg-blue-100 text-blue-800 border-blue-200",
    approver: "bg-emerald-100 text-emerald-800 border-emerald-200",
    viewer: "bg-slate-100 text-slate-700 border-slate-200",
  };

  const roleIcons = {
    admin: Shield,
    agent: Headphones,
    approver: UserCheck,
    viewer: Eye,
  };

  const UserRoleIcon = user?.role ? roleIcons[user.role] || User : User;

  return (
    <header className="h-16 border-b border-[#d4e3f3] bg-white/95 backdrop-blur-md px-6 flex items-center justify-between z-20 relative">
      {/* Title & Page Context */}
      <div className="flex items-center gap-4">
        <h1 className="text-lg font-bold text-slate-900 tracking-tight">{title}</h1>
        {overview && (
          <div className="hidden lg:flex items-center gap-2 text-xs">
            {overview.ai_enabled ? (
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-300 text-emerald-700 font-semibold shadow-sm">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                AI Online
              </span>
            ) : (
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-50 border border-rose-300 text-rose-700 font-semibold">
                <Power className="h-3 w-3" />
                AI Emergency Off
              </span>
            )}

            {overview.watching_mode && (
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-300 text-amber-800 font-semibold">
                <Eye className="h-3 w-3" />
                Watching Mode
              </span>
            )}

            {overview.auto_refunds_paused && (
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-50 border border-rose-300 text-rose-800 font-semibold">
                <AlertCircle className="h-3 w-3" />
                Daily Cap Paused
              </span>
            )}

            <span className="text-blue-700 font-mono text-[11px] px-2 py-0.5 rounded bg-blue-50/80 border border-blue-200 font-medium">
              Stripe: Test Mode
            </span>
          </div>
        )}
      </div>

      {/* Action Controls */}
      <div className="flex items-center gap-3">
        {/* Sound chime toggle for live handoffs */}
        <button
          onClick={() => setSoundEnabled(!soundEnabled)}
          title={soundEnabled ? "Mute live chat sound alert" : "Enable sound alerts for incoming hand-offs"}
          className={`p-2 rounded-lg border transition shadow-sm ${
            soundEnabled
              ? "bg-white border-[#d4e3f3] text-blue-600 hover:text-blue-700 hover:bg-blue-50"
              : "bg-slate-100 border-slate-200 text-slate-400 hover:text-slate-600"
          }`}
        >
          {soundEnabled ? <Volume2 className="h-4 w-4 text-blue-600" /> : <VolumeX className="h-4 w-4" />}
        </button>

        {/* Live handoff pulse notice */}
        {liveQueueCount > 0 && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-100 border border-amber-300 text-amber-900 text-xs font-semibold animate-pulse shadow-sm">
            <Radio className="h-3.5 w-3.5 text-amber-600 animate-spin" />
            <span>{liveQueueCount} live handoff{liveQueueCount > 1 ? "s" : ""} waiting!</span>
          </div>
        )}

        {/* New tickets alert badge */}
        {unreadTicketsCount > 0 && (
          <button
            onClick={() => onNavigate && onNavigate("tickets")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-100 hover:bg-blue-200 border border-blue-300 text-blue-900 text-xs font-bold animate-pulse shadow-sm transition"
            title="Click to view new tickets"
          >
            <Ticket className="h-3.5 w-3.5 text-blue-700" />
            <span>{unreadTicketsCount} new ticket{unreadTicketsCount > 1 ? "s" : ""}!</span>
          </button>
        )}

        {/* Agent Availability Toggle */}
        <div className="flex items-center gap-2 border-l border-[#d4e3f3] pl-3">
          <span className="text-xs font-medium text-slate-500 hidden sm:inline">Status:</span>
          <button
            onClick={toggleAvailability}
            disabled={updatingAvail}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
              isAvailable
                ? "bg-emerald-50 border-emerald-300 text-emerald-700 hover:bg-emerald-100 shadow-sm"
                : "bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200"
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                isAvailable ? "bg-emerald-500 animate-ping" : "bg-slate-400"
              }`}
            />
            <span className="capitalize">{user?.availability || "away"}</span>
          </button>
        </div>

        {/* Profile Avatar / Name Hover Dropdown Menu */}
        <div
          ref={menuRef}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          className="relative pl-2 border-l border-[#d4e3f3]"
        >
          <button
            type="button"
            onClick={() => setProfileOpen(!profileOpen)}
            className="flex items-center gap-2.5 p-1.5 pr-2.5 rounded-xl hover:bg-blue-50/80 border border-transparent hover:border-blue-200 transition select-none"
          >
            <div className="h-8 w-8 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white font-bold text-xs shadow-md shadow-blue-500/20">
              {user?.name ? user.name[0].toUpperCase() : "U"}
            </div>
            <div className="text-left hidden md:block">
              <div className="text-xs font-semibold text-slate-800 truncate max-w-[130px]">
                {user?.name || user?.email}
              </div>
              <div className="text-[10px] text-slate-500 font-mono uppercase font-bold tracking-wider">
                {user?.role}
              </div>
            </div>
            <ChevronDown className={`h-3.5 w-3.5 text-slate-500 transition-transform duration-150 ${profileOpen ? "rotate-180" : ""}`} />
          </button>

          {/* Hover / Click Dropdown Menu with hover-bridge before pseudo */}
          {profileOpen && (
            <div className="absolute right-0 top-full mt-1.5 w-72 bg-white border border-[#d4e3f3] rounded-2xl shadow-2xl p-2.5 z-50 animate-in fade-in zoom-in-95 duration-150 text-slate-800 before:absolute before:-top-2 before:left-0 before:right-0 before:h-2 before:content-['']">
              {/* Profile Card Header */}
              <div className="p-3 bg-[#f0f6fc] rounded-xl border border-blue-100 mb-2">
                <div className="font-bold text-xs text-slate-900 truncate">{user?.name}</div>
                <div className="text-[11px] text-slate-500 font-mono truncate">{user?.email}</div>
                <div className="mt-2 flex items-center justify-between">
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-md font-bold uppercase border tracking-wider flex items-center gap-1 ${
                      roleColors[user?.role] || roleColors.viewer
                    }`}
                  >
                    <UserRoleIcon className="h-3 w-3" />
                    <span>{user?.role}</span>
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">ID: #{user?.id}</span>
                </div>
              </div>

              {/* Action List */}
              <div className="space-y-1">
                {/* Role Upgrade Option (visible to non-admins like Agent / Approver) */}
                {user?.role !== "admin" && (
                  <button
                    type="button"
                    onClick={() => {
                      setProfileOpen(false);
                      setUpgradeModalOpen(true);
                    }}
                    className="w-full flex items-center justify-between p-2.5 rounded-xl text-xs font-semibold text-amber-900 bg-amber-50 hover:bg-amber-100/90 border border-amber-200/90 transition group text-left shadow-sm"
                  >
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-amber-500 group-hover:scale-110 transition" />
                      <div>
                        <div className="font-bold">Request Role Upgrade</div>
                        <div className="text-[10px] text-amber-700/80">Become Approver or Admin</div>
                      </div>
                    </div>
                    <ArrowUpRight className="h-3.5 w-3.5 text-amber-600" />
                  </button>
                )}

                {/* Quick Availability Toggle Option */}
                <button
                  type="button"
                  onClick={() => {
                    toggleAvailability();
                  }}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium text-slate-700 hover:text-slate-900 hover:bg-blue-50/70 transition"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-2 w-2 rounded-full ${
                        isAvailable ? "bg-emerald-500" : "bg-slate-400"
                      }`}
                    />
                    <span>Set {isAvailable ? "Away" : "Available"}</span>
                  </div>
                  <span className="text-[10px] uppercase font-mono text-slate-400">
                    {user?.availability}
                  </span>
                </button>

                <div className="my-1 border-t border-slate-100" />

                {/* Logout Option */}
                <button
                  type="button"
                  onClick={() => {
                    setProfileOpen(false);
                    logout();
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 transition"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Role Upgrade Modal - Portaled to document.body so it NEVER clips or cuts off */}
      {upgradeModalOpen && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[9999] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-[#d4e3f3] rounded-2xl max-w-md w-full p-6 shadow-2xl text-slate-800 animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-base font-bold text-slate-900 mb-1">Request Role Upgrade</h3>
            <p className="text-xs text-slate-500 mb-4">
              Submit a role upgrade request to SuperAdmin (Piyush) to become an Approver or Administrator.
            </p>

            {upgradeSuccess ? (
              <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold text-center">
                ✓ {upgradeSuccess}
              </div>
            ) : (
              <form onSubmit={handleUpgradeSubmit} className="space-y-4 text-xs">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Requested Role</label>
                  <select
                    value={targetRole}
                    onChange={(e) => setTargetRole(e.target.value)}
                    className="w-full bg-[#f8fafd] border border-[#d4e3f3] rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white shadow-inner font-medium"
                  >
                    <option value="approver">Approver (Can approve refunds & cancellations)</option>
                    <option value="admin">Administrator (Full control & team management)</option>
                    <option value="viewer">Viewer (Compliance audit)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Reason / Note for Admin</label>
                  <textarea
                    rows={3}
                    value={upgradeReason}
                    onChange={(e) => setUpgradeReason(e.target.value)}
                    placeholder="e.g. Taking over weekend refund approval duties."
                    className="w-full bg-[#f8fafd] border border-[#d4e3f3] rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white shadow-inner"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setUpgradeModalOpen(false)}
                    className="px-3.5 py-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submittingUpgrade}
                    className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 rounded-xl font-bold text-white shadow-md shadow-blue-500/20 disabled:opacity-50"
                  >
                    {submittingUpgrade ? "Submitting…" : "Send Request to Admin"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>,
        document.body
      )}
    </header>
  );
}
