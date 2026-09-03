"use client";

import { useState } from "react";

export default function ChatPage() {
  const [message, setMessage] = useState("");

  return (
    <main className="flex h-screen bg-[#0a0a0a] text-white">
      
      {/* Sidebar */}
      <aside className="hidden w-64 flex-col border-r border-white/10 bg-[#0d0d0d] p-4 sm:flex">
        <div className="mb-6 text-xl font-semibold">
          Chatly
        </div>

        <button className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-left text-sm hover:bg-white/10">
          + New Chat
        </button>

        <div className="mt-6">
          <p className="mb-3 text-xs text-zinc-500">
            Recent chats
          </p>

          <button className="w-full truncate rounded-lg px-3 py-2 text-left text-sm text-zinc-400 hover:bg-white/5">
            Hello Chatly
          </button>

          <button className="mt-1 w-full truncate rounded-lg px-3 py-2 text-left text-sm text-zinc-400 hover:bg-white/5">
            Help with my project
          </button>
        </div>
      </aside>

      {/* Main Chat */}
      <section className="flex flex-1 flex-col">
        
        {/* Header */}
        <header className="flex h-16 items-center justify-between border-b border-white/10 px-5">
          <div>
            <h1 className="font-medium">
              New Chat
            </h1>
            <p className="text-xs text-zinc-500">
              AI Assistant
            </p>
          </div>

          <button className="rounded-lg border border-white/10 px-3 py-2 text-sm text-zinc-400 hover:bg-white/5">
            🎙 Voice
          </button>
        </header>

        {/* Messages */}
        <div className="flex flex-1 flex-col overflow-y-auto">
          <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-end gap-6 px-5 py-8">
            
            {/* AI Message */}
            <div className="flex gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-xs font-bold text-black">
                AI
              </div>

              <div className="max-w-[80%] rounded-2xl bg-white/5 px-4 py-3 text-sm leading-6 text-zinc-200">
                Hello! 👋 How can I help you today?
              </div>
            </div>

            {/* Example User Message */}
            <div className="flex justify-end">
              <div className="max-w-[80%] rounded-2xl bg-white px-4 py-3 text-sm leading-6 text-black">
                Hello!
              </div>
            </div>

          </div>
        </div>

        {/* Input */}
        <div className="border-t border-white/10 p-4">
          <form
            className="mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border border-white/10 bg-white/5 p-2"
            onSubmit={(e) => {
              e.preventDefault();

              if (!message.trim()) return;

              setMessage("");
            }}
          >
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Message Chatly..."
              rows={1}
              className="max-h-32 flex-1 resize-none bg-transparent px-3 py-2 text-sm text-white outline-none placeholder:text-zinc-500"
            />

            <button
              type="submit"
              disabled={!message.trim()}
              className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-30"
            >
              ↑
            </button>
          </form>

          <p className="mt-2 text-center text-xs text-zinc-600">
            Chatly can make mistakes. Check important information.
          </p>
        </div>
      </section>
    </main>
  );
}