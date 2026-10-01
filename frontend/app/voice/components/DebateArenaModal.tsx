"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import { API_BASE } from "../../config";
import { FactCheckData } from "./FactCheckHUD";

export interface DebateTurn {
  round: number;
  speaker: "andhbhakt" | "rational" | "moderator";
  speakerName: string;
  speakerAvatar: string;
  text: string;
  audio?: string;
  audioFormat?: string;
  ragSource?: string;
  groundingDetails?: any;
  factCheck?: FactCheckData | null;
}

interface DebateArenaModalProps {
  isOpen: boolean;
  onClose: () => void;
  isDark?: boolean;
  onOpenGroundingDrawer?: (data: any) => void;
}

const PRESET_TOPICS = [
  "Economic Growth vs Inflation & Unemployment",
  "Ram Mandir & Heritage vs Hospital & School Capex",
  "Freebie Social Welfare Doles vs High-Speed Infrastructure",
  "Operation Ganga & Russia-Ukraine Strategic Autonomy",
  "Uniform Civil Code (UCC) & Gender Equality vs Minority Rights",
];

export default function DebateArenaModal({
  isOpen,
  onClose,
  isDark = true,
  onOpenGroundingDrawer,
}: DebateArenaModalProps) {
  const [topic, setTopic] = useState<string>("Economic Growth vs Inflation & Unemployment");
  const [rounds, setRounds] = useState<number>(3);
  const [currentRound, setCurrentRound] = useState<number>(1);
  const [activeSpeaker, setActiveSpeaker] = useState<"andhbhakt" | "rational" | "moderator">("andhbhakt");
  const [isDebating, setIsDebating] = useState<boolean>(false);
  const [isTurnLoading, setIsTurnLoading] = useState<boolean>(false);
  const [isSpeakingAudio, setIsSpeakingAudio] = useState<boolean>(false);
  const [turns, setTurns] = useState<DebateTurn[]>([]);
  const [isPaused, setIsPaused] = useState<boolean>(false);

  // Moderator / Anchor Interruption state
  const [isAnchorMode, setIsAnchorMode] = useState<boolean>(false);
  const [anchorComment, setAnchorComment] = useState<string>("");
  const [debateError, setDebateError] = useState<string | null>(null);

  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);
  const isDebatingRef = useRef(false);
  const isPausedRef = useRef(false);
  const debateTimerRef = useRef<NodeJS.Timeout | null>(null);
  const debateGenerationIdRef = useRef<number>(0);
  const activeFetchAbortControllerRef = useRef<AbortController | null>(null);
  const activeAudioResolveRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    isDebatingRef.current = isDebating;
  }, [isDebating]);

  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, isTurnLoading, isAnchorMode]);

  // Comparative Accuracy & Rhetoric Statistics Barometer
  const stats = useMemo(() => {
    const saffronTurns = turns.filter((t) => t.speaker === "andhbhakt" && t.factCheck);
    const rationalTurns = turns.filter((t) => t.speaker === "rational" && t.factCheck);

    const saffronAvg = saffronTurns.length
      ? Math.round(saffronTurns.reduce((acc, t) => acc + (t.factCheck?.credibilityScore ?? 0), 0) / saffronTurns.length)
      : null;
    const rationalAvg = rationalTurns.length
      ? Math.round(rationalTurns.reduce((acc, t) => acc + (t.factCheck?.credibilityScore ?? 0), 0) / rationalTurns.length)
      : null;

    const totalFallacies = turns.reduce((acc, t) => acc + (t.factCheck?.fallaciesDetected?.length || 0), 0);

    return {
      saffronAvg,
      rationalAvg,
      totalFallacies,
      saffronCount: saffronTurns.length,
      rationalCount: rationalTurns.length,
    };
  }, [turns]);

  // Stop debate and audio on close or unmount
  const stopDebate = () => {
    setIsDebating(false);
    setIsTurnLoading(false);
    setIsPaused(false);
    setIsSpeakingAudio(false);
    setIsAnchorMode(false);
    setDebateError(null);

    // Cancel pending timer
    if (debateTimerRef.current) {
      clearTimeout(debateTimerRef.current);
      debateTimerRef.current = null;
    }

    // Invalidate active generation
    debateGenerationIdRef.current++;

    // Abort in-flight network request
    if (activeFetchAbortControllerRef.current) {
      activeFetchAbortControllerRef.current.abort();
      activeFetchAbortControllerRef.current = null;
    }

    // Resolve any pending audio play promise & cleanup audio
    if (activeAudioResolveRef.current) {
      activeAudioResolveRef.current();
      activeAudioResolveRef.current = null;
    }

    if (audioPlayerRef.current) {
      try {
        audioPlayerRef.current.pause();
        audioPlayerRef.current.src = "";
        audioPlayerRef.current.load();
      } catch (_) {}
      audioPlayerRef.current = null;
    }
  };

  const playTurnAudio = (base64Audio?: string, format = "audio/mp3"): Promise<void> => {
    return new Promise((resolve) => {
      if (!base64Audio) return resolve();

      // Clean up previous audio & resolve pending promise
      if (activeAudioResolveRef.current) {
        activeAudioResolveRef.current();
        activeAudioResolveRef.current = null;
      }
      if (audioPlayerRef.current) {
        try {
          audioPlayerRef.current.pause();
          audioPlayerRef.current.src = "";
        } catch (_) {}
      }

      try {
        const audio = new Audio(`data:${format};base64,${base64Audio}`);
        audio.volume = 1.0;
        audioPlayerRef.current = audio;
        setIsSpeakingAudio(true);

        const cleanup = () => {
          setIsSpeakingAudio(false);
          activeAudioResolveRef.current = null;
          audioPlayerRef.current = null;
          resolve();
        };

        activeAudioResolveRef.current = cleanup;
        audio.onended = cleanup;
        audio.onerror = cleanup;

        audio.play().catch(() => {
          cleanup();
        });
      } catch (_) {
        setIsSpeakingAudio(false);
        activeAudioResolveRef.current = null;
        resolve();
      }
    });
  };

  // Run next debate turn
  const executeDebateTurn = async (speaker: "andhbhakt" | "rational", roundNum: number, currentHistory: DebateTurn[]) => {
    if (!isDebatingRef.current || isPausedRef.current) return;

    // Advance monotonic generation ID so obsolete responses are discarded
    debateGenerationIdRef.current++;
    const thisGenId = debateGenerationIdRef.current;

    // Abort previous in-flight fetch if any
    if (activeFetchAbortControllerRef.current) {
      activeFetchAbortControllerRef.current.abort();
      activeFetchAbortControllerRef.current = null;
    }

    const controller = new AbortController();
    activeFetchAbortControllerRef.current = controller;

    setIsTurnLoading(true);
    setActiveSpeaker(speaker);
    setDebateError(null);

    const token = typeof window !== "undefined" ? localStorage.getItem("chatly_token") : null;

    try {
      const response = await fetch(`${API_BASE}/api/voice/debate/turn`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token || ""}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          topic,
          round: roundNum,
          currentSpeaker: speaker,
          history: currentHistory.map((t) => ({ speaker: t.speaker, text: t.text })),
        }),
      });

      if (thisGenId !== debateGenerationIdRef.current) return;

      if (!response.ok) {
        if (response.status === 429) {
          throw new Error("API rate-limit encountered (429). The system is in cooldown. You can retry or break in.");
        }
        throw new Error(`Server returned ${response.status}`);
      }

      const data = await response.json();
      if (thisGenId !== debateGenerationIdRef.current) return;

      setIsTurnLoading(false);

      const newTurn: DebateTurn = {
        round: roundNum,
        speaker,
        speakerName: data.speakerName,
        speakerAvatar: data.speakerAvatar,
        text: data.reply,
        audio: data.audio,
        audioFormat: data.audioFormat || "audio/mp3",
        ragSource: data.ragSource,
        groundingDetails: data.groundingDetails,
        factCheck: data.factCheck || null,
      };

      const updatedHistory = [...currentHistory, newTurn];
      setTurns(updatedHistory);

      // Play spoken audio for this turn
      if (data.audio && thisGenId === debateGenerationIdRef.current) {
        await playTurnAudio(data.audio, data.audioFormat || "audio/mp3");
      }

      // Check if paused, stopped, or interrupted during speech playback
      if (thisGenId !== debateGenerationIdRef.current || !isDebatingRef.current || isPausedRef.current) return;

      // Clear any previous timer
      if (debateTimerRef.current) {
        clearTimeout(debateTimerRef.current);
        debateTimerRef.current = null;
      }

      // Determine next turn
      if (speaker === "andhbhakt") {
        debateTimerRef.current = setTimeout(() => {
          if (thisGenId === debateGenerationIdRef.current && isDebatingRef.current && !isPausedRef.current) {
            executeDebateTurn("rational", roundNum, updatedHistory);
          }
        }, 800);
      } else {
        if (roundNum < rounds) {
          setCurrentRound(roundNum + 1);
          debateTimerRef.current = setTimeout(() => {
            if (thisGenId === debateGenerationIdRef.current && isDebatingRef.current && !isPausedRef.current) {
              executeDebateTurn("andhbhakt", roundNum + 1, updatedHistory);
            }
          }, 1200);
        } else {
          setIsDebating(false);
          setIsSpeakingAudio(false);
        }
      }
    } catch (err: any) {
      if (err.name === "AbortError" || thisGenId !== debateGenerationIdRef.current) {
        // Deliberately cancelled by anchor interruption or user stop
        return;
      }
      console.error("Debate turn failed:", err);
      setIsTurnLoading(false);
      setIsSpeakingAudio(false);
      setDebateError(err.message || "Failed to generate debate turn.");
    }
  };

  const handleStartDebate = () => {
    stopDebate();
    setTurns([]);
    setCurrentRound(1);
    setIsDebating(true);
    setIsPaused(false);
    setDebateError(null);
    executeDebateTurn("andhbhakt", 1, []);
  };

  const handleTogglePause = () => {
    if (isPaused) {
      setIsPaused(false);
      setDebateError(null);
      // Resume from next speaker
      const lastTurn = turns[turns.length - 1];
      const nextSpeaker = lastTurn?.speaker === "andhbhakt" ? "rational" : "andhbhakt";
      const nextRound = lastTurn?.speaker === "rational" ? currentRound + 1 : currentRound;
      if (nextRound <= rounds) {
        setCurrentRound(nextRound);
        executeDebateTurn(nextSpeaker, nextRound, turns);
      }
    } else {
      setIsPaused(true);
      if (debateTimerRef.current) {
        clearTimeout(debateTimerRef.current);
        debateTimerRef.current = null;
      }
      if (activeAudioResolveRef.current) {
        activeAudioResolveRef.current();
        activeAudioResolveRef.current = null;
      }
      if (audioPlayerRef.current) {
        try {
          audioPlayerRef.current.pause();
        } catch (_) {}
      }
      setIsSpeakingAudio(false);
    }
  };

  // Moderator / Anchor Interruption Handler
  const handleAnchorIntervention = (e: React.FormEvent) => {
    e.preventDefault();
    if (!anchorComment.trim()) return;

    const interventionText = anchorComment.trim();
    setAnchorComment("");
    setIsAnchorMode(false);
    setDebateError(null);

    // Cancel any scheduled timer immediately
    if (debateTimerRef.current) {
      clearTimeout(debateTimerRef.current);
      debateTimerRef.current = null;
    }

    // Invalidate active generation and abort in-flight server fetch
    debateGenerationIdRef.current++;
    if (activeFetchAbortControllerRef.current) {
      activeFetchAbortControllerRef.current.abort();
      activeFetchAbortControllerRef.current = null;
    }

    // Cancel active audio playback immediately
    if (activeAudioResolveRef.current) {
      activeAudioResolveRef.current();
      activeAudioResolveRef.current = null;
    }
    if (audioPlayerRef.current) {
      try {
        audioPlayerRef.current.pause();
        audioPlayerRef.current.src = "";
        audioPlayerRef.current.load();
      } catch (_) {}
      audioPlayerRef.current = null;
    }
    setIsSpeakingAudio(false);

    const anchorTurn: DebateTurn = {
      round: currentRound,
      speaker: "moderator",
      speakerName: "Debate Anchor (You)",
      speakerAvatar: "🎙️",
      text: interventionText,
    };

    const updated = [...turns, anchorTurn];
    setTurns(updated);

    // Opposing speaker directly responds to Anchor
    const nextSpeaker = activeSpeaker === "andhbhakt" ? "rational" : "andhbhakt";
    setIsDebating(true);
    setIsPaused(false);
    executeDebateTurn(nextSpeaker, currentRound, updated);
  };

  // Export Full Formatted Transcript
  const handleExportDebate = () => {
    if (turns.length === 0) return;
    let content = `==========================================================\n`;
    content += `CHATLY AI VS AI CROSSFIRE DEBATE ARENA TRANSCRIPT\n`;
    content += `Topic: ${topic}\n`;
    content += `Date: ${new Date().toLocaleString()}\n`;
    content += `Total Rounds: ${rounds} | Completed Turns: ${turns.length}\n`;
    if (stats.saffronAvg !== null || stats.rationalAvg !== null) {
      content += `Truth Barometer: Saffron Debater (${stats.saffronAvg ?? "--"}%) vs Rationalist Analyst (${stats.rationalAvg ?? "--"}%)\n`;
      content += `Fallacies Flagged: ${stats.totalFallacies}\n`;
    }
    content += `==========================================================\n\n`;

    turns.forEach((t, i) => {
      content += `[Turn ${i + 1} - Round ${t.round}] ${t.speakerName} (${t.speakerAvatar}):\n`;
      content += `${t.text}\n`;
      if (t.factCheck) {
        content += `>> Truth Score: ${t.factCheck.credibilityScore}% | Verdict: ${t.factCheck.verdictLabel}\n`;
        if (t.factCheck.fallaciesDetected?.length) {
          content += `>> Fallacies: ${t.factCheck.fallaciesDetected.map((f) => f.label).join(", ")}\n`;
        }
        if (t.factCheck.primaryCitation) {
          content += `>> Source: ${t.factCheck.primaryCitation.title} (${t.factCheck.primaryCitation.url})\n`;
        }
      }
      content += `\n----------------------------------------------------------\n\n`;
    });

    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `chatly-crossfire-debate-${topic.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-md overflow-hidden animate-in fade-in duration-200">
      <div
        className={`w-full max-w-4xl h-[94vh] max-h-[890px] rounded-3xl border flex flex-col shadow-2xl overflow-hidden ${
          isDark ? "bg-zinc-950 border-white/10 text-white" : "bg-white border-slate-200 text-slate-900"
        }`}
      >
        {/* Top Header */}
        <div
          className={`px-5 py-4 border-b flex items-center justify-between ${
            isDark ? "bg-white/[0.02] border-white/10" : "bg-slate-50 border-slate-200"
          }`}
        >
          <div className="flex items-center gap-3">
            <span className="text-3xl select-none">⚔️</span>
            <div>
              <h2 className="text-base sm:text-lg font-bold tracking-tight flex items-center gap-2">
                Live AI vs. AI "Crossfire" Debate
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-500 border border-amber-500/30 uppercase tracking-wider">
                  Duplex Audio HD
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                Saffron Firebrand (Sarvam Aditya) vs. Rationalist Analyst (Sarvam Priya) with live Truth Meter
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {turns.length > 0 && (
              <button
                type="button"
                onClick={handleExportDebate}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold border transition cursor-pointer border-slate-300 dark:border-white/15 bg-slate-100 hover:bg-slate-200 dark:bg-white/[0.05] dark:hover:bg-white/10"
                title="Export formatted transcript with truth scores"
              >
                📄 Export
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                stopDebate();
                onClose();
              }}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 transition cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Dual Debate Podiums with Live Animated Waveform */}
        <div
          className={`p-3 sm:p-4 border-b grid grid-cols-2 gap-3 sm:gap-6 ${
            isDark ? "bg-white/[0.01] border-white/5" : "bg-slate-100/60 border-slate-200"
          }`}
        >
          {/* Saffron Debater Podium */}
          <div
            className={`p-3.5 sm:p-4 rounded-2xl border transition-all duration-300 flex items-center justify-between gap-3 ${
              isDebating && activeSpeaker === "andhbhakt"
                ? "border-amber-500 bg-amber-500/10 shadow-lg shadow-amber-500/20 scale-[1.01]"
                : "border-slate-200 dark:border-white/5 bg-white/40 dark:bg-white/[0.02] opacity-75"
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="relative shrink-0">
                <div
                  className={`w-11 h-11 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center text-2xl select-none ${
                    isDebating && activeSpeaker === "andhbhakt"
                      ? "bg-gradient-to-tr from-amber-600 to-orange-400 text-white shadow-md shadow-amber-500/40"
                      : "bg-slate-200 dark:bg-white/10"
                  }`}
                >
                  🚩
                </div>
                {isDebating && activeSpeaker === "andhbhakt" && (
                  <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-amber-500"></span>
                  </span>
                )}
              </div>
              <div className="truncate">
                <h4 className="font-bold text-xs sm:text-sm text-amber-600 dark:text-amber-400 truncate">
                  Saffron Debater
                </h4>
                <p className="text-[10px] sm:text-[11px] text-slate-500 dark:text-zinc-400 truncate">
                  Sarvam Aditya • Patriotic Resurgence
                </p>
              </div>
            </div>

            {/* Audio Waveform Bars when Speaking */}
            {isDebating && activeSpeaker === "andhbhakt" && isSpeakingAudio && (
              <div className="flex items-center gap-1 shrink-0 px-2 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <span className="w-1 h-3 bg-amber-500 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                <span className="w-1 h-5 bg-amber-400 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                <span className="w-1 h-2 bg-amber-500 rounded-full animate-bounce"></span>
                <span className="w-1 h-4 bg-amber-400 rounded-full animate-bounce [animation-delay:-0.2s]"></span>
              </div>
            )}
          </div>

          {/* Rationalist Analyst Podium */}
          <div
            className={`p-3.5 sm:p-4 rounded-2xl border transition-all duration-300 flex items-center justify-between gap-3 ${
              isDebating && activeSpeaker === "rational"
                ? "border-cyan-500 bg-cyan-500/10 shadow-lg shadow-cyan-500/20 scale-[1.01]"
                : "border-slate-200 dark:border-white/5 bg-white/40 dark:bg-white/[0.02] opacity-75"
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="relative shrink-0">
                <div
                  className={`w-11 h-11 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center text-2xl select-none ${
                    isDebating && activeSpeaker === "rational"
                      ? "bg-gradient-to-tr from-cyan-600 to-blue-500 text-white shadow-md shadow-cyan-500/40"
                      : "bg-slate-200 dark:bg-white/10"
                  }`}
                >
                  ⚖️
                </div>
                {isDebating && activeSpeaker === "rational" && (
                  <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-cyan-500"></span>
                  </span>
                )}
              </div>
              <div className="truncate">
                <h4 className="font-bold text-xs sm:text-sm text-cyan-600 dark:text-cyan-400 truncate">
                  Rationalist Analyst
                </h4>
                <p className="text-[10px] sm:text-[11px] text-slate-500 dark:text-zinc-400 truncate">
                  Sarvam Priya • Empirical Statistics
                </p>
              </div>
            </div>

            {/* Audio Waveform Bars when Speaking */}
            {isDebating && activeSpeaker === "rational" && isSpeakingAudio && (
              <div className="flex items-center gap-1 shrink-0 px-2 py-1 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
                <span className="w-1 h-3 bg-cyan-500 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                <span className="w-1 h-5 bg-cyan-400 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                <span className="w-1 h-2 bg-cyan-500 rounded-full animate-bounce"></span>
                <span className="w-1 h-4 bg-cyan-400 rounded-full animate-bounce [animation-delay:-0.2s]"></span>
              </div>
            )}
          </div>
        </div>

        {/* Live Truth Meter Barometer */}
        {turns.length > 0 && (
          <div
            className={`px-4 py-2 border-b flex flex-wrap items-center justify-between gap-3 text-xs ${
              isDark ? "bg-white/[0.015] border-white/5" : "bg-slate-100/50 border-slate-200"
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="font-bold text-[11px] text-slate-400 uppercase tracking-wider flex items-center gap-1">
                <span>📊 Truth Barometer:</span>
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-semibold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 text-[11px]">
                🚩 Saffron: {stats.saffronAvg !== null ? `${stats.saffronAvg}% accuracy` : "Pending..."}
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-semibold bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30 text-[11px]">
                ⚖️ Rationalist: {stats.rationalAvg !== null ? `${stats.rationalAvg}% accuracy` : "Pending..."}
              </span>
            </div>

            {stats.totalFallacies > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-bold bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30 text-[10px]">
                ⚠️ {stats.totalFallacies} Rhetorical Fallacies Flagged
              </span>
            )}
          </div>
        )}

        {/* Topic & Controls Bar */}
        <div
          className={`p-3 sm:p-4 border-b space-y-2.5 ${
            isDark ? "bg-white/[0.02] border-white/10" : "bg-slate-50 border-slate-200"
          }`}
        >
          {/* Preset Buttons */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
            <span className="text-[11px] font-semibold text-slate-400 uppercase mr-1 shrink-0">Topic:</span>
            {PRESET_TOPICS.map((preset) => (
              <button
                key={preset}
                type="button"
                disabled={isDebating}
                onClick={() => setTopic(preset)}
                className={`px-3 py-1.5 rounded-xl border text-xs whitespace-nowrap transition cursor-pointer ${
                  topic === preset
                    ? "bg-emerald-600 text-white border-emerald-600 font-semibold"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-100 dark:border-white/10 dark:bg-white/5 dark:text-zinc-400 dark:hover:text-white"
                }`}
              >
                {preset}
              </button>
            ))}
          </div>

          {/* Topic Input + Rounds + Start/Pause/Intervene Buttons */}
          <div className="flex flex-col sm:flex-row items-center gap-2">
            <input
              type="text"
              disabled={isDebating}
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Or enter any custom debate topic..."
              className={`w-full sm:flex-1 px-4 py-2 rounded-xl text-xs border focus:outline-hidden ${
                isDark
                  ? "bg-zinc-900 border-white/10 text-white focus:border-emerald-500"
                  : "bg-white border-slate-300 text-slate-900 focus:border-emerald-600"
              }`}
            />

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <select
                disabled={isDebating}
                value={rounds}
                onChange={(e) => setRounds(Number(e.target.value))}
                className={`px-3 py-2 rounded-xl text-xs border font-semibold ${
                  isDark ? "bg-zinc-900 border-white/10 text-white" : "bg-white border-slate-300 text-slate-800"
                }`}
              >
                <option value={1}>1 Round (2 Turns)</option>
                <option value={2}>2 Rounds (4 Turns)</option>
                <option value={3}>3 Rounds (6 Turns)</option>
                <option value={4}>4 Rounds (8 Turns)</option>
              </select>

              {!isDebating ? (
                <button
                  type="button"
                  onClick={handleStartDebate}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white shadow-md transition cursor-pointer flex items-center gap-1.5 shrink-0"
                >
                  ▶️ Start Debate
                </button>
              ) : (
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={handleTogglePause}
                    className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-white transition cursor-pointer"
                  >
                    {isPaused ? "▶️ Resume" : "⏸️ Pause"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsAnchorMode((prev) => !prev)}
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1 ${
                      isAnchorMode
                        ? "bg-purple-600 text-white ring-2 ring-purple-400"
                        : "bg-purple-500/20 text-purple-600 dark:text-purple-300 border border-purple-500/30 hover:bg-purple-500/30"
                    }`}
                    title="Interrupt debate with an anchor question or fact-check"
                  >
                    🎙️ Break In
                  </button>
                  <button
                    type="button"
                    onClick={stopDebate}
                    className="px-3 py-2 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white transition cursor-pointer"
                  >
                    ⏹️ End
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Anchor Break-In Form */}
          {isAnchorMode && (
            <form
              onSubmit={handleAnchorIntervention}
              className="flex items-center gap-2 p-2 rounded-xl border border-purple-500/40 bg-purple-500/10 animate-in fade-in slide-in-from-top-1 duration-150"
            >
              <span className="text-sm select-none">🎙️</span>
              <input
                type="text"
                value={anchorComment}
                onChange={(e) => setAnchorComment(e.target.value)}
                placeholder="Anchor Interruption: Challenge a debater, clarify facts, or redirect debate..."
                className="flex-1 bg-transparent px-2 py-1 text-xs outline-none text-slate-900 dark:text-white placeholder:text-purple-400"
                autoFocus
              />
              <button
                type="submit"
                disabled={!anchorComment.trim()}
                className="px-3 py-1 rounded-lg text-xs font-bold bg-purple-600 text-white hover:bg-purple-700 transition cursor-pointer disabled:opacity-40"
              >
                Inject Turn →
              </button>
              <button
                type="button"
                onClick={() => setIsAnchorMode(false)}
                className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-white px-1 cursor-pointer"
              >
                ✕
              </button>
            </form>
          )}

          {/* Failure / Rate Limit Banner with Retry */}
          {debateError && (
            <div className="flex items-center justify-between gap-3 p-3 rounded-xl border border-rose-500/40 bg-rose-500/10 text-rose-500 text-xs animate-in fade-in duration-150">
              <div className="flex items-center gap-2">
                <span className="text-base select-none">⚠️</span>
                <span>{debateError}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setDebateError(null);
                    setIsDebating(true);
                    setIsPaused(false);
                    executeDebateTurn(activeSpeaker, currentRound, turns);
                  }}
                  className="px-3 py-1 rounded-lg text-xs font-bold bg-rose-600 text-white hover:bg-rose-700 transition cursor-pointer"
                >
                  Retry Turn 🔄
                </button>
                <button
                  type="button"
                  onClick={() => setDebateError(null)}
                  className="p-1 rounded text-slate-400 hover:text-white transition cursor-pointer"
                >
                  ✕
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Live Debate Transcript Stream */}
        <div className="flex-1 p-4 sm:p-5 overflow-y-auto space-y-4">
          {turns.length === 0 && !isTurnLoading && (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400 dark:text-zinc-500">
              <span className="text-5xl mb-3">🎙️⚔️</span>
              <p className="font-bold text-sm text-slate-700 dark:text-zinc-300">
                Live AI vs. AI Crossfire Arena
              </p>
              <p className="text-xs max-w-md mt-1 leading-relaxed">
                Select a topic and press "Start Debate". Watch two distinct AI minds duel in real time with authentic Indian voices (Sarvam Aditya vs. Priya), live Truth Meter fact-checking, and interactive anchor interruption.
              </p>
            </div>
          )}

          {turns.map((turn, idx) => {
            const isSaffronTurn = turn.speaker === "andhbhakt";
            const isModeratorTurn = turn.speaker === "moderator";

            return (
              <div
                key={idx}
                className={`p-4 rounded-2xl border transition-all animate-in fade-in slide-in-from-bottom-2 duration-200 ${
                  isModeratorTurn
                    ? isDark
                      ? "bg-purple-500/15 border-purple-500/40 text-purple-100 shadow-md shadow-purple-500/10"
                      : "bg-purple-50 border-purple-200 text-purple-950 shadow-xs"
                    : isSaffronTurn
                    ? isDark
                      ? "bg-amber-500/10 border-amber-500/30 text-amber-100"
                      : "bg-amber-50 border-amber-200 text-amber-950"
                    : isDark
                    ? "bg-cyan-500/10 border-cyan-500/30 text-cyan-100"
                    : "bg-cyan-50 border-cyan-200 text-cyan-950"
                }`}
              >
                {/* Turn Header */}
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{turn.speakerAvatar}</span>
                    <span className="font-bold text-xs">
                      {turn.speakerName} {turn.speaker !== "moderator" && `(Round ${turn.round})`}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {/* Truth Meter Score Pill */}
                    {turn.factCheck && (
                      <span
                        className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold border flex items-center gap-1 ${
                          (turn.factCheck.credibilityScore ?? 70) >= 80
                            ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                            : (turn.factCheck.credibilityScore ?? 70) >= 50
                            ? "bg-amber-500/15 border-amber-500/30 text-amber-600 dark:text-amber-400"
                            : "bg-rose-500/15 border-rose-500/30 text-rose-600 dark:text-rose-400"
                        }`}
                        title={turn.factCheck.explanation}
                      >
                        <span>
                          {(turn.factCheck.credibilityScore ?? 70) >= 80
                            ? "✓"
                            : (turn.factCheck.credibilityScore ?? 70) >= 50
                            ? "⚖️"
                            : "⚠️"}
                        </span>
                        <span>Truth: {Math.round(turn.factCheck.credibilityScore ?? 70)}%</span>
                      </span>
                    )}

                    {/* Rhetorical Fallacy Badge */}
                    {turn.factCheck?.fallaciesDetected?.map((f, fi) => (
                      <span
                        key={fi}
                        className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-rose-500/20 text-rose-600 dark:text-rose-300 border border-rose-500/30 animate-pulse"
                        title={f.explanation}
                      >
                        ⚠️ {f.label}
                      </span>
                    ))}

                    {/* Verified Source Link */}
                    {turn.factCheck?.primaryCitation?.url && (
                      <a
                        href={turn.factCheck.primaryCitation.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] px-2 py-0.5 rounded-md hover:underline font-medium text-slate-500 dark:text-zinc-400 hover:text-emerald-500 transition"
                        title={`Verified Source: ${turn.factCheck.primaryCitation.title}`}
                      >
                        📜 Source ↗
                      </a>
                    )}

                    {/* RAG Grounding Indicator */}
                    {turn.ragSource && (
                      <button
                        type="button"
                        onClick={() =>
                          onOpenGroundingDrawer?.({
                            ragSource: turn.ragSource!,
                            groundingDetails: turn.groundingDetails,
                          })
                        }
                        className={`text-[10px] px-2 py-0.5 rounded-full font-medium border cursor-pointer ${
                          isSaffronTurn
                            ? "bg-amber-500/20 border-amber-500/40 text-amber-700 dark:text-amber-300"
                            : "bg-cyan-500/20 border-cyan-500/40 text-cyan-700 dark:text-cyan-300"
                        }`}
                      >
                        {isSaffronTurn ? "🚩 Grounded" : "⚖️ Fact-Checked"} 🔍
                      </button>
                    )}

                    {/* Audio Replay Button */}
                    {turn.audio && (
                      <button
                        type="button"
                        onClick={() => playTurnAudio(turn.audio, turn.audioFormat)}
                        className="text-xs px-2 py-0.5 rounded-md hover:bg-black/10 dark:hover:bg-white/10 transition cursor-pointer font-medium"
                        title="Replay Spoken Audio"
                      >
                        ▶️ Replay
                      </button>
                    )}
                  </div>
                </div>

                {/* Spoken Rebuttal Text */}
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{turn.text}</p>
              </div>
            );
          })}

          {isTurnLoading && (
            <div className="p-4 rounded-2xl border border-dashed border-slate-300 dark:border-white/20 animate-pulse flex items-center gap-3">
              <span className="text-xl">{activeSpeaker === "andhbhakt" ? "🚩" : "⚖️"}</span>
              <span className="text-xs font-semibold text-slate-500 dark:text-zinc-400">
                {activeSpeaker === "andhbhakt" ? "Saffron Debater" : "Rationalist Analyst"} is formulating rebuttal and synthesizing voice...
              </span>
            </div>
          )}

          <div ref={transcriptEndRef} />
        </div>
      </div>
    </div>
  );
}
