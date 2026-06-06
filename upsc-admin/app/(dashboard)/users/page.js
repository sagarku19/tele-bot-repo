"use client";

import { useState, useEffect } from "react";

import UserTable from "@/components/UserTable";

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("all");

  useEffect(() => {
    fetch("/api/users")
      .then(res => res.json())
      .then(data => {
        if (data.users) setUsers(data.users);
      })
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  const filteredUsers = users.filter(user => {
    const matchesSearch = 
      (user.name || "").toLowerCase().includes(search.toLowerCase()) || 
      (user.username || "").toLowerCase().includes(search.toLowerCase());
    const matchesStage = stageFilter === "all" || user.stage === stageFilter;
    return matchesSearch && matchesStage;
  });

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Users Management</h1>
        <div className="text-sm font-medium text-slate-400 bg-slate-800 px-3 py-1 rounded-full border border-slate-700">
          Total: {filteredUsers.length}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <input
            type="text"
            placeholder="Search by name or username..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-[#1e293b] border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:ring-2 focus:ring-[#3b82f6] outline-none"
          />
          <span className="absolute left-3 top-3 text-slate-500">🔍</span>
        </div>
        
        <select
          value={stageFilter}
          onChange={(e) => setStageFilter(e.target.value)}
          className="w-full sm:w-48 px-4 py-2.5 bg-[#1e293b] border border-slate-700 rounded-lg text-white focus:ring-2 focus:ring-[#3b82f6] outline-none"
        >
          <option value="all">All Stages</option>
          <option value="new">New</option>
          <option value="engaged">Engaged</option>
          <option value="interested">Interested</option>
          <option value="payment_pending">Payment Pending</option>
          <option value="paid">Paid</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-[#1e293b] rounded-xl shadow-lg border border-slate-700 overflow-hidden">
        {loading ? (
          <div className="px-6 py-12 text-center text-slate-400">
            <div className="w-6 h-6 border-2 border-[#3b82f6] border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
            Loading users...
          </div>
        ) : (
          <UserTable users={filteredUsers} />
        )}
      </div>
    </div>
  );
}
