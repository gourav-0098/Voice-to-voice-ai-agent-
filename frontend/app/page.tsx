"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ThemeToggle } from "./components/ThemeToggle";

export default function Home() {
  const [currentUser, setCurrentUser] = useState<{
    name: string;
    email: string;
    avatar?: string;
    role?: string;
  } | null>(null);

  const [activeSamplePlaying, setActiveSamplePlaying] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("chatly_user");
      if (stored) {
        try {
          setCurrentUser(JSON.parse(stored));
        } catch (_) {}
      }
    }
  }, []);

  const handleLogout = () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("chatly_token");
      localStorage.removeItem("chatly_user");
    }
    setCurrentUser(null);
  };

  const handlePlaySample = () => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    if (activeSamplePlaying) {
      window.speechSynthesis.cancel();
      setActiveSamplePlaying(false);
      return;
    }

    window.speechSynthesis.cancel();
    const text = "Namaste! Main Chatly hoon. Chahe Article 370 ho, Indian economy ka track record ya infrastructure vikas—hum sabhi muddo par verified facts ke saath live debate kar sakte hain.";
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "hi-IN";
    utterance.rate = 1.05;
    utterance.onstart = () => setActiveSamplePlaying(true);
    utterance.onend = () => setActiveSamplePlaying(false);
    utterance.onerror = () => setActiveSamplePlaying(false);
    window.speechSynthesis.speak(utterance);
  };

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-[#07080a] text-slate-900 dark:text-white selection:bg-emerald-500 selection:text-white relative overflow-hidden transition-colors duration-200">
      {/* Background ambient lighting */}
      <div className="absolute top-1/4 -left-48 h-96 w-96 rounded-full bg-emerald-500/10 blur-[130px] pointer-events-none" />
      <div className="absolute top-1/3 right-0 h-[400px] w-[400px] rounded-full bg-amber-500/10 blur-[140px] pointer-events-none" />
      <div className="absolute bottom-1/4 -right-48 h-96 w-96 rounded-full bg-cyan-500/10 blur-[130px] pointer-events-none" />

      {/* Navbar */}
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6 relative z-10">
        <Link
          href="/"
          className="text-xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2.5"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-gradient-to-tr from-emerald-500 via-teal-400 to-cyan-400 text-black text-base font-bold shadow-sm shadow-emerald-500/20">
            🎙️
          </span>
          <span className="font-extrabold tracking-tight">Chatly <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-mono border border-emerald-500/20">AI</span></span>
        </Link>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <ThemeToggle />

          {currentUser ? (
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <div className="flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs">
                {currentUser.avatar ? (
                  <img
                    src={currentUser.avatar}
                    alt={currentUser.name}
                    className="h-4 w-4 rounded-full object-cover"
                  />
                ) : (
                  <span className="h-2 w-2 rounded-full bg-emerald-500 dark:bg-emerald-400" />
                )}
                <span className="font-medium text-emerald-700 dark:text-emerald-300 truncate max-w-[100px] sm:max-w-[150px]">
                  {currentUser.name}
                </span>
              </div>

              <Link
                href="/dashboard"
                className="text-xs font-medium text-slate-700 hover:text-slate-900 dark:text-zinc-300 dark:hover:text-white px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 dark:border-white/10 dark:bg-transparent dark:hover:border-white/20 transition shadow-xs"
              >
                Dashboard
              </Link>

              {((currentUser as any)?.role === "admin" ||
                currentUser?.email?.toLowerCase() === "r19216871@gamil.com" ||
                currentUser?.email?.toLowerCase() === "r19216871@gmail.com") && (
                <Link
                  href="/admin"
                  className="flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-100/80 dark:bg-white/5 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-zinc-300 shadow-xs hover:bg-slate-200/70 dark:hover:bg-white/10 transition"
                >
                  <span>🛡️</span>
                  <span>Admin</span>
                </Link>
              )}

              <Link
                href="/voice"
                className="rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-white dark:text-black dark:hover:bg-zinc-200 px-4 py-1.5 sm:py-2 text-xs font-semibold transition shadow-sm"
              >
                🎙️ Voice Studio
              </Link>

              <button
                type="button"
                onClick={handleLogout}
                className="text-xs text-slate-500 hover:text-red-500 dark:text-zinc-400 dark:hover:text-red-400 transition cursor-pointer px-1 font-medium"
              >
                Sign out
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                href="/login"
                className="rounded-xl px-3.5 py-1.5 text-xs sm:text-sm text-slate-600 hover:text-slate-900 dark:text-zinc-300 dark:hover:text-white transition hover:bg-slate-100 dark:hover:bg-white/5 font-medium"
              >
                Log in
              </Link>

              <Link
                href="/signup"
                className="rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-white dark:text-black dark:hover:bg-zinc-200 px-4 py-1.5 text-xs sm:text-sm font-semibold transition shadow-xs"
              >
                Sign up
              </Link>
            </div>
          )}
        </div>
      </nav>

      {/* Hero Section */}
      <section className="mx-auto flex min-h-[calc(100vh-100px)] max-w-6xl flex-col items-center justify-center px-4 sm:px-6 pt-4 pb-20 text-center relative z-10">
        {/* Telemetry pill */}
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-1.5 text-[11px] sm:text-xs font-semibold text-emerald-700 dark:text-emerald-300 backdrop-blur-md shadow-xs">
          <span className="h-2 w-2 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-ping" />
          <span>Hyper-Grounded Political & Cultural Voice AI</span>
          <span className="text-emerald-500/40">•</span>
          <span className="font-mono">11,190+ Vectors</span>
        </div>

        <h1 className="max-w-4xl text-4xl font-extrabold tracking-tight sm:text-6xl md:text-7xl text-slate-900 dark:text-white">
          Real-Time Voice AI,
          <span className="block bg-gradient-to-r from-emerald-500 via-teal-400 to-amber-500 bg-clip-text text-transparent">
            grounded in authentic facts.
          </span>
        </h1>

        <p className="mt-5 max-w-2xl text-sm sm:text-base md:text-lg leading-relaxed text-slate-600 dark:text-zinc-400">
          Spoken two-way debate with zero typing needed. Features dual persona engines
          (Saffron Nationalist vs Rationalist Analyst), sub-300ms streaming voice, and direct evidence retrieval from verified records.
        </p>

        {/* Action Buttons */}
        <div className="mt-8 flex flex-col sm:flex-row items-center gap-3.5 w-full sm:w-auto">
          <Link
            href="/voice"
            className="w-full sm:w-auto rounded-2xl bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-white dark:text-black dark:hover:bg-zinc-200 px-8 py-4 text-sm font-semibold transition shadow-lg shadow-emerald-600/25 active:scale-95 text-center flex items-center justify-center gap-2 cursor-pointer"
          >
            <span>🎙️ Enter Voice Studio</span>
            <span>→</span>
          </Link>

          <button
            type="button"
            onClick={handlePlaySample}
            className="w-full sm:w-auto rounded-2xl border border-slate-300 bg-white/90 text-slate-800 hover:bg-slate-100 dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:hover:bg-white/[0.08] px-6 py-4 text-sm font-semibold transition shadow-xs active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
          >
            <span>{activeSamplePlaying ? "⏹️ Stop Sample" : "🔊 Listen to Voice Sample"}</span>
          </button>
        </div>

        {/* Stats Row */}
        <div className="mt-14 grid grid-cols-2 md:grid-cols-4 gap-3 w-full max-w-4xl text-center">
          <div className="rounded-2xl border border-slate-200 dark:border-white/5 bg-white/70 dark:bg-white/[0.02] p-4 backdrop-blur-md">
            <p className="text-2xl font-black text-slate-900 dark:text-white">11,190+</p>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">Grounded Qdrant Vectors</p>
          </div>
          <div className="rounded-2xl border border-slate-200 dark:border-white/5 bg-white/70 dark:bg-white/[0.02] p-4 backdrop-blur-md">
            <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400">&lt; 300ms</p>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">Streaming Latency</p>
          </div>
          <div className="rounded-2xl border border-slate-200 dark:border-white/5 bg-white/70 dark:bg-white/[0.02] p-4 backdrop-blur-md">
            <p className="text-2xl font-black text-amber-500">272</p>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">Authenticated Broadsheets</p>
          </div>
          <div className="rounded-2xl border border-slate-200 dark:border-white/5 bg-white/70 dark:bg-white/[0.02] p-4 backdrop-blur-md">
            <p className="text-2xl font-black text-cyan-500">Dual STT</p>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">Groq Whisper + Web Speech</p>
          </div>
        </div>

        {/* Bento Grid Feature Matrix */}
        <div className="mt-16 w-full max-w-5xl text-left">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-500 text-center mb-6">
            Architecture & Core Capabilities
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Bento Card 1: Sub-second Voice (Span 2 cols) */}
            <div className="md:col-span-2 rounded-3xl border border-slate-200 dark:border-white/10 bg-white/80 dark:bg-gradient-to-br dark:from-white/[0.04] dark:to-white/[0.01] p-7 backdrop-blur-md shadow-xs hover:border-emerald-500/40 transition group">
              <div className="flex items-center gap-3 mb-4">
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-lg font-bold border border-emerald-500/20">
                  ⚡
                </span>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                    Sub-300ms Pipelined Voice Streaming
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-zinc-400">
                    Silero VAD turn-taking with immediate acoustic barge-in
                  </p>
                </div>
              </div>
              <p className="text-sm leading-relaxed text-slate-600 dark:text-zinc-300">
                Audio is segmented at syntactic boundaries and synthesized chunk-by-chunk using Sarvam and Deepgram Aura neural voices.
                If you interrupt while the AI speaks, playback halts in under 50ms with zero acoustic clash.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <span className="px-2.5 py-1 rounded-lg text-[11px] font-mono bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-zinc-300">Web Audio Analyser</span>
                <span className="px-2.5 py-1 rounded-lg text-[11px] font-mono bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-zinc-300">AudioStreamQueue</span>
                <span className="px-2.5 py-1 rounded-lg text-[11px] font-mono bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-zinc-300">Groq Whisper Turbo</span>
              </div>
            </div>

            {/* Bento Card 2: Persona Engine */}
            <div className="rounded-3xl border border-slate-200 dark:border-white/10 bg-white/80 dark:bg-gradient-to-br dark:from-white/[0.04] dark:to-white/[0.01] p-7 backdrop-blur-md shadow-xs hover:border-amber-500/40 transition group">
              <div className="flex items-center gap-3 mb-4">
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 text-lg font-bold border border-amber-500/20">
                  🎭
                </span>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                    Persona Engine
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-zinc-400">
                    Saffron Nationalist ⚔️ Rationalist
                  </p>
                </div>
              </div>
              <p className="text-sm leading-relaxed text-slate-600 dark:text-zinc-300">
                Dynamic stance modulation across 5 intensity levels. In Saffron mode, defends national achievements with cultural markers;
                in Secular mode, evaluates policy through strict constitutional scrutiny.
              </p>
              <div className="mt-5 flex items-center gap-2 text-xs font-semibold text-amber-600 dark:text-amber-400">
                <span>Try Live AI vs AI Debate Arena</span>
                <span>→</span>
              </div>
            </div>

            {/* Bento Card 3: 11,000+ Grounded Vectors */}
            <div className="rounded-3xl border border-slate-200 dark:border-white/10 bg-white/80 dark:bg-gradient-to-br dark:from-white/[0.04] dark:to-white/[0.01] p-7 backdrop-blur-md shadow-xs hover:border-cyan-500/40 transition group">
              <div className="flex items-center gap-3 mb-4">
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 text-lg font-bold border border-cyan-500/20">
                  📚
                </span>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                    11,000+ Grounded Vectors
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-zinc-400">
                    Qdrant Cloud + Verified Broadsheets
                  </p>
                </div>
              </div>
              <p className="text-sm leading-relaxed text-slate-600 dark:text-zinc-300">
                Every policy claim is verified against authentic archival sources (The Hindu, Indian Express, UNU, PIB, Supreme Court judgments)
                with clickable citation drawers.
              </p>
              <div className="mt-5 flex flex-wrap gap-1.5">
                <span className="px-2 py-0.5 rounded text-[10px] bg-cyan-500/10 text-cyan-600 dark:text-cyan-300 border border-cyan-500/20">Tier 1 Constitutional</span>
                <span className="px-2 py-0.5 rounded text-[10px] bg-cyan-500/10 text-cyan-600 dark:text-cyan-300 border border-cyan-500/20">Tier 2 Broadsheets</span>
              </div>
            </div>

            {/* Bento Card 4: Bilingual Indian STT (Span 2 cols) */}
            <div className="md:col-span-2 rounded-3xl border border-slate-200 dark:border-white/10 bg-white/80 dark:bg-gradient-to-br dark:from-white/[0.04] dark:to-white/[0.01] p-7 backdrop-blur-md shadow-xs hover:border-purple-500/40 transition group">
              <div className="flex items-center gap-3 mb-4">
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-purple-500/10 text-purple-600 dark:text-purple-400 text-lg font-bold border border-purple-500/20">
                  🇮🇳
                </span>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                    Bilingual Hindi & English Dialect Recognition
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-zinc-400">
                    Dual-channel recognition tailored for Indian conversational speech
                  </p>
                </div>
              </div>
              <p className="text-sm leading-relaxed text-slate-600 dark:text-zinc-300">
                Whether you speak in Shuddh Hindi, conversational Hinglish, or Indian English, Chatly seamlessly transcribes
                colloquial idioms, scheme abbreviations (PM-JAY, UPI, CAA), and political discourse without dropping context.
              </p>
              <div className="mt-5 flex items-center gap-3">
                <Link
                  href="/voice"
                  className="text-xs font-semibold text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-1"
                >
                  <span>Launch Voice Studio to start speaking</span>
                  <span>→</span>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}