const SIZES = { sm: 16, md: 32, lg: 48 };

/** Centered spinning circle in the brand green. */
export default function LoadingSpinner({ size = "md" }) {
  const px = SIZES[size] ?? SIZES.md;

  return (
    <div className="flex items-center justify-center">
      <div
        style={{ width: px, height: px, borderWidth: Math.max(2, px / 12) }}
        className="animate-spin rounded-full border-slate-200 border-t-primary [animation-duration:0.7s]"
        role="status"
        aria-label="Loading"
      />
    </div>
  );
}
