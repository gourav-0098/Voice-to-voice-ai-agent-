"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { API_BASE } from "../config";

interface UserProfile {
  id: string;
  name: string;
  email: string;
  role?: string;
  createdAt?: string;
  quota?: {
    isAdmin: boolean;
    remainingHourly: number | string;
    remainingDaily: number | string;
    totalHourly: number | string;
    totalDaily: number | string;
  };
}

export default function UserDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [resettingMemory, setResettingMemory] = useState(false);
  const [memoryMessage, setMemoryMessage] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const token = localStorage.getItem("chatly_token");
      if (!token) {
        router.push("/login");
        return;
      }

      // Fetch fresh profile & quota
      fetch(`${API_BASE}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => {
          if (!res.ok) throw new Error("Unauthorized");
          return res.json();
        })
        .then((data) => {
          if (data.user) {
            setUser(data.user);
            localStorage.setItem("chatly_user", JSON.stringify(data.user));
          }
        })
        .catch(() => {
          localStorage.removeItem("chatly_token");
          localStorage.removeItem("chatly_user");
          router.push("/login");
        })
        .finally(() => setLoading(false));
    }
  }, [router]);

  const handleLogout = () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("chatly_token");
      localStorage.removeItem("chatly_user");
    }
    router.push("/login");
  };

  const handleClearMemory = async () => {
    const token = typeof window !== "undefined" ? localStorage.getItem("chatly_token") : null;
    if (!token) return;

    setResettingMemory(true);
    setMemoryMessage(null);

    try {
      const res = await fetch(`${API_BASE}/api/voice/history`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setMemoryMessage("Conversation memory cleared successfully!");
        setTimeout(() => setMemoryMessage(null), 3000);
      }
    } catch (_) {
      setMemoryMessage("Failed to clear memory.");
    } finally {
      setResettingMemory(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#07080a] flex items-center justify-center text-white">
        <div className="flex items-center gap-3 text-sm text-zinc-400">
          <span className="h-4 w-4 rounded-full border-2 border-emerald-400 border-t-transparent animate-spin" />
          Loading your dashboard...
        </div>
      </div>
    );
  }

  const isAdmin =
    user?.role === "admin" ||
    user?.email?.toLowerCase() === "r19216871@gamil.com" ||
    user?.email?.toLowerCase() === "r19216871@gmail.com";

  const remainingHourly = typeof user?.quota?.remainingHourly === "number" ? user.quota.remainingHourly : 5;
  const remainingDaily = typeof user?.quota?.remainingDaily === "number" ? user.quota.remainingDaily : 10;

  const hourlyPct = Math.min(100, Math.max(0, (remainingHourly / 5) * 100));
  const dailyPct = Math.min(100, Math.max(0, (remainingDaily / 10) * 100));

  return (
    <main className="min-h-screen bg-[#07080a] text-white selection:bg-emerald-500 selection:text-white flex flex-col relative overflow-hidden">
      {/* Ambient background glows */}
      <div className="absolute top-10 left-1/4 h-96 w-96 rounded-full bg-emerald-500/10 blur-[130px] pointer-events-none" />
      <div className="absolute bottom-10 right-1/4 h-96 w-96 rounded-full bg-cyan-500/10 blur-[130px] pointer-events-none" />

      {/* NAVBAR */}
      <nav className="border-b border-white/10 bg-zinc-950/40 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 sm:py-0 sm:h-16 flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2 sm:gap-4">
            <Link href="/" className="text-lg sm:text-xl font-bold tracking-tight hover:opacity-80 transition">
              Chatly
            </Link>
            <span className="text-zinc-600">/</span>
            <span className="text-xs sm:text-sm font-medium text-zinc-300">Dashboard</span>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {isAdmin && (
              <Link
                href="/admin"
                className="flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/15 px-2.5 sm:px-3 py-1 sm:py-1.5 text-[11px] sm:text-xs font-semibold text-amber-300 shadow-[0_0_15px_rgba(245,158,11,0.2)] hover:bg-amber-500/25 transition"
              >
                👑 Admin →
              </Link>
            )}

            <Link
              href="/voice"
              className="rounded-xl bg-white px-3 sm:px-4 py-1.5 sm:py-2 text-xs font-semibold text-black transition hover:bg-zinc-200 shadow-sm"
            >
              🎙️ Voice AI
            </Link>

            <button
              onClick={handleLogout}
              className="rounded-xl border border-white/10 px-2.5 sm:px-3 py-1.5 sm:py-2 text-xs font-medium text-zinc-400 hover:text-red-400 hover:border-red-500/30 transition cursor-pointer"
            >
              Sign out
            </button>
          </div>
        </div>
      </nav>

      {/* DASHBOARD CONTENT */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10 w-full flex-1 relative z-10 space-y-6 sm:space-y-8">
        {/* WELCOME HERO */}
        <div className="rounded-3xl border border-white/10 bg-gradient-to-tr from-white/[0.04] to-white/[0.01] p-5 sm:p-8 backdrop-blur-xl relative overflow-hidden">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-5 sm:gap-6">
            <div className="flex items-center gap-4 sm:gap-5">
              <div className="h-12 w-12 sm:h-16 sm:w-16 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-xl sm:text-2xl font-bold text-black shadow-lg shadow-emerald-500/20 shrink-0">
                {user?.name ? user.name[0].toUpperCase() : "U"}
              </div>

              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight">
                    Welcome back, {user?.name || "User"}
                  </h1>
                  {isAdmin && (
                    <span className="rounded-full bg-amber-500/20 border border-amber-500/40 px-2.5 py-0.5 text-[10px] sm:text-[11px] font-bold text-amber-300 uppercase tracking-wider">
                      ADMIN
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs sm:text-sm text-zinc-400 truncate max-w-[260px] sm:max-w-none">
                  {user?.email} · Ready for voice AI conversations
                </p>
              </div>
            </div>

            <Link
              href="/voice"
              className="w-full md:w-auto inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-6 py-3.5 text-sm font-semibold text-black hover:bg-emerald-400 transition shadow-lg shadow-emerald-500/20 active:scale-95"
            >
              <span>🎙️ Start Speaking Now</span>
              <span>→</span>
            </Link>
          </div>
        </div>

        {/* QUOTA STATS GRID */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* HOURLY QUOTA */}
          <div className="rounded-3xl border border-white/10 bg-zinc-950/60 p-6 backdrop-blur-md">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Hourly Limit
              </span>
              <span className="text-xs text-zinc-500">60-min window</span>
            </div>

            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold">
                {isAdmin ? "∞" : remainingHourly}
              </span>
              <span className="text-sm text-zinc-500 font-medium">
                {isAdmin ? "Unlimited" : "/ 5 calls"}
              </span>
            </div>

            {!isAdmin && (
              <div className="mt-4">
                <div className="h-2 w-full rounded-full bg-white/5 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-400 transition-all duration-300"
                    style={{ width: `${hourlyPct}%` }}
                  />
                </div>
                <p className="mt-2 text-[11px] text-zinc-500">
                  {remainingHourly} call{remainingHourly !== 1 ? "s" : ""} left this hour
                </p>
              </div>
            )}

            {isAdmin && (
              <p className="mt-4 text-xs text-amber-300/90 font-medium">
                👑 Admin bypasses all hourly rate limits
              </p>
            )}
          </div>

          {/* DAILY QUOTA */}
          <div className="rounded-3xl border border-white/10 bg-zinc-950/60 p-6 backdrop-blur-md">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Daily Limit
              </span>
              <span className="text-xs text-zinc-500">24-hour window</span>
            </div>

            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold">
                {isAdmin ? "∞" : remainingDaily}
              </span>
              <span className="text-sm text-zinc-500 font-medium">
                {isAdmin ? "Unlimited" : "/ 10 calls"}
              </span>
            </div>

            {!isAdmin && (
              <div className="mt-4">
                <div className="h-2 w-full rounded-full bg-white/5 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-300"
                    style={{ width: `${dailyPct}%` }}
                  />
                </div>
                <p className="mt-2 text-[11px] text-zinc-500">
                  {remainingDaily} call{remainingDaily !== 1 ? "s" : ""} left today
                </p>
              </div>
            )}

            {isAdmin && (
              <p className="mt-4 text-xs text-amber-300/90 font-medium">
                👑 Admin bypasses all daily rate limits
              </p>
            )}
          </div>

          {/* AI MEMORY STATUS */}
          <div className="rounded-3xl border border-white/10 bg-zinc-950/60 p-6 backdrop-blur-md flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Conversational Memory
                </span>
                <span className="h-2 w-2 rounded-full bg-purple-400 animate-pulse" />
              </div>

              <p className="text-sm font-semibold text-purple-300">
                {isAdmin ? "🧠 Enterprise Knowledge Memory Active" : "🧠 Conversation Memory Active"}
              </p>

              <p className="mt-1 text-xs text-zinc-400 leading-relaxed">
                {isAdmin
                  ? "Semantic knowledge and dialogue context are indexed into persistent vector memory for instant long-term recall."
                  : "Chatly remembers dialogue context across recent conversational turns in real time."}
              </p>
            </div>

            <div className="mt-4">
              <button
                type="button"
                onClick={handleClearMemory}
                disabled={resettingMemory}
                className="w-full rounded-xl border border-white/10 bg-white/[0.02] py-2 text-xs font-medium text-zinc-300 hover:text-white hover:bg-white/[0.06] transition cursor-pointer"
              >
                {resettingMemory ? "Clearing..." : "🧹 Clear Memory Context"}
              </button>
              {memoryMessage && (
                <p className="mt-1.5 text-center text-[11px] text-emerald-400">{memoryMessage}</p>
              )}
            </div>
          </div>
        </div>

        {/* QUICK LAUNCH CARDS */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* VOICE CALL CARD */}
          <Link
            href="/voice"
            className="group rounded-3xl border border-white/10 bg-white/[0.02] p-6 hover:border-emerald-500/40 hover:bg-emerald-500/[0.03] transition duration-200 backdrop-blur-md"
          >
            <div className="flex items-start justify-between">
              <div className="h-12 w-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-2xl group-hover:scale-110 transition">
                🎙️
              </div>
              <span className="text-xs text-zinc-500 group-hover:text-emerald-400 transition font-medium">
                Launch →
              </span>
            </div>

            <h3 className="mt-4 text-lg font-bold text-white group-hover:text-emerald-300 transition">
              Voice-to-Voice AI
            </h3>

            <p className="mt-1 text-xs leading-5 text-zinc-400">
              Real-time spoken dialogue with next-generation AI, dynamic sound orb feedback, studio-grade speech synthesis, and live transcription.
            </p>
          </Link>

          {/* TEXT CHAT CARD */}
          <Link
            href="/chat"
            className="group rounded-3xl border border-white/10 bg-white/[0.02] p-6 hover:border-cyan-500/40 hover:bg-cyan-500/[0.03] transition duration-200 backdrop-blur-md"
          >
            <div className="flex items-start justify-between">
              <div className="h-12 w-12 rounded-2xl bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center text-2xl group-hover:scale-110 transition">
                💬
              </div>
              <span className="text-xs text-zinc-500 group-hover:text-cyan-400 transition font-medium">
                Open Chat →
              </span>
            </div>

            <h3 className="mt-4 text-lg font-bold text-white group-hover:text-cyan-300 transition">
              Text Conversations
            </h3>

            <p className="mt-1 text-xs leading-5 text-zinc-400">
              Type questions, brainstorm code, and exchange long-form ideas with markdown formatting and conversation history.
            </p>
          </Link>
        </div>
      </div>
    </main>
  );
}
