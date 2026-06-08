"use client";

import { useEffect, useState, useCallback, use } from "react";
import Link from "next/link";

const sourceBadge = {
  user: "bg-slate-700 text-slate-300",
  claude: "bg-blue-500/20 text-blue-300 border border-blue-500/30",
  faq: "bg-purple-500/20 text-purple-300 border border-purple-500/30",
  template: "bg-yellow-500/20 text-yellow-300 border border-yellow-500/30",
  system: "bg-slate-500/20 text-slate-300 border border-slate-500/30",
};

export default function ChatViewer({ params }) {
  const { telegramId } = use(params);

  const [user, setUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [uRes, mRes] = await Promise.all([
        fetch(`/api/users?telegramId=${telegramId}`),
        fetch(`/api/messages?telegramId=${telegramId}&limit=100`),
      ]);
      if (!uRes.ok) throw new Error(`User fetch failed: ${uRes.status}`);
      if (!mRes.ok) throw new Error(`Messages fetch failed: ${mRes.status}`);
      const uData = await uRes.json();
      const mData = await mRes.json();
      setUser(uData.user);
      // API returns newest-first; render oldest-first
      setMessages([...mData.messages].reverse());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [telegramId]);

  useEffect(() => {
    load();
  }, [load]);

  const loadOlder = async () => {
    if (messages.length === 0) return;
    const oldestTs = messages[0].ts;
    setLoadingOlder(true);
    try {
      const res = await fetch(
        `/api/messages?telegramId=${telegramId}&limit=100&before=${encodeURIComponent(oldestTs)}`,
      );
      if (!res.ok) throw new Error(`Older fetch failed: ${res.status}`);
      const data = await res.json();
      // Prepend (still oldest-first display)
      setMessages((prev) => [...[...data.messages].reverse(), ...prev]);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoadingOlder(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-slate-400">Loading…</div>;
  }
  if (error) {
    return <div className="p-8 text-red-400">Error: {error}</div>;
  }
  if (!user) {
    return <div className="p-8 text-slate-400">User not found.</div>;
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <Link href="/users" className="text-blue-400 hover:text-blue-300">← Back to Users</Link>
        <button
          onClick={load}
          className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
        >
          🔄 Refresh
        </button>
      </div>

      {/* User info card */}
      <div className="bg-[#1e293b] border border-slate-700 rounded-lg p-4 mb-6">
        <div className="flex items-baseline gap-3">
          <h2 className="text-xl font-semibold text-slate-100">{user.name || "Unknown"}</h2>
          {user.username && <span className="text-slate-400">@{user.username}</span>}
        </div>
        <div className="mt-2 text-sm text-slate-400 space-y-1">
          <div>Stage: <span className="text-slate-200">{user.stage}</span></div>
          <div>Joined: <span className="text-slate-200">{user.createdAt ? new Date(user.createdAt).toLocaleString() : "—"}</span></div>
          <div>Last seen: <span className="text-slate-200">{user.lastSeen ? new Date(user.lastSeen).toLocaleString() : "—"}</span></div>
          <div>Paid courses: <span className="text-slate-200">{user.paidCourseIds?.length ? user.paidCourseIds.join(", ") : "—"}</span></div>
        </div>
      </div>

      {/* Load older */}
      {messages.length > 0 && (
        <div className="flex justify-center mb-4">
          <button
            onClick={loadOlder}
            disabled={loadingOlder}
            className="px-4 py-2 text-sm rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 disabled:opacity-50"
          >
            {loadingOlder ? "Loading…" : "Load older"}
          </button>
        </div>
      )}

      {/* Messages */}
      {messages.length === 0 ? (
        <div className="text-center py-12 text-slate-500">No messages yet.</div>
      ) : (
        <div className="space-y-3">
          {messages.map((m) => (
            <div key={m.id} className={`flex ${m.role === "user" ? "justify-start" : "justify-end"}`}>
              <div className={`max-w-[75%] rounded-lg p-3 ${
                m.role === "user" ? "bg-slate-800 border border-slate-700" : "bg-blue-900/30 border border-blue-800/50"
              }`}>
                <div className="text-xs text-slate-400 mb-1 flex items-center gap-2">
                  <span>{new Date(m.ts).toLocaleString()}</span>
                  <span>·</span>
                  <span>{m.stage}</span>
                  <span>·</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] uppercase tracking-wider ${sourceBadge[m.source] || sourceBadge.system}`}>
                    {m.source}
                  </span>
                  {m.faqKey && <span className="text-purple-300 text-[10px]">key: {m.faqKey}</span>}
                </div>
                <div className="text-slate-100 whitespace-pre-wrap">{m.text}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
