import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Building2,
  Hospital,
  Car,
  Mail,
  Lock,
  Eye,
  EyeOff,
  Search,
  X,
  Check,
  ArrowLeft,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";

import api from "@/lib/api";
import ErrorMessage from "@/components/shared/ErrorMessage";

const ROLE_OPTIONS = [
  {
    value: "company",
    icon: Building2,
    title: "Pharmaceutical Company",
    text: "Register your company and manage product distribution",
  },
  {
    value: "pharmacy",
    icon: Hospital,
    title: "Pharmacy",
    text: "Browse and order from verified pharmaceutical companies",
  },
  {
    value: "driver",
    icon: Car,
    title: "Driver",
    text: "Join a company and complete delivery assignments",
  },
];

/** Returns the password strength bucket per PRD rules. */
function getStrength(pw) {
  if (!pw) return null;
  const hasUpper = /[A-Z]/.test(pw);
  const hasLower = /[a-z]/.test(pw);
  const hasNumber = /[0-9]/.test(pw);
  const hasSpecial = /[!@#$%^&*]/.test(pw);

  if (pw.length < 8) {
    return { label: "Weak", color: "bg-red-500", text: "text-red-600", width: "33%" };
  }
  if (hasNumber && hasSpecial) {
    return { label: "Strong", color: "bg-green-600", text: "text-green-600", width: "100%" };
  }
  if (hasUpper && hasLower) {
    return { label: "Medium", color: "bg-yellow-500", text: "text-yellow-600", width: "66%" };
  }
  return { label: "Weak", color: "bg-red-500", text: "text-red-600", width: "33%" };
}

function ProgressBar({ step }) {
  return (
    <div className="mb-6 flex items-center gap-2">
      {[1, 2, 3].map((n) => (
        <div
          key={n}
          className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${
            n <= step ? "bg-primary" : "bg-slate-200"
          }`}
        />
      ))}
    </div>
  );
}

export default function Register() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [role, setRole] = useState("");

  // Form fields (superset across roles).
  const [form, setForm] = useState({
    email: "",
    password: "",
    company_name: "",
    pharmacy_name: "",
    owner_name: "",
    full_name: "",
    phone: "",
    address: "",
    description: "",
    vehicle_info: "",
  });

  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Driver: company search.
  const [companyQuery, setCompanyQuery] = useState("");
  const [companyResults, setCompanyResults] = useState([]);
  const [selectedCompany, setSelectedCompany] = useState(null);
  const searchTimer = useRef(null);

  const strength = getStrength(form.password);

  function update(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
    setFieldErrors((e) => ({ ...e, [key]: undefined }));
  }

  // Debounced company search for drivers.
  useEffect(() => {
    if (role !== "driver" || selectedCompany) return;
    const q = companyQuery.trim();
    if (!q) {
      setCompanyResults([]);
      return;
    }

    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      try {
        const { data } = await api.get("/market/companies", {
          params: { search: q },
        });
        const list = data?.data ?? data ?? [];
        setCompanyResults(Array.isArray(list) ? list : []);
      } catch {
        setCompanyResults([]);
      }
    }, 300);

    return () => clearTimeout(searchTimer.current);
  }, [companyQuery, role, selectedCompany]);

  function selectCompany(company) {
    setSelectedCompany(company);
    setCompanyResults([]);
    setCompanyQuery("");
    setFieldErrors((e) => ({ ...e, company_id: undefined }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setFieldErrors({});

    if (role === "driver" && !selectedCompany) {
      setFieldErrors((er) => ({ ...er, company_id: "Please select a company." }));
      return;
    }

    // Description + Address are required for every role and shown publicly.
    const nextErrors = {};
    if (!form.description.trim()) {
      nextErrors.description = "Description is required.";
    }
    if (!form.address.trim()) {
      nextErrors.address = "Address is required.";
    }
    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      return;
    }

    // Build the role-specific payload.
    const payload = {
      role,
      email: form.email,
      password: form.password,
      address: form.address.trim(),
      description: form.description.trim(),
    };
    if (role === "company") {
      payload.name = form.company_name;
      payload.phone = form.phone;
    } else if (role === "pharmacy") {
      payload.name = form.pharmacy_name;
      payload.owner_name = form.owner_name;
      payload.phone = form.phone;
    } else if (role === "driver") {
      payload.full_name = form.full_name;
      payload.phone = form.phone;
      payload.vehicle_info = form.vehicle_info;
      payload.company_id = selectedCompany?.id;
    }

    setSubmitting(true);
    try {
      await api.post("/auth/register", payload);
      setStep(3);
    } catch (err) {
      const data = err.response?.data;
      if (data?.errors && typeof data.errors === "object") {
        setFieldErrors(data.errors);
      }
      if (data?.message) {
        setError(data.message);
      } else if (err.response) {
        setError("Registration failed. Please check your details.");
      } else {
        toast.error("Something went wrong. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass = (key) =>
    `w-full rounded-lg border py-2.5 pl-3 pr-3 text-sm outline-none transition-colors duration-150 placeholder:text-slate-400 focus:ring-2 focus:ring-primary/25 ${
      fieldErrors[key]
        ? "border-red-300 focus:border-red-400 focus:ring-red-500/20"
        : "border-border hover:border-slate-300 focus:border-primary"
    }`;

  return (
    <div className="flex min-h-screen items-center justify-center bg-primary-subtle px-4 py-12">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-xl shadow-primary/5 ring-1 ring-slate-900/5"
      >
        <button
          onClick={() => navigate('/')}
          className="group mb-4 flex items-center gap-1 text-sm text-slate-500 transition-colors duration-150 hover:text-primary"
        >
          <ArrowLeft size={16} className="transition-transform duration-200 group-hover:-translate-x-0.5" /> Back to Home
        </button>

        {/* Brand */}
        <div className="mb-6 flex items-center gap-2">
          <img src="/icon.png" alt="PharmaBridge" className="w-9 h-9 object-contain" />
          <span className="text-lg font-bold tracking-tight text-text-primary">
            PharmaBridge
          </span>
        </div>

        <ProgressBar step={step} />

        {/* STEP 1 — choose role */}
        {step === 1 && (
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-text-primary">
              Create your account
            </h2>
            <p className="mt-1 text-sm text-text-secondary">
              Choose the type of account you want to create.
            </p>

            <div className="mt-6 space-y-3">
              {ROLE_OPTIONS.map(({ value, icon: Icon, title, text }) => {
                const active = role === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setRole(value)}
                    className={`flex w-full items-start gap-4 rounded-xl border-2 p-4 text-left transition-all duration-150 active:scale-[0.99] ${
                      active
                        ? "border-primary bg-primary-subtle shadow-sm ring-1 ring-primary/15"
                        : "border-slate-200 hover:border-primary/40 hover:bg-slate-50"
                    }`}
                  >
                    <span
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg transition-colors duration-150 ${
                        active
                          ? "bg-primary text-white"
                          : "bg-primary-subtle text-primary"
                      }`}
                    >
                      <Icon size={22} />
                    </span>
                    <span>
                      <span className="block font-semibold text-text-primary">
                        {title}
                      </span>
                      <span className="mt-0.5 block text-sm text-text-secondary">
                        {text}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              disabled={!role}
              onClick={() => setStep(2)}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-semibold text-white shadow-sm transition-all duration-150 hover:bg-[#14532d] hover:shadow-md active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Continue <ArrowRight size={18} />
            </button>

            <p className="mt-6 text-center text-sm text-text-secondary">
              Already have an account?{" "}
              <Link
                to="/login"
                className="font-semibold text-primary hover:underline"
              >
                Sign in
              </Link>
            </p>
          </div>
        )}

        {/* STEP 2 — fill details */}
        {step === 2 && (
          <form onSubmit={handleSubmit}>
            <h2 className="text-2xl font-bold tracking-tight text-text-primary">
              Account details
            </h2>
            <p className="mt-1 text-sm text-text-secondary">
              Fill in your information to continue.
            </p>

            <div className="mt-6 space-y-4">
              {/* Role-specific name fields */}
              {role === "company" && (
                <Field label="Company Name" required error={fieldErrors.company_name}>
                  <input
                    type="text"
                    required
                    value={form.company_name}
                    onChange={(e) => update("company_name", e.target.value)}
                    className={inputClass("company_name")}
                  />
                </Field>
              )}

              {role === "pharmacy" && (
                <>
                  <Field label="Pharmacy Name" required error={fieldErrors.pharmacy_name}>
                    <input
                      type="text"
                      required
                      value={form.pharmacy_name}
                      onChange={(e) => update("pharmacy_name", e.target.value)}
                      className={inputClass("pharmacy_name")}
                    />
                  </Field>
                  <Field label="Owner Name" error={fieldErrors.owner_name}>
                    <input
                      type="text"
                      value={form.owner_name}
                      onChange={(e) => update("owner_name", e.target.value)}
                      className={inputClass("owner_name")}
                    />
                  </Field>
                </>
              )}

              {role === "driver" && (
                <Field label="Full Name" required error={fieldErrors.full_name}>
                  <input
                    type="text"
                    required
                    value={form.full_name}
                    onChange={(e) => update("full_name", e.target.value)}
                    className={inputClass("full_name")}
                  />
                </Field>
              )}

              {/* Email */}
              <Field label="Email" required error={fieldErrors.email}>
                <div className="relative">
                  <Mail
                    size={18}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary"
                  />
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    value={form.email}
                    onChange={(e) => update("email", e.target.value)}
                    className={`${inputClass("email")} pl-10`}
                  />
                </div>
              </Field>

              {/* Password */}
              <Field label="Password" required error={fieldErrors.password}>
                <div className="relative">
                  <Lock
                    size={18}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary"
                  />
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    autoComplete="new-password"
                    value={form.password}
                    onChange={(e) => update("password", e.target.value)}
                    className={`${inputClass("password")} pl-10 pr-10`}
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
                {strength && (
                  <div className="mt-2">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                      <div
                        className={`h-full rounded-full transition-all ${strength.color}`}
                        style={{ width: strength.width }}
                      />
                    </div>
                    <span className={`mt-1 block text-xs font-medium ${strength.text}`}>
                      {strength.label}
                    </span>
                  </div>
                )}
              </Field>

              {/* Phone (all roles) */}
              <Field label="Phone" error={fieldErrors.phone}>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => update("phone", e.target.value)}
                  className={inputClass("phone")}
                />
              </Field>

              {/* Address (all roles — required, publicly displayed) */}
              <Field label="Address" required error={fieldErrors.address}>
                <input
                  type="text"
                  required
                  maxLength={255}
                  value={form.address}
                  onChange={(e) => update("address", e.target.value)}
                  placeholder="Street, city, region"
                  className={inputClass("address")}
                />
              </Field>

              {/* Description (all roles — required, publicly displayed) */}
              <Field label="Description" required error={fieldErrors.description}>
                <textarea
                  required
                  rows={3}
                  value={form.description}
                  onChange={(e) => update("description", e.target.value)}
                  placeholder={
                    role === "driver"
                      ? "Tell pharmacies a bit about you and your delivery service"
                      : "Describe your business — this is shown publicly"
                  }
                  className={`${inputClass("description")} resize-y`}
                />
              </Field>

              {/* Driver-only: vehicle + company search */}
              {role === "driver" && (
                <>
                  <Field label="Vehicle Info" error={fieldErrors.vehicle_info}>
                    <input
                      type="text"
                      value={form.vehicle_info}
                      onChange={(e) => update("vehicle_info", e.target.value)}
                      className={inputClass("vehicle_info")}
                    />
                  </Field>

                  <Field label="Company" required error={fieldErrors.company_id}>
                    {selectedCompany ? (
                      <div className="flex items-center justify-between rounded-lg border border-primary bg-primary-subtle px-3 py-2.5 ring-1 ring-primary/15">
                        <span className="text-sm font-medium text-text-primary">
                          {selectedCompany.name ??
                            selectedCompany.company_name ??
                            "Selected company"}
                        </span>
                        <button
                          type="button"
                          onClick={() => setSelectedCompany(null)}
                          aria-label="Clear selected company"
                          className="flex h-7 w-7 items-center justify-center rounded-md text-text-secondary transition-colors duration-150 hover:bg-red-50 hover:text-red-600 active:scale-95"
                        >
                          <X size={18} />
                        </button>
                      </div>
                    ) : (
                      <div className="relative">
                        <Search
                          size={18}
                          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary"
                        />
                        <input
                          type="text"
                          value={companyQuery}
                          onChange={(e) => setCompanyQuery(e.target.value)}
                          placeholder="Search for a company…"
                          className={`${inputClass("company_id")} pl-10`}
                        />
                        {companyResults.length > 0 && (
                          <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-border bg-white py-1 shadow-lg shadow-slate-900/5 ring-1 ring-slate-900/5">
                            {companyResults.map((c) => (
                              <li key={c.id}>
                                <button
                                  type="button"
                                  onClick={() => selectCompany(c)}
                                  className="block w-full px-3 py-2 text-left text-sm transition-colors duration-150 hover:bg-primary-subtle hover:text-primary"
                                >
                                  {c.name ?? c.company_name}
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </Field>
                </>
              )}
            </div>

            <ErrorMessage message={error} />

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="flex items-center justify-center gap-2 rounded-lg border border-border px-5 py-2.5 text-sm font-semibold text-text-primary transition-colors duration-150 hover:border-slate-300 hover:bg-slate-50 active:scale-[0.98]"
              >
                <ArrowLeft size={18} /> Back
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-semibold text-white shadow-sm transition-all duration-150 hover:bg-[#14532d] hover:shadow-md active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {submitting ? "Submitting…" : "Submit"}
              </button>
            </div>
          </form>
        )}

        {/* STEP 3 — success */}
        {step === 3 && (
          <div className="flex flex-col items-center py-6 text-center">
            <motion.span
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 200, damping: 15 }}
              className="flex h-20 w-20 items-center justify-center rounded-full bg-primary-subtle text-success ring-8 ring-primary-subtle/50"
            >
              <Check size={44} strokeWidth={3} />
            </motion.span>
            <h2 className="mt-6 text-2xl font-bold tracking-tight text-text-primary">
              Registration Submitted!
            </h2>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-text-secondary">
              Please check your email inbox to verify your account. Once verified,
              your request will be reviewed.
            </p>
            <Link
              to="/login"
              className="mt-7 inline-flex w-full items-center justify-center rounded-lg bg-primary py-2.5 text-sm font-semibold text-white shadow-sm transition-all duration-150 hover:bg-[#14532d] hover:shadow-md active:scale-[0.99]"
            >
              Go to Login
            </Link>
          </div>
        )}
      </motion.div>
    </div>
  );
}

/** Labelled form field with optional inline error. */
function Field({ label, required, error, children }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-text-primary">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
