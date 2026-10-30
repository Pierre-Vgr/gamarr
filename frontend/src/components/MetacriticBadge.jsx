export function MetacriticBadge({ score, size = "sm", showLabel = false }) {
  if (score == null) return null;
  const color = score >= 75 ? "bg-emerald-600" : score >= 50 ? "bg-yellow-600" : "bg-red-700";
  const sizeClasses = size === "lg" ? "w-14 h-14 text-xl" : "w-8 h-8 text-sm";

  return (
    <div className="flex flex-col items-center gap-1">
      <span
        className={`inline-flex items-center justify-center rounded-md font-bold text-white shadow-lg ${sizeClasses} ${color}`}
        title="Score Metacritic"
      >
        {score}
      </span>
      {showLabel && (
        <span className="text-[10px] uppercase tracking-wide text-slate-500">Metacritic</span>
      )}
    </div>
  );
}
