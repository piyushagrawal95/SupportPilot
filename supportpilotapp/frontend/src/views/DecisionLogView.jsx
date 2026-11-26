import React, { useState, useEffect } from "react";
import { FileCheck2, ChevronDown, ChevronUp, CheckCircle, ShieldCheck } from "lucide-react";
import { api } from "../api";

export default function DecisionLogView() {
  const [logs, setLogs] = useState([]);
  const [openIds, setOpenIds] = useState(new Set([1, 2, 3])); // Open first 3 by default

  useEffect(() => {
    api.getDecisionLog().then(setLogs).catch(console.error);
  }, []);

  const toggle = (id) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandAll = () => setOpenIds(new Set(logs.map((l) => l.problem_id)));
  const collapseAll = () => setOpenIds(new Set());

  return (
    <div className="p-8 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2.5">
            <FileCheck2 className="h-5 w-5 text-indigo-400" />
            <span>Architecture Decision Log (10 Problems)</span>
          </h1>
          <p className="text-xs text-slate-400">
            Formal engineering defense justifying the architectural decisions, trade-offs, and empirical verification.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <button
            onClick={expandAll}
            className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-white"
          >
            Expand All
          </button>
          <button
            onClick={collapseAll}
            className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-white"
          >
            Collapse All
          </button>
        </div>
      </div>

      {/* Accordions */}
      <div className="space-y-4">
        {logs.map((log) => {
          const isOpen = openIds.has(log.problem_id);

          return (
            <div
              key={log.problem_id}
              className="bg-slate-900/60 border border-slate-800/80 rounded-2xl shadow-xl overflow-hidden backdrop-blur-sm transition"
            >
              {/* Header Toggle */}
              <button
                onClick={() => toggle(log.problem_id)}
                className="w-full p-5 text-left flex items-center justify-between hover:bg-slate-800/40 transition"
              >
                <div className="flex items-center gap-3.5">
                  <div className="h-7 w-7 rounded-lg bg-indigo-500/20 text-indigo-300 flex items-center justify-center font-bold text-xs font-mono">
                    #{log.problem_id}
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white tracking-tight">
                      Problem {log.problem_id}: {log.title}
                    </h3>
                    <p className="text-xs text-emerald-400 font-semibold mt-0.5">
                      Chosen: {log.chosen}
                    </p>
                  </div>
                </div>

                {isOpen ? (
                  <ChevronUp className="h-4 w-4 text-slate-400" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-slate-400" />
                )}
              </button>

              {/* Body */}
              {isOpen && (
                <div className="px-5 pb-5 pt-2 border-t border-slate-800/80 text-xs space-y-4 text-slate-300 leading-relaxed">
                  {/* Options Considered */}
                  <div>
                    <h4 className="font-bold text-slate-400 uppercase text-[10px] tracking-wider mb-1.5">
                      1. Options Considered
                    </h4>
                    <ul className="list-disc list-inside space-y-1 text-slate-300 pl-1">
                      {log.options_considered.map((opt, i) => (
                        <li key={i}>{opt}</li>
                      ))}
                    </ul>
                  </div>

                  {/* Why We Chose It */}
                  <div>
                    <h4 className="font-bold text-indigo-400 uppercase text-[10px] tracking-wider mb-1">
                      2. What We Chose and Why
                    </h4>
                    <p className="p-3 bg-slate-950/80 rounded-xl border border-slate-800 text-slate-200">
                      {log.why}
                    </p>
                  </div>

                  {/* Empirical Evidence */}
                  <div>
                    <h4 className="font-bold text-emerald-400 uppercase text-[10px] tracking-wider mb-1">
                      3. Evidence that it Works (Test / Metric)
                    </h4>
                    <p className="font-mono text-emerald-300 p-2.5 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
                      {log.evidence}
                    </p>
                  </div>

                  {/* Trade-off / What We Gave Up */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                    <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
                      <h4 className="font-bold text-amber-400 uppercase text-[10px] tracking-wider mb-1">
                        4. What We Gave Up (Trade-off)
                      </h4>
                      <p className="text-slate-400">{log.what_we_gave_up}</p>
                    </div>

                    <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
                      <h4 className="font-bold text-purple-400 uppercase text-[10px] tracking-wider mb-1">
                        5. What Would Make Us Change Our Mind
                      </h4>
                      <p className="text-slate-400">{log.what_would_change_mind}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
