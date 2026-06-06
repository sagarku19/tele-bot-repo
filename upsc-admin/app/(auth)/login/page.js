"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    if (res?.error) {
      setError("Invalid credentials. Please try again.");
      setLoading(false);
    } else {
      router.push("/");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0f172a]">
      <div className="w-full max-w-md bg-[#1e293b] rounded-2xl shadow-2xl border border-slate-700 p-8 mx-4">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-[#3b82f6] rounded-xl flex items-center justify-center mx-auto mb-4 text-3xl shadow-lg shadow-blue-500/20">
            🤖
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">UPSC Bot Admin</h1>
          <p className="text-slate-400 mt-2">Sign in to manage your bot operations</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="bg-red-500/10 border border-red-500/50 text-red-400 text-sm px-4 py-3 rounded-lg flex items-center gap-2">
              <span className="font-bold">!</span> {error}
            </div>
          )}

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-1.5">
              Email Address
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 bg-[#0f172a] border border-slate-600 text-white rounded-lg focus:ring-2 focus:ring-[#3b82f6] focus:border-transparent outline-none transition placeholder-slate-500"
              placeholder="admin@yourdomain.com"
              required
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-1.5">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 bg-[#0f172a] border border-slate-600 text-white rounded-lg focus:ring-2 focus:ring-[#3b82f6] focus:border-transparent outline-none transition placeholder-slate-500"
              placeholder="••••••••"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-[#3b82f6] text-white rounded-lg font-semibold shadow-lg shadow-blue-500/30 hover:bg-blue-600 hover:shadow-blue-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2"
          >
            {loading ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Signing in...
              </>
            ) : (
              "Sign In"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
