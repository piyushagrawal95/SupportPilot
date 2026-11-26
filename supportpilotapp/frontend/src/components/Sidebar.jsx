import React from "react";
import {
  LayoutDashboard,
  Inbox,
  Headphones,
  CheckCircle2,
  Users,
  ScrollText,
  TrendingUp,
  Settings,
  Shield,
  UserCheck,
  User,
  Eye,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";

export default function Sidebar({
  activeTab,
  setActiveTab,
  openTicketsCount = 0,
  unreadTicketsCount = 0,
  liveQueueCount = 0,
  pendingApprovalsCount = 0,
}) {
  const { user } = useAuth();

  const navItems = [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    {
      id: "tickets",
      label: "Tickets",
      icon: Inbox,
      badge: unreadTicketsCount > 0 ? unreadTicketsCount : (openTicketsCount > 0 ? openTicketsCount : null),
      badgeColor: unreadTicketsCount > 0 ? "bg-rose-500 animate-pulse text-white font-bold shadow-sm" : "bg-blue-600 text-white font-semibold shadow-sm",
    },
    {
      id: "live",
      label: "Live Chats",
      icon: Headphones,
      badge: liveQueueCount > 0 ? liveQueueCount : null,
      badgeColor: "bg-amber-500 animate-pulse text-black",
    },
    {
      id: "approvals",
      label: "Approvals",
      icon: CheckCircle2,
      badge: pendingApprovalsCount > 0 ? pendingApprovalsCount : null,
      badgeColor: "bg-rose-500 text-white",
    },
    { id: "users", label: "Users & Staff", icon: Users, adminOnly: true },
    { id: "activity", label: "Activity Log", icon: ScrollText },
    { id: "performance", label: "AI Performance", icon: TrendingUp },
    { id: "settings", label: "Settings", icon: Settings, adminOnly: true },
  ];

  const roleColors = {
    admin: "border-purple-200 bg-purple-100 text-purple-800",
    agent: "border-blue-200 bg-blue-100 text-blue-800",
    approver: "border-emerald-200 bg-emerald-100 text-emerald-800",
    viewer: "border-slate-200 bg-slate-100 text-slate-700",
  };

  const roleIcons = {
    admin: Shield,
    agent: Headphones,
    approver: UserCheck,
    viewer: Eye,
  };

  const UserRoleIcon = user?.role ? roleIcons[user.role] || User : User;

  return (
    <aside className="w-64 border-r border-[#d4e3f3] bg-[#f8fbfe] flex flex-col h-screen select-none shrink-0 z-10">
      {/* Brand Header */}
      <div className="p-4 border-b border-[#d4e3f3] flex items-center justify-between bg-white/70">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-sky-500 flex items-center justify-center shadow-md shadow-blue-500/20">
            <span className="font-bold text-white text-lg">S</span>
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-base tracking-tight text-slate-900 font-sans">SupportPilot</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded font-mono font-semibold bg-blue-100 text-blue-700 border border-blue-200">
                AI
              </span>
            </div>
            <p className="text-[11px] text-slate-500 font-medium">Ops & AI Control Center</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          if (item.adminOnly && user?.role !== "admin") return null;
          const Icon = item.icon;
          const isActive = activeTab === item.id;

          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${
                isActive
                  ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold shadow-md shadow-blue-500/20"
                  : "text-slate-600 hover:text-slate-900 hover:bg-blue-50/80"
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon className={`h-4 w-4 ${isActive ? "text-white" : "text-slate-500"}`} />
                <span>{item.label}</span>
              </div>
              {item.badge !== null && item.badge !== undefined && (
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                    item.badgeColor || "bg-blue-600 text-white"
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* User compact footer */}
      <div className="p-3.5 border-t border-[#d4e3f3] flex items-center justify-between bg-white/90">
        <div className="flex items-center gap-2.5 overflow-hidden">
          <div className="h-8 w-8 rounded-lg bg-blue-100 border border-blue-200 flex items-center justify-center shrink-0 text-blue-700">
            <UserRoleIcon className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-800 truncate">{user?.name || user?.email}</p>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded-md font-bold uppercase border tracking-wider ${
                roleColors[user?.role] || roleColors.viewer
              }`}
            >
              {user?.role}
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}
