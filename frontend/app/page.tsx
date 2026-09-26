"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ThemeToggle } from "./components/ThemeToggle";

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
    <main className="min-h-screen bg-slate-50 dark:bg-[#07080a] text-slate-900 dark:text-white selection:bg-emerald-500 selection:text-white relative overflow-hidden transition-colors duration-200">
      {/* Background ambient lighting */}
      <div className="absolute top-1/4 -left-48 h-96 w-96 rounded-full bg-emerald-500/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 -right-48 h-96 w-96 rounded-full bg-cyan-500/10 blur-[120px] pointer-events-none" />

      {/* Navbar */}
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6 relative z-10">
        <Link
          href="/"
          className="text-xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 text-black text-sm font-bold shadow-sm">
            🎙️
          </span>
          Chatly
        </Link>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <ThemeToggle />

          {currentUser ? (
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <div className="flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs">
                <span className="h-2 w-2 rounded-full bg-emerald-500 dark:bg-emerald-400" />
                <span className="font-medium text-emerald-700 dark:text-emerald-300 truncate max-w-[100px] sm:max-w-[150px]">
                  {currentUser.name}
                </span>
              </div>

              <Link
                href="/dashboard"
                className="text-xs font-medium text-slate-700 hover:text-slate-900 dark:text-zinc-300 dark:hover:text-white px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 dark:border-white/10 dark:bg-transparent dark:hover:border-white/20 transition shadow-xs"
              >
                Dashboard
              </Link>

              {((currentUser as any)?.role === "admin" ||
                currentUser?.email?.toLowerCase() === "r19216871@gamil.com" ||
                currentUser?.email?.toLowerCase() === "r19216871@gmail.com") && (
                <Link
                  href="/admin"
                  className="flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-100/80 dark:bg-white/5 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-zinc-300 shadow-xs hover:bg-slate-200/70 dark:hover:bg-white/10 transition"
                >
                  <svg className="w-3.5 h-3.5 text-slate-500 dark:text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                  </svg>
                  <span>Admin</span>
                </Link>
              )}

              <Link
                href="/voice"
                className="rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-white dark:text-black dark:hover:bg-zinc-200 px-3 sm:px-4 py-1.5 sm:py-2 text-xs font-semibold transition shadow-sm"
              >
                🎙️ Voice
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
                className="rounded-lg px-3 py-1.5 text-xs sm:text-sm text-slate-600 hover:text-slate-900 dark:text-zinc-300 dark:hover:text-white transition hover:bg-slate-100 dark:hover:bg-white/5 font-medium"
              >
                Log in
              </Link>

              <Link
                href="/signup"
                className="rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-white dark:text-black dark:hover:bg-zinc-200 px-3.5 py-1.5 text-xs sm:text-sm font-semibold transition shadow-xs"
              >
                Sign up
              </Link>
            </div>
          )}
        </div>
      </nav>

      {/* Hero */}
      <section className="mx-auto flex min-h-[calc(100vh-88px)] max-w-4xl flex-col items-center justify-center px-4 sm:px-6 pb-20 text-center relative z-10">
        <div className="mb-6 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-1 text-[11px] sm:text-xs font-medium text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-ping" />
          Next-Generation Conversational Voice AI
        </div>

        <h1 className="max-w-3xl text-4xl font-bold tracking-tight sm:text-6xl md:text-7xl text-slate-900 dark:text-white">
          Talk to AI,
          <span className="block text-slate-500 dark:text-zinc-400">
            completely naturally.
          </span>
        </h1>

        <p className="mt-4 sm:mt-6 max-w-xl text-sm sm:text-base md:text-lg leading-6 sm:leading-7 text-slate-600 dark:text-zinc-400">
          Have real conversations, ask complex questions, or brainstorm ideas.
          Speak aloud and hear Chatly reply in real-time.
        </p>

        {/* Buttons */}
        <div className="mt-8 sm:mt-10 flex flex-col sm:flex-row w-full sm:w-auto gap-3">
          <Link
            href="/voice"
            className="w-full sm:w-auto rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-white dark:text-black dark:hover:bg-zinc-200 px-8 py-3.5 text-sm font-semibold transition shadow-md shadow-emerald-600/20 text-center"
          >
            🎙️ Start Voice Chat →
          </Link>

          {!currentUser && (
            <Link
              href="/signup"
              className="rounded-xl border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:hover:bg-white/[0.08] px-7 py-3.5 text-sm font-semibold transition shadow-xs"
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
    <div className="rounded-2xl border border-slate-200 bg-white/80 shadow-xs dark:border-white/10 dark:bg-white/[0.03] dark:shadow-none p-5 text-left backdrop-blur-sm transition">
      <h2 className="font-semibold text-slate-900 dark:text-white">
        {title}
      </h2>

      <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-zinc-400">
        {text}
      </p>
    </div>
  );
}