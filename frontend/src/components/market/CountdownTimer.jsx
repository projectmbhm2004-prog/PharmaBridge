import { useEffect, useState } from "react";

// ms left until endsAt, or null if the date is junk
function getRemaining(endsAt) {
  if (!endsAt) return null;
  const end = new Date(endsAt).getTime();
  if (Number.isNaN(end)) return null;
  return Math.max(0, end - Date.now());
}

// ms -> "05:09:32"
function formatHMS(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

// live HH:MM:SS countdown to when an offer ends. green normally, goes red + pulses under an
// hour, and shows "Expired" once it's done.
export default function CountdownTimer({ offerEndsAt }) {
  const [remaining, setRemaining] = useState(() => getRemaining(offerEndsAt));

  useEffect(() => {
    setRemaining(getRemaining(offerEndsAt));
    const id = setInterval(() => {
      setRemaining(getRemaining(offerEndsAt));
    }, 1000);
    return () => clearInterval(id);
  }, [offerEndsAt]);

  if (remaining == null) return null;

  if (remaining <= 0) {
    return <span className="text-xs font-semibold text-red-600">Expired</span>;
  }

  const urgent = remaining < 60 * 60 * 1000; // under one hour

  return (
    <span
      className={`font-mono text-xs font-semibold tabular-nums ${
        urgent ? "animate-pulse text-red-600" : "text-green-600"
      }`}
    >
      {formatHMS(remaining)}
    </span>
  );
}
