"use client";

import React from "react";

export interface GroundingDrawerData {
  ragSource: string;
  groundingDetails?: {
    type?: string;
    topic?: string;
    score?: number;
    criticism?: string;
    counterArgument?: string;
    statsAndFacts?: string;
    whataboutism?: string;
    targetEntity?: string;
    counterEntity?: string;
    signatureCatchphrase?: string;
    claim?: string;
    context?: string;
    factCheckSummary?: string;
    sourceType?: string;
    sourceUrl?: string;
    sourceTitle?: string;
    section?: string;
    text?: string;
  } | null;
  messageText?: string;
}

interface GroundingSourceDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  data: GroundingDrawerData | null;
  isDark?: boolean;
}

export default function GroundingSourceDrawer({
  isOpen,
  onClose,
  data,
  isDark = true,
}: GroundingSourceDrawerProps) {
  if (!isOpen || !data) return null;

  const details = data.groundingDetails;
  const isSaffron = data.ragSource.includes("political_debate_rag") || details?.type === "political_debate_rag";
  const isFactCheck = data.ragSource.includes("fact_checks_rag") || details?.type === "fact_checks_rag";
  const scorePercent = details?.score ? Math.min(Math.round(details.score * 100), 99) : 85;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden flex justify-end">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Sliding Sheet Panel */}
      <div
        className={`relative z-10 w-full max-w-lg h-full overflow-y-auto shadow-2xl transition-transform flex flex-col ${
          isDark ? "bg-zinc-950 border-l border-white/10 text-white" : "bg-white border-l border-slate-200 text-slate-900"
        }`}
      >
        {/* Header */}
        <div className={`p-5 border-b flex items-center justify-between sticky top-0 backdrop-blur-md z-10 ${
          isDark ? "bg-zinc-950/90 border-white/10" : "bg-white/90 border-slate-200"
        }`}>
          <div className="flex items-center gap-3">
            <span className="text-2xl select-none">
              {isSaffron ? "🚩" : isFactCheck ? "⚖️" : "🧠"}
            </span>
            <div>
              <h3 className="font-bold text-base tracking-tight">
                {isSaffron ? "GraphRAG Debate Grounding" : isFactCheck ? "Verified Fact-Check Analysis" : "Knowledge Grounding Details"}
              </h3>
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                Source: {data.ragSource}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 transition cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-5 flex-1">
          {/* Similarity & Neural Rerank Confidence Score */}
          <div className={`p-4 rounded-2xl border ${
            isDark ? "bg-white/[0.03] border-white/5" : "bg-slate-50 border-slate-200"
          }`}>
            <div className="flex justify-between items-center mb-1.5 text-xs font-semibold">
              <span className="text-slate-500 dark:text-zinc-400">Dense & Lexical Rerank Score</span>
              <span className={isSaffron ? "text-amber-500" : isFactCheck ? "text-cyan-500" : "text-emerald-500"}>
                {details?.score ? details.score.toFixed(3) : "0.520"} ({scorePercent}% match)
              </span>
            </div>
            <div className="w-full bg-slate-200 dark:bg-white/10 h-2 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  isSaffron ? "bg-gradient-to-r from-amber-500 to-orange-500" : isFactCheck ? "bg-gradient-to-r from-cyan-500 to-blue-500" : "bg-emerald-500"
                }`}
                style={{ width: `${scorePercent}%` }}
              />
            </div>
          </div>

          {/* Core Matched Topic or Evaluated Claim */}
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500 block mb-1.5">
              {isFactCheck ? "Evaluated Viral Claim" : "Matched Debate Topic"}
            </label>
            <div className={`p-3.5 rounded-xl border text-sm font-semibold leading-snug ${
              isDark ? "bg-white/5 border-white/10 text-zinc-100" : "bg-slate-100 border-slate-200 text-slate-800"
            }`}>
              {details?.topic || details?.claim || "National Governance & Resurgence"}
            </div>
          </div>

          {/* Saffron Debater Graph Relations (Neo4j / GraphRAG) */}
          {isSaffron && details && (
            <div className="space-y-4">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500 block">
                Graph Knowledge Relationships
              </label>

              {/* Target vs Counter Entity Badges */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                  <span className="text-[10px] uppercase font-bold block opacity-75">Target Entity Defended</span>
                  <span className="font-semibold text-sm">{details.targetEntity || "Government / Nation"}</span>
                </div>
                <div className="p-3 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300">
                  <span className="text-[10px] uppercase font-bold block opacity-75">Contrasting Opponent</span>
                  <span className="font-semibold text-sm">{details.counterEntity || "Opposition"}</span>
                </div>
              </div>

              {/* Verified Rebuttal Point */}
              {details.counterArgument && (
                <div className={`p-3.5 rounded-xl border text-xs leading-relaxed ${
                  isDark ? "bg-amber-500/10 border-amber-500/30 text-amber-200" : "bg-amber-50 border-amber-200 text-amber-900"
                }`}>
                  <strong className="block text-amber-600 dark:text-amber-400 font-bold mb-1">
                    🎯 Verified Grounded Rebuttal:
                  </strong>
                  {details.counterArgument}
                </div>
              )}

              {/* Hard Stats & Data */}
              {details.statsAndFacts && (
                <div className={`p-3.5 rounded-xl border text-xs leading-relaxed ${
                  isDark ? "bg-white/5 border-white/10 text-zinc-300" : "bg-slate-50 border-slate-200 text-slate-700"
                }`}>
                  <strong className="block text-slate-900 dark:text-white font-bold mb-1">
                    📊 Verified Hard Data & Metrics:
                  </strong>
                  {details.statsAndFacts}
                </div>
              )}

              {/* Whataboutism / Pre-2014 Contrast */}
              {details.whataboutism && (
                <div className={`p-3.5 rounded-xl border text-xs leading-relaxed ${
                  isDark ? "bg-purple-500/10 border-purple-500/30 text-purple-200" : "bg-purple-50 border-purple-200 text-purple-900"
                }`}>
                  <strong className="block text-purple-600 dark:text-purple-400 font-bold mb-1">
                    🏛️ Historical Contrast / Pre-2014 Comparison:
                  </strong>
                  {details.whataboutism}
                </div>
              )}
            </div>
          )}

          {/* Fact-Check Details (Rationalist) */}
          {isFactCheck && details && (
            <div className="space-y-4">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500 block">
                Fact-Check Verdict & Evidence
              </label>

              {/* Verdict Summary */}
              {details.factCheckSummary && (
                <div className={`p-3.5 rounded-xl border text-xs leading-relaxed ${
                  isDark ? "bg-cyan-500/10 border-cyan-500/30 text-cyan-200" : "bg-cyan-50 border-cyan-200 text-cyan-900"
                }`}>
                  <strong className="block text-cyan-600 dark:text-cyan-400 font-bold mb-1">
                    ⚖️ Independent Fact-Check Verdict:
                  </strong>
                  {details.factCheckSummary}
                </div>
              )}

              {/* Context */}
              {details.context && (
                <div className={`p-3.5 rounded-xl border text-xs leading-relaxed ${
                  isDark ? "bg-white/5 border-white/10 text-zinc-300" : "bg-slate-50 border-slate-200 text-slate-700"
                }`}>
                  <strong className="block text-slate-900 dark:text-white font-bold mb-1">
                    🔍 Viral Context & Origin:
                  </strong>
                  {details.context}
                </div>
              )}
            </div>
          )}

          {/* Verified Source URL Link */}
          {details?.sourceUrl && (
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500 block mb-1.5">
                Official Grounding Citation
              </label>
              <a
                href={details.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={`p-3.5 rounded-xl border flex items-center justify-between transition group cursor-pointer ${
                  isDark ? "bg-white/5 border-white/10 hover:border-emerald-500/50 hover:bg-emerald-500/5 text-zinc-200" : "bg-slate-50 border-slate-200 hover:border-emerald-500/50 hover:bg-emerald-50 text-slate-800"
                }`}
              >
                <div className="truncate pr-3">
                  <span className="font-semibold text-xs block truncate group-hover:text-emerald-500">
                    {details.sourceTitle || details.sourceUrl}
                  </span>
                  <span className="text-[10px] text-slate-400 dark:text-zinc-500 truncate block">
                    {details.sourceUrl}
                  </span>
                </div>
                <span className="text-sm select-none opacity-70 group-hover:opacity-100 group-hover:translate-x-0.5 transition">
                  ↗️
                </span>
              </a>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={`p-4 border-t flex justify-end ${
          isDark ? "bg-zinc-950 border-white/10" : "bg-white border-slate-200"
        }`}>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 dark:bg-white/10 dark:hover:bg-white/15 dark:text-white transition cursor-pointer"
          >
            Close Sheet
          </button>
        </div>
      </div>
    </div>
  );
}
