"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";

const navItems = [
  { href: "/", label: "Dashboard", icon: "📊" },
  { href: "/users", label: "Users", icon: "👥" },
  { href: "/courses", label: "Courses", icon: "📚" },
  { href: "/payments", label: "Payments", icon: "💳" },
  { href: "/broadcast", label: "Broadcast", icon: "📢" },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 h-full bg-[#1e293b] text-slate-100 flex flex-col border-r border-slate-700">
      <div className="p-6 border-b border-slate-700">
        <h1 className="text-2xl font-bold text-white tracking-tight">UPSC Admin</h1>
        <p className="text-sm text-slate-400 mt-1">Bot Management Panel</p>
      </div>
      
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${
              pathname === item.href
                ? "bg-[#3b82f6] text-white"
                : "text-slate-300 hover:bg-slate-700 hover:text-white"
            }`}
          >
            <span className="text-xl">{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>

      <div className="p-4 border-t border-slate-700">
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium text-slate-300 hover:bg-red-500 hover:text-white transition-colors"
        >
          <span>🚪</span>
          <span>Logout</span>
        </button>
      </div>
    </aside>
  );
}
