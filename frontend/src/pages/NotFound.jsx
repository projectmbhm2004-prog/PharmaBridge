import { useNavigate } from "react-router-dom";
import { House } from "lucide-react";

export default function NotFound() {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white px-4 text-center">
      <h1 className="text-7xl font-bold tracking-tight text-primary sm:text-8xl">
        404
      </h1>
      <h2 className="mt-4 text-2xl font-bold text-text-primary">
        Page not found
      </h2>
      <p className="mt-2 text-sm text-text-secondary">
        The page you&apos;re looking for doesn&apos;t exist.
      </p>
      <button
        type="button"
        onClick={() => navigate("/")}
        className="mt-8 inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all duration-150 hover:bg-[#14532d] hover:shadow-md active:scale-[0.98]"
      >
        <House size={18} /> Go Home
      </button>
    </div>
  );
}
