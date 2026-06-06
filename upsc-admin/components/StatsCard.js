/**
 * StatsCard component
 * Displays a single metric with label, value, and optional trend
 */
export default function StatsCard({ title, value, subtitle, color = "blue" }) {
  const borderColors = {
    blue: "border-l-[#3b82f6]",
    green: "border-l-green-500",
    yellow: "border-l-yellow-500",
    red: "border-l-red-500",
  };

  const textColors = {
    blue: "text-[#3b82f6]",
    green: "text-green-500",
    yellow: "text-yellow-500",
    red: "text-red-500",
  };

  return (
    <div className={`bg-[#1e293b] rounded-xl shadow-lg border border-slate-700 p-6 border-l-4 ${borderColors[color]}`}>
      <div className="flex flex-col">
        <span className="text-sm font-medium text-slate-400 uppercase tracking-wider">{title}</span>
        <div className="mt-2 text-3xl font-bold text-white">{value}</div>
        {subtitle && (
          <p className={`text-sm mt-2 font-medium ${textColors[color]}`}>
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
}
