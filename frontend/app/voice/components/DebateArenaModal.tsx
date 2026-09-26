"use client";

import React, { useState, useRef, useEffect } from "react";
import { API_BASE } from "../../config";

export interface DebateTurn {
  round: number;
  speaker: "andhbhakt" | "rational";
  speakerName: string;
  speakerAvatar: string;
  text: string;
  audio?: string;
  audioFormat?: string;
  ragSource?: string;
  groundingDetails?: any;
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
  const [activeSpeaker, setActiveSpeaker] = useState<"andhbhakt" | "rational">("andhbhakt");
  const [isDebating, setIsDebating] = useState<boolean>(false);
  const [isTurnLoading, setIsTurnLoading] = useState<boolean>(false);
  const [turns, setTurns] = useState<DebateTurn[]>([]);
  const [isPaused, setIsPaused] = useState<boolean>(false);

  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);
  const isDebatingRef = useRef(false);
  const isPausedRef = useRef(false);

  useEffect(() => {
    isDebatingRef.current = isDebating;
  }, [isDebating]);

  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, isTurnLoading]);

  // Stop debate and audio on close or unmount
  const stopDebate = () => {
    setIsDebating(false);
    setIsTurnLoading(false);
    setIsPaused(false);
    if (audioPlayerRef.current) {
      try {
        audioPlayerRef.current.pause();
      } catch (_) {}
      audioPlayerRef.current = null;
    }
  };

  const playTurnAudio = (base64Audio?: string, format = "audio/wav"): Promise<void> => {
    return new Promise((resolve) => {
      if (!base64Audio) return resolve();

      if (audioPlayerRef.current) {
        try {
          audioPlayerRef.current.pause();
        } catch (_) {}
      }

      try {
        const audio = new Audio(`data:${format};base64,${base64Audio}`);
        audio.volume = 1.0;
        audioPlayerRef.current = audio;

        audio.onended = () => {
          audioPlayerRef.current = null;
          resolve();
        };

        audio.onerror = () => {
          audioPlayerRef.current = null;
          resolve();
        };

        audio.play().catch(() => resolve());
      } catch (_) {
        resolve();
      }
    });
  };

  // Run next debate turn
  const executeDebateTurn = async (speaker: "andhbhakt" | "rational", roundNum: number, currentHistory: DebateTurn[]) => {
    if (!isDebatingRef.current || isPausedRef.current) return;

    setIsTurnLoading(true);
    setActiveSpeaker(speaker);

    const token = typeof window !== "undefined" ? localStorage.getItem("chatly_token") : null;

    try {
      const response = await fetch(`${API_BASE}/api/voice/debate/turn`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token || ""}`,
        },
        body: JSON.stringify({
          topic,
          round: roundNum,
          currentSpeaker: speaker,
          history: currentHistory.map((t) => ({ speaker: t.speaker, text: t.text })),
        }),
      });

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }

      const data = await response.json();
      setIsTurnLoading(false);

      const newTurn: DebateTurn = {
        round: roundNum,
        speaker,
        speakerName: data.speakerName,
        speakerAvatar: data.speakerAvatar,
        text: data.reply,
        audio: data.audio,
        audioFormat: data.audioFormat || "audio/wav",
        ragSource: data.ragSource,
        groundingDetails: data.groundingDetails,
      };

      const updatedHistory = [...currentHistory, newTurn];
      setTurns(updatedHistory);

      // Play spoken audio for this turn
      if (data.audio) {
        await playTurnAudio(data.audio, data.audioFormat || "audio/wav");
      }

      // Check if paused or stopped while speaking
      if (!isDebatingRef.current || isPausedRef.current) return;

      // Determine next turn
      if (speaker === "andhbhakt") {
        // Next is rational in same round
        setTimeout(() => {
          if (isDebatingRef.current && !isPausedRef.current) {
            executeDebateTurn("rational", roundNum, updatedHistory);
          }
        }, 800);
      } else {
        // Round complete: check if more rounds remain
        if (roundNum < rounds) {
          setCurrentRound(roundNum + 1);
          setTimeout(() => {
            if (isDebatingRef.current && !isPausedRef.current) {
              executeDebateTurn("andhbhakt", roundNum + 1, updatedHistory);
            }
          }, 1200);
        } else {
          // Debate finished
          setIsDebating(false);
        }
      }
    } catch (err: any) {
      console.error("Debate turn failed:", err);
      setIsTurnLoading(false);
      setIsDebating(false);
    }
  };

  const handleStartDebate = () => {
    stopDebate();
    setTurns([]);
    setCurrentRound(1);
    setIsDebating(true);
    setIsPaused(false);
    executeDebateTurn("andhbhakt", 1, []);
  };

  const handleTogglePause = () => {
    if (isPaused) {
      setIsPaused(false);
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
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/75 backdrop-blur-md overflow-hidden">
      <div
        className={`w-full max-w-4xl h-[92vh] max-h-[860px] rounded-3xl border flex flex-col shadow-2xl overflow-hidden ${
          isDark ? "bg-zinc-950 border-white/10 text-white" : "bg-white border-slate-200 text-slate-900"
        }`}
      >
        {/* Header */}
        <div className={`p-5 border-b flex items-center justify-between ${
          isDark ? "bg-white/[0.02] border-white/10" : "bg-slate-50 border-slate-200"
        }`}>
          <div className="flex items-center gap-3">
            <span className="text-3xl select-none">⚔️</span>
            <div>
              <h2 className="text-lg font-bold tracking-tight flex items-center gap-2">
                AI vs. AI "Debate Arena"
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/15 text-amber-500 border border-amber-500/30">
                  Live Voice Duplex
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                Saffron Debater vs. Rationalist Analyst in alternating grounded voice rounds
              </p>
            </div>
          </div>
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

        {/* Debate Podium Visualizer */}
        <div className={`p-4 border-b grid grid-cols-2 gap-3 sm:gap-6 ${
          isDark ? "bg-white/[0.01] border-white/5" : "bg-slate-100/60 border-slate-200"
        }`}>
          {/* Saffron Debater Podium */}
          <div
            className={`p-4 rounded-2xl border transition-all duration-300 flex items-center gap-3.5 ${
              isDebating && activeSpeaker === "andhbhakt"
                ? "border-amber-500/80 bg-amber-500/10 shadow-lg shadow-amber-500/20 scale-[1.01]"
                : "border-slate-200 dark:border-white/5 bg-white/40 dark:bg-white/[0.02] opacity-75"
            }`}
          >
            <div className="relative">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl select-none ${
                isDebating && activeSpeaker === "andhbhakt"
                  ? "bg-gradient-to-tr from-amber-600 to-orange-400 text-white animate-pulse"
                  : "bg-slate-200 dark:bg-white/10"
              }`}>
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
              <h4 className="font-bold text-sm text-amber-600 dark:text-amber-400">Saffron Debater</h4>
              <p className="text-[11px] text-slate-500 dark:text-zinc-400 truncate">GraphRAG & Patriotic Resurgence</p>
            </div>
          </div>

          {/* Rationalist Analyst Podium */}
          <div
            className={`p-4 rounded-2xl border transition-all duration-300 flex items-center gap-3.5 ${
              isDebating && activeSpeaker === "rational"
                ? "border-cyan-500/80 bg-cyan-500/10 shadow-lg shadow-cyan-500/20 scale-[1.01]"
                : "border-slate-200 dark:border-white/5 bg-white/40 dark:bg-white/[0.02] opacity-75"
            }`}
          >
            <div className="relative">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl select-none ${
                isDebating && activeSpeaker === "rational"
                  ? "bg-gradient-to-tr from-cyan-600 to-blue-500 text-white animate-pulse"
                  : "bg-slate-200 dark:bg-white/10"
              }`}>
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
              <h4 className="font-bold text-sm text-cyan-600 dark:text-cyan-400">Rationalist Analyst</h4>
              <p className="text-[11px] text-slate-500 dark:text-zinc-400 truncate">Fact-Checks & Empirical Statistics</p>
            </div>
          </div>
        </div>

        {/* Topic & Controls Bar */}
        <div className={`p-4 border-b space-y-3 ${
          isDark ? "bg-white/[0.02] border-white/10" : "bg-slate-50 border-slate-200"
        }`}>
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

          {/* Topic Input + Rounds + Start/Pause Buttons */}
          <div className="flex flex-col sm:flex-row items-center gap-2.5">
            <input
              type="text"
              disabled={isDebating}
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Or type any debate topic..."
              className={`w-full sm:flex-1 px-4 py-2 rounded-xl text-xs border focus:outline-hidden ${
                isDark ? "bg-zinc-900 border-white/10 text-white focus:border-emerald-500" : "bg-white border-slate-300 text-slate-900 focus:border-emerald-600"
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
                <option value={1}>1 Round</option>
                <option value={2}>2 Rounds</option>
                <option value={3}>3 Rounds</option>
                <option value={4}>4 Rounds</option>
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
                    className="px-4 py-2 rounded-xl text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-white transition cursor-pointer"
                  >
                    {isPaused ? "▶️ Resume" : "⏸️ Pause"}
                  </button>
                  <button
                    type="button"
                    onClick={stopDebate}
                    className="px-4 py-2 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white transition cursor-pointer"
                  >
                    ⏹️ End
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Live Debate Transcript Stream */}
        <div className="flex-1 p-5 overflow-y-auto space-y-4">
          {turns.length === 0 && !isTurnLoading && (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400 dark:text-zinc-500">
              <span className="text-4xl mb-3">🎙️⚔️</span>
              <p className="font-semibold text-sm">Select a topic and press "Start Debate"</p>
              <p className="text-xs max-w-sm mt-1">
                Chatly will orchestrate alternating rounds between Saffron Debater and Rationalist Analyst with live voice synthesis.
              </p>
            </div>
          )}

          {turns.map((turn, idx) => {
            const isSaffronTurn = turn.speaker === "andhbhakt";
            return (
              <div
                key={idx}
                className={`p-4 rounded-2xl border transition-all ${
                  isSaffronTurn
                    ? isDark
                      ? "bg-amber-500/10 border-amber-500/30 text-amber-100"
                      : "bg-amber-50 border-amber-200 text-amber-950"
                    : isDark
                    ? "bg-cyan-500/10 border-cyan-500/30 text-cyan-100"
                    : "bg-cyan-50 border-cyan-200 text-cyan-950"
                }`}
              >
                {/* Turn Header */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{turn.speakerAvatar}</span>
                    <span className="font-bold text-xs">
                      {turn.speakerName} (Round {turn.round})
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {turn.ragSource && (
                      <button
                        type="button"
                        onClick={() => onOpenGroundingDrawer?.({ ragSource: turn.ragSource!, groundingDetails: turn.groundingDetails })}
                        className={`text-[10px] px-2 py-0.5 rounded-full font-medium border cursor-pointer ${
                          isSaffronTurn
                            ? "bg-amber-500/20 border-amber-500/40 text-amber-700 dark:text-amber-300"
                            : "bg-cyan-500/20 border-cyan-500/40 text-cyan-700 dark:text-cyan-300"
                        }`}
                      >
                        {isSaffronTurn ? "🚩 Grounded" : "⚖️ Fact-Checked"} 🔍
                      </button>
                    )}

                    {turn.audio && (
                      <button
                        type="button"
                        onClick={() => playTurnAudio(turn.audio, turn.audioFormat)}
                        className="text-xs px-2 py-0.5 rounded-md hover:bg-black/10 dark:hover:bg-white/10 transition cursor-pointer"
                        title="Replay Spoken Audio"
                      >
                        ▶️ Replay
                      </button>
                    )}
                  </div>
                </div>

                {/* Spoken Text */}
                <p className="text-sm leading-relaxed">{turn.text}</p>
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
