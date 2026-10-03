"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { API_BASE } from "../config";

function HalftoneWaveform() {
  const cols = 42;
  const rows = 19;
  const dots = [];

  for (let c = 0; c < cols; c++) {
    const xRatio = c / (cols - 1);
    // Audio envelope peaks around 0.22 and 0.68
    const env1 = Math.exp(-Math.pow((xRatio - 0.22) * 5, 2)) * 0.95;
    const env2 = Math.exp(-Math.pow((xRatio - 0.65) * 6, 2)) * 0.8;
    const baseline = 0.2;
    const waveHeight = Math.min(1, baseline + env1 + env2);

    for (let r = 0; r < rows; r++) {
      const yRatio = (r - (rows - 1) / 2) / ((rows - 1) / 2); // -1 to 1
      const absY = Math.abs(yRatio);
      const inWave = absY <= waveHeight;

      let radius = 0.9;
      let opacity = 0.12;
      let fill = "#cbd5e1";

      if (inWave) {
        const intensity = (1 - absY / waveHeight) * waveHeight;
        radius = 1.1 + intensity * 2.8;
        opacity = 0.25 + intensity * 0.75;
        fill = intensity > 0.45 ? "#0f172a" : "#475569";
      }

      dots.push(
        <circle
          key={`${c}-${r}`}
          cx={14 + c * 11.5}
          cy={14 + r * 15}
          r={radius}
          fill={fill}
          opacity={opacity}
        />
      );
    }
  }

  return (
    <svg
      viewBox="0 0 500 300"
      className="w-full h-full object-cover pointer-events-none select-none"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {dots}
    </svg>
  );
}

export default function SignupPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [sendTips, setSendTips] = useState(true);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [oauthNotice, setOauthNotice] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setOauthNotice(null);

    if (!email.trim() || !password) {
      setError("Please provide an email and password.");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }

    setLoading(true);

    const effectiveName = name.trim() || email.trim().split("@")[0] || "User";

    try {
      const response = await fetch(`${API_BASE}/api/auth/signup`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: effectiveName,
          email: email.trim(),
          password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to create account. Please try again.");
      }

      if (typeof window !== "undefined") {
        localStorage.setItem("chatly_token", data.token);
        localStorage.setItem("chatly_user", JSON.stringify(data.user));
      }

      const isAdmin = data.user?.role === "admin";
      const targetPath = isAdmin ? "/admin" : "/voice";
      setSuccessMsg("Account created successfully! Entering Studio...");

      setTimeout(() => {
        router.push(targetPath);
      }, 700);
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  const handleSocialClick = (provider: string) => {
    setOauthNotice(`${provider} OAuth integration will be connected soon. Please sign up with your email and password for now.`);
  };

  return (
    <main className="min-h-screen bg-[#eceef2] dark:bg-[#090b0e] flex items-center justify-center p-3 sm:p-6 lg:p-8 font-sans selection:bg-black selection:text-white">
      {/* Central Auth Canvas Card */}
      <div className="w-full max-w-[1080px] bg-white dark:bg-[#12151b] rounded-[28px] sm:rounded-[36px] shadow-[0_25px_60px_-15px_rgba(0,0,0,0.1)] border border-slate-200/80 dark:border-white/10 overflow-hidden grid grid-cols-1 lg:grid-cols-2">
        
        {/* ========================================================================= */}
        {/* LEFT PANEL: Voice Aura Studio Showcase & Waveform Architecture             */}
        {/* ========================================================================= */}
        <div className="relative bg-[#f7f8fa] dark:bg-[#161922] p-6 sm:p-10 lg:p-12 flex flex-col justify-between overflow-hidden border-b lg:border-b-0 lg:border-r border-slate-200/70 dark:border-white/5 min-h-[460px] lg:min-h-[680px]">
          
          {/* Halftone Audio Waveform Graphic Background */}
          <div className="absolute inset-0 z-0 flex items-center justify-center opacity-90 dark:opacity-40">
            <HalftoneWaveform />
          </div>

          {/* Top Brand Bar */}
          <div className="relative z-10 flex items-center justify-between">
            <Link href="/" className="inline-flex items-center gap-2 group">
              {/* Soundwave Bars Icon */}
              <div className="flex items-center gap-0.5 text-slate-900 dark:text-white">
                <span className="w-1 h-3 rounded-full bg-current" />
                <span className="w-1 h-5 rounded-full bg-current" />
                <span className="w-1 h-2 rounded-full bg-current" />
                <span className="w-1 h-4 rounded-full bg-current" />
                <span className="w-1 h-2.5 rounded-full bg-current" />
              </div>
              <span className="text-sm font-black tracking-widest text-slate-900 dark:text-white uppercase font-sans">
                VOICE AURA <span className="text-[10px] text-slate-400 font-normal ml-1">BY CHATLY</span>
              </span>
            </Link>
          </div>

          {/* Floating Pill on top-left of hero */}
          <div className="relative z-10 my-4 flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-white dark:bg-zinc-800 shadow-[0_4px_14px_rgba(0,0,0,0.06)] border border-slate-200/60 dark:border-white/10 flex items-center justify-center text-slate-800 dark:text-zinc-200">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 02-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </div>
            <div className="w-5 h-0.5 bg-blue-500 rounded-full" />
          </div>

          {/* Center Floating Glass Card */}
          <div className="relative z-10 my-auto py-2">
            <div className="bg-white/85 dark:bg-zinc-900/85 backdrop-blur-md rounded-2xl border border-white/90 dark:border-white/10 shadow-[0_20px_45px_-10px_rgba(0,0,0,0.08)] p-5 sm:p-6 max-w-[390px]">
              
              {/* Tab Switcher */}
              <div className="flex items-center gap-2 mb-3.5">
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-zinc-800 shadow-xs border border-slate-200/70 dark:border-white/10 text-xs font-semibold text-slate-900 dark:text-white">
                  <span>📄</span>
                  <span>Text to Speech</span>
                </div>
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-500 dark:text-zinc-400">
                  <span>🎙️</span>
                  <span>Voice Agent</span>
                </div>
              </div>

              {/* Description */}
              <p className="text-xs text-slate-600 dark:text-zinc-300 leading-relaxed mb-4">
                Unlock the power of intelligent voice technology through interactive speech-to-speech AI. Experience sub-300ms ultra-low latency, adaptive deep research, and studio-grade voice conversations.
              </p>

              {/* Tags / Pills */}
              <div className="flex flex-wrap gap-1.5 text-[11px] text-slate-600 dark:text-zinc-300">
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-200/80 dark:border-white/10 bg-white/60 dark:bg-white/5 font-medium">
                  <span className="text-red-500">▶</span> YouTube
                </span>
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-200/80 dark:border-white/10 bg-white/60 dark:bg-white/5 font-medium">
                  <span className="text-amber-500">📄</span> Narration
                </span>
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-200/80 dark:border-white/10 bg-white/60 dark:bg-white/5 font-medium">
                  <span className="text-blue-500">📢</span> Advertisement
                </span>
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-200/80 dark:border-white/10 bg-white/60 dark:bg-white/5 font-medium">
                  <span className="text-purple-500">🎙️</span> Podcast
                </span>
              </div>
            </div>
          </div>

          {/* Floating Pill on bottom-right */}
          <div className="relative z-10 flex justify-end items-center gap-2 my-2 pr-4 sm:pr-8">
            <div className="w-5 h-0.5 bg-blue-500 rounded-full" />
            <div className="w-8 h-8 rounded-xl bg-white dark:bg-zinc-800 shadow-[0_4px_14px_rgba(0,0,0,0.06)] border border-slate-200/60 dark:border-white/10 flex items-center justify-center text-xs font-bold text-slate-800 dark:text-zinc-200">
              A
            </div>
          </div>

          {/* Bottom Headline */}
          <div className="relative z-10 pt-4">
            <h2 className="text-3xl sm:text-4xl text-slate-900 dark:text-white font-serif font-normal tracking-tight leading-[1.15]">
              One Click Away from<br />
              <span className="italic font-serif">Studio-Grade Voice</span>
            </h2>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* RIGHT PANEL: Minimal, Elegant Auth Form                                   */}
        {/* ========================================================================= */}
        <div className="p-8 sm:p-12 lg:p-14 flex flex-col justify-center bg-white dark:bg-[#12151b]">
          <div className="max-w-[380px] w-full mx-auto">
            
            {/* Title & Subtitle */}
            <div className="mb-6">
              <h1 className="text-3xl font-serif text-slate-900 dark:text-white tracking-tight">
                Create an Account
              </h1>
              <p className="mt-1 text-xs text-slate-500 dark:text-zinc-400">
                You are few moments away from getting started!
              </p>
            </div>

            {/* Notifications / Errors */}
            {error && (
              <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-600 dark:text-red-400 flex items-start gap-2">
                <span>⚠️</span>
                <p className="flex-1">{error}</p>
              </div>
            )}

            {successMsg && (
              <div className="mb-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
                <span>✅</span>
                <p className="flex-1">{successMsg}</p>
              </div>
            )}

            {oauthNotice && (
              <div className="mb-4 rounded-xl border border-blue-500/20 bg-blue-500/10 p-3 text-xs text-blue-600 dark:text-blue-400 flex items-start gap-2 animate-in fade-in duration-150">
                <span>ℹ️</span>
                <p className="flex-1">{oauthNotice}</p>
              </div>
            )}

            {/* Checkbox: Send me tips, updates and offers */}
            <div className="mb-5 flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setSendTips(!sendTips)}
                className={`w-4 h-4 rounded border flex items-center justify-center transition cursor-pointer ${
                  sendTips
                    ? "bg-slate-900 border-slate-900 text-white dark:bg-white dark:border-white dark:text-black"
                    : "border-slate-300 dark:border-zinc-700 bg-transparent"
                }`}
              >
                {sendTips && (
                  <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
              <label
                onClick={() => setSendTips(!sendTips)}
                className="text-xs text-slate-700 dark:text-zinc-300 select-none cursor-pointer"
              >
                Send me tips, updates and offers
              </label>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Optional Name (Smoothly supported) */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1.5">
                  Name <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter your name"
                  className="w-full rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 px-4 py-3 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-zinc-600 outline-none focus:border-black dark:focus:border-white focus:ring-1 focus:ring-black dark:focus:ring-white transition"
                />
              </div>

              {/* Email */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1.5">
                  Email
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  className="w-full rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 px-4 py-3 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-zinc-600 outline-none focus:border-black dark:focus:border-white focus:ring-1 focus:ring-black dark:focus:ring-white transition"
                />
              </div>

              {/* Password */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 px-4 py-3 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-zinc-600 outline-none focus:border-black dark:focus:border-white focus:ring-1 focus:ring-black dark:focus:ring-white transition pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 transition cursor-pointer"
                  >
                    {showPassword ? (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {/* Terms disclaimer */}
              <p className="text-[11px] leading-relaxed text-slate-500 dark:text-zinc-400 pt-1">
                By signing up, you accept Voice Aura{" "}
                <Link href="/" className="underline hover:text-slate-800 dark:hover:text-zinc-200">
                  privacy policy
                </Link>{" "}
                and{" "}
                <Link href="/" className="underline hover:text-slate-800 dark:hover:text-zinc-200">
                  terms of service
                </Link>.
              </p>

              {/* Primary Sign Up Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-black text-white dark:bg-white dark:text-black py-3.5 text-sm font-semibold hover:bg-neutral-800 dark:hover:bg-zinc-200 active:scale-[0.99] transition shadow-md disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {loading ? "Creating account..." : "Sign up"}
              </button>
            </form>

            {/* Divider */}
            <div className="relative my-6 text-center">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200 dark:border-zinc-800" />
              </div>
              <span className="relative bg-white dark:bg-[#12151b] px-3 text-xs text-slate-400 dark:text-zinc-500">
                or
              </span>
            </div>

            {/* Social Authentication Buttons */}
            <div className="space-y-2.5">
              {/* Continue with Google */}
              <button
                type="button"
                onClick={() => handleSocialClick("Google")}
                className="w-full flex items-center justify-center gap-3 rounded-xl border border-slate-200 dark:border-zinc-800 hover:bg-slate-50 dark:hover:bg-zinc-900/50 py-3 text-sm font-medium text-slate-700 dark:text-zinc-200 transition shadow-2xs cursor-pointer active:scale-[0.99]"
              >
                {/* Official Google Vector Logo */}
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <span>Continue with Google</span>
              </button>

              {/* Continue with Microsoft */}
              <button
                type="button"
                onClick={() => handleSocialClick("Microsoft")}
                className="w-full flex items-center justify-center gap-3 rounded-xl border border-slate-200 dark:border-zinc-800 hover:bg-slate-50 dark:hover:bg-zinc-900/50 py-3 text-sm font-medium text-slate-700 dark:text-zinc-200 transition shadow-2xs cursor-pointer active:scale-[0.99]"
              >
                {/* Official Microsoft 4-square vector */}
                <svg className="w-4 h-4" viewBox="0 0 21 21">
                  <rect x="1" y="1" width="9" height="9" fill="#F25022" />
                  <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
                  <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
                  <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
                </svg>
                <span>Continue with Microsoft</span>
              </button>
            </div>

            {/* Bottom Link: Already have an account? Log In */}
            <div className="mt-8 text-center text-xs text-slate-500 dark:text-zinc-400">
              Already have an account?{" "}
              <Link href="/login" className="font-bold text-slate-900 dark:text-white hover:underline ml-1">
                Log In
              </Link>
            </div>

          </div>
        </div>

      </div>
    </main>
  );
}
