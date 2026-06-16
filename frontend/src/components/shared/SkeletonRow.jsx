// placeholder table row with shimmer cells, shown while data loads
export default function SkeletonRow({ cols = 4 }) {
  return (
    <tr className="border-b border-border">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 w-full max-w-[140px] animate-pulse rounded bg-slate-200" />
        </td>
      ))}
    </tr>
  );
}
