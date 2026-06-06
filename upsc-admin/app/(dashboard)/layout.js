"use client";

import { useSession } from "next-auth/react";
import Sidebar from "@/components/Sidebar";

export default function DashboardLayout({ children }) {
  const { status } = useSession({
    required: true,
    onUnauthenticated() {
      // Handled automatically by required: true, redirects to signIn (which is configured to /login in lib/auth.js)
    },
  });

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-[#3b82f6] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-[#0f172a] text-slate-100">
      <div className="w-64 fixed inset-y-0 left-0">
        <Sidebar />
      </div>
      <main className="flex-1 ml-64 p-8">{children}</main>
    </div>
  );
}
