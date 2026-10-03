"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { API_BASE } from "../config";

function HalftoneWaveform({ isDark }: { isDark: boolean }) {
  const cols = 48;
  const rows = 58;
  const dots = [];

  for (let c = 0; c < cols; c++) {
    const x = 10 + c * 10.2;
    for (let r = 0; r < rows; r++) {
      const y = 10 + r * 10.2;

      // 1. Left Horizontal Waveform (envelope on left edge matching reference screenshot)
      let leftWaveIntensity = 0;
      if (x < 150) {
        const env = 75 * Math.pow(1 - x / 150, 0.7);
        const distY = Math.abs(y - 340);
        if (distY < env) {
          leftWaveIntensity = Math.pow(1 - distY / env, 0.6);
        }
      }

      // 2. Radial Circular Cluster centered behind/above the card (approx x=330, y=300)
      const distRad = Math.hypot(x - 330, y - 300);
      let radIntensity = 0;
      if (distRad < 190) {
        radIntensity = Math.pow(Math.cos((distRad / 190) * (Math.PI / 2)), 2.2);
      }

      const intensity = Math.max(leftWaveIntensity, radIntensity);

      let radius = 0.8;
      let fill = isDark ? "#1e293b" : "#e5e7eb";
      let opacity = isDark ? 0.3 : 0.35;

      if (intensity > 0.6) {
        radius = 2.8 + (intensity - 0.6) * 1.5;
        fill = isDark ? "#38bdf8" : "#000000";
        opacity = 0.95;
      } else if (intensity > 0.35) {
        radius = 2.0 + (intensity - 0.35) * 2.5;
        fill = isDark ? "#60a5fa" : "#1e293b";
        opacity = 0.8;
      } else if (intensity > 0.15) {
        radius = 1.4 + (intensity - 0.15) * 2.0;
        fill = isDark ? "#2563eb" : "#64748b";
        opacity = 0.55;
      } else if (intensity > 0.04) {
        radius = 1.0;
        fill = isDark ? "#1e3a8a" : "#cbd5e1";
        opacity = 0.4;
      }

      dots.push(
        <circle
          key={`${c}-${r}`}
          cx={x}
          cy={y}
          r={radius}
          fill={fill}
          opacity={opacity}
        />
      );
    }
  }

  return (
    <svg
      viewBox="0 0 500 600"
      className="w-full h-full object-cover pointer-events-none select-none"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {dots}
    </svg>
  );
}

export default function LoginPage() {
  const router = useRouter();

  // Theme toggler state: White theme is DEFAULT as requested
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const saved = localStorage.getItem("voice_auth_theme");
    if (saved === "dark") {
      setTheme("dark");
    }
  }, []);

  const toggleTheme = () => {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    localStorage.setItem("voice_auth_theme", next);
  };

  const isDark = theme === "dark";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [oauthNotice, setOauthNotice] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setOauthNotice(null);

    if (!email.trim() || !password) {
      setError("Please provide both email and password.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: email.trim(),
          password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Invalid email or password.");
      }

      if (typeof window !== "undefined") {
        localStorage.setItem("chatly_token", data.token);
        localStorage.setItem("chatly_user", JSON.stringify(data.user));
      }

      const isAdmin = data.user?.role === "admin";
      const targetPath = isAdmin ? "/admin" : "/voice";
      setSuccessMsg(`Welcome back, ${data.user.name || "Creator"}! Entering Studio...`);

      setTimeout(() => {
        router.push(targetPath);
      }, 700);
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred during login.");
    } finally {
      setLoading(false);
    }
  };

  const handleSocialClick = (provider: string) => {
    setOauthNotice(`${provider} OAuth integration will be connected soon. Please log in with your email and password for now.`);
  };

  return (
    <div
      data-theme={theme}
      style={{
        backgroundColor: isDark ? "#06080e" : "#e0e0e0",
        color: isDark ? "#f3f4f6" : "#111827",
      }}
      className="min-h-screen relative flex flex-col justify-center items-center transition-colors duration-200"
    >
      {/* Discreet Theme Switcher floating at top right */}
      <button
        type="button"
        onClick={toggleTheme}
        aria-label="Toggle theme"
        className={`fixed top-4 right-4 z-50 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium backdrop-blur-md border transition shadow-sm cursor-pointer ${
          isDark
            ? "bg-zinc-800/80 text-zinc-200 border-zinc-700/80 hover:bg-zinc-700/80"
            : "bg-white/80 text-neutral-800 border-neutral-300 hover:bg-white"
        }`}
      >
        <span>{isDark ? "☀️ Light Mode" : "🌙 Dark Mode"}</span>
      </button>

      {/* ========================================================================= */}
      {/* 1. LAPTOP / DESKTOP VIEW (Visible on lg and larger screens)                */}
      {/* Exact white color code is completely untouched when in default Light mode! */}
      {/* ========================================================================= */}
      <main className="hidden lg:flex w-full items-center justify-center p-6 lg:p-10 font-sans selection:bg-black selection:text-white">
        {/* Central Auth Canvas Card */}
        <div
          style={{
            backgroundColor: isDark ? "#11141c" : "#ffffff",
            borderColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.8)",
          }}
          className="w-full max-w-[1020px] rounded-[36px] shadow-[0_25px_60px_-15px_rgba(0,0,0,0.08)] border overflow-hidden grid grid-cols-2"
        >
          {/* Left Panel: Studio Showcase */}
          <div
            style={{
              backgroundColor: isDark ? "#151923" : "#f6f6f7",
              borderColor: isDark ? "rgba(255,255,255,0.06)" : "#e5e7eb",
            }}
            className="relative p-10 lg:p-12 flex flex-col justify-between overflow-hidden border-r min-h-[660px]"
          >
            {/* Halftone Audio Waveform Graphics */}
            <div className="absolute inset-0 z-0 flex items-center justify-center pointer-events-none">
              <HalftoneWaveform isDark={isDark} />
            </div>

            {/* Top Brand Bar */}
            <div className="relative z-10 flex items-center justify-between">
              <Link href="/" className="inline-flex items-center gap-2 group">
                <div className={`flex items-center gap-[3px] ${isDark ? "text-white" : "text-black"}`}>
                  <span className="w-[3px] h-2.5 rounded-full bg-current" />
                  <span className="w-[3px] h-4.5 rounded-full bg-current" />
                  <span className="w-[3px] h-2 rounded-full bg-current" />
                  <span className="w-[3px] h-3.5 rounded-full bg-current" />
                  <span className="w-[3px] h-2.5 rounded-full bg-current" />
                </div>
                <span className={`text-sm font-bold tracking-wider uppercase font-sans ${isDark ? "text-white" : "text-black"}`}>
                  VOICE AURA
                </span>
              </Link>
            </div>

            {/* Floating Pill on top-left */}
            <div className="relative z-10 my-2 flex items-center gap-2">
              <div
                style={{
                  backgroundColor: isDark ? "#1e2230" : "#ffffff",
                  borderColor: isDark ? "rgba(255,255,255,0.1)" : "#e5e7eb",
                }}
                className="w-10 h-10 rounded-2xl shadow-[0_4px_16px_rgba(0,0,0,0.06)] border flex items-center justify-center"
              >
                <div className={`flex items-center gap-[2.5px] ${isDark ? "text-cyan-400" : "text-neutral-800"}`}>
                  <span className="w-[2px] h-2 rounded-full bg-current" />
                  <span className="w-[2px] h-3.5 rounded-full bg-current" />
                  <span className="w-[2px] h-1.5 rounded-full bg-current" />
                  <span className="w-[2px] h-3 rounded-full bg-current" />
                </div>
              </div>
              <div className="w-6 h-[2.5px] bg-[#1d6ee5] rounded-full" />
            </div>

            {/* Center Floating Glass Card */}
            <div className="relative z-10 my-auto py-2">
              <div
                style={{
                  backgroundColor: isDark ? "rgba(23, 27, 38, 0.92)" : "rgba(255, 255, 255, 0.95)",
                  borderColor: isDark ? "rgba(255,255,255,0.08)" : "#ffffff",
                }}
                className="relative backdrop-blur-md rounded-2xl border shadow-[0_16px_40px_-10px_rgba(0,0,0,0.08)] p-5 sm:p-6 max-w-[395px] overflow-hidden before:absolute before:top-0 before:left-0 before:w-28 before:h-20 before:bg-blue-400/15 before:blur-xl before:pointer-events-none"
              >
                {/* Tab Switcher */}
                <div className="flex items-center gap-2 mb-3.5">
                  <div
                    style={{
                      backgroundColor: isDark ? "#202636" : "#ffffff",
                      borderColor: isDark ? "rgba(255,255,255,0.1)" : "#e5e7eb",
                      color: isDark ? "#ffffff" : "#111827",
                    }}
                    className="relative inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl shadow-xs border text-xs font-semibold after:absolute after:bottom-0 after:left-3 after:right-3 after:h-[2px] after:bg-[#1d6ee5] after:rounded-full"
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="4" y="4" width="13" height="13" rx="2" />
                      <rect x="7" y="7" width="13" height="13" rx="2" />
                    </svg>
                    <span>Text to Speech</span>
                  </div>
                  <div className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-400 hover:text-neutral-500 transition cursor-pointer">
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 4v16m-8-8h16" />
                    </svg>
                    <span>Upload File</span>
                  </div>
                </div>

                {/* Description */}
                <p className={`text-xs leading-relaxed mb-4 font-serif ${isDark ? "text-neutral-300" : "text-neutral-600"}`}>
                  Unlock the power of intelligent voice technology through interactive voice projects. Learn the core AI skills behind speech recognition, natural language, and smart voice experiences.
                </p>

                {/* Tags */}
                <div className="flex flex-wrap gap-1.5 text-[11px]">
                  <span
                    style={{
                      backgroundColor: isDark ? "#202636" : "#ffffff",
                      borderColor: isDark ? "rgba(255,255,255,0.1)" : "#e5e7eb",
                      color: isDark ? "#ffffff" : "#1f2937",
                    }}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl border font-medium shadow-[0_2px_8px_rgba(29,110,229,0.12)]"
                  >
                    <span className="w-4 h-4 rounded-md border border-neutral-300 dark:border-neutral-700 flex items-center justify-center text-[8px]">▶</span>
                    YouTube
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-neutral-400 font-medium">
                    <svg className="w-3.5 h-3.5 text-neutral-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M9 18V5l12-2v13" />
                      <circle cx="6" cy="18" r="3" />
                      <circle cx="18" cy="16" r="3" />
                    </svg>
                    Narration
                  </span>
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-neutral-400 font-medium">
                    <span className="text-[10px] font-bold border border-neutral-300 dark:border-neutral-700 rounded px-1 text-neutral-400">Ad</span>
                    Advertisement
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-neutral-400 font-medium">
                    <svg className="w-3.5 h-3.5 text-neutral-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="2" />
                      <path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14" />
                    </svg>
                    Podcast
                  </span>
                </div>
              </div>
            </div>

            {/* Floating Pill bottom-right */}
            <div className="relative z-10 flex justify-end items-center gap-2 my-2 pr-6">
              <div className="w-6 h-[2.5px] bg-[#1d6ee5] rounded-full" />
              <div
                style={{
                  backgroundColor: isDark ? "#1e2230" : "#ffffff",
                  borderColor: isDark ? "rgba(255,255,255,0.1)" : "#e5e7eb",
                  color: isDark ? "#ffffff" : "#1f2937",
                }}
                className="w-9 h-9 rounded-2xl shadow-[0_4px_16px_rgba(0,0,0,0.06)] border flex items-center justify-center text-xs font-serif font-bold"
              >
                A
              </div>
            </div>

            {/* Bottom Headline */}
            <div className="relative z-10 pt-4">
              <h2 className={`text-3xl sm:text-4xl font-serif font-normal tracking-tight leading-[1.18] ${isDark ? "text-white" : "text-black"}`}>
                One Click Away from<br />
                <span>Studio-Grade Voice</span>
              </h2>
            </div>
          </div>

          {/* Right Panel: Laptop Auth Form */}
          <div
            style={{ backgroundColor: isDark ? "#11141c" : "#ffffff" }}
            className="p-10 lg:p-14 flex flex-col justify-center"
          >
            <div className="max-w-[360px] w-full mx-auto">
              <div className="mb-6">
                <h1 className={`text-3xl font-serif tracking-tight ${isDark ? "text-white" : "text-[#111111]"}`}>
                  Welcome Back
                </h1>
                <p className={`mt-1 text-xs font-sans ${isDark ? "text-neutral-400" : "text-neutral-500"}`}>
                  You are few moments away from resuming your voice studio!
                </p>
              </div>

              {error && (
                <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-500 flex items-start gap-2">
                  <span>⚠️</span>
                  <p className="flex-1">{error}</p>
                </div>
              )}

              {successMsg && (
                <div className="mb-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs text-emerald-500 flex items-center gap-2">
                  <span>✅</span>
                  <p className="flex-1">{successMsg}</p>
                </div>
              )}

              {oauthNotice && (
                <div className="mb-4 rounded-xl border border-blue-500/20 bg-blue-500/10 p-3 text-xs text-blue-400 flex items-start gap-2">
                  <span>ℹ️</span>
                  <p className="flex-1">{oauthNotice}</p>
                </div>
              )}

              {/* Checkbox & Forgot Password */}
              <div className="mb-5 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setRememberMe(!rememberMe)}
                    style={{
                      backgroundColor: isDark ? "#1a1e2c" : "#ffffff",
                      borderColor: isDark ? "rgba(255,255,255,0.15)" : "#d1d5db",
                    }}
                    className="w-4 h-4 rounded-md border flex items-center justify-center transition cursor-pointer"
                  >
                    {rememberMe && (
                      <svg className="w-2.5 h-2.5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                  <label
                    onClick={() => setRememberMe(!rememberMe)}
                    className={`text-xs select-none cursor-pointer ${isDark ? "text-neutral-300" : "text-neutral-700"}`}
                  >
                    Remember me for 30 days
                  </label>
                </div>
                <Link href="/" className={`text-xs hover:underline ${isDark ? "text-neutral-400 hover:text-white" : "text-neutral-500 hover:text-black"}`}>
                  Forgot password?
                </Link>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className={`block text-xs font-semibold mb-1.5 ${isDark ? "text-neutral-300" : "text-neutral-800"}`}>
                    Email
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your email"
                    style={{
                      backgroundColor: isDark ? "#171b26" : "#ffffff",
                      color: isDark ? "#ffffff" : "#111827",
                      borderColor: isDark ? "rgba(255,255,255,0.12)" : "#e5e7eb",
                    }}
                    className="w-full rounded-xl border px-4 py-3 text-sm placeholder:text-neutral-400 outline-none focus:border-blue-500 transition"
                  />
                </div>

                <div>
                  <label className={`block text-xs font-semibold mb-1.5 ${isDark ? "text-neutral-300" : "text-neutral-800"}`}>
                    Password
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••••••"
                      style={{
                        backgroundColor: isDark ? "#171b26" : "#ffffff",
                        color: isDark ? "#ffffff" : "#111827",
                        borderColor: isDark ? "rgba(255,255,255,0.12)" : "#e5e7eb",
                      }}
                      className="w-full rounded-xl border px-4 py-3 text-sm placeholder:text-neutral-400 outline-none focus:border-blue-500 transition pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-500 transition cursor-pointer"
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

                <p className="text-[11px] leading-relaxed text-neutral-400 pt-1">
                  By logging in, you accept Voice Aura{" "}
                  <Link href="/" className={`font-semibold hover:underline ${isDark ? "text-neutral-200" : "text-neutral-800"}`}>
                    privacy policy
                  </Link>{" "}
                  and{" "}
                  <Link href="/" className={`font-semibold hover:underline ${isDark ? "text-neutral-200" : "text-neutral-800"}`}>
                    terms of service
                  </Link>.
                </p>

                {/* Primary Button */}
                <button
                  type="submit"
                  disabled={loading}
                  style={
                    isDark
                      ? {
                          background: "linear-gradient(90deg, #74aefb 0%, #89d9f8 50%, #68e8fa 100%)",
                          color: "#061024",
                        }
                      : { backgroundColor: "#000000", color: "#ffffff" }
                  }
                  className="w-full rounded-2xl py-3.5 text-sm font-semibold hover:opacity-90 active:scale-[0.99] transition shadow-md disabled:opacity-50 cursor-pointer"
                >
                  {loading ? "Signing in..." : "Log in"}
                </button>
              </form>

              {/* Divider */}
              <div className="relative my-6 text-center">
                <div className="absolute inset-0 flex items-center">
                  <div className={`w-full border-t ${isDark ? "border-zinc-800" : "border-[#e5e7eb]"}`} />
                </div>
                <span
                  style={{ backgroundColor: isDark ? "#11141c" : "#ffffff" }}
                  className="relative px-3 text-xs text-neutral-400"
                >
                  or
                </span>
              </div>

              {/* Social Buttons */}
              <div className="space-y-2.5">
                <button
                  type="button"
                  onClick={() => handleSocialClick("Google")}
                  style={{
                    backgroundColor: isDark ? "#171b26" : "#ffffff",
                    borderColor: isDark ? "rgba(255,255,255,0.12)" : "#e5e7eb",
                    color: isDark ? "#f3f4f6" : "#374151",
                  }}
                  className="w-full flex items-center justify-center gap-3 rounded-2xl border hover:opacity-90 py-3 text-sm font-medium transition cursor-pointer active:scale-[0.99]"
                >
                  <span className="font-serif font-black text-sm text-neutral-400">G</span>
                  <span>Continue with Google</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSocialClick("Microsoft")}
                  style={{
                    backgroundColor: isDark ? "#171b26" : "#ffffff",
                    borderColor: isDark ? "rgba(255,255,255,0.12)" : "#e5e7eb",
                    color: isDark ? "#f3f4f6" : "#374151",
                  }}
                  className="w-full flex items-center justify-center gap-3 rounded-2xl border hover:opacity-90 py-3 text-sm font-medium transition cursor-pointer active:scale-[0.99]"
                >
                  <div className="grid grid-cols-2 gap-0.5 w-3.5 h-3.5">
                    <div className="bg-neutral-500 rounded-[1px]" />
                    <div className="bg-neutral-500 rounded-[1px]" />
                    <div className="bg-neutral-500 rounded-[1px]" />
                    <div className="bg-neutral-500 rounded-[1px]" />
                  </div>
                  <span>Continue with Microsoft</span>
                </button>
              </div>

              <div className="mt-8 text-center text-xs text-neutral-400 font-serif">
                Don&apos;t have an account?{" "}
                <Link href="/signup" className={`font-bold hover:underline ml-1 ${isDark ? "text-white" : "text-black"}`}>
                  Sign Up
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* ========================================================================= */}
      {/* 2. DEDICATED MOBILE VERTICAL VIEW (Visible on mobile/tablet < lg)         */}
      {/* Matching the provided mobile layout with atmospheric radiant blue glow     */}
      {/* ========================================================================= */}
      <main
        style={{
          background: isDark
            ? "radial-gradient(ellipse at 85% 0%, rgba(125, 198, 239, 0.45) 0%, rgba(73, 124, 241, 0.35) 25%, rgba(18, 32, 70, 0.4) 50%, #030611 80%)"
            : "radial-gradient(ellipse at 85% 0%, rgba(191, 219, 254, 0.5) 0%, rgba(224, 231, 255, 0.4) 30%, #f4f5f8 75%)",
          backgroundColor: isDark ? "#030611" : "#f4f5f8",
        }}
        className="lg:hidden flex flex-col justify-between w-full min-h-screen px-6 py-8 relative overflow-hidden"
      >
        <div className="w-full max-w-[420px] mx-auto flex-1 flex flex-col justify-between">
          {/* Top Brand Bar */}
          <div className="flex items-center justify-between pt-2 mb-8">
            <Link href="/" className="inline-flex items-center gap-2.5">
              {/* Modern Wing / Acoustic Shape mark matching mobile reference */}
              <div className="w-8 h-8 rounded-xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center text-blue-400">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
                </svg>
              </div>
              <span className={`text-xl font-bold tracking-tight ${isDark ? "text-white" : "text-neutral-900"}`}>
                Voice Aura
              </span>
            </Link>
          </div>

          {/* Center Mobile Form Content */}
          <div className="my-auto py-4">
            <div className="text-center mb-6">
              <h1 className={`text-3xl font-bold tracking-tight mb-2 ${isDark ? "text-white" : "text-neutral-900"}`}>
                Hi There!
              </h1>
              <p className={`text-xs max-w-[280px] mx-auto leading-relaxed ${isDark ? "text-slate-300" : "text-neutral-600"}`}>
                Please enter required details to enter your voice studio.
              </p>
            </div>

            {/* Error / Notice Banners */}
            {error && (
              <div className="mb-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400 flex items-center gap-2">
                <span>⚠️</span>
                <p className="flex-1">{error}</p>
              </div>
            )}

            {successMsg && (
              <div className="mb-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-400 flex items-center gap-2">
                <span>✅</span>
                <p className="flex-1">{successMsg}</p>
              </div>
            )}

            {oauthNotice && (
              <div className="mb-4 rounded-2xl border border-blue-500/30 bg-blue-500/10 p-3 text-xs text-blue-300 flex items-center gap-2">
                <span>ℹ️</span>
                <p className="flex-1">{oauthNotice}</p>
              </div>
            )}

            {/* Side-by-Side Social Buttons matching mobile screenshot */}
            <div className="grid grid-cols-2 gap-3 mb-5">
              <button
                type="button"
                onClick={() => handleSocialClick("Google")}
                style={{
                  backgroundColor: isDark ? "rgba(23, 28, 45, 0.85)" : "#ffffff",
                  borderColor: isDark ? "rgba(255, 255, 255, 0.12)" : "#e2e8f0",
                }}
                className={`flex items-center justify-center gap-2 py-3 rounded-2xl border text-xs font-semibold backdrop-blur-md active:scale-[0.98] transition cursor-pointer ${
                  isDark ? "text-white" : "text-neutral-800"
                }`}
              >
                {/* Google Colored Logo */}
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
                <span>Google</span>
              </button>

              <button
                type="button"
                onClick={() => handleSocialClick("Apple")}
                style={{
                  backgroundColor: isDark ? "rgba(23, 28, 45, 0.85)" : "#ffffff",
                  borderColor: isDark ? "rgba(255, 255, 255, 0.12)" : "#e2e8f0",
                }}
                className={`flex items-center justify-center gap-2 py-3 rounded-2xl border text-xs font-semibold backdrop-blur-md active:scale-[0.98] transition cursor-pointer ${
                  isDark ? "text-white" : "text-neutral-800"
                }`}
              >
                {/* Apple Vector Logo */}
                <svg className="w-4 h-4 fill-current" viewBox="0 0 170 170">
                  <path d="M150.37 130.25c-2.45 5.66-5.35 10.87-8.71 15.66-4.58 6.53-8.33 11.05-11.22 13.56-4.48 4.12-9.28 6.23-14.42 6.35-3.69 0-8.14-1.05-13.32-3.18-5.19-2.12-9.97-3.17-14.34-3.17-4.58 0-9.49 1.05-14.75 3.17-5.26 2.13-9.5 3.24-12.74 3.35-4.35.13-9.16-1.9-14.42-6.08-3.7-3.04-7.6-7.85-11.71-14.43-5.78-9.24-10.23-19.8-13.33-31.69-3.1-11.89-4.66-23.47-4.66-34.74 0-14.93 3.65-27.18 10.96-36.75 7.3-9.57 16.59-14.42 27.87-14.56 5.56 0 11.27 1.45 17.15 4.35 5.88 2.91 10.15 4.41 12.82 4.51 2.07 0 6.64-1.63 13.72-4.89 7.07-3.26 13.43-4.66 19.06-4.22 14.19 1.14 25.13 6.66 32.82 16.55-12.63 7.64-18.8 17.88-18.52 30.73.28 10.16 4.18 18.66 11.71 25.49 7.53 6.83 16.49 10.66 26.88 11.48-2.39 7.29-5.49 14.59-9.31 21.9zM119.22 31.84c0-7.39 2.65-14.47 7.96-21.25 5.3-6.78 12.01-10.59 20.12-11.43.22 1.41.33 2.72.33 3.92 0 7.39-2.73 14.42-8.19 21.09-5.46 6.67-12.22 10.45-20.22 11.34v-3.67z" />
                </svg>
                <span>Apple</span>
              </button>
            </div>

            {/* Subtle Divider */}
            <div className="relative my-4 text-center">
              <div className="absolute inset-0 flex items-center">
                <div className={`w-full border-t ${isDark ? "border-slate-800" : "border-slate-300"}`} />
              </div>
              <span
                style={{
                  backgroundColor: isDark ? "#080d1a" : "#f4f5f8",
                  color: isDark ? "#64748b" : "#94a3b8",
                }}
                className="relative px-3 text-[11px] font-medium"
              >
                Or
              </span>
            </div>

            {/* Mobile Form */}
            <form onSubmit={handleSubmit} className="space-y-3.5">
              <div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email address"
                  style={{
                    backgroundColor: isDark ? "rgba(19, 23, 38, 0.85)" : "#ffffff",
                    borderColor: isDark ? "rgba(255, 255, 255, 0.12)" : "#e2e8f0",
                    color: isDark ? "#ffffff" : "#0f172a",
                  }}
                  className="w-full rounded-2xl border px-4 py-3.5 text-sm placeholder:text-slate-400 outline-none focus:border-cyan-400 backdrop-blur-md transition"
                />
              </div>

              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  style={{
                    backgroundColor: isDark ? "rgba(19, 23, 38, 0.85)" : "#ffffff",
                    borderColor: isDark ? "rgba(255, 255, 255, 0.12)" : "#e2e8f0",
                    color: isDark ? "#ffffff" : "#0f172a",
                  }}
                  className="w-full rounded-2xl border px-4 py-3.5 text-sm placeholder:text-slate-400 outline-none focus:border-cyan-400 backdrop-blur-md transition pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition"
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

              {/* Forgot Password Link right-aligned matching mobile screenshot */}
              <div className="flex justify-end pt-0.5">
                <Link
                  href="/"
                  className={`text-xs hover:underline ${isDark ? "text-slate-300 hover:text-white" : "text-neutral-600 hover:text-black"}`}
                >
                  Forgot Password?
                </Link>
              </div>

              {/* Glowing Gradient Action Button matching mobile reference */}
              <button
                type="submit"
                disabled={loading}
                style={{
                  background: "linear-gradient(90deg, #74aefb 0%, #89d9f8 50%, #68e8fa 100%)",
                  boxShadow: "0 8px 25px rgba(104, 232, 250, 0.28)",
                }}
                className="w-full rounded-2xl py-3.5 text-sm font-semibold text-[#061024] hover:opacity-95 active:scale-[0.98] transition cursor-pointer disabled:opacity-50 mt-2"
              >
                {loading ? "Signing in..." : "Log In"}
              </button>
            </form>

            {/* Switch Account link matching mobile reference */}
            <div className="mt-5 text-center text-xs">
              <span className={isDark ? "text-slate-400" : "text-neutral-500"}>Create an account? </span>
              <Link
                href="/signup"
                className={`font-semibold hover:underline ${isDark ? "text-white" : "text-neutral-900"}`}
              >
                Sign Up
              </Link>
            </div>
          </div>

          {/* Mobile Footer */}
          <div className="text-center pt-6 pb-2 text-[11px] text-slate-500">
            <Link href="/" className="hover:underline">
              Terms of Service
            </Link>{" "}
            |{" "}
            <Link href="/" className="hover:underline">
              Privacy Policy
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
