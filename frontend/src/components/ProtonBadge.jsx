const PROTON_STYLES = {
  platinum: "bg-sky-900 text-sky-200",
  gold: "bg-yellow-900 text-yellow-200",
  silver: "bg-slate-500 text-slate-100",
  bronze: "bg-orange-900 text-orange-200",
  borked: "bg-red-900 text-red-200",
  pending: "bg-slate-700 text-slate-300",
};

export function ProtonBadge({ tier, className = "" }) {
  if (!tier) return null;
  return (
    <span
      className={`px-1.5 py-0.5 rounded text-[10px] font-medium capitalize ${
        PROTON_STYLES[tier] || PROTON_STYLES.pending
      } ${className}`}
    >
      Proton: {tier}
    </span>
  );
}
