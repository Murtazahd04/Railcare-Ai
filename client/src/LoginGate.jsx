import React, { useState } from "react";
import { login } from "./api";
import { Train } from "lucide-react";

/**
 * Minimal login screen against the real /api/v1/auth/login endpoint.
 * Demo users are created by `npm run seed` on the server.
 */
export default function LoginGate({ onLoggedIn }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedUsername, setSelectedUsername] = useState("");

  function selectAccount(accountUsername) {
    setSelectedUsername(accountUsername);
    setUsername(accountUsername);
    setError(null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { token, user } = await login(username, password);
      onLoggedIn({ token, user });
    } catch (err) {
      setError(err.message || "Could not reach the server. Is it running on port 4000?");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-500 min-h-screen bg-[#F4F6FA] text-[#0F172A] flex items-center justify-center p-6" style={{ fontFamily: "Inter, sans-serif" }}>
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-lg border border-[#E2E8F0] bg-[#FFFFFF] p-6 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Train size={18} className="text-[#0284C7]" />
          <div className="text-sm font-semibold">SRLMS Executive Console</div>
        </div>

        <div>
          <div className="text-xs text-[#64748B] mb-1.5">Choose a demo username</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {[
              { username: "priya", role: "Executive" },
              { username: "karan", role: "Executive" },
              { username: "farah", role: "Executive" },
              { username: "vikas", role: "Executive" },
              { username: "sneha", role: "Executive" },
              { username: "supervisor", role: "Supervisor" },
              { username: "admin", role: "Admin" },
            ].map((account) => (
              <button
                key={account.username}
                type="button"
                onClick={() => selectAccount(account.username)}
                aria-pressed={selectedUsername === account.username}
                className={`rounded-md border px-2 py-2 text-left transition-colors ${
                  selectedUsername === account.username
                    ? "border-[#0284C7] bg-[#0284C7]/10 text-[#0369A1]"
                    : "border-[#E2E8F0] bg-white text-[#475569] hover:bg-[#F8FAFC]"
                }`}
              >
                <span className="block text-xs font-medium">{account.username}</span>
                <span className="block text-[10px] opacity-70">{account.role}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs text-[#64748B]">Username</label>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            className="w-full mt-1 bg-[#FFFFFF] border border-[#E2E8F0] rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#3B82C4]/50"
          />
        </div>
        <div>
          <label className="text-xs text-[#64748B]">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            className="w-full mt-1 bg-[#FFFFFF] border border-[#E2E8F0] rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#3B82C4]/50"
          />
        </div>

        {error && (
          <div className="text-xs text-[#E5484D] bg-[#E5484D]/10 border border-[#E5484D]/30 rounded-md px-3 py-2">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2 rounded-md bg-[#3B82C4]/20 border border-[#3B82C4]/40 text-[#0284C7] text-sm font-medium hover:bg-[#3B82C4]/30 disabled:opacity-50"
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>

        <div className="text-[11px] text-[#64748B] text-center">
          Select a username, then enter your staff password.
        </div>
        <a href="#/" className="block text-[11px] text-[#64748B] hover:text-[#64748B] text-center underline underline-offset-2">← Back to home</a>
      </form>
    </div>
  );
}
