export const badgeColors = {
  new: "bg-slate-700 text-slate-300",
  engaged: "bg-blue-500/20 text-blue-400 border border-blue-500/30",
  interested: "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30",
  payment_pending: "bg-orange-500/20 text-orange-400 border border-orange-500/30",
  paid: "bg-green-500/20 text-green-400 border border-green-500/30",
};

export default function UserTable({ users = [], compact = false }) {
  if (users.length === 0) {
    return (
      <div className="text-center py-12 text-slate-500">
        No users found.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto w-full">
      <table className="w-full text-sm text-left whitespace-nowrap">
        <thead className="text-xs text-slate-400 uppercase bg-slate-800/80 border-b border-slate-700">
          <tr>
            <th className="px-4 md:px-6 py-3 md:py-4 font-semibold rounded-tl-lg">Name</th>
            {!compact && <th className="px-6 py-4 font-semibold">Username</th>}
            <th className="px-4 md:px-6 py-3 md:py-4 font-semibold">Stage</th>
            {!compact && <th className="px-6 py-4 font-semibold text-center">Paid</th>}
            <th className={`px-4 md:px-6 py-3 md:py-4 font-semibold text-right ${compact ? 'rounded-tr-lg' : ''}`}>Joined</th>
            {!compact && <th className="px-6 py-4 font-semibold text-right">Last Seen</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-700/50">
          {users.map((user, i) => (
            <tr key={user.id || i} className="hover:bg-slate-800/30 transition-colors">
              <td className="px-4 md:px-6 py-3 md:py-4 font-medium text-slate-200">
                {user.name || user.username || "Unknown"}
              </td>
              {!compact && (
                <td className="px-6 py-4 text-slate-400">
                  {user.username ? `@${user.username}` : "—"}
                </td>
              )}
              <td className="px-4 md:px-6 py-3 md:py-4">
                <span className={`px-2.5 py-1 rounded-full text-[10px] sm:text-xs font-semibold uppercase tracking-wider ${badgeColors[user.stage] || badgeColors.new}`}>
                  {user.stage || "new"}
                </span>
              </td>
              {!compact && (
                <td className="px-6 py-4 text-center">
                  {user.isPaid ? (
                    <span className="text-green-500 font-bold">✓ Yes</span>
                  ) : (
                    <span className="text-slate-500">—</span>
                  )}
                </td>
              )}
              <td className="px-4 md:px-6 py-3 md:py-4 text-right text-slate-400">
                {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : "—"}
              </td>
              {!compact && (
                <td className="px-6 py-4 text-right text-slate-400 text-xs">
                  {user.lastSeen ? new Date(user.lastSeen).toLocaleString() : "—"}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
