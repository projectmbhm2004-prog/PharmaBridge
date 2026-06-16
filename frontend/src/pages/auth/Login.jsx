import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Mail, Lock, Eye, EyeOff, LoaderCircle, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

import api from "@/lib/api";
import useAuth from "@/hooks/useAuth";
import ErrorMessage from "@/components/shared/ErrorMessage";

// where each role gets sent right after logging in
const ROLE_HOME = {
  admin: "/admin/registrations",
  company: "/company/orders",
  pharmacy: "/pharmacy/market",
  driver: "/driver/orders",
};

export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const { data } = await api.post("/auth/login", { email, password });
      // backend sends { success: true, data: { token, role } }
      const token = data?.data?.token;
      const role = data?.data?.role;

      if (!token || !role) {
        console.error("[login] unexpected response shape:", data);
        setError("Login failed: unexpected server response.");
        return;
      }

      login(token, role);
      navigate(ROLE_HOME[role] ?? "/", { replace: true });
    } catch (err) {
      // dump the whole error so the real cause shows up in the console
      console.error("[login] request failed:", err);
      console.error("[login] response:", err.response?.status, err.response?.data);

      const status = err.response?.status;
      const message = err.response?.data?.message;
      if (status && message) {
        setError(message);
      } else if (status) {
        setError("Invalid email or password.");
      } else {
        // no response at all = network/CORS issue or the backend is just down
        setError("Cannot reach the server. Check that the backend is running.");
        toast.error("Something went wrong. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-primary-subtle px-4 py-12">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl shadow-primary/5 ring-1 ring-slate-900/5"
      >
        <button
          onClick={() => navigate('/')}
          className="group mb-4 flex items-center gap-1 text-sm text-slate-500 transition-colors duration-150 hover:text-primary"
        >
          <ArrowLeft size={16} className="transition-transform duration-200 group-hover:-translate-x-0.5" /> Back to Home
        </button>

        {/* Brand */}
        <div className="flex items-center gap-2">
          <img src="/icon.png" alt="PharmaBridge" className="w-9 h-9 object-contain" />
          <span className="text-lg font-bold tracking-tight text-text-primary">
            PharmaBridge
          </span>
        </div>

        <h2 className="mt-6 text-2xl font-bold tracking-tight text-text-primary">
          Welcome back
        </h2>
        <p className="mt-1 text-sm text-text-secondary">
          Sign in to your account
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {/* Email */}
          <div>
            <label
              htmlFor="email"
              className="mb-1.5 block text-sm font-medium text-text-primary"
            >
              Email
            </label>
            <div className="relative">
              <Mail
                size={18}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary"
              />
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-lg border border-border py-2.5 pl-10 pr-3 text-sm outline-none transition-colors duration-150 placeholder:text-slate-400 hover:border-slate-300 focus:border-primary focus:ring-2 focus:ring-primary/25"
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label
              htmlFor="password"
              className="mb-1.5 block text-sm font-medium text-text-primary"
            >
              Password
            </label>
            <div className="relative">
              <Lock
                size={18}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary"
              />
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-lg border border-border py-2.5 pl-10 pr-10 text-sm outline-none transition-colors duration-150 placeholder:text-slate-400 hover:border-slate-300 focus:border-primary focus:ring-2 focus:ring-primary/25"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-text-secondary transition-colors duration-150 hover:bg-slate-100 hover:text-text-primary active:scale-95"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <ErrorMessage message={error} />

          <button
            type="submit"
            disabled={submitting}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-semibold text-white shadow-sm transition-all duration-150 hover:bg-[#14532d] hover:shadow-md active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70 disabled:active:scale-100"
          >
            {submitting ? (
              <>
                <LoaderCircle size={18} className="animate-spin" />
                Signing in…
              </>
            ) : (
              "Sign In"
            )}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-text-secondary">
          Don&apos;t have an account?{" "}
          <Link
            to="/register"
            className="font-semibold text-primary hover:underline"
          >
            Register
          </Link>
        </p>
      </motion.div>
    </div>
  );
}
