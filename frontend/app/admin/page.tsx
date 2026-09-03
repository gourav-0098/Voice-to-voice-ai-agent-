"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface AdminMetrics {
  totalUsers: number;
  callsToday: number;
  callsThisHour: number;
  allTimeCalls: number;
  qdrantPoints: number;
  qdrantStatus: string;
  qdrantCollection: string;
  activeAdmins: number;
}

interface UserItem {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
  callsLastHour: number;
  callsLastDay: number;
  remainingHourly: number | string;
  remainingDaily: number | string;
}

export default function AdminDashboard() {
  const router = useRouter();
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const fetchAdminData = useCallback(async () => {
    const token = typeof window !== "undefined" ? localStorage.getItem("chatly_token") : null;
    if (!token) {
      router.push("/login");
      return;
    }

    try {
      // 1. Fetch Stats
      const statsRes = await fetch("http://localhost:5000/api/admin/stats", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (statsRes.status === 403 || statsRes.status === 401) {
        // Not an admin!
        router.push("/dashboard");
        return;
      }

      const statsData = await statsRes.json();
      if (statsData.metrics) {
        setMetrics(statsData.metrics);
      }

      // 2. Fetch Users
      const usersRes = await fetch("http://localhost:5000/api/admin/users", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const usersData = await usersRes.json();
      if (usersData.users) {
        setUsers(usersData.users);
      }
    } catch (err) {
      console.error("Admin fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchAdminData();
  }, [fetchAdminData]);

  // Reset a user's rate limits
  const handleResetQuota = async (userId: string, userName: string) => {
    const token = typeof window !== "undefined" ? localStorage.getItem("chatly_token") : null;
    if (!token) return;

    setActionLoadingId(userId);
    setActionMessage(null);

    try {
      const res = await fetch(`http://localhost:5000/api/admin/users/${userId}/reset-quota`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json();
      if (res.ok) {
        setActionMessage(`✅ Quota reset for ${userName}!`);
        await fetchAdminData();
      } else {
        setActionMessage(`⚠️ ${data.error || "Failed to reset quota"}`);
      }
    } catch (_) {
      setActionMessage("⚠️ Error resetting quota.");
    } finally {
      setActionLoadingId(null);
      setTimeout(() => setActionMessage(null), 4000);
    }
  };

  // Toggle user role between user and admin
  const handleToggleRole = async (userId: string, userName: string) => {
    const token = typeof window !== "undefined" ? localStorage.getItem("chatly_token") : null;
    if (!token) return;

    setActionLoadingId(userId);
    setActionMessage(null);

    try {
      const res = await fetch(`http://localhost:5000/api/admin/users/${userId}/toggle-role`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json();
      if (res.ok) {
        setActionMessage(`🛡️ Role updated for ${userName} -> ${data.role}`);
        await fetchAdminData();
      } else {
        setActionMessage(`⚠️ ${data.error || "Failed to toggle role"}`);
      }
    } catch (_) {
      setActionMessage("⚠️ Error toggling role.");
    } finally {
      setActionLoadingId(null);
      setTimeout(() => setActionMessage(null), 4000);
    }
  };

  const handleLogout = () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("chatly_token");
      localStorage.removeItem("chatly_user");
    }
    router.push("/login");
  };

  const filteredUsers = users.filter(
    (u) =>
      u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-[#07080a] flex items-center justify-center text-white">
        <div className="flex items-center gap-3 text-sm text-zinc-400">
          <span className="h-4 w-4 rounded-full border-2 border-amber-400 border-t-transparent animate-spin" />
          Verifying administrator credentials...
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[#07080a] text-white selection:bg-amber-500 selection:text-black flex flex-col relative overflow-hidden">
      {/* Background ambient gold lighting */}
      <div className="absolute top-10 right-1/4 h-96 w-96 rounded-full bg-amber-500/10 blur-[140px] pointer-events-none" />
      <div className="absolute bottom-10 left-1/4 h-96 w-96 rounded-full bg-cyan-500/10 blur-[140px] pointer-events-none" />

      {/* NAVBAR */}
      <nav className="border-b border-white/10 bg-zinc-950/40 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-0 sm:h-16 flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2 sm:gap-4">
            <Link href="/" className="text-lg sm:text-xl font-bold tracking-tight hover:opacity-80 transition">
              Chatly
            </Link>
            <span className="text-zinc-600">/</span>
            <div className="flex items-center gap-2">
              <span className="text-xs sm:text-sm font-semibold text-amber-300">Admin</span>
              <span className="rounded-full bg-amber-500/20 border border-amber-500/40 px-2 py-0.5 text-[9px] sm:text-[10px] font-bold text-amber-300 uppercase">
                ROOT
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <Link
              href="/dashboard"
              className="text-xs font-medium text-zinc-400 hover:text-white px-2.5 py-1.5 rounded-xl border border-white/10 hover:border-white/20 transition"
            >
              Dashboard →
            </Link>

            <Link
              href="/voice"
              className="rounded-xl bg-white px-3 sm:px-4 py-1.5 sm:py-2 text-xs font-semibold text-black transition hover:bg-zinc-200 shadow-sm"
            >
              🎙️ Voice AI
            </Link>

            <button
              onClick={handleLogout}
              className="rounded-xl border border-white/10 px-2.5 sm:px-3 py-1.5 sm:py-2 text-xs font-medium text-zinc-400 hover:text-red-400 transition cursor-pointer"
            >
              Sign out
            </button>
          </div>
        </div>
      </nav>

      {/* ADMIN CONTENT */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-10 w-full flex-1 relative z-10 space-y-6 sm:space-y-8">
        {/* BANNER NOTIFICATION */}
        {actionMessage && (
          <div className="rounded-2xl border border-amber-500/40 bg-amber-500/15 p-3.5 sm:p-4 text-xs font-semibold text-amber-200 animate-in fade-in duration-150 flex items-center justify-between">
            <span>{actionMessage}</span>
            <button onClick={() => setActionMessage(null)} className="text-zinc-400 hover:text-white ml-2">
              ✕
            </button>
          </div>
        )}

        {/* METRICS CARDS GRID */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
          {/* TOTAL USERS */}
          <div className="rounded-3xl border border-white/10 bg-zinc-950/70 p-5 sm:p-6 backdrop-blur-md">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Registered Users
              </span>
              <span className="text-xl">👥</span>
            </div>
            <p className="text-2xl sm:text-3xl font-extrabold text-white">{metrics?.totalUsers ?? 0}</p>
            <p className="mt-2 text-xs text-zinc-500">
              {metrics?.activeAdmins ?? 1} administrator account(s)
            </p>
          </div>

          {/* CALLS TODAY */}
          <div className="rounded-3xl border border-white/10 bg-zinc-950/70 p-5 sm:p-6 backdrop-blur-md">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Voice Calls Today
              </span>
              <span className="text-xl">🎙️</span>
            </div>
            <p className="text-2xl sm:text-3xl font-extrabold text-emerald-400">{metrics?.callsToday ?? 0}</p>
            <p className="mt-2 text-xs text-zinc-500">
              {metrics?.callsThisHour ?? 0} made in last hour
            </p>
          </div>

          {/* ALL-TIME CALLS */}
          <div className="rounded-3xl border border-white/10 bg-zinc-950/70 p-5 sm:p-6 backdrop-blur-md">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                All-Time Calls
              </span>
              <span className="text-xl">⚡</span>
            </div>
            <p className="text-2xl sm:text-3xl font-extrabold text-cyan-400">{metrics?.allTimeCalls ?? 0}</p>
            <p className="mt-2 text-xs text-zinc-500">Across all platform users</p>
          </div>

          {/* SEMANTIC KNOWLEDGE CLOUD */}
          <div className="rounded-3xl border border-white/10 bg-zinc-950/70 p-5 sm:p-6 backdrop-blur-md">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Indexed Knowledge Points
              </span>
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse" />
            </div>
            <p className="text-2xl sm:text-3xl font-extrabold text-purple-300">
              {metrics?.qdrantPoints?.toLocaleString() ?? "1,345"}
            </p>
            <p className="mt-2 text-xs text-zinc-500 truncate">
              Memory Cluster: <span className="text-zinc-300 font-mono text-[11px]">Primary Cluster</span>
            </p>
          </div>
        </div>

        {/* SYSTEM STATUS & MEMORY BAR */}
        <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-6 backdrop-blur-md flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-6 text-xs text-zinc-400">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              <span>Core Database: Online</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              <span>Conversational Intelligence Engine: Active</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-purple-400" />
              <span>Semantic Vector Cloud: Online</span>
            </div>
          </div>

          <button
            onClick={fetchAdminData}
            className="rounded-xl border border-white/10 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:text-white hover:bg-white/5 transition"
          >
            🔄 Refresh Data
          </button>
        </div>

        {/* USER MANAGEMENT SECTION */}
        <div className="rounded-3xl border border-white/10 bg-zinc-950/70 p-8 backdrop-blur-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h2 className="text-xl font-bold tracking-tight">User Management & Rate Limit Control</h2>
              <p className="mt-1 text-xs text-zinc-400">
                View all registered accounts, inspect live usage, and reset quotas or toggle admin roles.
              </p>
            </div>

            {/* Search filter */}
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name or email..."
              className="w-full sm:w-72 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-xs text-white placeholder:text-zinc-600 outline-none focus:border-amber-500/50"
            />
          </div>

          {/* TABLE */}
          <div className="overflow-x-auto -mx-2 px-2 sm:mx-0 sm:px-0">
            <table className="min-w-[620px] w-full text-left text-xs">
              <thead>
                <tr className="border-b border-white/10 text-zinc-500 uppercase tracking-wider font-semibold">
                  <th className="pb-3 pr-4">User</th>
                  <th className="pb-3 px-4">Role</th>
                  <th className="pb-3 px-4">Calls (Hour)</th>
                  <th className="pb-3 px-4">Calls (Today)</th>
                  <th className="pb-3 px-4">Remaining</th>
                  <th className="pb-3 pl-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredUsers.map((u) => {
                  const isRootAdmin = u.email.toLowerCase() === "r19216871@gamil.com";
                  const isActionLoading = actionLoadingId === u.id;

                  return (
                    <tr key={u.id} className="hover:bg-white/[0.02] transition">
                      <td className="py-4 pr-4">
                        <p className="font-semibold text-white">{u.name}</p>
                        <p className="text-zinc-500 text-[11px]">{u.email}</p>
                      </td>

                      <td className="py-4 px-4">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                            u.role === "admin"
                              ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                              : "bg-white/5 text-zinc-400 border border-white/10"
                          }`}
                        >
                          {u.role}
                        </span>
                      </td>

                      <td className="py-4 px-4 text-zinc-300 font-mono">
                        {u.callsLastHour} / 5
                      </td>

                      <td className="py-4 px-4 text-zinc-300 font-mono">
                        {u.callsLastDay} / 10
                      </td>

                      <td className="py-4 px-4">
                        {u.role === "admin" ? (
                          <span className="text-amber-300 font-medium">∞ Unlimited</span>
                        ) : (
                          <span
                            className={`font-mono ${
                              Number(u.remainingHourly) === 0
                                ? "text-red-400 font-bold"
                                : "text-emerald-400"
                            }`}
                          >
                            {u.remainingHourly} hr · {u.remainingDaily} day
                          </span>
                        )}
                      </td>

                      <td className="py-4 pl-4 text-right space-x-2">
                        {/* Reset Quota Button */}
                        <button
                          type="button"
                          disabled={isActionLoading}
                          onClick={() => handleResetQuota(u.id, u.name)}
                          className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-300 hover:bg-emerald-500/20 transition cursor-pointer disabled:opacity-40"
                        >
                          {isActionLoading ? "..." : "Reset Quota"}
                        </button>

                        {/* Toggle Role Button (cannot demote root admin) */}
                        {!isRootAdmin && (
                          <button
                            type="button"
                            disabled={isActionLoading}
                            onClick={() => handleToggleRole(u.id, u.name)}
                            className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-zinc-300 hover:text-white hover:bg-white/10 transition cursor-pointer disabled:opacity-40"
                          >
                            {u.role === "admin" ? "Demote" : "Make Admin"}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {filteredUsers.length === 0 && (
              <p className="text-center py-8 text-xs text-zinc-500">
                No users found matching &quot;{searchQuery}&quot;.
              </p>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
