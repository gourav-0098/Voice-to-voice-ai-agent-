"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ThemeToggle } from "../../components/ThemeToggle";
import { VoiceOption } from "../page";

// ─────────────────────────────────────────────────────────────
//  TYPES
// ─────────────────────────────────────────────────────────────
export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role?: string;
  quota?: {
    isAdmin: boolean;
    remainingHourly: number | string;
    remainingDaily: number | string;
    totalHourly: number | string;
    totalDaily: number | string;
  };
}

export interface SettingsPanelProps {
  // User
  currentUser: UserProfile | null;
  quota: UserProfile["quota"] | null;
  isAdmin: boolean;
  onSignIn: () => void;
  onSignOut: () => void;

  // Modes
  conversationMode: "voice-only" | "voice-chat" | "text-only";
  onModeChange: (mode: "voice-only" | "voice-chat" | "text-only") => void;

  // Persona
  selectedPersona: string;
  onPersonaChange: (id: string) => void;

  // Voice & Language
  selectedLanguage: "all" | "hi" | "en";
  onLanguageChange: (lang: "all" | "hi" | "en") => void;
  selectedVoice: string;
  onVoiceChange: (id: string) => void;
  filteredVoices: VoiceOption[];

  // Audio
  voiceMuted: boolean;
  volume: number;
  onToggleMute: () => void;
  onVolumeChange: (v: number) => void;
  handsFree: boolean;
  onHandsFreeChange: (v: boolean) => void;

  // Theme
  isDark: boolean;

  // Active model
  activeModel: string;

  // Actions
  hasMessages: boolean;
  onClearHistory: () => void;
  onOpenDebateArena: () => void;
  lastTtfa: number | null;

  // Mobile close
  isMobile?: boolean;
  onClose?: () => void;
}

// ─────────────────────────────────────────────────────────────
//  DATA
// ─────────────────────────────────────────────────────────────
const PERSONA_OPTIONS = [
  { id: "conversational", label: "Conversational", desc: "Warm & Natural", icon: "🎙️" },
  { id: "concise",        label: "Ultra Concise",  desc: "1-sentence direct", icon: "⚡" },
  { id: "technical",      label: "Tech Specialist", desc: "Architectural & precise", icon: "👨‍💻" },
  { id: "tutor",          label: "Patient Tutor",  desc: "Analogies & easy explanations", icon: "🎓" },
  { id: "rational",       label: "Rationalist",    desc: "Fact-checks & objective", icon: "⚖️" },
  { id: "andhbhakt",      label: "Saffron Debater", desc: "Hyper-nationalist & GraphRAG", icon: "🚩" },
];

type CategoryId = "account" | "voice_audio" | "ai_chat" | "appearance" | "memory" | "about";

interface Category {
  id: CategoryId;
  label: string;
  icon: string;
  description: string;
  accent: string;
}

const CATEGORIES: Category[] = [
  { id: "account",    label: "Account",      icon: "👤", description: "Profile & quota",         accent: "emerald" },
  { id: "voice_audio",label: "Voice & Audio",icon: "🎙️", description: "Voice model, volume",     accent: "orange"  },
  { id: "ai_chat",    label: "AI & Chat",    icon: "🤖", description: "Persona, mode, language",  accent: "sky"     },
  { id: "appearance", label: "Appearance",   icon: "🎨", description: "Theme & display",          accent: "violet"  },
  { id: "memory",     label: "Memory",       icon: "🧠", description: "Semantic memory & RAG",    accent: "purple"  },
  { id: "about",      label: "About & Help", icon: "ℹ️", description: "Tools, version & links",  accent: "slate"   },
];

const ACCENT: Record<string, { bg: string; text: string; border: string; iconBg: string }> = {
  emerald: { bg: "bg-emerald-500/10 dark:bg-emerald-500/15", text: "text-emerald-700 dark:text-emerald-300", border: "border-emerald-500/30", iconBg: "bg-emerald-500/15 dark:bg-emerald-500/20" },
  orange:  { bg: "bg-orange-500/10 dark:bg-orange-500/15",   text: "text-orange-700 dark:text-orange-300",   border: "border-orange-500/30",  iconBg: "bg-orange-500/15 dark:bg-orange-500/20"  },
  sky:     { bg: "bg-sky-500/10 dark:bg-sky-500/15",         text: "text-sky-700 dark:text-sky-300",         border: "border-sky-500/30",     iconBg: "bg-sky-500/15 dark:bg-sky-500/20"       },
  violet:  { bg: "bg-violet-500/10 dark:bg-violet-500/15",   text: "text-violet-700 dark:text-violet-300",   border: "border-violet-500/30",  iconBg: "bg-violet-500/15 dark:bg-violet-500/20" },
  purple:  { bg: "bg-purple-500/10 dark:bg-purple-500/15",   text: "text-purple-700 dark:text-purple-300",   border: "border-purple-500/30",  iconBg: "bg-purple-500/15 dark:bg-purple-500/20" },
  slate:   { bg: "bg-slate-500/10 dark:bg-slate-500/15",     text: "text-slate-600 dark:text-slate-300",     border: "border-slate-400/30",   iconBg: "bg-slate-500/15 dark:bg-slate-500/20"   },
};

// ─────────────────────────────────────────────────────────────
//  MICRO COMPONENTS
// ─────────────────────────────────────────────────────────────
function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full p-1 cursor-pointer transition-all duration-300 focus:outline-none ${
        value ? "bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.35)]" : "bg-slate-200 dark:bg-zinc-700"
      }`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-md transition-transform duration-300 ${value ? "translate-x-5" : "translate-x-0"}`} />
    </button>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400 dark:text-zinc-500 mb-2.5">
      {children}
    </p>
  );
}

function SettingRow({ icon, label, description, right }: { icon?: string; label: string; description?: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-3 px-4 border-b border-slate-100 dark:border-white/[0.05] last:border-0">
      <div className="flex items-start gap-3 min-w-0">
        {icon && <span className="text-lg w-7 shrink-0 select-none leading-tight">{icon}</span>}
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-900 dark:text-white leading-tight">{label}</p>
          {description && <p className="text-[11px] text-slate-500 dark:text-zinc-500 mt-0.5 leading-snug">{description}</p>}
        </div>
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}

function StatusBadge({ children, color }: { children: React.ReactNode; color: string }) {
  const colorMap: Record<string, string> = {
    emerald: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/25",
    sky:     "text-sky-600 dark:text-cyan-400 bg-sky-500/10 border-sky-500/25",
    purple:  "text-purple-600 dark:text-purple-400 bg-purple-500/10 border-purple-500/25",
    amber:   "text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/25",
  };
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${colorMap[color] || colorMap.emerald}`}>
      {children}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────
//  PANES
// ─────────────────────────────────────────────────────────────
function AccountPane({ p }: { p: SettingsPanelProps }) {
  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-gradient-to-br from-emerald-500/8 to-teal-500/4 dark:from-emerald-500/10 dark:to-teal-500/5 p-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-400 text-white font-bold text-lg shadow-lg shadow-emerald-500/25">
            {p.currentUser ? p.currentUser.name.slice(0, 2).toUpperCase() : "👤"}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-slate-900 dark:text-white truncate">
              {p.currentUser ? p.currentUser.name : "Guest User"}
            </p>
            <p className="text-xs text-slate-500 dark:text-zinc-500 truncate">
              {p.currentUser ? p.currentUser.email : "Not signed in"}
            </p>
          </div>
        </div>
        {p.currentUser ? (
          <button
            type="button"
            onClick={p.onSignOut}
            className="w-full py-2 rounded-xl border border-red-500/30 bg-red-500/8 dark:bg-red-500/10 text-red-600 dark:text-red-400 text-xs font-semibold hover:bg-red-500/15 transition cursor-pointer"
          >
            Sign Out
          </button>
        ) : (
          <div className="flex gap-2">
            <Link href="/login" className="flex-1 text-center py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 transition shadow-sm">
              Sign In
            </Link>
            <Link href="/signup" className="flex-1 text-center py-2.5 rounded-xl border border-slate-200 dark:border-white/10 text-slate-700 dark:text-zinc-300 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-white/5 transition">
              Sign Up
            </Link>
          </div>
        )}
      </div>

      <div>
        <SectionLabel>Usage Quota</SectionLabel>
        <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.02] overflow-hidden">
          {p.isAdmin ? (
            <SettingRow icon="👑" label="Account Plan" right={<StatusBadge color="amber">Admin – Unlimited</StatusBadge>} />
          ) : (
            <>
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-white/5">
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-white">Hourly Calls</p>
                  <p className="text-[10px] text-slate-400 dark:text-zinc-500">Resets every hour</p>
                </div>
                <div className="text-right">
                  <p className="text-base font-bold text-emerald-600 dark:text-emerald-400">{p.quota ? p.quota.remainingHourly : "5"} / 5</p>
                  <p className="text-[10px] text-slate-400 dark:text-zinc-500">remaining</p>
                </div>
              </div>
              <div className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-white">Daily Calls</p>
                  <p className="text-[10px] text-slate-400 dark:text-zinc-500">Resets at midnight</p>
                </div>
                <div className="text-right">
                  <p className="text-base font-bold text-sky-600 dark:text-cyan-400">{p.quota ? p.quota.remainingDaily : "10"} / 10</p>
                  <p className="text-[10px] text-slate-400 dark:text-zinc-500">remaining</p>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <div>
        <SectionLabel>Navigation</SectionLabel>
        <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.02] overflow-hidden">
          <Link href="/dashboard" className="flex items-center justify-between px-4 py-3.5 text-sm text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-white/5 transition border-b border-slate-100 dark:border-white/5">
            <span className="flex items-center gap-2.5 font-medium"><span className="text-base">📊</span> Dashboard</span>
            <span className="text-slate-300 dark:text-zinc-600">→</span>
          </Link>
          {p.isAdmin && (
            <Link href="/admin" className="flex items-center justify-between px-4 py-3.5 text-sm text-amber-600 dark:text-amber-400 hover:bg-amber-500/5 transition">
              <span className="flex items-center gap-2.5 font-medium"><span className="text-base">👑</span> Admin Console</span>
              <span className="text-amber-300 dark:text-amber-600">→</span>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function VoiceAudioPane({ p }: { p: SettingsPanelProps }) {
  return (
    <div className="space-y-5">
      <div>
        <SectionLabel>Language Filter</SectionLabel>
        <div className="grid grid-cols-3 gap-1.5 p-1.5 rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-white/[0.03]">
          {(["all", "hi", "en"] as const).map((lang) => {
            const meta = {
              all: { label: "🌐 All",     active: "bg-white text-slate-900 dark:bg-zinc-800 dark:text-white shadow-sm" },
              hi:  { label: "🇮🇳 Hindi",   active: "bg-white text-orange-700 dark:bg-orange-500/20 dark:text-orange-300 shadow-sm" },
              en:  { label: "🇬🇧 English", active: "bg-white text-blue-700 dark:bg-blue-500/20 dark:text-blue-300 shadow-sm" },
            }[lang];
            return (
              <button key={lang} type="button" onClick={() => p.onLanguageChange(lang)}
                className={`py-2 rounded-xl text-xs font-medium cursor-pointer transition-all duration-200 ${
                  p.selectedLanguage === lang ? meta.active : "text-slate-500 hover:text-slate-800 dark:text-zinc-500 dark:hover:text-white"
                }`}
              >{meta.label}</button>
            );
          })}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2.5">
          <SectionLabel>Voice Model</SectionLabel>
          <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20 -mt-1">
            {p.filteredVoices.length} available
          </span>
        </div>
        <div className="space-y-1.5 max-h-52 overflow-y-auto pr-0.5">
          {p.filteredVoices.map((v) => {
            const isSel = p.selectedVoice === v.id;
            const provColor = v.provider === "Sarvam Bulbul"
              ? "bg-orange-500/12 text-orange-700 dark:text-orange-300 border-orange-500/25"
              : v.provider === "Edge Neural"
              ? "bg-purple-500/12 text-purple-700 dark:text-purple-300 border-purple-500/25"
              : "bg-blue-500/12 text-blue-700 dark:text-blue-300 border-blue-500/25";
            return (
              <button key={v.id} type="button" onClick={() => p.onVoiceChange(v.id)}
                className={`w-full text-left px-3 py-2.5 rounded-xl border text-xs transition-all duration-200 cursor-pointer flex items-center justify-between gap-2 ${
                  isSel
                    ? "border-emerald-500/50 bg-emerald-50 dark:bg-emerald-500/10 shadow-sm"
                    : "border-slate-200 dark:border-white/5 bg-white dark:bg-white/[0.02] hover:border-slate-300 dark:hover:border-white/10 hover:bg-slate-50 dark:hover:bg-white/[0.04]"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <p className={`font-medium truncate ${isSel ? "text-emerald-800 dark:text-emerald-300" : "text-slate-700 dark:text-zinc-300"}`}>{v.label}</p>
                    <span className={`text-[9px] px-1.5 py-px rounded border font-semibold uppercase tracking-wider shrink-0 ${provColor}`}>{v.badge}</span>
                  </div>
                  <p className="text-[10px] text-slate-400 dark:text-zinc-500 truncate">{v.desc}</p>
                </div>
                {isSel && <span className="text-emerald-500 dark:text-emerald-400 text-base shrink-0">✓</span>}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <SectionLabel>Volume Control</SectionLabel>
        <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.02] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="text-xl select-none">
                {p.voiceMuted || p.volume === 0 ? "🔇" : p.volume < 0.35 ? "🔈" : p.volume < 0.75 ? "🔉" : "🔊"}
              </span>
              <div>
                <p className="text-sm font-medium text-slate-900 dark:text-white">Audio Output</p>
                <p className="text-[10px] text-slate-500 dark:text-zinc-500">{p.voiceMuted ? "Muted" : `${Math.round(p.volume * 100)}%`}</p>
              </div>
            </div>
            <button type="button" onClick={p.onToggleMute}
              className={`px-3 py-1 text-[11px] rounded-full border cursor-pointer font-semibold transition ${
                p.voiceMuted
                  ? "border-red-500/40 bg-red-500/10 text-red-500 dark:text-red-400"
                  : "border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white"
              }`}
            >{p.voiceMuted ? "🔇 Muted" : "Mute"}</button>
          </div>
          <input type="range" min="0" max="1" step="0.05"
            value={p.voiceMuted ? 0 : p.volume}
            onChange={(e) => p.onVolumeChange(parseFloat(e.target.value))}
            className="w-full h-1.5 bg-slate-200 dark:bg-zinc-700 rounded-full appearance-none cursor-pointer accent-emerald-500"
            aria-label="Audio output volume"
          />
        </div>
      </div>

      <div>
        <SectionLabel>Microphone</SectionLabel>
        <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.02] overflow-hidden">
          <SettingRow icon="✨" label="Hands-Free Mode" description="Auto re-opens mic after AI finishes speaking"
            right={<Toggle value={p.handsFree} onChange={p.onHandsFreeChange} />}
          />
        </div>
      </div>
    </div>
  );
}

function AiChatPane({ p }: { p: SettingsPanelProps }) {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 p-3.5 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 dark:bg-emerald-500/8">
        <span className="text-2xl select-none">⚡</span>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 mb-0.5">Active Model</p>
          <p className="text-sm font-semibold text-slate-900 dark:text-white">{p.activeModel}</p>
        </div>
      </div>

      <div>
        <SectionLabel>Conversation Mode</SectionLabel>
        <div className="grid grid-cols-3 gap-1.5 p-1.5 rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-white/[0.03]">
          {([
            { id: "voice-only" as const, emoji: "🎙️", label: "Voice" },
            { id: "voice-chat" as const, emoji: "💬", label: "Split" },
            { id: "text-only"  as const, emoji: "⌨️", label: "Text" },
          ]).map((m) => (
            <button key={m.id} type="button" onClick={() => p.onModeChange(m.id)}
              className={`flex flex-col items-center gap-0.5 py-2.5 rounded-xl text-xs font-medium cursor-pointer transition-all duration-200 ${
                p.conversationMode === m.id
                  ? "bg-white text-slate-900 dark:bg-zinc-800 dark:text-white shadow-sm"
                  : "text-slate-500 hover:text-slate-800 dark:text-zinc-500 dark:hover:text-white"
              }`}
            >
              <span className="text-base">{m.emoji}</span>
              <span className="text-[10px]">{m.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <SectionLabel>AI Persona</SectionLabel>
        <div className="grid grid-cols-2 gap-2">
          {PERSONA_OPTIONS.map((p2) => {
            const isSel = p.selectedPersona === p2.id;
            return (
              <button key={p2.id} type="button" onClick={() => p.onPersonaChange(p2.id)}
                className={`text-left p-3 rounded-xl border text-xs transition-all duration-200 cursor-pointer flex flex-col gap-1 ${
                  isSel
                    ? "border-emerald-500/50 bg-emerald-50 dark:bg-emerald-500/10 shadow-sm"
                    : "border-slate-200 dark:border-white/5 bg-white dark:bg-white/[0.02] hover:border-slate-300 dark:hover:border-white/10 hover:bg-slate-50 dark:hover:bg-white/[0.04]"
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-base select-none">{p2.icon}</span>
                  <span className={`font-semibold text-xs leading-tight ${isSel ? "text-emerald-800 dark:text-emerald-300" : "text-slate-800 dark:text-zinc-200"}`}>{p2.label}</span>
                </div>
                <p className="text-[10px] text-slate-500 dark:text-zinc-500 leading-tight">{p2.desc}</p>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function AppearancePane({ p }: { p: SettingsPanelProps }) {
  return (
    <div className="space-y-5">
      <div>
        <SectionLabel>Color Theme</SectionLabel>
        <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.02] overflow-hidden">
          <SettingRow
            icon={p.isDark ? "🌙" : "☀️"}
            label={p.isDark ? "Dark Mode Active" : "Light Mode Active"}
            description="Toggle between light and dark color scheme"
            right={<ThemeToggle />}
          />
        </div>
      </div>

      <div>
        <SectionLabel>Interface Preview</SectionLabel>
        <div className="rounded-2xl border border-slate-200 dark:border-white/10 overflow-hidden">
          <div className={`p-4 transition-colors duration-500 ${p.isDark ? "bg-zinc-950" : "bg-slate-50"}`}>
            <div className={`rounded-xl border p-3 mb-2.5 ${p.isDark ? "border-white/10 bg-zinc-900" : "border-slate-200 bg-white shadow-xs"}`}>
              <div className="flex items-center gap-2 mb-2">
                <div className="h-5 w-5 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center"><span className="text-[8px]">🤖</span></div>
                <div className="h-2 w-16 rounded-full bg-slate-200 dark:bg-zinc-700" />
              </div>
              <div className="space-y-1">
                <div className="h-1.5 w-full rounded-full bg-slate-200 dark:bg-zinc-700" />
                <div className="h-1.5 w-3/4 rounded-full bg-slate-200 dark:bg-zinc-700" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-full bg-sky-500/20 border border-sky-500/30 flex items-center justify-center"><span className="text-[8px]">👤</span></div>
              <div className={`flex-1 h-7 rounded-xl border px-3 flex items-center ${p.isDark ? "border-white/10 bg-zinc-800" : "border-slate-200 bg-slate-100"}`}>
                <div className="h-1.5 w-20 rounded-full bg-slate-300 dark:bg-zinc-600" />
              </div>
            </div>
          </div>
          <div className={`flex items-center justify-between px-4 py-2.5 border-t text-[11px] ${p.isDark ? "border-white/10 bg-zinc-900 text-zinc-500" : "border-slate-100 bg-white text-slate-500"}`}>
            <span>Current theme</span>
            <span className={`font-semibold ${p.isDark ? "text-white" : "text-slate-900"}`}>{p.isDark ? "Dark" : "Light"}</span>
          </div>
        </div>
      </div>

      <div>
        <SectionLabel>Accent Color</SectionLabel>
        <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.02] p-4">
          <div className="flex items-center gap-3">
            {["#10b981", "#06b6d4", "#8b5cf6", "#f59e0b", "#ef4444"].map((color, i) => (
              <div key={color} title={color} style={{ backgroundColor: color }}
                className={`h-7 w-7 rounded-full border-2 cursor-pointer transition-all hover:scale-110 active:scale-95 ${i === 0 ? "border-white dark:border-zinc-800 scale-110 ring-2 ring-emerald-500/40" : "border-transparent opacity-60 hover:opacity-90"}`}
              />
            ))}
            <span className="text-[10px] text-slate-400 dark:text-zinc-500 ml-1">Emerald active</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function MemoryPane({ p }: { p: SettingsPanelProps }) {
  return (
    <div className="space-y-5">
      <div>
        <SectionLabel>Memory Engine</SectionLabel>
        <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.02] overflow-hidden">
          <SettingRow icon="🧠" label="Semantic Memory"    description="Vector search — Qdrant Cloud"           right={<StatusBadge color="purple">Active</StatusBadge>} />
          <SettingRow icon="⚡" label="Groq Distillation"  description="Background extraction of durable facts" right={<StatusBadge color="emerald">Enabled</StatusBadge>} />
          <SettingRow icon="🔒" label="Privacy Guard"      description="Credentials & sensitive PII never stored" right={<StatusBadge color="sky">On</StatusBadge>} />
        </div>
      </div>

      <div>
        <SectionLabel>Personalization</SectionLabel>
        <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.02] overflow-hidden">
          <SettingRow icon="📋" label="Conversation History" description="Per-session context via MongoDB" right={<span className="text-[10px] font-semibold text-slate-500 dark:text-zinc-400">Session</span>} />
          <SettingRow icon="🎯" label="GraphRAG Grounding"   description="Political & fact-check knowledge graphs" right={<StatusBadge color="amber">Qdrant</StatusBadge>} />
        </div>
      </div>

      {p.hasMessages && (
        <div>
          <SectionLabel>Danger Zone</SectionLabel>
          <button type="button" onClick={p.onClearHistory}
            className="w-full py-3 px-4 rounded-2xl border border-red-500/30 bg-red-500/5 dark:bg-red-500/10 text-red-600 dark:text-red-400 text-sm font-semibold hover:bg-red-500/15 transition cursor-pointer flex items-center justify-center gap-2 active:scale-[0.98]"
          >
            <span>🗑️</span> Clear Conversation History
          </button>
        </div>
      )}
    </div>
  );
}

function AboutPane({ p }: { p: SettingsPanelProps }) {
  return (
    <div className="space-y-5">
      <div>
        <SectionLabel>Active Tools</SectionLabel>
        <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.02] overflow-hidden">
          <SettingRow icon="🌐" label="Live Web Search"      description="Tavily / Brave real-time search"   right={<StatusBadge color="emerald">Enabled</StatusBadge>} />
          <SettingRow icon="📄" label="Web Page Scraper"     description="Intelligent page extraction"       right={<StatusBadge color="emerald">Enabled</StatusBadge>} />
          <SettingRow icon="🧮" label="Calculator & Tools"   description="Math, time, weather — real-time"  right={<StatusBadge color="emerald">Enabled</StatusBadge>} />
          <SettingRow icon="🔄" label="WebSocket Streaming"  description="Sub-300ms audio pipeline"         right={<StatusBadge color="sky">Active</StatusBadge>} />
        </div>
      </div>

      <div>
        <SectionLabel>Performance</SectionLabel>
        <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.02] overflow-hidden">
          <SettingRow icon="⚡" label="Model"       right={<span className="text-xs font-semibold text-slate-700 dark:text-zinc-300">{p.activeModel}</span>} />
          <SettingRow icon="🎙️" label="Voice Engine" right={<span className="text-xs font-semibold text-slate-700 dark:text-zinc-300 truncate max-w-[100px]">{p.selectedVoice.replace("aura-","").replace("-en","").replace("sarvam-","Sarvam ")}</span>} />
          {p.lastTtfa != null && (
            <SettingRow icon="⏱️" label="Last TTFA" description="Time to first audio chunk"
              right={<span className={`text-xs font-bold ${p.lastTtfa < 800 ? "text-emerald-600 dark:text-emerald-400" : p.lastTtfa < 1500 ? "text-amber-600 dark:text-amber-400" : "text-red-500"}`}>{p.lastTtfa}ms</span>}
            />
          )}
        </div>
      </div>

      <button type="button"
        onClick={() => { p.onOpenDebateArena(); if (p.isMobile && p.onClose) p.onClose(); }}
        className="w-full flex items-center justify-center gap-2 py-3.5 px-4 rounded-2xl border border-amber-500/40 bg-gradient-to-r from-amber-500/10 to-orange-500/10 text-amber-700 dark:text-amber-300 font-semibold text-sm hover:from-amber-500/20 hover:to-orange-500/20 transition cursor-pointer shadow-xs active:scale-[0.98]"
      >
        <span>⚔️</span> Open AI Debate Arena
      </button>

      <div className="text-center pt-1">
        <p className="text-[11px] text-slate-400 dark:text-zinc-600">Chatly Voice AI • v2.0</p>
        <p className="text-[10px] text-slate-300 dark:text-zinc-700 mt-0.5">Real-time voice intelligence with RAG & memory</p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
//  MAIN
// ─────────────────────────────────────────────────────────────
export default function SettingsPanel(props: SettingsPanelProps) {
  const { isMobile = false, onClose } = props;
  const [activeCategory, setActiveCategory] = useState<CategoryId | null>(isMobile ? null : "account");

  function renderContent(id: CategoryId) {
    switch (id) {
      case "account":    return <AccountPane p={props} />;
      case "voice_audio": return <VoiceAudioPane p={props} />;
      case "ai_chat":    return <AiChatPane p={props} />;
      case "appearance": return <AppearancePane p={props} />;
      case "memory":     return <MemoryPane p={props} />;
      case "about":      return <AboutPane p={props} />;
    }
  }

  const Header = (
    <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-white/10 mb-4 shrink-0">
      <Link href="/" className="flex items-center gap-2.5" onClick={onClose}>
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 text-white font-bold shadow-md shadow-emerald-500/25 text-base">
          🎙️
        </div>
        <div>
          <span className="font-bold text-sm tracking-tight text-slate-900 dark:text-white block">Chatly AI</span>
          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold uppercase tracking-wider block">Settings</span>
        </div>
      </Link>
      <div className="flex items-center gap-2">
        <ThemeToggle />
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Close settings"
            className="p-2 rounded-xl text-slate-400 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white transition cursor-pointer hover:bg-slate-100 dark:hover:bg-white/5"
          >✕</button>
        )}
      </div>
    </div>
  );

  const CategoryNav = (compact: boolean) => (
    <nav className={`flex flex-col ${compact ? "gap-0.5" : "gap-1"}`}>
      {CATEGORIES.map((cat) => {
        const isActive = activeCategory === cat.id;
        const a = ACCENT[cat.accent];
        return (
          <button key={cat.id} type="button" onClick={() => setActiveCategory(cat.id)}
            className={`flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-left cursor-pointer transition-all duration-200 group w-full ${
              isActive ? `${a.bg} ${a.border} border` : "border border-transparent hover:bg-slate-100 dark:hover:bg-white/[0.04]"
            }`}
          >
            <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-sm transition-all ${isActive ? a.iconBg : "bg-slate-100 dark:bg-white/[0.04]"}`}>
              {cat.icon}
            </span>
            <div className="min-w-0 flex-1">
              <p className={`text-xs font-semibold truncate transition-colors leading-tight ${isActive ? a.text : "text-slate-700 dark:text-zinc-300"}`}>{cat.label}</p>
              {!compact && <p className="text-[9px] text-slate-400 dark:text-zinc-600 truncate leading-tight">{cat.description}</p>}
            </div>
            <span className={`text-xs transition-all shrink-0 ${isActive ? a.text : "opacity-0 group-hover:opacity-40 text-slate-400"}`}>›</span>
          </button>
        );
      })}
    </nav>
  );

  // ── DESKTOP ──────────────────────────────────────────────────
  if (!isMobile) {
    return (
      <div className="flex flex-col h-full">
        {Header}
        <div className="flex flex-1 min-h-0 gap-3">
          {/* Left category nav */}
          <div className="w-[150px] shrink-0">
            {CategoryNav(false)}
          </div>
          {/* Divider */}
          <div className="w-px bg-slate-200 dark:bg-white/[0.07] shrink-0" />
          {/* Right content */}
          <div className="flex-1 min-w-0 overflow-y-auto pb-6">
            {activeCategory ? (
              <div key={activeCategory} className="animate-in fade-in slide-in-from-right-1 duration-200">
                {/* Pane title */}
                {(() => {
                  const cat = CATEGORIES.find((c) => c.id === activeCategory)!;
                  const a = ACCENT[cat.accent];
                  return (
                    <div className="flex items-center gap-2 mb-4">
                      <span className={`flex h-6 w-6 items-center justify-center rounded-lg ${a.iconBg} text-sm`}>{cat.icon}</span>
                      <h2 className={`text-sm font-bold ${a.text}`}>{cat.label}</h2>
                    </div>
                  );
                })()}
                {renderContent(activeCategory)}
              </div>
            ) : (
              <div className="flex items-center justify-center h-24 text-slate-300 dark:text-zinc-700 text-sm">Select a category</div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── MOBILE ────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">
      {Header}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {activeCategory === null ? (
          /* Mobile category list */
          <div className="space-y-1.5 pb-6">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-600 px-1 mb-3">Settings</p>
            {CATEGORIES.map((cat) => {
              const a = ACCENT[cat.accent];
              return (
                <button key={cat.id} type="button" onClick={() => setActiveCategory(cat.id)}
                  className="flex items-center gap-3 w-full px-4 py-3.5 rounded-2xl border border-slate-200 dark:border-white/[0.07] bg-white dark:bg-white/[0.02] hover:bg-slate-50 dark:hover:bg-white/[0.04] cursor-pointer transition-all active:scale-[0.98]"
                >
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${a.iconBg} text-xl`}>{cat.icon}</span>
                  <div className="min-w-0 flex-1 text-left">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">{cat.label}</p>
                    <p className="text-[11px] text-slate-500 dark:text-zinc-500">{cat.description}</p>
                  </div>
                  <span className="text-slate-300 dark:text-zinc-600 text-base">›</span>
                </button>
              );
            })}
          </div>
        ) : (
          /* Mobile content pane */
          <div className="pb-6">
            <div className="flex items-center gap-2 mb-5">
              <button type="button" onClick={() => setActiveCategory(null)}
                className="text-sm font-medium text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white transition cursor-pointer flex items-center gap-1"
              >‹ Back</button>
              <span className="text-slate-200 dark:text-zinc-700">|</span>
              {(() => {
                const cat = CATEGORIES.find((c) => c.id === activeCategory)!;
                const a = ACCENT[cat.accent];
                return (
                  <h2 className={`text-sm font-bold ${a.text} flex items-center gap-1.5`}>
                    <span>{cat.icon}</span><span>{cat.label}</span>
                  </h2>
                );
              })()}
            </div>
            <div key={activeCategory} className="animate-in fade-in slide-in-from-right-2 duration-200">
              {renderContent(activeCategory)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
