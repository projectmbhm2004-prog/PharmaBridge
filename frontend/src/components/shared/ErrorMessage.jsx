import { AlertCircle } from "lucide-react";

// red alert box for showing an error
export default function ErrorMessage({ message }) {
  if (!message) return null;

  return (
    <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      <AlertCircle size={18} className="mt-0.5 shrink-0" />
      <span>{message}</span>
    </div>
  );
}
