import { useEffect, useState } from "react";

// ms left until endsAt. null when there's no date at all, NaN when the date is junk.
function getRemaining(endsAt) {
  if (!endsAt) return null;
  const end = new Date(endsAt).getTime();
  if (Number.isNaN(end)) return null;
  return end - Date.now();
}

// ms -> "2d 14h 30m 22s"
function formatDHMS(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const d = Math.floor(totalSeconds / 86400);
  const h = Math.floor((totalSeconds % 86400) / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${d}d ${h}h ${m}m ${s}s`;
}

// Compact offer indicator that fits inside a product card.
//   endsAt null      -> green "✦ Limited Offer"
//   endsAt in past   -> gray "Offer Ended"
//   endsAt in future -> amber "Ends in 2d 14h 30m 22s", ticking every second
export default function CountdownTimer({ endsAt }) {
  const [remaining, setRemaining] = useState(() => getRemaining(endsAt));

  useEffect(() => {
    setRemaining(getRemaining(endsAt));
    // no end date -> nothing to tick
    if (!endsAt) return;
    const id = setInterval(() => {
      setRemaining(getRemaining(endsAt));
    }, 1000);
    return () => clearInterval(id);
  }, [endsAt]);

  // no end date: open-ended "Limited Offer" badge
  if (remaining == null) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs font-semibold text-green-600">
        ✦ Limited Offer
      </span>
    );
  }

  if (remaining <= 0) {
    return <span className="text-xs font-semibold text-slate-400">Offer Ended</span>;
  }

  return (
    <span className="font-mono text-xs font-semibold tabular-nums text-amber-600">
      Ends in {formatDHMS(remaining)}
    </span>
  );
}
