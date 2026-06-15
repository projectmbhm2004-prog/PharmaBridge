import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { CircleCheck, CircleX, LoaderCircle } from "lucide-react";

import api from "@/lib/api";

export default function VerifyEmail() {
  const [params] = useSearchParams();
  const [status, setStatus] = useState("loading"); // loading | success | error
  const calledRef = useRef(false);

  useEffect(() => {
    if (calledRef.current) return;
    calledRef.current = true;

    const token = params.get("token");
    if (!token) {
      setStatus("error");
      return;
    }

    (async () => {
      try {
        await api.get("/auth/verify-email", { params: { token } });
        setStatus("success");
      } catch {
        setStatus("error");
      }
    })();
  }, [params]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-primary-subtle px-4 py-12">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-xl shadow-primary/5 ring-1 ring-slate-900/5"
      >
        <div className="mb-6 flex items-center justify-center gap-2">
          <img src="/icon.png" alt="PharmaBridge" className="w-9 h-9 object-contain" />
          <span className="text-lg font-bold tracking-tight text-text-primary">PharmaBridge</span>
        </div>

        {status === "loading" && (
          <div className="flex flex-col items-center py-6">
            <LoaderCircle size={48} className="animate-spin text-primary" />
            <p className="mt-5 text-sm font-medium text-text-secondary">
              Verifying your email…
            </p>
          </div>
        )}

        {status === "success" && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col items-center py-4"
          >
            <span className="flex h-20 w-20 items-center justify-center rounded-full bg-primary-subtle ring-8 ring-primary-subtle/50">
              <CircleCheck size={48} className="text-success" />
            </span>
            <h2 className="mt-5 text-2xl font-bold tracking-tight text-text-primary">
              Email Verified!
            </h2>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-text-secondary">
              Your account is pending approval. You&apos;ll receive an email once
              reviewed.
            </p>
            <Link
              to="/login"
              className="mt-7 inline-flex w-full items-center justify-center rounded-lg bg-primary py-2.5 text-sm font-semibold text-white shadow-sm transition-all duration-150 hover:bg-[#14532d] hover:shadow-md active:scale-[0.99]"
            >
              Go to Login
            </Link>
          </motion.div>
        )}

        {status === "error" && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col items-center py-4"
          >
            <span className="flex h-20 w-20 items-center justify-center rounded-full bg-red-50 ring-8 ring-red-50/50">
              <CircleX size={48} className="text-danger" />
            </span>
            <h2 className="mt-5 text-2xl font-bold tracking-tight text-text-primary">
              Verification Failed
            </h2>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-text-secondary">
              This link is invalid or has already been used.
            </p>
            <Link
              to="/login"
              className="mt-7 inline-flex w-full items-center justify-center rounded-lg bg-primary py-2.5 text-sm font-semibold text-white shadow-sm transition-all duration-150 hover:bg-[#14532d] hover:shadow-md active:scale-[0.99]"
            >
              Go to Login
            </Link>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}
