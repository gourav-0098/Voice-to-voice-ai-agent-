"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { API_BASE } from "../config";
import { ThemeToggle } from "../components/ThemeToggle";

interface UserProfile {
  id: string;
  name: string;
  email: string;
  role?: string;
  avatar?: string;
  dob?: string;
  bio?: string;
  gender?: string;
  phone?: string;
  location?: string;
  jobTitle?: string;
  preferredLanguage?: string;
  voicePersonaPreference?: string;
  createdAt?: string;
  updatedAt?: string;
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);

  const [resettingMemory, setResettingMemory] = useState(false);
  const [memoryMessage, setMemoryMessage] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    avatar: "",
    dob: "",
    bio: "",
    gender: "not_specified",
    phone: "",
    location: "",
    jobTitle: "",
    preferredLanguage: "auto",
    voicePersonaPreference: "friendly",
  });

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
            setFormData({
              name: data.user.name || "",
              avatar: data.user.avatar || "",
              dob: data.user.dob || "",
              bio: data.user.bio || "",
              gender: data.user.gender || "not_specified",
              phone: data.user.phone || "",
              location: data.user.location || "",
              jobTitle: data.user.jobTitle || "",
              preferredLanguage: data.user.preferredLanguage || "auto",
              voicePersonaPreference: data.user.voicePersonaPreference || "friendly",
            });
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

  // Image Upload & Client-Side Compression Handler
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setSaveMessage({ type: "error", text: "Please upload an image file (PNG, JPG, or WebP)." });
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      setSaveMessage({ type: "error", text: "Image is too large. Please select a photo under 8MB." });
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX_DIM = 400;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_DIM) {
            height = Math.round((height * MAX_DIM) / width);
            width = MAX_DIM;
          }
        } else {
          if (height > MAX_DIM) {
            width = Math.round((width * MAX_DIM) / height);
            height = MAX_DIM;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressed = canvas.toDataURL("image/jpeg", 0.86);
          setFormData((prev) => ({ ...prev, avatar: compressed }));
          setSaveMessage({
            type: "info",
            text: "Photo ready! Click 'Save Profile Changes' below to update.",
          });
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleRemovePhoto = () => {
    setFormData((prev) => ({ ...prev, avatar: "" }));
    if (fileInputRef.current) fileInputRef.current.value = "";
    setSaveMessage({ type: "info", text: "Photo removed. Click 'Save Profile Changes' to apply." });
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = typeof window !== "undefined" ? localStorage.getItem("chatly_token") : null;
    if (!token) return;

    if (!formData.name.trim()) {
      setSaveMessage({ type: "error", text: "Name cannot be empty." });
      return;
    }

    setSaving(true);
    setSaveMessage(null);

    try {
      const res = await fetch(`${API_BASE}/api/auth/profile`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to update profile.");
      }

      if (data.user) {
        setUser(data.user);
        localStorage.setItem("chatly_user", JSON.stringify(data.user));
        setSaveMessage({ type: "success", text: "Profile details updated successfully!" });
        setTimeout(() => setSaveMessage(null), 4000);
      }
    } catch (err: any) {
      setSaveMessage({ type: "error", text: err.message || "Failed to save profile." });
    } finally {
      setSaving(false);
    }
  };

  const calculateAge = (dobString?: string) => {
    if (!dobString) return null;
    const birthDate = new Date(dobString);
    if (isNaN(birthDate.getTime())) return null;
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age >= 0 && age < 130 ? age : null;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#07080a] flex items-center justify-center text-slate-900 dark:text-white">
        <div className="flex items-center gap-3 text-sm text-slate-500 dark:text-zinc-400">
          <span className="h-4 w-4 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
          Loading your dashboard...
        </div>
      </div>
    );
  }

  const isAdmin =
    user?.role === "admin" ||
    user?.email?.toLowerCase() === "r19216871@gamil.com" ||
    user?.email?.toLowerCase() === "r19216871@gmail.com";

  const remainingHourly = typeof user?.quota?.remainingHourly === "number" ? user.quota.remainingHourly : 30;
  const remainingDaily = "Unlimited";

  const hourlyPct = Math.min(100, Math.max(0, ((typeof remainingHourly === "number" ? remainingHourly : 30) / 30) * 100));
  const dailyPct = 100;

  const userAge = calculateAge(formData.dob);

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-[#07080a] text-slate-900 dark:text-white selection:bg-emerald-500 selection:text-white flex flex-col relative overflow-hidden transition-colors duration-200">
      {/* Ambient background glows */}
      <div className="absolute top-10 left-1/4 h-96 w-96 rounded-full bg-emerald-500/10 blur-[130px] pointer-events-none" />
      <div className="absolute bottom-10 right-1/4 h-96 w-96 rounded-full bg-cyan-500/10 blur-[130px] pointer-events-none" />

      {/* NAVBAR */}
      <nav className="border-b border-slate-200 dark:border-white/10 bg-white/80 dark:bg-zinc-950/40 backdrop-blur-md sticky top-0 z-40 transition-colors">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 sm:py-0 sm:h-16 flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2 sm:gap-4">
            <Link
              href="/"
              className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 dark:text-white hover:opacity-80 transition flex items-center gap-2"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-tr from-emerald-500 to-teal-400 text-black text-xs font-bold shadow-xs">
                🎙️
              </span>
              Chatly
            </Link>
            <span className="text-slate-300 dark:text-zinc-600">/</span>
            <span className="text-xs sm:text-sm font-medium text-slate-600 dark:text-zinc-300">Account Dashboard</span>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <ThemeToggle />

            {isAdmin && (
              <Link
                href="/admin"
                className="flex items-center gap-1.5 rounded-full border border-slate-200 dark:border-white/10 bg-slate-100/80 dark:bg-white/5 px-2.5 sm:px-3 py-1 sm:py-1.5 text-[11px] sm:text-xs font-medium text-slate-700 dark:text-zinc-300 shadow-xs hover:bg-slate-200/70 dark:hover:bg-white/10 transition"
              >
                <svg
                  className="w-3.5 h-3.5 text-slate-500 dark:text-zinc-400"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
                <span>Admin</span>
                <span className="text-slate-400 dark:text-zinc-500 text-[10px]">→</span>
              </Link>
            )}

            <Link
              href="/voice"
              className="rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-white dark:text-black dark:hover:bg-zinc-200 px-3 sm:px-4 py-1.5 sm:py-2 text-xs font-semibold transition shadow-xs"
            >
              🎙️ Voice AI
            </Link>

            <button
              onClick={handleLogout}
              className="rounded-xl border border-slate-200 bg-white text-slate-700 hover:text-red-600 hover:border-red-200 dark:border-white/10 dark:bg-transparent dark:text-zinc-400 dark:hover:text-red-400 px-2.5 sm:px-3 py-1.5 sm:py-2 text-xs font-medium transition cursor-pointer shadow-xs dark:shadow-none"
            >
              Sign out
            </button>
          </div>
        </div>
      </nav>

      {/* DASHBOARD CONTENT */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10 w-full flex-1 relative z-10 space-y-6 sm:space-y-8">
        {/* PROFILE HEADER HERO */}
        <div className="rounded-3xl border border-slate-200 dark:border-white/10 bg-white dark:bg-gradient-to-tr dark:from-white/[0.04] dark:to-white/[0.01] p-5 sm:p-8 backdrop-blur-xl relative overflow-hidden shadow-xs dark:shadow-none">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-center gap-4 sm:gap-6">
              {/* Avatar with Click to Change */}
              <div className="relative group shrink-0">
                {formData.avatar ? (
                  <img
                    src={formData.avatar}
                    alt={formData.name || "Profile"}
                    className="h-20 w-20 sm:h-24 sm:w-24 rounded-2xl object-cover border-2 border-emerald-500 shadow-md shadow-emerald-500/20"
                  />
                ) : (
                  <div className="h-20 w-20 sm:h-24 sm:w-24 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-3xl font-bold text-black shadow-md shadow-emerald-500/20">
                    {formData.name ? formData.name[0].toUpperCase() : "U"}
                  </div>
                )}

                {/* Upload Hover Overlay */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute inset-0 rounded-2xl bg-black/50 text-white opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center gap-1 transition cursor-pointer text-xs font-semibold backdrop-blur-xs"
                  title="Upload profile picture"
                >
                  <span className="text-base">📷</span>
                  <span className="text-[10px]">Change</span>
                </button>
              </div>

              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
                    {formData.name || user?.name || "User"}
                  </h1>
                  {isAdmin ? (
                    <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 text-[10px] sm:text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 uppercase tracking-wider">
                      🛡️ Admin
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 px-2 py-0.5 text-[10px] sm:text-[11px] font-medium text-slate-600 dark:text-zinc-400 uppercase tracking-wider">
                      Voice Explorer
                    </span>
                  )}
                </div>

                <p className="mt-1 text-xs sm:text-sm text-slate-500 dark:text-zinc-400">
                  {user?.email}
                  {formData.location && ` • 📍 ${formData.location}`}
                  {userAge !== null && ` • 🎂 ${userAge} yrs`}
                </p>

                {formData.bio && (
                  <p className="mt-2 text-xs text-slate-600 dark:text-zinc-300 italic max-w-xl line-clamp-2">
                    "{formData.bio}"
                  </p>
                )}

                {/* Action buttons under hero */}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-xs font-medium text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer flex items-center gap-1"
                  >
                    <span>📷 Upload Photo</span>
                  </button>

                  {formData.avatar && (
                    <>
                      <span className="text-slate-300 dark:text-zinc-700">|</span>
                      <button
                        type="button"
                        onClick={handleRemovePhoto}
                        className="text-xs font-medium text-red-500 hover:text-red-600 dark:hover:text-red-400 hover:underline cursor-pointer"
                      >
                        Remove Photo
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>

            <Link
              href="/voice"
              className="w-full md:w-auto inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:text-black dark:hover:bg-emerald-400 px-6 py-3.5 text-sm font-semibold transition shadow-md shadow-emerald-600/20 active:scale-95"
            >
              <span>🎙️ Start Speaking Now</span>
              <span>→</span>
            </Link>
          </div>
        </div>

        {/* HIDDEN FILE INPUT */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png, image/jpeg, image/jpg, image/webp"
          className="hidden"
          onChange={handleImageUpload}
        />

        {/* FEEDBACK BANNER */}
        {saveMessage && (
          <div
            className={`p-4 rounded-2xl border text-xs sm:text-sm font-medium flex items-center justify-between transition-all animate-in fade-in duration-200 ${
              saveMessage.type === "success"
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300"
                : saveMessage.type === "error"
                ? "bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400"
                : "bg-sky-500/10 border-sky-500/30 text-sky-700 dark:text-cyan-300"
            }`}
          >
            <span>{saveMessage.text}</span>
            <button
              type="button"
              onClick={() => setSaveMessage(null)}
              className="ml-3 text-slate-400 hover:text-slate-700 dark:hover:text-white"
            >
              ✕
            </button>
          </div>
        )}

        {/* MAIN PROFILE EDIT FORM */}
        <form onSubmit={handleSaveProfile} className="space-y-6">
          <div className="rounded-3xl border border-slate-200 dark:border-white/10 bg-white dark:bg-zinc-950/60 p-6 sm:p-8 backdrop-blur-md shadow-xs dark:shadow-none space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/5 pb-4">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                  User Account & Personal Info
                </h2>
                <p className="text-xs text-slate-500 dark:text-zinc-400">
                  Update your personal details, profile picture, and conversational preferences.
                </p>
              </div>

              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs sm:text-sm transition cursor-pointer shadow-sm active:scale-95 disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save Profile Changes"}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Full Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300 flex items-center justify-between">
                  <span>Full Name *</span>
                  <span className="text-[10px] text-slate-400 font-normal">Displayed in Voice sessions</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Alex Johnson"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-white/[0.03] text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition"
                />
              </div>

              {/* Email (Read-Only) */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300 flex items-center justify-between">
                  <span>Email Address</span>
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-normal flex items-center gap-1">
                    ✓ Verified
                  </span>
                </label>
                <input
                  type="email"
                  disabled
                  value={user?.email || ""}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-100/70 dark:bg-white/[0.02] text-sm text-slate-500 dark:text-zinc-500 cursor-not-allowed"
                />
              </div>

              {/* Date of Birth (DOB) */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300 flex items-center justify-between">
                  <span>Date of Birth (DOB)</span>
                  {userAge !== null && (
                    <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                      {userAge} years old
                    </span>
                  )}
                </label>
                <input
                  type="date"
                  value={formData.dob}
                  onChange={(e) => setFormData({ ...formData, dob: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-white/[0.03] text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition"
                />
              </div>

              {/* Gender */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
                  Gender
                </label>
                <select
                  value={formData.gender}
                  onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-zinc-900 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition cursor-pointer"
                >
                  <option value="not_specified">Prefer not to say / Unspecified</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="non_binary">Non-Binary</option>
                  <option value="other">Other</option>
                </select>
              </div>

              {/* Location */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
                  Location (City, Country)
                </label>
                <input
                  type="text"
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  placeholder="e.g. San Francisco, CA or Mumbai, India"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-white/[0.03] text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition"
                />
              </div>

              {/* Job Title / Profession */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
                  Job Title / Profession
                </label>
                <input
                  type="text"
                  value={formData.jobTitle}
                  onChange={(e) => setFormData({ ...formData, jobTitle: e.target.value })}
                  placeholder="e.g. AI Engineer, Designer, Student"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-white/[0.03] text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition"
                />
              </div>

              {/* Phone Number */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
                  Phone Number (Optional)
                </label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="e.g. +1 555-0199"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-white/[0.03] text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition"
                />
              </div>

              {/* Preferred Spoken Language */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
                  Preferred Voice Language
                </label>
                <select
                  value={formData.preferredLanguage}
                  onChange={(e) => setFormData({ ...formData, preferredLanguage: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-zinc-900 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition cursor-pointer"
                >
                  <option value="auto">🌐 Automatic (Deepgram EN / Sarvam HI)</option>
                  <option value="en">🇺🇸 English (Deepgram Aura)</option>
                  <option value="hi">🇮🇳 Hindi / Hinglish (Sarvam AI)</option>
                </select>
              </div>
            </div>

            {/* About / Bio Textarea */}
            <div className="space-y-1.5 pt-2">
              <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300 flex items-center justify-between">
                <span>About You / Bio</span>
                <span className="text-[10px] text-slate-400 font-normal">
                  {formData.bio.length} / 500 characters
                </span>
              </label>
              <textarea
                rows={3}
                maxLength={500}
                value={formData.bio}
                onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                placeholder="Tell Chatly a little bit about yourself, your hobbies, or what topics you like discussing so conversations are naturally personalized..."
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-white/[0.03] text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition resize-none"
              />
              <p className="text-[11px] text-slate-400 dark:text-zinc-500">
                💡 This information helps Chatly AI address you personally and tailor spoken responses to your background.
              </p>
            </div>

            {/* Voice Persona Style */}
            <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-white/5">
              <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
                AI Voice Persona Style
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {[
                  { id: "friendly", label: "Friendly", icon: "😊", desc: "Warm & Engaging" },
                  { id: "professional", label: "Executive", icon: "💼", desc: "Direct & Concise" },
                  { id: "analytical", label: "Analyst", icon: "🔬", desc: "Deep & Structured" },
                  { id: "humorous", label: "Playful", icon: "🎭", desc: "Witty & Fun" },
                ].map((persona) => {
                  const isSelected = formData.voicePersonaPreference === persona.id;
                  return (
                    <button
                      key={persona.id}
                      type="button"
                      onClick={() => setFormData({ ...formData, voicePersonaPreference: persona.id })}
                      className={`p-3 rounded-2xl border text-left transition cursor-pointer ${
                        isSelected
                          ? "border-emerald-500 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200 ring-2 ring-emerald-500/20"
                          : "border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-white/[0.02] text-slate-700 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-white/5"
                      }`}
                    >
                      <div className="text-xl mb-1">{persona.icon}</div>
                      <p className="text-xs font-bold leading-tight">{persona.label}</p>
                      <p className="text-[10px] opacity-75 mt-0.5">{persona.desc}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Bottom Save Button */}
            <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-100 dark:border-white/5">
              <button
                type="submit"
                disabled={saving}
                className="w-full sm:w-auto px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm transition cursor-pointer shadow-md shadow-emerald-600/20 active:scale-95 disabled:opacity-50"
              >
                {saving ? "Saving Changes..." : "✓ Save Profile Changes"}
              </button>
            </div>
          </div>
        </form>

        {/* QUOTA STATS GRID */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* HOURLY QUOTA */}
          <div className="rounded-3xl border border-slate-200 dark:border-white/10 bg-white dark:bg-zinc-950/60 p-6 backdrop-blur-md shadow-xs dark:shadow-none">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                Hourly Limit
              </span>
              <span className="text-xs text-slate-400 dark:text-zinc-500">60-min window</span>
            </div>

            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-slate-900 dark:text-white">
                {isAdmin ? "∞" : remainingHourly}
              </span>
              <span className="text-sm text-slate-500 dark:text-zinc-500 font-medium">
                {isAdmin ? "Unlimited" : "/ 30 calls"}
              </span>
            </div>

            {!isAdmin && (
              <div className="mt-4">
                <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-white/5 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-500 transition-all duration-300"
                    style={{ width: `${hourlyPct}%` }}
                  />
                </div>
                <p className="mt-2 text-[11px] text-slate-500 dark:text-zinc-500">
                  {remainingHourly} call{remainingHourly !== 1 ? "s" : ""} left this hour
                </p>
              </div>
            )}

            {isAdmin && (
              <p className="mt-4 text-xs text-slate-500 dark:text-zinc-400 font-medium flex items-center gap-1.5">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Admin account bypasses hourly rate limits
              </p>
            )}
          </div>

          {/* DAILY QUOTA */}
          <div className="rounded-3xl border border-slate-200 dark:border-white/10 bg-white dark:bg-zinc-950/60 p-6 backdrop-blur-md shadow-xs dark:shadow-none">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                Daily Limit
              </span>
              <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">No Day Limit</span>
            </div>

            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-slate-900 dark:text-white">
                ∞
              </span>
              <span className="text-sm text-emerald-600 dark:text-emerald-400 font-semibold">
                Unlimited Daily
              </span>
            </div>

            <p className="mt-4 text-xs text-slate-500 dark:text-zinc-400 font-medium flex items-center gap-1.5">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Logged-in members have unlimited daily calls with 30 calls/hour.
            </p>
          </div>

          {/* AI MEMORY STATUS */}
          <div className="rounded-3xl border border-slate-200 dark:border-white/10 bg-white dark:bg-zinc-950/60 p-6 backdrop-blur-md flex flex-col justify-between shadow-xs dark:shadow-none">
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                  Conversational Memory
                </span>
                <span className="h-2 w-2 rounded-full bg-purple-500 dark:bg-purple-400 animate-pulse" />
              </div>

              <p className="text-sm font-semibold text-purple-700 dark:text-purple-300">
                {isAdmin ? "🧠 Enterprise Knowledge Memory Active" : "🧠 Conversation Memory Active"}
              </p>

              <p className="mt-1 text-xs text-slate-500 dark:text-zinc-400 leading-relaxed">
                {isAdmin
                  ? "Semantic knowledge and personal profile facts are indexed into persistent vector memory for instant long-term recall."
                  : "Chatly remembers personal facts and dialogue context across recent conversational turns in real time."}
              </p>
            </div>

            <div className="mt-4">
              <button
                type="button"
                onClick={handleClearMemory}
                disabled={resettingMemory}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 hover:text-slate-900 dark:border-white/10 dark:bg-white/[0.02] dark:text-zinc-300 dark:hover:text-white dark:hover:bg-white/[0.06] py-2 text-xs font-medium transition cursor-pointer"
              >
                {resettingMemory ? "Clearing..." : "🧹 Clear Memory Context"}
              </button>
              {memoryMessage && (
                <p className="mt-1.5 text-center text-[11px] text-emerald-600 dark:text-emerald-400">{memoryMessage}</p>
              )}
            </div>
          </div>
        </div>

        {/* QUICK LAUNCH CARDS */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* VOICE CALL CARD */}
          <Link
            href="/voice"
            className="group rounded-3xl border border-slate-200 bg-white p-6 hover:border-emerald-500 hover:shadow-md dark:border-white/10 dark:bg-white/[0.02] dark:hover:border-emerald-500/40 dark:hover:bg-emerald-500/[0.03] transition duration-200 backdrop-blur-md shadow-xs"
          >
            <div className="flex items-start justify-between">
              <div className="h-12 w-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-2xl group-hover:scale-110 transition">
                🎙️
              </div>
              <span className="text-xs text-slate-400 group-hover:text-emerald-600 dark:text-zinc-500 dark:group-hover:text-emerald-400 transition font-medium">
                Launch →
              </span>
            </div>

            <h3 className="mt-4 text-lg font-bold text-slate-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-300 transition">
              Voice-to-Voice AI
            </h3>

            <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-zinc-400">
              Real-time spoken dialogue with next-generation AI, personalized user profile context, studio-grade speech synthesis, and live transcription.
            </p>
          </Link>

          {/* TEXT CHAT CARD */}
          <Link
            href="/chat"
            className="group rounded-3xl border border-slate-200 bg-white p-6 hover:border-sky-500 hover:shadow-md dark:border-white/10 dark:bg-white/[0.02] dark:hover:border-cyan-500/40 dark:hover:bg-cyan-500/[0.03] transition duration-200 backdrop-blur-md shadow-xs"
          >
            <div className="flex items-start justify-between">
              <div className="h-12 w-12 rounded-2xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-2xl group-hover:scale-110 transition">
                💬
              </div>
              <span className="text-xs text-slate-400 group-hover:text-sky-600 dark:text-zinc-500 dark:group-hover:text-cyan-400 transition font-medium">
                Open Chat →
              </span>
            </div>

            <h3 className="mt-4 text-lg font-bold text-slate-900 dark:text-white group-hover:text-sky-600 dark:group-hover:text-cyan-300 transition">
              Text Conversations
            </h3>

            <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-zinc-400">
              Type questions, brainstorm code, and exchange long-form ideas with markdown formatting and conversation history.
            </p>
          </Link>
        </div>
      </div>
    </main>
  );
}
