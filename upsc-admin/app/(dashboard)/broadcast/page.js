"use client";

import { useState, useEffect } from "react";

export default function BroadcastPage() {
  const [message, setMessage] = useState("");
  const [targetStage, setTargetStage] = useState("all");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);
  
  // For estimating recipients
  const [estimateLoading, setEstimateLoading] = useState(true);
  const [usersCount, setUsersCount] = useState(0);

  useEffect(() => {
    // Fetch users to calculate estimation
    setEstimateLoading(true);
    fetch("/api/users")
      .then(res => res.json())
      .then(data => {
        if (!data.users) return;
        const count = targetStage === "all" 
          ? data.users.length 
          : data.users.filter(u => u.stage === targetStage).length;
        setUsersCount(count);
      })
      .catch(() => setUsersCount(0))
      .finally(() => setEstimateLoading(false));
  }, [targetStage]);

  const handleSend = async () => {
    if (!message.trim()) return;
    if (!confirm(`You are about to send a message to ~${usersCount} users. Are you sure?`)) return;

    setSending(true);
    setResult(null);

    try {
      const res = await fetch("/api/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, targetStage }),
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Broadcast failed");
      
      setResult(data);
      setMessage("");
    } catch (err) {
      console.error(err);
      alert("Broadcast failed: " + err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Broadcast Message</h1>
        <p className="text-slate-400 mt-1">Send a direct message to users via the Telegram Bot</p>
      </div>

      <div className="bg-[#1e293b] rounded-xl shadow-lg border border-slate-700 p-6">
        {result && (
          <div className="mb-6 p-4 bg-green-500/10 border border-green-500/30 rounded-lg flex items-start gap-3">
            <span className="text-green-500 text-xl">✅</span>
            <div>
              <h3 className="text-green-400 font-bold">Broadcast Completed</h3>
              <p className="text-green-500/80 text-sm mt-1">
                Successfully sent to <span className="font-bold">{result.sent}</span> users. 
                {result.failed > 0 && <span className="text-red-400 ml-1">Failed for {result.failed} users.</span>}
              </p>
            </div>
            <button onClick={() => setResult(null)} className="ml-auto text-green-500 hover:text-green-400 font-bold">✕</button>
          </div>
        )}

        <div className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Target Audience
            </label>
            <select
              value={targetStage}
              onChange={(e) => setTargetStage(e.target.value)}
              className="w-full px-4 py-3 bg-[#0f172a] border border-slate-700 rounded-lg text-white focus:ring-2 focus:ring-[#3b82f6] outline-none transition"
            >
              <option value="all">All Users</option>
              <option value="new">New</option>
              <option value="engaged">Engaged</option>
              <option value="interested">Interested</option>
              <option value="payment_pending">Payment Pending</option>
              <option value="paid">Paid</option>
            </select>
            
            <p className="mt-2 text-sm flex items-center gap-2">
              <span className="text-slate-400">Estimated recipients:</span>
              {estimateLoading ? (
                <span className="w-3 h-3 border-2 border-slate-400 border-t-transparent rounded-full animate-spin"></span>
              ) : (
                <span className="font-bold text-[#3b82f6] bg-blue-500/10 px-2 py-0.5 rounded">~{usersCount}</span>
              )}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Message content
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={8}
              className="w-full px-4 py-3 bg-[#0f172a] border border-slate-700 rounded-lg text-white focus:ring-2 focus:ring-[#3b82f6] outline-none transition resize-y font-mono text-sm placeholder-slate-600"
              placeholder="Hello! Check out our new current affairs compilation..."
            />
            <p className="mt-2 text-xs text-slate-500">
              Message will be sent exactly as typed. Telegram Markdown format is not processed by default unless configured in the bot.
            </p>
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-slate-700 flex items-center justify-between">
          <p className="text-sm text-yellow-500/80 bg-yellow-500/10 px-3 py-1.5 rounded-lg border border-yellow-500/20 inline-flex items-center gap-2">
            ⚠️ Messages are rate-limited to avoid Telegram spam bans.
          </p>
          <button
            onClick={handleSend}
            disabled={sending || !message.trim() || usersCount === 0}
            className="px-8 py-3 bg-[#3b82f6] text-white rounded-lg font-bold shadow-lg shadow-blue-500/20 hover:bg-blue-600 hover:shadow-blue-500/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {sending ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Sending Broadcast...
              </>
            ) : (
              <>
                <span>📢</span> Send Broadcast
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
