import { useEffect, useState, useRef } from "react";
import { supabase } from "./supabase";
import AuthModal from "./components/AuthModal";
import ChatWidget from "./components/ChatWidget";

const API = import.meta.env.VITE_API_URL;

function readCheckoutNotice() {
  const p = new URLSearchParams(window.location.search);
  const c = p.get("checkout");
  if (c === "success") return { tone: "ok", text: "Checkout complete! Your CloudNotes Pro subscription is now active." };
  if (c === "cancelled") return { tone: "warn", text: "Checkout cancelled. You were not charged." };
  if (p.get("billing") === "update") return { tone: "warn", text: "Payment update required: Please verify or update your billing card below." };
  return null;
}

export default function App() {
  const [session, setSession] = useState(null);
  const [recovery, setRecovery] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(readCheckoutNotice);

  // Auth Dialog state (Navbar triggered)
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState("login"); // "login" | "signup"

  // Account modal state
  const [accountOpen, setAccountOpen] = useState(false);
  const [subscription, setSubscription] = useState({
    subscribed: false,
    plan: "Free Tier",
    price: "$0 / month",
    cancel_at_period_end: false,
  });

  // Interactive product demo state
  const [selectedProduct, setSelectedProduct] = useState("editor");
  const [activeFaq, setActiveFaq] = useState(null);

  // Real Notes State (Bug 9, 11, 12, 13, 14, 15, 17)
  const [notes, setNotes] = useState([]);
  const [selectedNoteId, setSelectedNoteId] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [planInfo, setPlanInfo] = useState({ pro: false, limit: 10, count: 0 });
  const [saveStatus, setSaveStatus] = useState("idle"); // "idle" | "saving" | "saved" | "error"
  const [notesLoading, setNotesLoading] = useState(false);
  const [proPrompt, setProPrompt] = useState(null);

  // Active note editor fields
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editPinned, setEditPinned] = useState(false);
  const [editTags, setEditTags] = useState([]);
  const [tagInput, setTagInput] = useState("");

  // AI Copilot state
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiStyle, setAiStyle] = useState("notes"); // "notes" | "summary" | "action_items" | "study_guide"
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiError, setAiError] = useState(null);

  // In-Editor AI Assist state
  const [aiAssistOpen, setAiAssistOpen] = useState(false);
  const [aiAssisting, setAiAssisting] = useState(false);

  // Guest demo state
  const [guestTitle, setGuestTitle] = useState("⚡ Welcome to CloudNotes");
  const [guestBody, setGuestBody] = useState(
    "Start typing immediately. Sign in to autosave your notes to the cloud, organize with tags, and sync across all devices."
  );

  const initialLoadRef = useRef(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === "PASSWORD_RECOVERY") {
        setRecovery(true);
        setAuthOpen(true);
      }
    });

    const p = new URLSearchParams(window.location.search);
    if (p.get("billing") === "update") {
      setAuthOpen(true);
    }
    return () => data.subscription.unsubscribe();
  }, []);

  // Fetch real subscription status from backend
  useEffect(() => {
    if (session) {
      fetch(`${API}/status`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data) setSubscription(data);
        })
        .catch(() => {});
    } else {
      setSubscription({
        subscribed: false,
        plan: "Free Tier",
        price: "$0 / month",
        cancel_at_period_end: false,
      });
    }
  }, [session]);

  // Fetch user notes (Bug 9, 11)
  useEffect(() => {
    if (!session) {
      setNotes([]);
      setSelectedNoteId(null);
      setPlanInfo({ pro: false, limit: 10, count: 0 });
      return;
    }
    setNotesLoading(true);
    const qParam = searchQuery.trim() ? `?q=${encodeURIComponent(searchQuery.trim())}` : "";
    const timer = setTimeout(() => {
      fetch(`${API}/notes${qParam}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data) {
            setNotes(data.notes || []);
            if (data.plan) setPlanInfo(data.plan);
            if (data.notes?.length > 0) {
              // If currently selected note is not in list or not set, select first note
              if (!selectedNoteId || !data.notes.some((n) => n.id === selectedNoteId)) {
                const first = data.notes[0];
                setSelectedNoteId(first.id);
                setEditTitle(first.title);
                setEditBody(first.body);
                setEditPinned(first.pinned);
                setEditTags(first.tags || []);
                setSaveStatus("saved");
              }
            } else {
              setSelectedNoteId(null);
              setEditTitle("");
              setEditBody("");
              setEditPinned(false);
              setEditTags([]);
              setSaveStatus("idle");
            }
          }
        })
        .catch(() => {})
        .finally(() => setNotesLoading(false));
    }, 200);

    return () => clearTimeout(timer);
  }, [searchQuery, session]);

  // When active note changes, populate inputs
  function selectNote(note) {
    setSelectedNoteId(note.id);
    setEditTitle(note.title);
    setEditBody(note.body);
    setEditPinned(note.pinned);
    setEditTags(note.tags || []);
    setSaveStatus("saved");
  }

  // Autosave with 800ms debounce (Bug 12)
  useEffect(() => {
    if (!session || !selectedNoteId) return;

    // Check if the content actually changed compared to the selected note in state
    const currentNote = notes.find((n) => n.id === selectedNoteId);
    if (!currentNote) return;

    if (currentNote.title === editTitle && currentNote.body === editBody) {
      return;
    }

    setSaveStatus("saving");
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`${API}/notes/${selectedNoteId}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            title: editTitle,
            body: editBody,
          }),
        });
        if (res.ok) {
          const updated = await res.json();
          setNotes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
          setSaveStatus("saved");
        } else {
          const err = await res.json().catch(() => ({}));
          setSaveStatus("error");
          if (res.status === 403 && err.detail?.code === "pro_required") {
            setProPrompt({
              title: "Pro Feature Required",
              message: err.detail.message || "This feature requires CloudNotes Pro.",
            });
          }
        }
      } catch {
        setSaveStatus("error");
      }
    }, 800);

    return () => clearTimeout(timer);
  }, [editTitle, editBody, selectedNoteId, session]);

  // Create new note (Bug 11, 14)
  async function handleCreateNote() {
    if (!session) {
      setAuthMode("signup");
      setAuthOpen(true);
      return;
    }
    setSaveStatus("saving");
    try {
      const res = await fetch(`${API}/notes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ title: "Untitled Note", body: "" }),
      });
      const data = await res.json();
      if (res.ok) {
        setNotes((prev) => [data, ...prev]);
        setSelectedNoteId(data.id);
        setEditTitle(data.title);
        setEditBody(data.body);
        setEditPinned(false);
        setEditTags([]);
        setSaveStatus("saved");
        setPlanInfo((prev) => ({ ...prev, count: prev.count + 1 }));
      } else if (res.status === 403) {
        setSaveStatus("idle");
        if (data.detail?.code === "limit_reached") {
          setProPrompt({
            title: "Free Limit Reached (10 Notes)",
            message:
              data.detail.message ||
              "Free tier allows up to 10 notes. Upgrade to CloudNotes Pro for unlimited notes, tags, pinning, and exports.",
          });
        }
      } else {
        setSaveStatus("error");
      }
    } catch {
      setSaveStatus("error");
    }
  }

  // Delete note (Bug 11)
  async function handleDeleteNote(noteId, e) {
    if (e) e.stopPropagation();
    if (!session) return;
    if (!window.confirm("Are you sure you want to delete this note?")) return;
    try {
      const res = await fetch(`${API}/notes/${noteId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const remaining = notes.filter((n) => n.id !== noteId);
        setNotes(remaining);
        setPlanInfo((prev) => ({ ...prev, count: Math.max(0, prev.count - 1) }));
        if (selectedNoteId === noteId) {
          if (remaining.length > 0) {
            selectNote(remaining[0]);
          } else {
            setSelectedNoteId(null);
            setEditTitle("");
            setEditBody("");
            setEditPinned(false);
            setEditTags([]);
            setSaveStatus("idle");
          }
        }
      }
    } catch {}
  }

  // Toggle Pin (Bug 15)
  async function handleTogglePin() {
    if (!session || !selectedNoteId) return;
    if (!planInfo.pro) {
      setProPrompt({
        title: "Pinning is a Pro Feature",
        message: "Pinning important notes to the top is exclusive to CloudNotes Pro. Upgrade to unlock!",
      });
      return;
    }
    const newPinned = !editPinned;
    setEditPinned(newPinned);
    try {
      const res = await fetch(`${API}/notes/${selectedNoteId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ pinned: newPinned }),
      });
      if (res.ok) {
        const updated = await res.json();
        setNotes((prev) =>
          prev
            .map((n) => (n.id === updated.id ? updated : n))
            .sort((a, b) => (b.pinned === a.pinned ? 0 : b.pinned ? 1 : -1))
        );
      } else {
        const data = await res.json();
        setEditPinned(!newPinned);
        if (res.status === 403 && data.detail?.code === "pro_required") {
          setProPrompt({
            title: "Pro Feature Required",
            message: data.detail.message || "Pinning is a Pro feature.",
          });
        }
      }
    } catch {
      setEditPinned(!newPinned);
    }
  }

  // Add Tag (Bug 15)
  async function handleAddTag(tagText) {
    const clean = tagText.trim().toLowerCase().slice(0, 30);
    if (!clean || editTags.includes(clean)) return;
    if (!planInfo.pro) {
      setProPrompt({
        title: "Tags are a Pro Feature",
        message: "Organizing your notes with custom tags is exclusive to CloudNotes Pro. Upgrade to unlock!",
      });
      return;
    }
    const updatedTags = [...editTags, clean];
    setEditTags(updatedTags);
    setTagInput("");
    try {
      const res = await fetch(`${API}/notes/${selectedNoteId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ tags: updatedTags }),
      });
      if (res.ok) {
        const updated = await res.json();
        setNotes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
      } else {
        const data = await res.json();
        setEditTags(editTags);
        if (res.status === 403 && data.detail?.code === "pro_required") {
          setProPrompt({
            title: "Pro Feature Required",
            message: data.detail.message || "Tags are a Pro feature.",
          });
        }
      }
    } catch {
      setEditTags(editTags);
    }
  }

  // Remove Tag (Bug 15)
  async function handleRemoveTag(tagToRemove) {
    if (!planInfo.pro) {
      setProPrompt({
        title: "Tags are a Pro Feature",
        message: "Tags require CloudNotes Pro.",
      });
      return;
    }
    const updatedTags = editTags.filter((t) => t !== tagToRemove);
    setEditTags(updatedTags);
    try {
      const res = await fetch(`${API}/notes/${selectedNoteId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ tags: updatedTags }),
      });
      if (res.ok) {
        const updated = await res.json();
        setNotes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
      }
    } catch {}
  }

  // Export Markdown (Bug 15)
  async function handleExport() {
    if (!session || !selectedNoteId) return;
    if (!planInfo.pro) {
      setProPrompt({
        title: "Markdown Export is a Pro Feature",
        message: "Exporting raw Markdown files is exclusive to CloudNotes Pro. Upgrade to unlock 1-click exports!",
      });
      return;
    }
    try {
      const res = await fetch(`${API}/notes/${selectedNoteId}/export`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const text = await res.text();
        const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${editTitle || "note"}.md`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        const data = await res.json();
        if (res.status === 403 && data.detail?.code === "pro_required") {
          setProPrompt({
            title: "Pro Feature Required",
            message: data.detail.message || "Export is a Pro feature.",
          });
        }
      }
    } catch {}
  }

  // AI Note Generator handler
  async function handleGenerateNoteWithAI() {
    if (!session) {
      setAuthMode("signup");
      setAuthOpen(true);
      return;
    }
    if (!aiPrompt.trim()) return;

    setAiGenerating(true);
    setAiError(null);

    try {
      const res = await fetch(`${API}/notes/ai-generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          prompt: aiPrompt.trim(),
          style: aiStyle,
          auto_save: true,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setNotes((prev) => [data, ...prev]);
        selectNote(data);
        setPlanInfo((prev) => ({ ...prev, count: prev.count + 1 }));
        setAiModalOpen(false);
        setAiPrompt("");
      } else if (res.status === 403 && data.detail?.code === "limit_reached") {
        setAiModalOpen(false);
        setProPrompt({
          title: "Free Plan Limit Reached (10 Notes)",
          message:
            data.detail.message ||
            "Free tier allows up to 10 notes. Upgrade to CloudNotes Pro for unlimited AI-generated notes.",
        });
      } else {
        setAiError(data.detail || "Failed to generate note with AI. Please try again.");
      }
    } catch {
      setAiError("Could not connect to AI Copilot. Please check your network.");
    } finally {
      setAiGenerating(false);
    }
  }

  // In-Editor AI Assist handler
  async function handleAIAssist(action) {
    if (!session || !selectedNoteId) return;
    if (!editBody.trim()) {
      alert("Please write or paste some content in the note first!");
      return;
    }

    setAiAssisting(true);
    setAiAssistOpen(false);
    setSaveStatus("saving");

    try {
      const res = await fetch(`${API}/notes/ai-assist`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          content: editBody,
          action: action,
        }),
      });

      const data = await res.json();
      if (res.ok && data.result) {
        let newBody = editBody;
        if (action === "summarize") {
          newBody = `> **⚡ AI Executive Summary**\n${data.result}\n\n---\n\n${editBody}`;
        } else if (action === "action_items") {
          newBody = `${editBody}\n\n---\n\n### ✅ Action Items Checklist\n${data.result}`;
        } else {
          newBody = data.result;
        }

        setEditBody(newBody);

        // Immediate background PUT to save
        const saveRes = await fetch(`${API}/notes/${selectedNoteId}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ body: newBody }),
        });
        if (saveRes.ok) {
          const updated = await saveRes.json();
          setNotes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
          setSaveStatus("saved");
        } else {
          setSaveStatus("error");
        }
      } else {
        setSaveStatus("error");
      }
    } catch {
      setSaveStatus("error");
    } finally {
      setAiAssisting(false);
    }
  }

  async function subscribe() {
    if (!session) {
      setAuthMode("signup");
      setAuthOpen(true);
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(`${API}/checkout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json();
      if (res.ok) {
        window.location.href = data.url;
        return;
      }
      setNotice({ tone: "warn", text: data.detail || "Could not initiate checkout. Please try again." });
    } catch {
      setNotice({ tone: "warn", text: "Could not reach billing server. Please try again in a moment." });
    }
    setBusy(false);
  }

  const toneClass =
    notice?.tone === "ok"
      ? "border-emerald-500/30 bg-emerald-50 text-emerald-900"
      : "border-accent/40 bg-orange-50 text-ink";

  const productsList = [
    {
      id: "editor",
      title: "CloudNotes Canvas & Editor",
      badge: "Core App",
      tagline: "Distraction-free Markdown & infinite visual canvas workspace",
      features: [
        "Bi-directional backlinks & nested document hierarchies",
        "Full KaTeX mathematical formula and symbol rendering",
        "Syntax-highlighted code blocks with copy-to-clipboard for 50+ languages",
        "Local-first cache architecture with instant sub-16ms typing response",
      ],
      previewHeadline: "Craft your thoughts without boundaries.",
      previewSnippet:
        "Write in rich text or pure Markdown. Embed live tables, flowcharts, code snippets, and audio notes seamlessly into your knowledge graph.",
    },
    {
      id: "ai",
      title: "CloudNotes AI Copilot",
      badge: "Intelligent Add-on",
      tagline: "Contextual assistant that indexes, synthesizes, and queries your notes",
      features: [
        "Instant bullet summaries of lengthy meeting transcripts and papers",
        "Auto-extract action items, task priorities, and follow-ups",
        "Semantic search: finds concepts even when keywords don't match exactly",
        "Local-private model support with zero third-party training retention",
      ],
      previewHeadline: "An intellect that lives inside your personal notebook.",
      previewSnippet:
        "Ask questions like: 'What were the core architectural decisions from last month?' and get instant verified answers with direct note citations.",
    },
    {
      id: "collab",
      title: "CloudNotes Team Multiplayer",
      badge: "Collaboration",
      tagline: "Real-time collaborative workspace with granular workspace permissions",
      features: [
        "Live multiplayer editing cursors with automatic conflict-free resolution",
        "Granular role-based access control: Admin, Editor, Commenter, Viewer",
        "Shared organization vaults with departmental segmentation",
        "Single Sign-On (SSO) with Okta, Google Workspace, and SAML 2.0",
      ],
      previewHeadline: "Think together across your entire organization.",
      previewSnippet:
        "Collaborate live in team sprints. Leave contextual comments, tag colleagues with @mentions, and review revision history down to the character.",
    },
    {
      id: "vault",
      title: "CloudNotes Vault & Backup",
      badge: "Security",
      tagline: "Zero-knowledge client encryption and hourly snapshot recovery",
      features: [
        "AES-256 client-side encryption before data leaves your device",
        "Hourly immutable snapshots with 1-click historical restore",
        "1TB secure cloud backup for attachments, sketches, and media",
        "Export to Markdown, PDF, HTML, or raw JSON archive at any time",
      ],
      previewHeadline: "Bank-grade privacy. Your thoughts are yours alone.",
      previewSnippet:
        "Even in the unlikely event of physical hardware inspection, not a single word of your documents can be decrypted without your private passphrase.",
    },
  ];

  const plans = [
    {
      name: "Starter Tier",
      price: "$0",
      period: "forever free",
      desc: "Ideal for personal thought capture and daily journals.",
      features: [
        "Up to 10 personal notes",
        "Sync across 2 devices",
        "Standard markdown & code blocks",
        "Community & chat support",
      ],
      cta: session && !subscription.subscribed ? "Current Active Plan" : "Get Started Free",
      action: () => {
        if (!session) {
          setAuthMode("signup");
          setAuthOpen(true);
        }
      },
      featured: false,
    },
    {
      name: "CloudNotes Pro",
      price: "$20",
      period: "per month",
      desc: "The complete professional workspace with unlimited sync and priority support.",
      features: [
        "Unlimited notes & notebooks",
        "Instant sync across unlimited devices",
        "CloudNotes AI Copilot integrated",
        "Full version history & snapshot restores",
        "Fast billing & chat assistance in widget",
      ],
      cta: subscription.subscribed
        ? "Active Pro Plan ✓"
        : busy
        ? "Opening Checkout…"
        : "Subscribe for $20 / month",
      action: subscribe,
      featured: true,
      badge: "Recommended",
    },
    {
      name: "Team & Enterprise",
      price: "$45",
      period: "per user / month",
      desc: "Designed for engineering organizations and research teams.",
      features: [
        "Everything in Pro tier",
        "Shared multiplayer team vaults",
        "Custom domains & SSO (SAML/Okta)",
        "Centralized seat & invoice management",
        "Dedicated VIP human support SLA",
      ],
      cta: "Contact Team Sales",
      action: () => alert("For Team & Enterprise inquiries, please reach out via the chat widget in the bottom right corner."),
      featured: false,
    },
  ];

  const faqs = [
    {
      q: "How does the CloudNotes Pro subscription work?",
      a: "CloudNotes Pro ($20/month) gives you unlimited notes, AI summaries, and instantaneous multi-device sync. Payments are processed securely via Stripe. You can adjust, manage, or cancel anytime using the support chat in the corner.",
    },
    {
      q: "Can I cancel my subscription anytime?",
      a: "Yes, there are zero lock-ins. Simply open the chat widget in the bottom right corner and let our team know you want to cancel. By default, your plan remains active until the end of your billing cycle.",
    },
    {
      q: "What is your refund policy?",
      a: "Duplicate charges reported within 60 days are refunded in full. General refund requests within 7 days of payment receive a 100% full refund. Requests between 8 and 30 days receive a prorated refund for the unused days of the period.",
    },
    {
      q: "How does the floating support chat work?",
      a: "When signed in, open the chat in the bottom right corner. Our system immediately verifies your account, diagnoses your billing or product question, and provides instant answers or connects you to a live support team member.",
    },
  ];

  const currentBody = session ? editBody : guestBody;
  const wordCount = currentBody.trim().split(/\s+/).filter(Boolean).length;
  const charCount = currentBody.length;

  return (
    <div className="min-h-screen bg-paper text-ink flex flex-col font-sans selection:bg-accent/20">
      {/* Top Banner Notice (Optional Checkout Status) */}
      {notice && (
        <div className={`py-2.5 px-4 text-center text-xs font-semibold border-b ${toneClass} flex items-center justify-center gap-2`}>
          <span>{notice.text}</span>
          <button onClick={() => setNotice(null)} className="ml-2 font-bold hover:opacity-75">✕</button>
        </div>
      )}

      {/* Navigation Bar */}
      <header className="border-b border-line bg-paper/95 backdrop-blur sticky top-0 z-40">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-accent text-white flex items-center justify-center font-display font-black text-xl shadow-md shadow-accent/20">
              C
            </div>
            <span className="font-display text-2xl font-bold tracking-tight text-ink">CloudNotes</span>
          </div>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center gap-7 text-xs font-semibold text-muted">
            <a href="#products" className="hover:text-ink transition">Products</a>
            <a href="#demo" className="hover:text-ink transition">Live Workspace</a>
            <a href="#pricing" className="hover:text-ink transition">Pricing</a>
            <a href="#faq" className="hover:text-ink transition">FAQ</a>
          </nav>

          {/* Right Action: Auth Modal Trigger (Navbar Buttons) */}
          <div className="flex items-center gap-3">
            {session ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setAccountOpen(true)}
                  className="rounded-xl border border-line bg-white px-3.5 py-1.5 text-xs font-semibold text-ink hover:border-accent transition flex items-center gap-2 shadow-sm"
                >
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  <span className="max-w-[120px] truncate">{session.user.email}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent font-bold">
                    {subscription.plan}
                  </span>
                </button>
                <button
                  onClick={() => supabase.auth.signOut()}
                  className="rounded-xl border border-line px-3 py-1.5 text-xs font-semibold text-muted hover:text-rose-600 hover:bg-white transition"
                >
                  Log out
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setAuthMode("login");
                    setAuthOpen(true);
                  }}
                  className="px-3.5 py-1.5 text-xs font-semibold text-ink hover:text-accent transition"
                >
                  Sign In
                </button>
                <button
                  onClick={() => {
                    setAuthMode("signup");
                    setAuthOpen(true);
                  }}
                  className="rounded-xl bg-accent px-4 py-2 text-xs font-bold text-white hover:bg-accent-dark transition shadow-md shadow-accent/25 hover:scale-[1.02] active:scale-[0.98]"
                >
                  Get Started Free
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Page Content */}
      <main className="mx-auto max-w-6xl px-6 py-12 flex-1 space-y-24">
        {/* Hero Section */}
        <section className="grid gap-12 lg:grid-cols-[1.1fr_1fr] lg:items-center pt-4">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-line bg-white text-xs font-semibold text-muted shadow-sm">
              <span className="h-2 w-2 rounded-full bg-accent animate-pulse" />
              <span>Next-Gen Markdown & Thought Management</span>
            </div>

            <h1 className="font-display text-5xl font-bold leading-[1.08] text-ink lg:text-6xl tracking-tight">
              Think clearer. Write faster. Remember everything.
            </h1>

            <p className="max-w-lg text-lg leading-relaxed text-muted font-sans">
              CloudNotes is the distraction-free workspace built for thinkers, engineers, and creators. Write with zero lag, sync instantly across all devices, and get help whenever you need it.
            </p>

            {/* Quick Action Buttons */}
            <div className="flex flex-wrap items-center gap-4 pt-2">
              <button
                onClick={subscribe}
                disabled={busy}
                className="rounded-xl bg-accent px-6 py-3.5 font-bold text-white text-sm hover:bg-accent-dark transition shadow-lg shadow-accent/25 hover:scale-[1.02] active:scale-[0.98]"
              >
                {subscription.subscribed ? "Manage Pro Plan" : busy ? "Opening Checkout…" : "Subscribe for $20 / month"}
              </button>
              <a
                href="#demo"
                className="rounded-xl border border-line bg-white px-5 py-3.5 font-semibold text-xs text-ink hover:bg-paper transition"
              >
                Try Interactive Demo ↓
              </a>
            </div>

            {/* Product Guarantee Badges */}
            <div className="flex items-center gap-6 pt-2 text-xs text-muted font-medium">
              <div className="flex items-center gap-1.5">
                <span className="text-emerald-600 font-bold">✓</span>
                <span>Sub-16ms typing latency</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-emerald-600 font-bold">✓</span>
                <span>End-to-end encrypted</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-emerald-600 font-bold">✓</span>
                <span>30-day money-back guarantee</span>
              </div>
            </div>
          </div>

          {/* Right Column: Hero Quick-Launch Card */}
          <div className="rounded-3xl border border-line bg-white p-6 shadow-xl space-y-5 relative overflow-hidden group">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-rose-400" />
                <span className="h-3 w-3 rounded-full bg-amber-400" />
                <span className="h-3 w-3 rounded-full bg-emerald-400" />
                <span className="text-[11px] font-mono text-muted ml-2">cloudnotes://workspace</span>
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-accent bg-accent/10 px-2 py-0.5 rounded-full">
                {session ? "Workspace Active" : "Instant Cloud Notes"}
              </span>
            </div>

            {session ? (
              <div className="space-y-4">
                <div className="p-4 rounded-2xl bg-paper border border-line space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-ink">Signed in as</span>
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-accent/10 text-accent font-bold">
                      {subscription.plan}
                    </span>
                  </div>
                  <p className="font-mono text-xs text-muted truncate">{session.user.email}</p>
                  <div className="pt-2 flex items-center justify-between text-xs text-ink/80 border-t border-line/60">
                    <span>Stored Notes</span>
                    <span className="font-bold font-mono">
                      {planInfo.count} {planInfo.limit ? `/ ${planInfo.limit} max` : "unlimited"}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => {
                      handleCreateNote();
                      const el = document.getElementById("demo");
                      if (el) el.scrollIntoView({ behavior: "smooth" });
                    }}
                    className="py-3 px-4 rounded-xl bg-accent text-white font-bold text-xs hover:bg-accent-dark transition flex items-center justify-center gap-1.5 shadow-md shadow-accent/20"
                  >
                    <span>+ New Note</span>
                  </button>
                  <a
                    href="#demo"
                    className="py-3 px-4 rounded-xl border border-line bg-paper hover:bg-white text-ink font-semibold text-xs transition flex items-center justify-center text-center"
                  >
                    Open Workspace ↓
                  </a>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <h3 className="font-display text-lg font-bold text-ink">Free Personal Workspace</h3>
                  <p className="text-xs text-muted leading-relaxed">
                    Write in distraction-free Markdown, search with zero latency, and organize your ideas seamlessly.
                  </p>
                </div>

                <div className="space-y-2 p-3 bg-paper rounded-xl border border-line text-xs font-medium text-ink/90">
                  <div className="flex items-center gap-2">
                    <span className="text-accent font-bold">✓</span>
                    <span>10 Personal Notes included on Free Tier</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-accent font-bold">✓</span>
                    <span>800ms Cloud Autosave with version history</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-accent font-bold">✓</span>
                    <span>Pro upgrade available for unlimited notes</span>
                  </div>
                </div>

                <div className="pt-1 flex items-center gap-3">
                  <button
                    onClick={() => {
                      setAuthMode("signup");
                      setAuthOpen(true);
                    }}
                    className="flex-1 py-3 rounded-xl bg-accent text-white font-bold text-xs hover:bg-accent-dark transition text-center shadow-md shadow-accent/20"
                  >
                    Get Started Free →
                  </button>
                  <a
                    href="#demo"
                    className="py-3 px-4 rounded-xl border border-line bg-paper hover:bg-white text-xs font-semibold text-ink transition text-center"
                  >
                    View Demo
                  </a>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Section 2: Products & Ecosystem Suite */}
        <section id="products" className="space-y-8 scroll-mt-24">
          <div className="text-center max-w-2xl mx-auto space-y-2">
            <span className="text-xs font-bold uppercase tracking-wider text-accent">Product Suite</span>
            <h2 className="font-display text-3xl font-bold text-ink md:text-4xl">
              Everything you need to capture, organize, and create.
            </h2>
            <p className="text-sm text-muted">
              Four specialized products unified under one seamless subscription.
            </p>
          </div>

          {/* Product Tabs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 border-b border-line pb-4">
            {productsList.map((p) => {
              const active = selectedProduct === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => setSelectedProduct(p.id)}
                  className={`p-3.5 rounded-2xl text-left transition border ${
                    active ? "bg-white border-accent shadow-sm" : "bg-paper/80 border-line hover:bg-white"
                  }`}
                >
                  <span className="text-[10px] font-bold uppercase tracking-wider text-accent block mb-1">
                    {p.badge}
                  </span>
                  <p className="font-display font-bold text-xs text-ink">{p.title}</p>
                </button>
              );
            })}
          </div>

          {/* Active Product Detailed Card */}
          {(() => {
            const prod = productsList.find((p) => p.id === selectedProduct) || productsList[0];
            return (
              <div className="bg-white rounded-3xl border border-line p-8 shadow-sm grid md:grid-cols-12 gap-8 items-center">
                <div className="md:col-span-6 space-y-4">
                  <span className="text-xs font-bold uppercase px-3 py-1 rounded-full bg-accent/10 text-accent inline-block">
                    {prod.badge}
                  </span>
                  <h3 className="font-display text-2xl font-bold text-ink">{prod.previewHeadline}</h3>
                  <p className="text-sm text-muted leading-relaxed">{prod.previewSnippet}</p>

                  <div className="space-y-2 pt-2">
                    {prod.features.map((f, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs font-medium text-ink">
                        <span className="text-accent font-bold">✓</span>
                        <span>{f}</span>
                      </div>
                    ))}
                  </div>

                  <div className="pt-4">
                    <button
                      onClick={subscribe}
                      className="px-5 py-2.5 rounded-xl bg-ink text-white font-semibold text-xs hover:bg-black transition shadow-sm"
                    >
                      Included with $20/mo Pro Plan →
                    </button>
                  </div>
                </div>

                {/* Mock Visual Container */}
                <div className="md:col-span-6 bg-paper rounded-2xl border border-line p-6 shadow-inner font-mono text-xs space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-line/60">
                    <div className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
                      <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                      <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                    </div>
                    <span className="text-[10px] text-muted">cloudnotes://app/{prod.id}</span>
                  </div>

                  <div className="space-y-2 text-ink/80 text-[11px] leading-relaxed">
                    <p className="font-bold text-ink"># {prod.title}</p>
                    <p className="text-muted italic">{prod.tagline}</p>
                    <div className="p-3 bg-white rounded-xl border border-line font-sans text-xs">
                      {prod.previewSnippet}
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
        </section>

        {/* Section 3: Real Interactive CloudNotes Workspace (Bugs 9, 11, 12, 13, 14, 15, 17) */}
        <section id="demo" className="rounded-3xl border border-line bg-white p-6 md:p-8 shadow-sm space-y-6 scroll-mt-24">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-line pb-4">
            <div>
              <div className="inline-flex items-center gap-2 text-xs font-bold text-accent uppercase tracking-wider mb-1">
                <span>CloudNotes Workspace</span>
              </div>
              <h2 className="font-display text-2xl font-bold text-ink">Your Live Notes & Documents</h2>
              <p className="text-xs text-muted">
                Fast Markdown editor with automatic 800ms debounce cloud autosave, search, tags, and pinning.
              </p>
            </div>

            {/* Plan Usage & Action Badge */}
            <div className="flex items-center gap-3">
              {session ? (
                <div className="flex items-center gap-2 bg-paper px-3.5 py-1.5 rounded-xl border border-line text-xs">
                  <span className="text-muted">Usage:</span>
                  <span className="font-bold text-ink font-mono">
                    {planInfo.count} {planInfo.limit ? `/ ${planInfo.limit} notes` : "notes (Unlimited)"}
                  </span>
                  {!planInfo.pro && (
                    <button
                      onClick={subscribe}
                      disabled={busy}
                      className="ml-2 px-2.5 py-0.5 rounded-md bg-accent text-white text-[11px] font-bold hover:bg-accent-dark transition shadow-sm"
                    >
                      Upgrade
                    </button>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2 bg-amber-50 text-amber-900 border border-amber-200 px-3.5 py-1.5 rounded-xl text-xs font-medium">
                  <span>Guest Mode (Not Saved)</span>
                  <button
                    onClick={() => {
                      setAuthMode("signup");
                      setAuthOpen(true);
                    }}
                    className="ml-2 font-bold underline hover:opacity-80"
                  >
                    Sign In
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Main Two-Column Workspace Layout */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
            {/* Left Column: Notes List & Search Sidebar (Bug 11) */}
            <div className="md:col-span-4 bg-paper/60 rounded-2xl border border-line p-4 space-y-4">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search notes (?q=)…"
                    className="w-full bg-white rounded-xl px-3 py-2 text-xs border border-line text-ink placeholder:text-muted focus:outline-none focus:border-accent"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      className="absolute right-2.5 top-2 text-muted hover:text-ink text-xs"
                    >
                      ✕
                    </button>
                  )}
                </div>
                <button
                  onClick={handleCreateNote}
                  className="px-3 py-2 rounded-xl bg-accent text-white text-xs font-bold hover:bg-accent-dark transition flex items-center gap-1 shadow-sm shrink-0"
                  title="Create new blank note"
                >
                  <span>+</span>
                  <span className="hidden sm:inline">New</span>
                </button>
                <button
                  onClick={() => {
                    if (!session) {
                      setAuthMode("signup");
                      setAuthOpen(true);
                    } else {
                      setAiModalOpen(true);
                    }
                  }}
                  className="px-3 py-2 rounded-xl bg-linear-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-sm shadow-purple-500/20 shrink-0"
                  title="Generate structured note with AI"
                >
                  <span>✨</span>
                  <span className="hidden sm:inline">AI Generate</span>
                </button>
              </div>

              {/* Notes List */}
              <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
                {notesLoading ? (
                  <div className="py-8 text-center text-xs text-muted">Loading notes…</div>
                ) : !session ? (
                  <div className="p-4 rounded-xl border border-dashed border-line bg-white/50 text-center space-y-3">
                    <p className="text-xs text-muted leading-relaxed">
                      You are in guest preview mode. Sign in to sync your notes to the database.
                    </p>
                    <button
                      onClick={() => {
                        setAuthMode("signup");
                        setAuthOpen(true);
                      }}
                      className="px-4 py-2 rounded-xl bg-accent text-white text-xs font-bold hover:bg-accent-dark transition"
                    >
                      Sign In to Save Notes
                    </button>
                  </div>
                ) : notes.length === 0 ? (
                  <div className="py-8 text-center text-xs text-muted space-y-2">
                    <p>{searchQuery ? `No notes matching "${searchQuery}"` : "No notes yet."}</p>
                    <button
                      onClick={handleCreateNote}
                      className="text-accent font-semibold hover:underline"
                    >
                      Create your first note →
                    </button>
                  </div>
                ) : (
                  notes.map((n) => {
                    const isSelected = n.id === selectedNoteId;
                    return (
                      <div
                        key={n.id}
                        onClick={() => selectNote(n)}
                        className={`p-3 rounded-xl border cursor-pointer transition text-left relative group ${
                          isSelected
                            ? "bg-white border-accent shadow-sm ring-1 ring-accent/20"
                            : "bg-white/70 border-line/80 hover:bg-white hover:border-line"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <div className="flex items-center gap-1.5 min-w-0">
                            {n.pinned && (
                              <span className="text-xs shrink-0" title="Pinned to top">
                                📌
                              </span>
                            )}
                            <h4 className="font-semibold text-xs text-ink truncate">
                              {n.title || "Untitled Note"}
                            </h4>
                          </div>
                          <button
                            onClick={(e) => handleDeleteNote(n.id, e)}
                            className="opacity-0 group-hover:opacity-100 text-muted hover:text-rose-600 transition p-1 text-xs shrink-0"
                            title="Delete note"
                          >
                            🗑
                          </button>
                        </div>

                        <p className="text-[11px] text-muted line-clamp-2 leading-relaxed mb-2 font-mono">
                          {n.body || "No content…"}
                        </p>

                        <div className="flex items-center justify-between gap-1 text-[10px] text-muted">
                          <span>
                            {n.updated_at
                              ? new Date(n.updated_at).toLocaleDateString([], {
                                  month: "short",
                                  day: "numeric",
                                })
                              : "Just now"}
                          </span>
                          {n.tags && n.tags.length > 0 && (
                            <div className="flex items-center gap-1 overflow-hidden">
                              {n.tags.slice(0, 2).map((t, i) => (
                                <span
                                  key={i}
                                  className="px-1.5 py-0.2 rounded bg-paper border border-line text-muted font-mono"
                                >
                                  #{t}
                                </span>
                              ))}
                              {n.tags.length > 2 && <span>+{n.tags.length - 2}</span>}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Right Column: Note Editor (Bugs 9, 12, 13, 15) */}
            <div className="md:col-span-8 bg-paper rounded-2xl p-6 border border-line space-y-4">
              {!session ? (
                // Guest Editor Mode (Bug 13)
                <div className="space-y-4">
                  <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 flex items-center justify-between text-xs">
                    <span className="text-amber-900 font-medium">
                      🔒 Guest Mode: Start typing to test. Sign in to save and sync your notes permanently.
                    </span>
                    <button
                      onClick={() => {
                        setAuthMode("signup");
                        setAuthOpen(true);
                      }}
                      className="px-3 py-1 rounded-lg bg-amber-600 text-white font-bold hover:bg-amber-700 transition shrink-0 ml-3"
                    >
                      Sign In to Save
                    </button>
                  </div>

                  <input
                    type="text"
                    value={guestTitle}
                    onChange={(e) => setGuestTitle(e.target.value)}
                    className="font-display text-xl font-bold text-ink bg-transparent focus:outline-none w-full"
                    placeholder="Guest Note Title…"
                  />

                  <textarea
                    rows={10}
                    value={guestBody}
                    onChange={(e) => setGuestBody(e.target.value)}
                    className="w-full bg-transparent font-sans text-xs leading-relaxed text-ink focus:outline-none resize-none border-t border-b border-line/60 py-3"
                    placeholder="Start typing in Markdown…"
                  />

                  <div className="flex items-center justify-between text-[11px] text-muted font-mono">
                    <span>{wordCount} words • {charCount} characters</span>
                    <span className="text-amber-700 font-semibold">● Guest Session (Not Saved)</span>
                  </div>
                </div>
              ) : selectedNoteId ? (
                // Logged-in Note Editor
                <div className="space-y-4">
                  {/* Editor Header & Actions (Bug 15) */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-line/60 pb-3">
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="font-display text-xl font-bold text-ink bg-transparent focus:outline-none flex-1 min-w-0"
                      placeholder="Note Title…"
                    />

                    <div className="flex items-center gap-2 shrink-0">
                      {/* Autosave Status Indicator (Bug 9, 12) */}
                      <div className="text-xs font-mono pr-2">
                        {saveStatus === "saving" && (
                          <span className="text-amber-600 font-medium flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                            Saving…
                          </span>
                        )}
                        {saveStatus === "saved" && (
                          <span className="text-emerald-700 font-semibold flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full bg-emerald-500" />
                            Saved
                          </span>
                        )}
                        {saveStatus === "error" && (
                          <span className="text-rose-600 font-medium flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full bg-rose-500" />
                            Error saving
                          </span>
                        )}
                        {saveStatus === "idle" && (
                          <span className="text-muted">Ready</span>
                        )}
                      </div>

                      {/* Pin Note Button (Bug 15) */}
                      <button
                        onClick={handleTogglePin}
                        className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition flex items-center gap-1 ${
                          editPinned
                            ? "bg-accent/10 border-accent text-accent"
                            : "bg-white border-line text-muted hover:text-ink"
                        }`}
                        title={planInfo.pro ? "Toggle Pin" : "Pinning requires Pro"}
                      >
                        <span>📌</span>
                        <span>{editPinned ? "Pinned" : "Pin"}</span>
                      </button>

                      {/* AI Copilot Dropdown */}
                      <div className="relative">
                        <button
                          onClick={() => setAiAssistOpen(!aiAssistOpen)}
                          disabled={aiAssisting}
                          className="px-3 py-1.5 rounded-lg border border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100 text-xs font-semibold transition flex items-center gap-1.5 shadow-2xs"
                          title="CloudNotes AI Copilot"
                        >
                          <span>{aiAssisting ? "⏳" : "✨"}</span>
                          <span>{aiAssisting ? "Thinking…" : "AI Copilot"}</span>
                          <span className="text-[9px]">▼</span>
                        </button>

                        {aiAssistOpen && (
                          <div className="absolute right-0 mt-1.5 w-52 bg-white rounded-2xl border border-line shadow-xl py-1.5 z-30 animate-in fade-in slide-in-from-top-1 text-xs">
                            <div className="px-3 py-1 text-[10px] uppercase font-bold tracking-wider text-muted border-b border-line/60">
                              AI Note Assistant
                            </div>
                            <button
                              onClick={() => handleAIAssist("summarize")}
                              className="w-full text-left px-3.5 py-2 hover:bg-paper transition flex items-center gap-2 text-ink font-medium"
                            >
                              <span>⚡</span>
                              <span>Generate Summary</span>
                            </button>
                            <button
                              onClick={() => handleAIAssist("polish")}
                              className="w-full text-left px-3.5 py-2 hover:bg-paper transition flex items-center gap-2 text-ink font-medium"
                            >
                              <span>📝</span>
                              <span>Polish & Format Markdown</span>
                            </button>
                            <button
                              onClick={() => handleAIAssist("action_items")}
                              className="w-full text-left px-3.5 py-2 hover:bg-paper transition flex items-center gap-2 text-ink font-medium"
                            >
                              <span>✅</span>
                              <span>Extract Action Checklist</span>
                            </button>
                            <button
                              onClick={() => handleAIAssist("expand")}
                              className="w-full text-left px-3.5 py-2 hover:bg-paper transition flex items-center gap-2 text-ink font-medium"
                            >
                              <span>🔍</span>
                              <span>Expand Key Concepts</span>
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Export Markdown Button (Bug 15) */}
                      <button
                        onClick={handleExport}
                        className="px-3 py-1.5 rounded-lg border border-line bg-white hover:bg-paper text-xs font-semibold text-ink transition flex items-center gap-1"
                        title={planInfo.pro ? "Export Markdown file" : "Export requires Pro"}
                      >
                        <span>⬇</span>
                        <span className="hidden sm:inline">Export</span>
                      </button>

                      {/* Delete Note Button */}
                      <button
                        onClick={(e) => handleDeleteNote(selectedNoteId, e)}
                        className="px-2.5 py-1.5 rounded-lg border border-line bg-white hover:border-rose-400 hover:text-rose-600 text-muted transition text-xs"
                        title="Delete note"
                      >
                        🗑
                      </button>
                    </div>
                  </div>

                  {/* Tags Bar (Bug 15) */}
                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    {editTags.map((t, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-0.5 rounded-md bg-white border border-line text-ink font-mono text-[11px] flex items-center gap-1 shadow-2xs"
                      >
                        #{t}
                        <button
                          onClick={() => handleRemoveTag(t)}
                          className="text-muted hover:text-rose-600 ml-0.5 font-bold"
                          title="Remove tag"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        value={tagInput}
                        onChange={(e) => setTagInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleAddTag(tagInput);
                          }
                        }}
                        placeholder="+ add tag (Enter)"
                        className="bg-transparent border-b border-line px-1.5 py-0.5 text-[11px] font-mono text-ink placeholder:text-muted focus:outline-none focus:border-accent w-28"
                      />
                      {tagInput && (
                        <button
                          onClick={() => handleAddTag(tagInput)}
                          className="text-[11px] text-accent font-bold hover:underline"
                        >
                          Add
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Editor Body Textarea (Bug 9, 12) */}
                  <textarea
                    rows={10}
                    value={editBody}
                    onChange={(e) => setEditBody(e.target.value)}
                    className="w-full bg-transparent font-sans text-xs leading-relaxed text-ink focus:outline-none resize-none pt-2"
                    placeholder="Write your note in Markdown here…"
                  />

                  {/* Editor Bottom Bar */}
                  <div className="flex items-center justify-between text-[11px] text-muted border-t border-line/60 pt-3 font-mono">
                    <span>{wordCount} words • {charCount} characters</span>
                    <span className="text-emerald-700 font-semibold">● Cloud Database Synced</span>
                  </div>
                </div>
              ) : (
                // No Note Selected
                <div className="py-20 text-center space-y-3">
                  <p className="text-muted text-xs">No note selected.</p>
                  <button
                    onClick={handleCreateNote}
                    className="px-4 py-2 rounded-xl bg-accent text-white text-xs font-bold hover:bg-accent-dark transition shadow-md shadow-accent/20"
                  >
                    + Create New Note
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Section 4: Pricing & Subscription Plans */}
        <section id="pricing" className="space-y-8 scroll-mt-24">
          <div className="text-center max-w-xl mx-auto space-y-2">
            <span className="text-xs font-bold uppercase tracking-wider text-accent">Transparent Pricing</span>
            <h2 className="font-display text-3xl font-bold text-ink md:text-4xl">
              Simple, predictable plans.
            </h2>
            <p className="text-sm text-muted">
              Need to cancel or ask about a refund? Use the support chat in the bottom right corner anytime.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {plans.map((p, idx) => (
              <div
                key={idx}
                className={`rounded-3xl border p-8 shadow-sm flex flex-col justify-between transition-all ${
                  p.featured
                    ? "bg-white border-accent ring-2 ring-accent/20 relative"
                    : "bg-white/80 border-line hover:border-line/80"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-display text-xl font-bold text-ink">{p.name}</h3>
                    {p.badge && (
                      <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-accent text-white uppercase">
                        {p.badge}
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-muted leading-relaxed mb-6">{p.desc}</p>

                  <div className="flex items-baseline gap-1.5 mb-6">
                    <span className="font-display text-4xl font-extrabold text-ink">{p.price}</span>
                    <span className="text-xs text-muted font-medium">{p.period}</span>
                  </div>

                  <div className="space-y-2.5 text-xs text-ink/90 border-t border-line/60 pt-5">
                    {p.features.map((f, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <span className="text-accent font-bold">✓</span>
                        <span className="leading-tight">{f}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-8">
                  <button
                    onClick={p.action}
                    disabled={p.featured && busy}
                    className={`w-full py-3 rounded-xl text-xs font-bold transition shadow-sm ${
                      p.featured
                        ? "bg-accent text-white hover:bg-accent-dark shadow-accent/25"
                        : "bg-paper border border-line text-ink hover:bg-white"
                    }`}
                  >
                    {p.cta}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Section 5: Frequently Asked Questions (FAQ) */}
        <section id="faq" className="space-y-6 max-w-3xl mx-auto scroll-mt-24">
          <div className="text-center space-y-2">
            <span className="text-xs font-bold uppercase tracking-wider text-accent">Got Questions?</span>
            <h2 className="font-display text-3xl font-bold text-ink">Frequently Asked Questions</h2>
          </div>

          <div className="space-y-3">
            {faqs.map((f, i) => {
              const isOpen = activeFaq === i;
              return (
                <div
                  key={i}
                  className="rounded-2xl border border-line bg-white overflow-hidden shadow-sm transition"
                >
                  <button
                    onClick={() => setActiveFaq(isOpen ? null : i)}
                    className="w-full p-5 text-left flex items-center justify-between text-xs font-bold text-ink hover:bg-paper/50 transition"
                  >
                    <span>{f.q}</span>
                    <span className="text-muted ml-4">{isOpen ? "−" : "+"}</span>
                  </button>
                  {isOpen && (
                    <div className="px-5 pb-5 text-xs text-muted leading-relaxed border-t border-line/50 pt-3">
                      {f.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-line py-8 bg-white/50 text-xs text-muted">
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-lg bg-accent text-white flex items-center justify-center font-display font-black text-xs">
              C
            </div>
            <span className="font-display font-bold text-ink text-sm">CloudNotes Inc.</span>
          </div>
          <span>© 2026 CloudNotes. Distraction-free workspace for modern thinkers.</span>
        </div>
      </footer>

      {/* Navbar Triggered Auth Modal */}
      <AuthModal
        isOpen={authOpen}
        onClose={() => setAuthOpen(false)}
        initialMode={authMode}
        recovery={recovery}
        onRecovered={() => setRecovery(false)}
      />

      {/* Account Details Modal (Bug 27 fix) */}
      {accountOpen && session && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white border border-line rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl space-y-6">
            <div className="flex items-center justify-between border-b border-line pb-4">
              <div>
                <h3 className="font-display text-2xl font-bold text-ink">Your Account</h3>
                <p className="text-xs text-muted">CloudNotes Workspace Membership</p>
              </div>
              <button
                onClick={() => setAccountOpen(false)}
                className="text-muted hover:text-ink text-sm p-1.5 rounded-full hover:bg-paper transition"
              >
                ✕
              </button>
            </div>

            <dl className="space-y-3.5 text-xs">
              <div className="flex justify-between py-2 border-b border-line/50">
                <dt className="text-muted font-medium">Email Address</dt>
                <dd className="font-semibold text-ink">{session.user.email}</dd>
              </div>
              <div className="flex justify-between py-2 border-b border-line/50">
                <dt className="text-muted font-medium">Current Subscription</dt>
                <dd className="font-bold text-accent font-sans">{subscription.plan}</dd>
              </div>
              <div className="flex justify-between py-2">
                <dt className="text-muted font-medium">Billed Rate</dt>
                <dd className="font-semibold text-ink">{subscription.price}</dd>
              </div>
            </dl>

            <div className="pt-2 space-y-2">
              {!subscription.subscribed ? (
                <button
                  onClick={() => {
                    setAccountOpen(false);
                    subscribe();
                  }}
                  disabled={busy}
                  className="w-full py-3 rounded-xl bg-accent text-white font-bold text-xs hover:bg-accent-dark transition shadow-md shadow-accent/25"
                >
                  {busy ? "Opening Checkout…" : "Upgrade to Pro ($20 / month)"}
                </button>
              ) : (
                <div className="p-3 bg-paper rounded-xl border border-line text-xs text-muted text-center">
                  Your Pro plan is active. To change or cancel your subscription, click the chat in the bottom right corner.
                </div>
              )}
              <button
                onClick={() => setAccountOpen(false)}
                className="w-full py-2.5 rounded-xl border border-line text-xs font-semibold text-muted hover:text-ink transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pro Feature & Free Limit Upgrade Prompt Modal (Bugs 14 & 15) */}
      {proPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white border border-line rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl space-y-6">
            <div className="flex items-center justify-between border-b border-line pb-4">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-xl bg-accent/10 text-accent flex items-center justify-center font-bold text-sm">
                  ✨
                </div>
                <div>
                  <h3 className="font-display text-xl font-bold text-ink">{proPrompt.title}</h3>
                  <span className="text-[10px] uppercase font-bold tracking-wider text-accent">CloudNotes Pro</span>
                </div>
              </div>
              <button
                onClick={() => setProPrompt(null)}
                className="text-muted hover:text-ink text-sm p-1.5 rounded-full hover:bg-paper transition"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-muted leading-relaxed">{proPrompt.message}</p>

            <div className="p-4 bg-paper rounded-2xl border border-line space-y-2 text-xs">
              <span className="font-bold text-ink block text-[11px] uppercase tracking-wider">
                What you get with Pro ($20/month):
              </span>
              <div className="space-y-1.5 text-muted">
                <div className="flex items-center gap-2">
                  <span className="text-accent font-bold">✓</span>
                  <span>Unlimited personal notes (no 10-note limit)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-accent font-bold">✓</span>
                  <span>Pin important notes & create custom tags</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-accent font-bold">✓</span>
                  <span>1-click Markdown document export</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-accent font-bold">✓</span>
                  <span>Instant multi-device cloud synchronization</span>
                </div>
              </div>
            </div>

            <div className="pt-2 space-y-2">
              <button
                onClick={() => {
                  setProPrompt(null);
                  subscribe();
                }}
                disabled={busy}
                className="w-full py-3 rounded-xl bg-accent text-white font-bold text-xs hover:bg-accent-dark transition shadow-md shadow-accent/25"
              >
                {busy ? "Opening Checkout…" : "Upgrade to Pro ($20 / month)"}
              </button>
              <button
                onClick={() => setProPrompt(null)}
                className="w-full py-2.5 rounded-xl border border-line text-xs font-semibold text-muted hover:text-ink transition"
              >
                Maybe Later
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Note Generator Modal */}
      {aiModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white border border-line rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl space-y-6">
            <div className="flex items-center justify-between border-b border-line pb-4">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center font-bold text-base shadow-sm">
                  ✨
                </div>
                <div>
                  <h3 className="font-display text-xl font-bold text-ink">AI Note Generator</h3>
                  <p className="text-[11px] text-muted">CloudNotes Copilot • Powered by Groq LLM</p>
                </div>
              </div>
              <button
                onClick={() => setAiModalOpen(false)}
                className="text-muted hover:text-ink text-sm p-1.5 rounded-full hover:bg-paper transition"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-ink">What should this note be about?</label>
                <textarea
                  rows={4}
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder="e.g. 'Overview of Kubernetes vs Docker Swarm with pros, cons and architecture', or paste messy meeting notes / rough ideas here..."
                  className="w-full bg-paper rounded-xl p-3 text-xs border border-line text-ink placeholder:text-muted focus:outline-none focus:bg-white focus:border-accent transition resize-none"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-ink">Note Format / Style</label>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {[
                    { id: "notes", label: "📝 Structured Notes", desc: "Headings & key takeaways" },
                    { id: "summary", label: "⚡ Executive Summary", desc: "Core points & bullet takeaways" },
                    { id: "action_items", label: "✅ Action Items", desc: "Tasks & to-do checklist" },
                    { id: "study_guide", label: "📚 Study Guide", desc: "Definitions & key concepts" },
                  ].map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setAiStyle(s.id)}
                      className={`p-2.5 rounded-xl border text-left transition ${
                        aiStyle === s.id
                          ? "bg-purple-50 border-purple-400 text-purple-900 shadow-xs"
                          : "bg-paper/70 border-line text-muted hover:bg-white"
                      }`}
                    >
                      <p className="font-bold text-[11px] text-ink">{s.label}</p>
                      <p className="text-[10px] text-muted">{s.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {aiError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700">
                  {aiError}
                </div>
              )}
            </div>

            <div className="pt-2 flex items-center justify-end gap-3 border-t border-line/60">
              <button
                type="button"
                onClick={() => setAiModalOpen(false)}
                className="px-4 py-2.5 rounded-xl border border-line text-xs font-semibold text-muted hover:text-ink transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleGenerateNoteWithAI}
                disabled={aiGenerating || !aiPrompt.trim()}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-bold text-xs transition shadow-md shadow-purple-500/20 disabled:opacity-50 flex items-center gap-2 cursor-pointer"
              >
                {aiGenerating ? (
                  <>
                    <span className="h-3 w-3 rounded-full border-2 border-white border-t-transparent animate-spin" />
                    <span>Drafting Note with AI…</span>
                  </>
                ) : (
                  <>
                    <span>✨</span>
                    <span>Generate Note</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Support Chat Widget in Corner */}
      <ChatWidget session={session} />
    </div>
  );
}
