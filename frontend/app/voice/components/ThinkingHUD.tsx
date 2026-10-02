"use client";

import React, { useState } from "react";

export interface ThinkingStep {
  stepIndex: number;
  phase: "PLANNING" | "TOOL_EXECUTION" | "TOOL_OBSERVATION" | "EVALUATION" | "CRITIQUE" | "SYNTHESIS" | string;
  title: string;
  thought?: string;
  tool?: string;
  args?: any;
  observation?: string;
  status: "in_progress" | "completed" | "error";
  timestamp?: number;
}

interface ThinkingLiveStepperProps {
  steps: ThinkingStep[];
  currentPhase?: string;
}

export const ThinkingLiveStepper: React.FC<ThinkingLiveStepperProps> = ({ steps, currentPhase }) => {
  const [showDetails, setShowDetails] = useState(false);
  const latestStep = steps.length > 0 ? steps[steps.length - 1] : null;

  const phases = [
    { key: "PLANNING", label: "Plan", icon: "📋" },
    { key: "TOOL_EXECUTION", label: "Tools", icon: "⚡" },
    { key: "EVALUATION", label: "Evaluate", icon: "🔍" },
    { key: "CRITIQUE", label: "Critique", icon: "⚖️" },
    { key: "SYNTHESIS", label: "Synthesize", icon: "✨" },
  ];

  const getPhaseIndex = (p?: string) => {
    if (!p) return 0;
    if (p.includes("PLAN")) return 0;
    if (p.includes("TOOL")) return 1;
    if (p.includes("EVAL")) return 2;
    if (p.includes("CRIT")) return 3;
    if (p.includes("SYNTH")) return 4;
    return 1;
  };

  const activeIdx = latestStep ? getPhaseIndex(latestStep.phase) : 0;

  return (
    <div className="w-full max-w-xl mx-auto my-2 rounded-2xl border border-purple-500/30 bg-purple-950/20 backdrop-blur-md p-4 text-purple-100 shadow-[0_4px_24px_rgba(168,85,247,0.15)] animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-purple-500"></span>
          </span>
          <span className="text-xs font-semibold uppercase tracking-wider text-purple-300">
            Cognitive Thinking Engine
          </span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 border border-purple-500/40 text-purple-200">
            Step {steps.length}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setShowDetails(!showDetails)}
          className="text-xs text-purple-300 hover:text-purple-100 transition cursor-pointer flex items-center gap-1"
        >
          <span>{showDetails ? "Hide stream" : "View reasoning"}</span>
          <span className="text-[10px]">{showDetails ? "▲" : "▼"}</span>
        </button>
      </div>

      {/* Progress Stepper Bar */}
      <div className="grid grid-cols-5 gap-1.5 mb-3">
        {phases.map((item, idx) => {
          const isDone = activeIdx > idx;
          const isCurrent = activeIdx === idx;
          return (
            <div
              key={item.key}
              className={`flex flex-col items-center justify-center p-1.5 rounded-xl border text-center transition-all ${
                isCurrent
                  ? "border-purple-400 bg-purple-500/30 text-white shadow-[0_0_12px_rgba(168,85,247,0.4)] scale-102"
                  : isDone
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                  : "border-purple-500/15 bg-purple-900/10 text-purple-400/60"
              }`}
            >
              <span className="text-xs">{item.icon}</span>
              <span className="text-[9px] font-semibold mt-0.5 truncate w-full">{item.label}</span>
            </div>
          );
        })}
      </div>

      {/* Active Thought Snapshot */}
      {latestStep && (
        <div className="rounded-xl border border-purple-500/20 bg-black/25 p-2.5 text-xs text-purple-200/90">
          <div className="flex items-center gap-2 font-medium text-purple-300 mb-1">
            <span className="text-xs">
              {latestStep.phase === "TOOL_EXECUTION" ? "⚡" : latestStep.phase === "CRITIQUE" ? "⚖️" : "💭"}
            </span>
            <span className="font-semibold">{latestStep.title}</span>
            {latestStep.tool && (
              <span className="ml-auto font-mono text-[10px] px-2 py-0.5 rounded bg-sky-500/20 border border-sky-500/40 text-sky-200">
                {latestStep.tool}
              </span>
            )}
          </div>
          {latestStep.thought && (
            <p className="text-[11px] leading-relaxed text-purple-200/80 italic line-clamp-2">
              "{latestStep.thought}"
            </p>
          )}
        </div>
      )}

      {/* Expanded Live Reasoning Log */}
      {showDetails && (
        <div className="mt-3 max-h-56 overflow-y-auto space-y-2 pr-1 rounded-xl border border-purple-500/20 bg-black/35 p-2.5 text-[11px] font-mono">
          {steps.map((st, i) => (
            <div key={i} className="border-b border-purple-500/10 pb-1.5 last:border-b-0 last:pb-0">
              <div className="flex items-center justify-between text-purple-300 font-semibold mb-0.5">
                <span>#{st.stepIndex} [{st.phase}]</span>
                <span className="text-[9px] text-purple-400">{st.title}</span>
              </div>
              {st.thought && <div className="text-zinc-300 whitespace-pre-wrap">{st.thought}</div>}
              {st.tool && (
                <div className="text-sky-300 mt-0.5">
                  &gt; Tool: {st.tool} ({JSON.stringify(st.args || {})})
                </div>
              )}
              {st.observation && (
                <div className="text-emerald-300/90 mt-0.5 line-clamp-3">
                  &lt; Observation: {st.observation}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

interface ThinkingAccordionProps {
  steps?: ThinkingStep[];
  totalLatencyMs?: number;
}

export const ThinkingAccordion: React.FC<ThinkingAccordionProps> = ({ steps, totalLatencyMs }) => {
  const [isOpen, setIsOpen] = useState(false);

  if (!steps || steps.length === 0) return null;

  // Extract tools invoked
  const toolsUsed = steps
    .filter((s) => s.phase === "TOOL_EXECUTION" && s.tool)
    .map((s) => s.tool as string);
  const uniqueTools = Array.from(new Set(toolsUsed));

  return (
    <div className="my-2 rounded-xl border border-purple-500/30 bg-purple-950/15 text-purple-200 text-xs overflow-hidden transition-all shadow-xs">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 py-2 bg-purple-900/20 hover:bg-purple-900/30 transition text-left cursor-pointer"
      >
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm">🧠</span>
          <span className="font-semibold text-purple-300">Thought Process</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 border border-purple-500/30 text-purple-200">
            {steps.length} cognitive steps
          </span>
          {uniqueTools.length > 0 && (
            <div className="flex items-center gap-1">
              {uniqueTools.map((t) => (
                <span
                  key={t}
                  className="text-[9px] px-1.5 py-0.2 rounded bg-sky-500/20 border border-sky-500/30 text-sky-200"
                >
                  ⚡ {t}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-purple-300 text-xs">
          <span>{isOpen ? "Hide" : "Show"}</span>
          <span className="text-[10px]">{isOpen ? "▲" : "▼"}</span>
        </div>
      </button>

      {isOpen && (
        <div className="p-3 space-y-3 bg-black/20 border-t border-purple-500/20 divide-y divide-purple-500/10">
          {steps.map((step, idx) => {
            const isPlan = step.phase === "PLANNING";
            const isTool = step.phase === "TOOL_EXECUTION";
            const isObs = step.phase === "TOOL_OBSERVATION";
            const isCritique = step.phase === "CRITIQUE";
            const isSynthesis = step.phase === "SYNTHESIS";

            const badgeColor = isPlan
              ? "bg-violet-500/20 text-violet-300 border-violet-500/30"
              : isTool
              ? "bg-sky-500/20 text-sky-300 border-sky-500/30"
              : isObs
              ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
              : isCritique
              ? "bg-amber-500/20 text-amber-300 border-amber-500/30"
              : "bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/30";

            return (
              <div key={idx} className="pt-2 first:pt-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border font-mono font-bold ${badgeColor}`}>
                    {step.phase}
                  </span>
                  <span className="font-semibold text-purple-100 text-[11px]">{step.title}</span>
                </div>

                {step.thought && (
                  <p className="text-zinc-300 text-[11px] leading-relaxed whitespace-pre-wrap ml-1 pl-2 border-l-2 border-purple-500/30">
                    {step.thought}
                  </p>
                )}

                {step.tool && (
                  <div className="mt-1.5 ml-1 p-2 rounded-lg bg-sky-950/40 border border-sky-500/30 text-sky-200 text-[10px] font-mono">
                    <span className="font-bold text-sky-400">Tool: {step.tool}</span>
                    <pre className="mt-1 whitespace-pre-wrap text-[10px] text-zinc-300">
                      {JSON.stringify(step.args || {}, null, 2)}
                    </pre>
                  </div>
                )}

                {step.observation && (
                  <div className="mt-1.5 ml-1 p-2 rounded-lg bg-emerald-950/30 border border-emerald-500/30 text-emerald-200 text-[10px]">
                    <span className="font-bold text-emerald-400">Observation:</span>
                    <p className="mt-1 whitespace-pre-wrap line-clamp-6 text-zinc-300">
                      {step.observation}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
