"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { API_BASE } from "../config";

export default function SignupPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!name.trim() || !email.trim() || !password) {
      setError("Please fill in all required fields.");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match. Please verify.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${API_BASE}/api/auth/signup`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to create account. Please try again.");
      }

      // Store JWT token and user info
      if (typeof window !== "undefined") {
        localStorage.setItem("chatly_token", data.token);
        localStorage.setItem("chatly_user", JSON.stringify(data.user));
      }

      const isAdmin =
        data.user?.role === "admin" ||
        data.user?.email?.toLowerCase() === "r19216871@gamil.com" ||
        data.user?.email?.toLowerCase() === "r19216871@gmail.com";

      const targetPath = isAdmin ? "/admin" : "/dashboard";
      setSuccessMsg("Account created successfully! Redirecting to Dashboard...");

      // Smoothly redirect to appropriate dashboard
      setTimeout(() => {
        router.push(targetPath);
      }, 800);
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#07080a] text-white flex flex-col justify-center items-center px-4 py-12 selection:bg-emerald-500 selection:text-white relative overflow-hidden">
      {/* Background ambient lighting */}
      <div className="absolute top-1/4 -left-32 h-80 w-80 rounded-full bg-emerald-500/10 blur-[100px] pointer-events-none" />
      <div className="absolute bottom-1/4 -right-32 h-80 w-80 rounded-full bg-cyan-500/10 blur-[100px] pointer-events-none" />

      {/* Navigation Header */}
      <nav className="absolute top-0 left-0 right-0 max-w-6xl mx-auto flex items-center justify-between px-6 py-6 w-full">
        <Link href="/" className="text-xl font-semibold tracking-tight hover:opacity-80 transition">
          Chatly
        </Link>
        <Link
          href="/login"
          className="text-xs font-medium text-zinc-400 hover:text-white px-3 py-1.5 rounded-lg border border-white/5 hover:border-white/10 bg-white/[0.02] transition"
        >
          Sign in →
        </Link>
      </nav>

      <div className="w-full max-w-md">
        {/* Card Container */}
        <div className="rounded-3xl border border-white/10 bg-zinc-950/80 p-6 sm:p-8 shadow-2xl backdrop-blur-xl relative">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-emerald-500/20 to-teal-500/10 border border-emerald-500/30 text-2xl shadow-inner shadow-emerald-500/20">
              ✨
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Create your account</h1>
            <p className="mt-1.5 text-xs sm:text-sm text-zinc-400">
              Join Chatly to experience natural, real-time voice AI conversations
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-5 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs leading-5 text-red-300 flex items-start gap-2 animate-in fade-in duration-150">
              <span className="text-sm">⚠️</span>
              <p className="flex-1">{error}</p>
            </div>
          )}

          {/* Success Message */}
          {successMsg && (
            <div className="mb-5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs leading-5 text-emerald-300 flex items-center gap-2 animate-in fade-in duration-150">
              <span className="text-sm">✅</span>
              <p className="flex-1">{successMsg}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Full Name */}
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                Full Name
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="John Doe"
                className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-base sm:text-sm text-white placeholder:text-zinc-600 outline-none focus:border-emerald-500/50 focus:bg-white/[0.05] transition"
              />
            </div>

            {/* Email Address */}
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                Email Address
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-emerald-500/50 focus:bg-white/[0.05] transition"
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-emerald-500/50 focus:bg-white/[0.05] transition pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3 text-xs text-zinc-500 hover:text-zinc-300 transition cursor-pointer"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            {/* Confirm Password */}
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                Confirm Password
              </label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repeat your password"
                className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-emerald-500/50 focus:bg-white/[0.05] transition"
              />
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full cursor-pointer rounded-xl bg-white py-3.5 text-sm font-semibold text-black transition hover:bg-zinc-200 active:scale-[0.98] shadow-lg shadow-white/10 disabled:opacity-50 disabled:cursor-not-allowed mt-2"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-3.5 w-3.5 rounded-full border-2 border-black border-t-transparent animate-spin" />
                  Creating Account...
                </span>
              ) : (
                "Create Account →"
              )}
            </button>
          </form>

          {/* Footer link to Login */}
          <p className="mt-6 text-center text-xs text-zinc-400">
            Already have an account?{" "}
            <Link
              href="/login"
              className="text-emerald-400 hover:text-emerald-300 font-semibold underline underline-offset-4"
            >
              Sign in
            </Link>
          </p>
        </div>

        {/* Security badge */}
        <div className="mt-5 flex items-center justify-center gap-2 text-xs text-zinc-600">
          <span>🔒 Salted bcrypt encryption & JWT protection</span>
        </div>
      </div>
    </main>
  );
}
