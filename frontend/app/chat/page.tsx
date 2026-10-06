"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { API_BASE } from "../config";
import { ThemeToggle } from "../components/ThemeToggle";

interface ChatMessage {
  id: string;
  sender: "user" | "ai";
  text: string;
  timestamp: string | Date;
  model?: string;
  ragSource?: string | null;
  factCheck?: {
    credibilityScore?: number;
    verdict?: string;
    verdictLabel?: string;
    explanation?: string;
  } | null;
}

export default function ChatPage() {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [inputMessage, setInputMessage] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [operatingMode, setOperatingMode] = useState<"FAST" | "SEARCH">("FAST");
  const [effortLevel, setEffortLevel] = useState<"LOW" | "MEDIUM" | "HIGH" | "MAX">("MEDIUM");
  const [error, setError] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<{ name: string; email: string } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setMounted(true);
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("chatly_user");
      const token = localStorage.getItem("chatly_token");
      if (stored) {
        try {
          setCurrentUser(JSON.parse(stored));
        } catch (_) {}
      }

      // Fetch saved conversation history
      if (token) {
        fetch(`${API_BASE}/api/voice/history`, {
          headers: { Authorization: `Bearer ${token}` },
        })
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => {
            if (data?.messages && Array.isArray(data.messages) && data.messages.length > 0) {
              setMessages(
                data.messages.map((m: any, idx: number) => ({
                  id: `history-${idx}-${Date.now()}`,
                  sender: m.sender || (m.role === "user" ? "user" : "ai"),
                  text: m.text,
                  timestamp: m.timestamp || new Date(),
                  toolUsed: m.toolUsed || null,
                }))
              );
            } else {
              // Welcome greeting if fresh
              setMessages([
                {
                  id: "welcome-1",
                  sender: "ai",
                  text: "Hello! 👋 I'm Chatly AI. You can chat with me, brainstorm ideas, research facts, or analyze complex data. How can I assist you today?",
                  timestamp: new Date(),
                },
              ]);
            }
          })
          .catch(() => {
            setMessages([
              {
                id: "welcome-1",
                sender: "ai",
                text: "Hello! 👋 I'm Chatly AI. How can I assist you today?",
                timestamp: new Date(),
              },
            ]);
          });
      } else {
        setMessages([
          {
            id: "welcome-1",
            sender: "ai",
            text: "Hello! 👋 I'm Chatly AI. How can I assist you today? (Sign in to save multi-turn conversation history across devices.)",
            timestamp: new Date(),
          },
        ]);
      }
    }
  }, []);

  const isDark = mounted ? resolvedTheme === "dark" : true;

  // Auto-scroll to bottom of chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isAiLoading]);

  // Start a new chat session
  const handleNewChat = async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const token = typeof window !== "undefined" ? localStorage.getItem("chatly_token") : null;
    if (token) {
      try {
        await fetch(`${API_BASE}/api/voice/history`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch (_) {}
    }
    setMessages([
      {
        id: `welcome-${Date.now()}`,
        sender: "ai",
        text: "New chat initialized! What would you like to explore or solve?",
        timestamp: new Date(),
      },
    ]);
    setError(null);
  };

  // Submit message to Chatly backend
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const promptText = inputMessage.trim();
    if (!promptText || isAiLoading) return;

    setInputMessage("");
    setError(null);

    const token = typeof window !== "undefined" ? localStorage.getItem("chatly_token") : null;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: "user",
      text: promptText,
      timestamp: new Date(),
    };

    const aiMsgId = `ai-${Date.now()}`;
    const initialAiMsg: ChatMessage = {
      id: aiMsgId,
      sender: "ai",
      text: "",
      timestamp: new Date(),
      model: operatingMode === "SEARCH" ? "Chatly Deep Research" : "Chatly Ultra",
    };

    setMessages((prev) => [...prev, userMsg, initialAiMsg]);
    setIsAiLoading(true);

    const historyPayload = messages
      .filter((m) => m.text && m.text.trim())
      .slice(-8)
      .map((m) => ({
        role: m.sender === "user" ? "user" : "assistant",
        sender: m.sender,
        text: m.text.trim(),
      }));

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      // 1. Try Streaming SSE Endpoint
      const response = await fetch(`${API_BASE}/api/voice/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        signal: controller.signal,
        body: JSON.stringify({
          text: promptText,
          message: promptText,
          history: historyPayload,
          mode: operatingMode,
          effort: effortLevel,
          thinkingMode: operatingMode === "SEARCH",
        }),
      });

      if (response.status === 429) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Rate limit reached. Please wait before asking more questions.");
      }

      if (!response.ok || !response.body) {
        throw new Error(`Server returned status ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let sseBuffer = "";
      let accumulatedText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        sseBuffer += decoder.decode(value, { stream: true });

        const events = sseBuffer.split("\n\n");
        sseBuffer = events.pop() || "";

        for (const rawEv of events) {
          const lines = rawEv.split("\n");
          let eventType = "message";
          let dataStr = "";
          for (const line of lines) {
            if (line.startsWith("event:")) eventType = line.slice(6).trim();
            if (line.startsWith("data:")) dataStr = line.slice(5).trim();
          }

          if (dataStr) {
            try {
              const parsed = JSON.parse(dataStr);
              if (eventType === "token" && parsed.token) {
                accumulatedText += parsed.token;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === aiMsgId ? { ...m, text: accumulatedText } : m
                  )
                );
              } else if (eventType === "factcheck") {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === aiMsgId ? { ...m, factCheck: parsed } : m
                  )
                );
              }
            } catch (_) {}
          }
        }
      }

      if (!accumulatedText.trim()) {
        // Fallback to standard /api/voice if stream completed without tokens
        const fallbackRes = await fetch(`${API_BASE}/api/voice`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            text: promptText,
            history: historyPayload,
            operatingMode,
            effort: effortLevel,
          }),
        });
        const fallbackData = await fallbackRes.json();
        const reply = fallbackData.text || fallbackData.response || "I have analyzed your request.";
        setMessages((prev) =>
          prev.map((m) => (m.id === aiMsgId ? { ...m, text: reply } : m))
        );
      }
    } catch (err: any) {
      if (err.name === "AbortError") return;

      console.warn("Stream error, falling back to standard API:", err);
      // Fallback
      try {
        const fallbackRes = await fetch(`${API_BASE}/api/voice`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            text: promptText,
            history: historyPayload,
            operatingMode,
          }),
        });

        if (!fallbackRes.ok) {
          const errData = await fallbackRes.json().catch(() => ({}));
          throw new Error(errData.error || "Failed to communicate with Chatly AI.");
        }

        const fallbackData = await fallbackRes.json();
        const reply = fallbackData.text || fallbackData.response || "No response received.";
        setMessages((prev) =>
          prev.map((m) => (m.id === aiMsgId ? { ...m, text: reply } : m))
        );
      } catch (finalErr: any) {
        setError(finalErr.message || "Something went wrong. Please check connection.");
        setMessages((prev) =>
          prev.map((m) =>
            m.id === aiMsgId
              ? {
                  ...m,
                  text: "⚠️ Sorry, I could not complete your request. Please ensure the backend is running and try again.",
                }
              : m
          )
        );
      }
    } finally {
      setIsAiLoading(false);
      abortControllerRef.current = null;
    }
  };

  return (
    <main
      className={`flex h-screen w-full transition-colors duration-200 overflow-hidden ${
        isDark ? "bg-[#09090d] text-white" : "bg-slate-50 text-slate-900"
      }`}
    >
      {/* =========================================================
          LEFT SIDEBAR
          ========================================================= */}
      <aside
        className={`hidden md:flex w-72 flex-col justify-between border-r p-4 transition-colors ${
          isDark
            ? "border-white/10 bg-[#0d0f14]"
            : "border-slate-200 bg-white shadow-xs"
        }`}
      >
        <div>
          {/* Brand Header */}
          <div className="flex items-center justify-between mb-5 px-2">
            <Link href="/" className="flex items-center gap-2.5 font-bold text-lg">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 text-white shadow-md text-sm">
                🎙️
              </span>
              <span>Chatly</span>
              <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                AI
              </span>
            </Link>
            <ThemeToggle />
          </div>

          {/* New Chat Button */}
          <button
            type="button"
            onClick={handleNewChat}
            className={`w-full rounded-2xl border py-3 px-4 text-left text-sm font-semibold flex items-center justify-between transition cursor-pointer active:scale-98 shadow-xs ${
              isDark
                ? "border-white/10 bg-white/5 hover:bg-white/10 text-white"
                : "border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-800"
            }`}
          >
            <span className="flex items-center gap-2">
              <span className="text-base">✨</span>
              <span>New Chat</span>
            </span>
            <span className="text-xs opacity-50">+</span>
          </button>

          {/* Navigation Links */}
          <div className="mt-5 space-y-1">
            <Link
              href="/voice"
              className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold transition ${
                isDark
                  ? "text-zinc-400 hover:bg-white/5 hover:text-white"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              <span>🎙️</span>
              <span>Voice Studio & Debate Arena</span>
            </Link>
            <Link
              href="/dashboard"
              className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold transition ${
                isDark
                  ? "text-zinc-400 hover:bg-white/5 hover:text-white"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              <span>📊</span>
              <span>User Dashboard & Quota</span>
            </Link>
          </div>

          {/* Quick Conversation Starters */}
          <div className="mt-6">
            <p className="px-2 mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              Suggested Topics
            </p>
            <div className="space-y-1">
              {[
                "Synthesize meeting notes into 5 bullets",
                "Compare India's GDP growth with China",
                "Explain Article 370 legal history",
                "Generate creative brand taglines",
              ].map((topic, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    setInputMessage(topic);
                  }}
                  className={`w-full truncate text-left rounded-xl px-3 py-2 text-xs transition cursor-pointer ${
                    isDark
                      ? "text-zinc-400 hover:bg-white/5 hover:text-white"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                >
                  💬 {topic}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* User Card at bottom of sidebar */}
        <div
          className={`rounded-2xl border p-3 flex items-center justify-between text-xs ${
            isDark ? "border-white/10 bg-white/[0.02]" : "border-slate-200 bg-slate-50"
          }`}
        >
          <div className="truncate">
            <p className="font-semibold truncate">{currentUser?.name || "Guest User"}</p>
            <p className="text-[11px] text-zinc-400 truncate">{currentUser?.email || "Free Tier"}</p>
          </div>
          <Link
            href="/login"
            className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
          >
            {currentUser ? "Switch" : "Sign In"}
          </Link>
        </div>
      </aside>

      {/* =========================================================
          MAIN CHAT AREA
          ========================================================= */}
      <section className="flex flex-1 flex-col h-full relative overflow-hidden">
        {/* Header Bar */}
        <header
          className={`flex h-16 items-center justify-between border-b px-5 transition-colors shrink-0 ${
            isDark ? "border-white/10 bg-[#09090d]/80" : "border-slate-200 bg-white/80"
          } backdrop-blur-md z-10`}
        >
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="md:hidden flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500 text-white font-bold text-sm"
            >
              🎙️
            </Link>
            <div>
              <h1 className="font-bold text-sm sm:text-base flex items-center gap-2">
                <span>Chatly Chat</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-mono font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  {operatingMode === "SEARCH" ? "Deep Search" : "Fast AI"}
                </span>
              </h1>
              <p className="text-[11px] text-zinc-400">
                Text conversations with live streaming & verifiable fact checking
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Mode Toggle Button */}
            <div className="flex items-center rounded-full border border-slate-300 dark:border-white/10 bg-slate-100 dark:bg-white/5 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setOperatingMode("FAST")}
                className={`px-2.5 py-1 rounded-full text-xs font-semibold transition cursor-pointer ${
                  operatingMode === "FAST"
                    ? "bg-white dark:bg-zinc-800 text-amber-600 dark:text-amber-400 shadow-xs"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                ⚡ Fast
              </button>
              <button
                type="button"
                onClick={() => setOperatingMode("SEARCH")}
                className={`px-2.5 py-1 rounded-full text-xs font-semibold transition cursor-pointer ${
                  operatingMode === "SEARCH"
                    ? "bg-white dark:bg-zinc-800 text-blue-600 dark:text-blue-400 shadow-xs"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                🔍 Search
              </button>
            </div>

            {/* Voice Mode Link */}
            <Link
              href="/voice"
              className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 px-3 py-1.5 text-xs font-semibold transition flex items-center gap-1.5 shadow-xs"
            >
              <span>🎙️ Voice</span>
            </Link>
          </div>
        </header>

        {/* Error notification banner */}
        {error && (
          <div className="mx-4 mt-3 rounded-2xl bg-rose-500/10 border border-rose-500/20 p-3 text-xs text-rose-600 dark:text-rose-400 flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="font-bold cursor-pointer">✕</button>
          </div>
        )}

        {/* Messages Stream */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
            {messages.map((msg) => {
              const isUser = msg.sender === "user";
              return (
                <div
                  key={msg.id}
                  className={`flex gap-3 sm:gap-4 ${isUser ? "justify-end" : "justify-start"}`}
                >
                  {/* AI Avatar */}
                  {!isUser && (
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 text-white font-bold text-xs shadow-md shadow-emerald-500/20">
                      AI
                    </div>
                  )}

                  {/* Message Bubble Container */}
                  <div className={`max-w-[85%] sm:max-w-[80%] flex flex-col ${isUser ? "items-end" : "items-start"}`}>
                    <div
                      className={`rounded-3xl px-4 sm:px-5 py-3.5 text-sm leading-relaxed shadow-xs transition-colors ${
                        isUser
                          ? "bg-emerald-600 text-white rounded-br-xs"
                          : isDark
                          ? "bg-white/[0.04] border border-white/10 text-zinc-100 rounded-bl-xs"
                          : "bg-white border border-slate-200 text-slate-900 rounded-bl-xs shadow-sm"
                      }`}
                    >
                      {/* Message Content */}
                      <p className="whitespace-pre-wrap">{msg.text || (isAiLoading ? "..." : "")}</p>

                      {/* Fact Check badge if attached */}
                      {msg.factCheck && (
                        <div className="mt-2.5 pt-2 border-t border-white/10 text-xs flex items-center gap-2">
                          <span className="font-semibold text-emerald-400">
                            🛡️ Score: {msg.factCheck.credibilityScore}%
                          </span>
                          <span className="opacity-75">{msg.factCheck.verdictLabel}</span>
                        </div>
                      )}
                    </div>

                    {/* Timestamp */}
                    <span className="text-[10px] text-zinc-500 mt-1 px-1">
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>

                  {/* User Avatar */}
                  {isUser && (
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl bg-zinc-800 text-white font-bold text-xs border border-white/10">
                      {currentUser?.name?.charAt(0) || "U"}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Streaming Indicator */}
            {isAiLoading && messages[messages.length - 1]?.sender === "user" && (
              <div className="flex gap-3 items-center">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 text-white font-bold text-xs animate-pulse">
                  AI
                </div>
                <div
                  className={`rounded-2xl px-4 py-3 text-xs flex items-center gap-2 ${
                    isDark ? "bg-white/5 text-zinc-300" : "bg-slate-100 text-slate-700"
                  }`}
                >
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
                  <span>Chatly is thinking and preparing your response...</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input Bar */}
        <div
          className={`border-t p-3 sm:p-4 shrink-0 transition-colors ${
            isDark ? "border-white/10 bg-[#0d0f14]/80" : "border-slate-200 bg-white/80"
          } backdrop-blur-md`}
        >
          <form
            onSubmit={handleSendMessage}
            className={`mx-auto flex max-w-3xl items-center gap-2 rounded-2xl border p-2 shadow-xs transition ${
              isDark
                ? "border-white/10 bg-white/5 focus-within:border-emerald-500/50"
                : "border-slate-300 bg-white focus-within:border-emerald-600 focus-within:ring-2 focus-within:ring-emerald-500/20"
            }`}
          >
            <textarea
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage(e);
                }
              }}
              placeholder={
                operatingMode === "SEARCH"
                  ? "Ask anything with deep search and verifiable facts..."
                  : "Message Chatly AI (Press Enter to send, Shift+Enter for new line)..."
              }
              rows={1}
              className="max-h-32 flex-1 resize-none bg-transparent px-3 py-2 text-sm outline-none placeholder:text-zinc-500"
            />

            <button
              type="submit"
              disabled={!inputMessage.trim() || isAiLoading}
              className="cursor-pointer rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white dark:bg-white dark:text-black dark:hover:bg-zinc-200 px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-30 shadow-xs"
            >
              {isAiLoading ? "..." : "Send ↑"}
            </button>
          </form>

          <p className="mt-2 text-center text-[11px] text-zinc-500">
            Chatly can research, synthesize, and cite verified facts. Verify critical numbers.
          </p>
        </div>
      </section>
    </main>
  );
}