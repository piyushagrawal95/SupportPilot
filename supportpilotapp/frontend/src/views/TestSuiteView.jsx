import React, { useState, useEffect } from "react";
import { FlaskConical, Play, CheckCircle2, XCircle, AlertCircle, Shield, RefreshCw } from "lucide-react";
import { api } from "../api";

export default function TestSuiteView() {
  const [suiteData, setSuiteData] = useState(null);
  const [running, setRunning] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("all");

  const runSuite = async () => {
    setRunning(true);
    try {
      const res = await api.runTests();
      setSuiteData(res);
    } catch (err) {
      alert("Failed to run test suite: " + err.message);
    } finally {
      setRunning(false);
    }
  };

  useEffect(() => {
    runSuite();
  }, []);

  const categories = [
    { id: "all", label: "All Tests (30)" },
    { id: "duplicate_charge", label: "Duplicate Charges" },
    { id: "refund", label: "Standard Refunds" },
    { id: "cancellation", label: "Cancellations" },
    { id: "limits", label: "Limits & Caps" },
    { id: "safety", label: "Kill Switch & Modes" },
    { id: "always_human", label: "Disputes & Account Deletion" },
    { id: "security_tricks", label: "Adversarial Injections" },
    { id: "handoff", label: "Live Handoff Triggers" },
    { id: "multi_intent", label: "Multi-Intent" },
    { id: "clarification", label: "Two-Try Hand-off" },
  ];

  const filteredResults = suiteData?.results?.filter(
    (r) => categoryFilter === "all" || r.category === categoryFilter
  ) || [];

  return (
    <div className="p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2.5">
            <FlaskConical className="h-5 w-5 text-indigo-400" />
            <span>Problem 10: 30-Scenario Automated Verification Suite</span>
          </h1>
          <p className="text-xs text-slate-400">
            Guarantees zero regressions across all 5 use cases, adversarial tricks, financial caps, and hand-offs.
          </p>
        </div>

        <button
          onClick={runSuite}
          disabled={running}
          className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-600/30 transition flex items-center gap-2 disabled:opacity-50"
        >
          <Play className={`h-3.5 w-3.5 ${running ? "animate-spin" : ""}`} />
          <span>{running ? "Executing 30 Scenarios…" : "Re-run Verification Suite"}</span>
        </button>
      </div>

      {/* Top Results Banner */}
      {suiteData && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 shadow-lg">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Total Scenarios</span>
            <p className="text-2xl font-black font-mono text-white mt-1">{suiteData.total}</p>
          </div>

          <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 shadow-lg">
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">Passed</span>
            <p className="text-2xl font-black font-mono text-emerald-300 mt-1">{suiteData.passed}</p>
          </div>

          <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 shadow-lg">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Failed</span>
            <p className={`text-2xl font-black font-mono mt-1 ${suiteData.failed > 0 ? "text-rose-400" : "text-slate-400"}`}>
              {suiteData.failed}
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 shadow-lg">
            <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400">Accuracy Rate</span>
            <p className="text-2xl font-black font-mono text-indigo-300 mt-1">{suiteData.pass_rate_pct}%</p>
          </div>
        </div>
      )}

      {/* Category Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-slate-800/80 text-xs">
        {categories.map((c) => {
          const isActive = categoryFilter === c.id;
          return (
            <button
              key={c.id}
              onClick={() => setCategoryFilter(c.id)}
              className={`px-3 py-1.5 rounded-xl font-semibold whitespace-nowrap transition ${
                isActive
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "bg-slate-900/60 border border-slate-800 text-slate-400 hover:text-white"
              }`}
            >
              {c.label}
            </button>
          );
        })}
      </div>

      {/* Test Scenarios Table */}
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl shadow-xl overflow-hidden backdrop-blur-sm">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-950/60 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              <th className="py-3 px-4 w-12">#</th>
              <th className="py-3 px-4">Scenario</th>
              <th className="py-3 px-4">Category</th>
              <th className="py-3 px-4">Expected Rule</th>
              <th className="py-3 px-4">Actual Rule</th>
              <th className="py-3 px-4 text-right">Result</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 font-mono">
            {filteredResults.map((t) => (
              <tr key={t.id} className="hover:bg-slate-800/40 transition">
                <td className="py-3 px-4 text-slate-500">{t.id}</td>
                <td className="py-3 px-4 font-sans font-medium text-slate-200">
                  <p>{t.name}</p>
                  <p className="text-[11px] text-slate-500 font-sans mt-0.5">{t.description}</p>
                </td>
                <td className="py-3 px-4 text-slate-400 text-[11px] capitalize">
                  {t.category.replace("_", " ")}
                </td>
                <td className="py-3 px-4 text-indigo-300 text-[11px]">{t.expected_rule}</td>
                <td className="py-3 px-4 text-slate-300 text-[11px]">{t.actual_rule}</td>
                <td className="py-3 px-4 text-right">
                  {t.passed ? (
                    <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      <CheckCircle2 className="h-3 w-3" /> PASS
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                      <XCircle className="h-3 w-3" /> FAIL
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
