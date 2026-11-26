import React, { useState, useEffect, useRef } from "react";
import { Ticket, ArrowRight, Bell } from "lucide-react";
import { useAuth } from "./context/AuthContext";
import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
import LoginView from "./views/LoginView";
import OverviewView from "./views/OverviewView";
import TicketsView from "./views/TicketsView";
import TicketDetailView from "./views/TicketDetailView";
import LiveChatsView from "./views/LiveChatsView";
import ApprovalsView from "./views/ApprovalsView";
import ActivityLogView from "./views/ActivityLogView";
import AIPerformanceView from "./views/AIPerformanceView";
import SettingsView from "./views/SettingsView";
import UsersView from "./views/UsersView";
import TestSuiteView from "./views/TestSuiteView";
import DecisionLogView from "./views/DecisionLogView";
import ApproveTokenView from "./views/ApproveTokenView";
import ResetPasswordView from "./views/ResetPasswordView";
import { api } from "./api";

// Web Audio API beep sound for live chat notification
function playHandoffChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.12); // A5
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
  } catch (e) {
    // AudioContext blocked or unsupported
  }
}

// Web Audio API chime for new ticket generation
function playTicketChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "triangle";
    osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
    osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.12); // E5
    osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.24); // G5
    gain.gain.setValueAtTime(0.35, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.55);
    osc.start();
    osc.stop(ctx.currentTime + 0.55);
  } catch (e) {
    // AudioContext blocked or unsupported
  }
}

function triggerBrowserNotification(title, body) {
  try {
    if ("Notification" in window) {
      if (Notification.permission === "granted") {
        new Notification(title, {
          body,
          icon: "/favicon.ico",
        });
      } else if (Notification.permission === "default") {
        Notification.requestPermission();
      }
    }
  } catch (e) {}
}

export default function App() {
  const { user, loading } = useAuth();
  const [activeTab, setActiveTab] = useState("overview");
  const [selectedTicketId, setSelectedTicketId] = useState(null);
  const [overview, setOverview] = useState(null);
  const [liveQueue, setLiveQueue] = useState([]);
  const [pendingApprovals, setPendingApprovals] = useState([]);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [newTicketToast, setNewTicketToast] = useState(null);
  const [unreadTicketsCount, setUnreadTicketsCount] = useState(0);
  const prevQueueLenRef = useRef(0);
  const prevMaxTicketIdRef = useRef(0);

  // Auto-dismiss new ticket toast after 8 seconds
  useEffect(() => {
    if (!newTicketToast) return;
    const timer = setTimeout(() => setNewTicketToast(null), 8000);
    return () => clearTimeout(timer);
  }, [newTicketToast]);

  const fetchGlobalTelemetry = async () => {
    if (!user) return;
    try {
      const [ov, lq, ap] = await Promise.all([
        api.getOverview().catch(() => null),
        api.getLiveQueue().catch(() => []),
        api.getApprovals("pending").catch(() => []),
      ]);

      if (ov) {
        setOverview(ov);
        const maxTicketId =
          ov.recent_tickets && ov.recent_tickets.length > 0
            ? Math.max(...ov.recent_tickets.map((t) => t.id))
            : 0;

        if (prevMaxTicketIdRef.current === 0) {
          prevMaxTicketIdRef.current = maxTicketId;
        } else if (maxTicketId > prevMaxTicketIdRef.current) {
          const freshTickets = ov.recent_tickets.filter((t) => t.id > prevMaxTicketIdRef.current);
          prevMaxTicketIdRef.current = maxTicketId;

          if (freshTickets.length > 0) {
            const latest = freshTickets[0];
            setUnreadTicketsCount((prev) => prev + freshTickets.length);
            if (soundEnabled) {
              playTicketChime();
            }
            triggerBrowserNotification(
              `🎫 New Ticket #${latest.id}`,
              `From: ${latest.customer_email || "Customer"} • Type: ${(latest.use_case || latest.source || "ticket").replace("_", " ")}`
            );
            setNewTicketToast({
              id: latest.id,
              customer_email: latest.customer_email,
              use_case: latest.use_case,
              source: latest.source,
            });
          }
        }
      }

      if (lq) {
        // Trigger sound alert & desktop notification if a new live chat arrived and sound is enabled
        if (lq.length > prevQueueLenRef.current) {
          if (soundEnabled) {
            playHandoffChime();
          }
          const latestHandoff = lq[0];
          triggerBrowserNotification(
            `💬 Live Chat Handoff Waiting!`,
            `Customer ${latestHandoff?.customer_email || "user"} needs a human support agent.`
          );
        }
        prevQueueLenRef.current = lq.length;
        setLiveQueue(lq);
      }
      if (ap) setPendingApprovals(ap);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (!user) return;
    fetchGlobalTelemetry();
    api.heartbeat();
    const interval = setInterval(() => {
      fetchGlobalTelemetry();
      api.heartbeat();
    }, 5000);
    return () => clearInterval(interval);
  }, [user, soundEnabled]);

  const pathname = window.location.pathname;
  const searchParams = new URLSearchParams(window.location.search);
  const token = searchParams.get("token");

  // Bug 11 fix: Support direct standalone email action links
  if (pathname === "/approve" || (pathname.startsWith("/approve") && token)) {
    return <ApproveTokenView token={token} />;
  }

  if (pathname === "/reset-password" || (pathname.startsWith("/reset-password") && token)) {
    return <ResetPasswordView token={token} />;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-400">
          <div className="h-6 w-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <span className="font-semibold text-sm">Initializing SupportPilot…</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginView />;
  }

  const handleSelectTicket = (id) => {
    setSelectedTicketId(id);
    setUnreadTicketsCount(0);
    setActiveTab("ticket_detail");
  };

  const handleBackToTickets = () => {
    setSelectedTicketId(null);
    setUnreadTicketsCount(0);
    setActiveTab("tickets");
  };

  const pageTitles = {
    overview: "Operations Overview",
    tickets: "Ticket Directory",
    ticket_detail: `Ticket #${selectedTicketId}`,
    live: "Live Chat Hand-offs",
    approvals: "Approval Queue",
    users: "Users & Staff Operations",
    activity: "Activity & Action Audit",
    performance: "AI Performance & Trust Metrics",
    settings: "System Policies & Governance",
    tests: "Automated Test Suite",
    decision_log: "Architecture Decision Log",
  };

  return (
    <div className="min-h-screen bg-[#edf4fb] text-slate-800 flex overflow-hidden relative selection:bg-blue-600 selection:text-white">
      {/* Ambient background accents in soft light blue */}
      <div className="fixed top-0 left-64 w-96 h-96 bg-blue-300/15 rounded-full blur-3xl pointer-events-none" />
      <div className="fixed bottom-10 right-10 w-96 h-96 bg-indigo-200/20 rounded-full blur-3xl pointer-events-none" />
      <div className="fixed top-1/2 right-1/3 w-80 h-80 bg-sky-200/20 rounded-full blur-3xl pointer-events-none" />

      {/* Sidebar Navigation */}
      <Sidebar
        activeTab={activeTab === "ticket_detail" ? "tickets" : activeTab}
        setActiveTab={(tab) => {
          setSelectedTicketId(null);
          if (tab === "tickets") setUnreadTicketsCount(0);
          setActiveTab(tab);
        }}
        openTicketsCount={overview?.open_tickets || 0}
        unreadTicketsCount={unreadTicketsCount}
        liveQueueCount={liveQueue.length}
        pendingApprovalsCount={pendingApprovals.length}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        <Header
          title={pageTitles[activeTab] || "SupportPilot"}
          overview={overview}
          soundEnabled={soundEnabled}
          setSoundEnabled={setSoundEnabled}
          liveQueueCount={liveQueue.length}
          unreadTicketsCount={unreadTicketsCount}
          onNavigate={(tab) => {
            setSelectedTicketId(null);
            if (tab === "tickets") setUnreadTicketsCount(0);
            setActiveTab(tab);
          }}
        />

        <main className="flex-1 overflow-y-auto">
          {activeTab === "overview" && (
            <OverviewView
              overview={overview}
              onNavigate={setActiveTab}
              onSelectTicket={handleSelectTicket}
            />
          )}

          {activeTab === "tickets" && (
            <TicketsView onSelectTicket={handleSelectTicket} />
          )}

          {activeTab === "ticket_detail" && selectedTicketId && (
            <TicketDetailView
              ticketId={selectedTicketId}
              onBack={handleBackToTickets}
            />
          )}

          {activeTab === "live" && (
            <LiveChatsView
              liveQueue={liveQueue}
              onSelectTicket={handleSelectTicket}
            />
          )}

          {activeTab === "approvals" && (
            <ApprovalsView onSelectTicket={handleSelectTicket} />
          )}

          {activeTab === "users" && <UsersView />}

          {activeTab === "activity" && (
            <ActivityLogView onSelectTicket={handleSelectTicket} />
          )}

          {activeTab === "performance" && (
            <AIPerformanceView onSelectTicket={handleSelectTicket} />
          )}

          {activeTab === "settings" && <SettingsView />}

          {activeTab === "tests" && <TestSuiteView />}

          {activeTab === "decision_log" && <DecisionLogView />}
        </main>
      </div>

      {/* Floating Real-time Ticket Notification Toast */}
      {newTicketToast && (
        <div className="fixed bottom-6 right-6 z-[9999] max-w-sm w-full bg-white border-2 border-blue-400 rounded-2xl p-4 shadow-2xl animate-in slide-in-from-bottom-5 duration-200">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-blue-50 text-blue-600 mt-0.5 border border-blue-100">
                <Ticket className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-xs text-slate-900">New Ticket #{newTicketToast.id}</span>
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                </div>
                <p className="text-xs text-slate-600 font-mono mt-0.5 truncate max-w-[200px]">
                  {newTicketToast.customer_email || "Customer"}
                </p>
                <div className="mt-1 flex items-center gap-1.5">
                  <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                    {(newTicketToast.use_case || newTicketToast.source || "ticket").replace("_", " ")}
                  </span>
                </div>
              </div>
            </div>
            <button
              onClick={() => setNewTicketToast(null)}
              className="text-slate-400 hover:text-slate-700 text-sm p-1 rounded-lg hover:bg-slate-100"
            >
              ✕
            </button>
          </div>
          <div className="mt-3 pt-2.5 border-t border-[#d4e3f3] flex items-center justify-end gap-2">
            <button
              onClick={() => setNewTicketToast(null)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-500 hover:text-slate-800"
            >
              Dismiss
            </button>
            <button
              onClick={() => {
                handleSelectTicket(newTicketToast.id);
                setNewTicketToast(null);
              }}
              className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold shadow-sm transition flex items-center gap-1"
            >
              <span>View Ticket</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
