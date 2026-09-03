"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function Home() {
  const [currentUser, setCurrentUser] = useState<{ name: string; email: string } | null>(null);

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

  return (
    <main className="min-h-screen bg-[#07080a] text-white selection:bg-emerald-500 selection:text-white relative overflow-hidden">
      {/* Background ambient lighting */}
      <div className="absolute top-1/4 -left-48 h-96 w-96 rounded-full bg-emerald-500/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 -right-48 h-96 w-96 rounded-full bg-cyan-500/10 blur-[120px] pointer-events-none" />

      {/* Navbar */}
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6 relative z-10">
        <Link
          href="/"
          className="text-xl font-semibold tracking-tight"
        >
          Chatly
        </Link>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {currentUser ? (
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <div className="flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                <span className="font-medium text-emerald-300 truncate max-w-[100px] sm:max-w-[150px]">
                  {currentUser.name}
                </span>
              </div>

              <Link
                href="/dashboard"
                className="text-xs font-medium text-zinc-300 hover:text-white px-2.5 py-1.5 rounded-lg border border-white/10 hover:border-white/20 transition"
              >
                Dashboard
              </Link>

              {((currentUser as any)?.role === "admin" ||
                currentUser?.email?.toLowerCase() === "r19216871@gamil.com" ||
                currentUser?.email?.toLowerCase() === "r19216871@gmail.com") && (
                <Link
                  href="/admin"
                  className="rounded-lg border border-amber-500/40 bg-amber-500/15 px-2.5 py-1.5 text-xs font-semibold text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.2)] hover:bg-amber-500/25 transition"
                >
                  👑 Admin
                </Link>
              )}

              <Link
                href="/voice"
                className="rounded-xl bg-white px-3 sm:px-4 py-1.5 sm:py-2 text-xs font-semibold text-black transition hover:bg-zinc-200"
              >
                🎙️ Voice
              </Link>

              <button
                type="button"
                onClick={handleLogout}
                className="text-xs text-zinc-400 hover:text-red-400 transition cursor-pointer px-1"
              >
                Sign out
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                href="/login"
                className="rounded-lg px-3 py-1.5 text-xs sm:text-sm text-zinc-300 transition hover:bg-white/5 hover:text-white"
              >
                Log in
              </Link>

              <Link
                href="/signup"
                className="rounded-lg bg-white px-3.5 py-1.5 text-xs sm:text-sm font-medium text-black transition hover:bg-zinc-200"
              >
                Sign up
              </Link>
            </div>
          )}
        </div>
      </nav>

      {/* Hero */}
      <section className="mx-auto flex min-h-[calc(100vh-88px)] max-w-4xl flex-col items-center justify-center px-4 sm:px-6 pb-20 text-center relative z-10">
        <div className="mb-6 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-1 text-[11px] sm:text-xs font-medium text-emerald-300 flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
          Next-Generation Conversational Voice AI
        </div>

        <h1 className="max-w-3xl text-4xl font-bold tracking-tight sm:text-6xl md:text-7xl">
          Talk to AI,
          <span className="block text-zinc-400">
            completely naturally.
          </span>
        </h1>

        <p className="mt-4 sm:mt-6 max-w-xl text-sm sm:text-base md:text-lg leading-6 sm:leading-7 text-zinc-400">
          Have real conversations, ask complex questions, or brainstorm ideas.
          Speak aloud and hear Chatly reply in real-time.
        </p>

        {/* Buttons */}
        <div className="mt-8 sm:mt-10 flex flex-col sm:flex-row w-full sm:w-auto gap-3">
          <Link
            href="/voice"
            className="w-full sm:w-auto rounded-xl bg-white px-8 py-3.5 text-sm font-semibold text-black transition hover:bg-zinc-200 shadow-lg shadow-white/10 text-center"
          >
            🎙️ Start Voice Chat →
          </Link>

          {!currentUser && (
            <Link
              href="/signup"
              className="rounded-xl border border-white/10 bg-white/[0.04] px-7 py-3.5 text-sm font-semibold text-white transition hover:bg-white/[0.08]"
            >
              Create Account
            </Link>
          )}
        </div>

        {/* Features */}
        <div className="mt-20 grid w-full max-w-2xl gap-3 sm:grid-cols-3">
          <Feature
            title="Speech-to-Speech"
            text="Real two-way spoken conversation with zero typing needed."
          />

          <Feature
            title="Ultra-Fast AI"
            text="State-of-the-art neural intelligence for instant, context-aware answers."
          />

          <Feature
            title="Secure & Private"
            text="Protected with enterprise encryption, secure tokens, and rate limits."
          />
        </div>
      </section>
    </main>
  );
}

function Feature({
  title,
  text,
}: {
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-left backdrop-blur-sm">
      <h2 className="font-medium text-white">
        {title}
      </h2>

      <p className="mt-2 text-xs leading-5 text-zinc-400">
        {text}
      </p>
    </div>
  );
}