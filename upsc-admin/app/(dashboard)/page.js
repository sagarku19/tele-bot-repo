"use client";

import { useState, useEffect } from "react";
import StatsCard from "@/components/StatsCard";
import UserTable from "@/components/UserTable";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

export default function DashboardPage() {
  const [stats, setStats] = useState(null);
  const [recentUsers, setRecentUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchData = async () => {
    try {
      // Fetch stats
      const statsRes = await fetch("/api/stats");
      if (!statsRes.ok) throw new Error("Failed to fetch stats");
      const statsData = await statsRes.json();
      setStats(statsData);

      // Fetch users for the recent list
      const usersRes = await fetch("/api/users");
      if (!usersRes.ok) throw new Error("Failed to fetch users");
      const usersData = await usersRes.json();
      setRecentUsers(usersData.users.slice(0, 5));
      
      setError("");
    } catch (err) {
      console.error(err);
      setError("Failed to load dashboard data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000); // 30s refresh
    return () => clearInterval(interval);
  }, []);

  if (loading && !stats) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <div className="w-8 h-8 border-4 border-[#3b82f6] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500/50 p-6 rounded-xl text-red-400">
        {error}
        <button onClick={fetchData} className="ml-4 underline">Retry</button>
      </div>
    );
  }

  const chartData = stats?.stageBreakdown ? [
    { name: "New", value: stats.stageBreakdown.new || 0, color: "#64748b" },
    { name: "Engaged", value: stats.stageBreakdown.engaged || 0, color: "#3b82f6" },
    { name: "Interested", value: stats.stageBreakdown.interested || 0, color: "#eab308" },
    { name: "Payment Pending", value: stats.stageBreakdown.payment_pending || 0, color: "#f97316" },
    { name: "Paid", value: stats.stageBreakdown.paid || 0, color: "#22c55e" },
  ] : [];

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Dashboard Overview</h1>
        <span className="text-sm text-slate-400 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
          Live updating
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatsCard 
          title="Total Users" 
          value={stats?.totalUsers?.toLocaleString() || 0} 
          color="blue" 
        />
        <StatsCard 
          title="Paid Users" 
          value={stats?.paidUsers?.toLocaleString() || 0} 
          color="green" 
        />
        <StatsCard 
          title="Today New Users" 
          value={stats?.todayNewUsers?.toLocaleString() || 0} 
          color="yellow" 
        />
        <StatsCard 
          title="Total Revenue" 
          value={`₹${stats?.totalRevenue?.toLocaleString() || 0}`} 
          color="green" 
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart */}
        <div className="bg-[#1e293b] rounded-xl shadow-lg border border-slate-700 p-6">
          <h2 className="text-lg font-semibold mb-6">Funnel Breakdown</h2>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <XAxis dataKey="name" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip 
                  cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px' }} 
                  itemStyle={{ color: '#fff' }}
                />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Recent Users */}
        <div className="bg-[#1e293b] rounded-xl shadow-lg border border-slate-700 p-6 overflow-hidden flex flex-col">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold">Recent Users</h2>
            <a href="/users" className="text-sm text-[#3b82f6] hover:underline">View All</a>
          </div>
          
          <div className="flex-1 overflow-auto">
            <UserTable users={recentUsers} compact={true} />
          </div>
        </div>
      </div>
    </div>
  );
}
