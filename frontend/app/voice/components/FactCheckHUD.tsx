"use client";

import React, { useState } from "react";

export interface FallacyItem {
  type: string;
  label: string;
  explanation: string;
}

export interface FactCheckCitation {
  title: string;
  publisher?: string;
  url: string;
  date?: string;
  authorityTier?: string;
  stance?: string;
  snippet?: string;
}

export interface FactCheckData {
  credibilityScore: number;
  verdict: "VERIFIED_FACT" | "PARTIALLY_TRUE" | "CONTESTED_NARRATIVE" | "UNVERIFIED_CLAIM" | string;
  verdictLabel: string;
  explanation: string;
  fallaciesDetected?: FallacyItem[];
  primaryCitation?: FactCheckCitation | null;
  citations?: FactCheckCitation[];
  citationsCount?: number;
  latencyMs?: number;
}

interface FactCheckHUDProps {
  data: FactCheckData | null;
  onClose?: () => void;
}

export const FactCheckHUD: React.FC<FactCheckHUDProps> = ({ data, onClose }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!data) return null;

  const score = Math.max(0, Math.min(100, Math.round(data.credibilityScore ?? 70)));
  const fallacies = data.fallaciesDetected || [];
  const primaryCitation = data.primaryCitation;

  // Color scheme based on credibility
  const getScoreTheme = () => {
    if (score >= 80) {
      return {
        bg: "from-emerald-500/20 via-teal-500/10 to-transparent",
        border: "border-emerald-500/40",
        badge: "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
        bar: "bg-emerald-500",
        text: "text-emerald-700 dark:text-emerald-300",
        icon: "✓",
      };
    }
    if (score >= 50) {
      return {
        bg: "from-amber-500/20 via-yellow-500/10 to-transparent",
        border: "border-amber-500/40",
        badge: "bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/30",
        bar: "bg-amber-500",
        text: "text-amber-700 dark:text-amber-300",
        icon: "⚖️",
      };
    }
    return {
      bg: "from-rose-500/25 via-red-500/10 to-transparent",
      border: "border-rose-500/40",
      badge: "bg-rose-500/20 text-rose-700 dark:text-rose-300 border-rose-500/30",
      bar: "bg-rose-500",
      text: "text-rose-700 dark:text-rose-300",
      icon: "⚠️",
    };
  };

  const theme = getScoreTheme();

  return (
    <aside
      aria-label="Live Fact-Check HUD and Credibility Meter"
      className={`w-full max-w-xl mx-auto my-3 rounded-2xl border ${theme.border} bg-white/90 dark:bg-zinc-950/80 backdrop-blur-xl shadow-lg transition-all duration-300 overflow-hidden relative z-20`}
    >
      {/* Top Banner Ticker */}
      <div className={`px-4 py-2.5 bg-gradient-to-r ${theme.bg} flex items-center justify-between gap-3 border-b border-slate-200/50 dark:border-white/5`}>
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex h-2 w-2 relative shrink-0">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${theme.bar}`}></span>
            <span className={`relative inline-flex rounded-full h-2 w-2 ${theme.bar}`}></span>
          </span>
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-200 shrink-0">
            LIVE FACT-CHECK HUD
          </span>
          <span className="text-slate-300 dark:text-zinc-700 shrink-0">•</span>
          <span className={`text-xs font-semibold truncate ${theme.text}`}>
            {data.verdictLabel || "Real-Time Verification"}
          </span>
        </div>

        {/* Truth Meter Score Pill */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-xs font-bold font-mono shadow-xs bg-white/80 dark:bg-zinc-900/90 border-slate-200 dark:border-white/10">
            <span className={theme.text}>{theme.icon}</span>
            <span className="text-slate-900 dark:text-white">{score}%</span>
            <span className="text-[10px] text-slate-400 font-normal">accuracy</span>
          </div>

          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-[11px] px-2 py-0.5 rounded-md border border-slate-200 dark:border-white/10 text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-white transition cursor-pointer"
          >
            {isExpanded ? "Collapse ▲" : "Details ▼"}
          </button>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-white text-xs px-1"
              title="Dismiss HUD"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Accuracy Progress Bar */}
      <div className="h-1 w-full bg-slate-100 dark:bg-white/5 overflow-hidden">
        <div
          className={`h-full transition-all duration-500 ease-out ${theme.bar}`}
          style={{ width: `${score}%` }}
        />
      </div>

      {/* Fallacy Warnings & Main Explanation */}
      <div className="p-3.5 space-y-2.5 text-left">
        {fallacies.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] uppercase font-bold text-rose-600 dark:text-rose-400 tracking-wider mr-1">
              Rhetoric Flagged:
            </span>
            {fallacies.map((f, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-md bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30"
                title={f.explanation}
              >
                <span>⚠️</span>
                <span>{f.label}</span>
              </span>
            ))}
          </div>
        )}

        <p className="text-xs text-slate-700 dark:text-zinc-300 leading-relaxed font-normal">
          {data.explanation}
        </p>

        {/* Primary Verified Citation */}
        {primaryCitation && primaryCitation.url && (
          <div className="pt-2 border-t border-slate-100 dark:border-white/5 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-xs">📜</span>
              <span className="text-[11px] font-semibold text-slate-600 dark:text-zinc-300 truncate max-w-xs">
                {primaryCitation.publisher || primaryCitation.title}
              </span>
              {primaryCitation.date && (
                <span className="text-[10px] text-slate-400 dark:text-zinc-500">
                  ({primaryCitation.date})
                </span>
              )}
            </div>

            <a
              href={primaryCitation.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1 shrink-0"
            >
              <span>View Source</span>
              <span>↗</span>
            </a>
          </div>
        )}

        {/* Expanded Supporting Evidence Drawer */}
        {isExpanded && data.citations && data.citations.length > 0 && (
          <div className="mt-3 pt-3 border-t border-slate-200/60 dark:border-white/10 space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
              Audited Evidence Corpus ({data.citations.length} Sources):
            </p>
            <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
              {data.citations.map((c, idx) => (
                <div
                  key={idx}
                  className="p-2 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200/50 dark:border-white/5 text-xs flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-slate-800 dark:text-zinc-200 truncate text-[11px]">
                      {c.title}
                    </p>
                    <p className="text-[10px] text-slate-400 dark:text-zinc-500 truncate">
                      {c.publisher} {c.date && `• ${c.date}`}
                    </p>
                  </div>
                  {c.url && c.url !== "#" && (
                    <a
                      href={c.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] font-medium text-cyan-600 dark:text-cyan-400 hover:underline shrink-0"
                    >
                      Audit Link ↗
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};

export default FactCheckHUD;
