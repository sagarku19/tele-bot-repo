"use client";

import { useEffect, useState } from "react";

export default function LinksPage() {
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [addingName, setAddingName] = useState("");
  const [addingUrl, setAddingUrl] = useState("");
  const [addingLabel, setAddingLabel] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editUrl, setEditUrl] = useState("");
  const [editLabel, setEditLabel] = useState("");

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/links");
      if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
      const data = await res.json();
      setLinks([...data.links].sort((a, b) => a.id.localeCompare(b.id)));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const addLink = async () => {
    if (!addingName.trim() || !addingUrl.trim()) return;
    const res = await fetch("/api/links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: addingName.trim(), url: addingUrl.trim(), label: addingLabel.trim() || undefined }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.error || "Add failed");
      return;
    }
    setAddingName("");
    setAddingUrl("");
    setAddingLabel("");
    await load();
  };

  const startEdit = (link) => {
    setEditingId(link.id);
    setEditUrl(link.url || "");
    setEditLabel(link.label || "");
  };

  const saveEdit = async () => {
    const res = await fetch("/api/links", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editingId, url: editUrl, label: editLabel || undefined }),
    });
    if (!res.ok) {
      alert("Update failed");
      return;
    }
    setEditingId(null);
    await load();
  };

  const deleteLink = async (name) => {
    if (!confirm(`Delete link "${name}"?`)) return;
    const res = await fetch(`/api/links?name=${encodeURIComponent(name)}`, { method: "DELETE" });
    if (!res.ok) {
      alert("Delete failed");
      return;
    }
    await load();
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-100 mb-6">Links</h1>

      {/* Add row */}
      <div className="bg-[#1e293b] border border-slate-700 rounded-lg p-4 mb-6">
        <h2 className="text-sm font-semibold text-slate-300 mb-3">Add a new link</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <input
            value={addingName}
            onChange={(e) => setAddingName(e.target.value)}
            placeholder="name (e.g. payment_link_phonepe)"
            className="px-3 py-2 bg-slate-800 border border-slate-700 rounded text-slate-100 placeholder-slate-500"
          />
          <input
            value={addingUrl}
            onChange={(e) => setAddingUrl(e.target.value)}
            placeholder="https://…"
            className="px-3 py-2 bg-slate-800 border border-slate-700 rounded text-slate-100 placeholder-slate-500 md:col-span-2"
          />
          <input
            value={addingLabel}
            onChange={(e) => setAddingLabel(e.target.value)}
            placeholder="label (optional)"
            className="px-3 py-2 bg-slate-800 border border-slate-700 rounded text-slate-100 placeholder-slate-500"
          />
        </div>
        <button
          onClick={addLink}
          className="mt-3 px-4 py-2 rounded bg-blue-500 hover:bg-blue-600 text-white font-medium"
        >
          Add
        </button>
      </div>

      {loading && <div className="text-slate-400">Loading…</div>}
      {error && <div className="text-red-400">Error: {error}</div>}

      {!loading && !error && (
        <div className="bg-[#1e293b] border border-slate-700 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="text-xs text-slate-400 uppercase bg-slate-800/80 border-b border-slate-700">
              <tr>
                <th className="px-4 py-3 text-left">Name</th>
                <th className="px-4 py-3 text-left">URL</th>
                <th className="px-4 py-3 text-left">Label</th>
                <th className="px-4 py-3 text-left">Updated</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {links.map((link) => (
                <tr key={link.id} className="hover:bg-slate-800/30">
                  <td className="px-4 py-3 font-medium text-slate-200">{link.id}</td>
                  <td className="px-4 py-3 text-slate-300 break-all">
                    {editingId === link.id ? (
                      <input
                        value={editUrl}
                        onChange={(e) => setEditUrl(e.target.value)}
                        className="w-full px-2 py-1 bg-slate-800 border border-slate-700 rounded text-slate-100"
                      />
                    ) : (
                      link.url
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-400">
                    {editingId === link.id ? (
                      <input
                        value={editLabel}
                        onChange={(e) => setEditLabel(e.target.value)}
                        className="w-full px-2 py-1 bg-slate-800 border border-slate-700 rounded text-slate-100"
                      />
                    ) : (
                      link.label || "—"
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs">
                    {link.updatedAt ? new Date(link.updatedAt).toLocaleString() : "—"}
                  </td>
                  <td className="px-4 py-3 text-right space-x-2">
                    {editingId === link.id ? (
                      <>
                        <button onClick={saveEdit} className="text-green-400 hover:text-green-300">Save</button>
                        <button onClick={() => setEditingId(null)} className="text-slate-400 hover:text-slate-300">Cancel</button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => startEdit(link)} className="text-blue-400 hover:text-blue-300">Edit</button>
                        <button onClick={() => deleteLink(link.id)} className="text-red-400 hover:text-red-300">Delete</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
              {links.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-12 text-center text-slate-500">No links yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
