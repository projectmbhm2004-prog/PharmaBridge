import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Building2, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import api from "@/lib/api";
import { formatDate } from "@/lib/utils";
import DashboardLayout from "@/components/shared/DashboardLayout";
import StatusBadge from "@/components/shared/StatusBadge";
import SkeletonRow from "@/components/shared/SkeletonRow";

const COLS = 9; // Company, Email, Phone, Address, Description, Status, Account, Registered, Actions

const EMPTY_FORM = {
  name: "",
  email: "",
  password: "",
  phone: "",
  address: "",
  description: "",
};

function avatarUrl(name) {
  const label = encodeURIComponent(name || "Company");
  return `https://ui-avatars.com/api/?name=${label}&background=166534&color=fff`;
}

const REG_STATUSES = ["pending", "accepted", "rejected"];

export default function Companies() {
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [account, setAccount] = useState(""); // "" | "active" | "inactive"
  const [regStatus, setRegStatus] = useState(""); // "" | pending | accepted | rejected

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // Edit state
  const [editing, setEditing] = useState(null); // { id, name, email, phone, address, description, password }
  const [savingEdit, setSavingEdit] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const { data } = await api.get("/admin/registrations", {
        params: { type: "company", status: "all" },
      });
      setCompanies(data?.data?.companies ?? []);
    } catch {
      toast.error("Failed to load companies.");
      setCompanies([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return companies.filter((c) => {
      if (
        q &&
        !(c.name || "").toLowerCase().includes(q) &&
        !(c.email || "").toLowerCase().includes(q)
      )
        return false;
      if (account === "active" && !c.is_active) return false;
      if (account === "inactive" && c.is_active) return false;
      if (regStatus && c.registration_status !== regStatus) return false;
      return true;
    });
  }, [companies, search, account, regStatus]);

  const hasFilters = search || account || regStatus;

  function clearFilters() {
    setSearch("");
    setAccount("");
    setRegStatus("");
  }

  async function handleAdd(e) {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.password) {
      toast.error("Company name, email, and password are required.");
      return;
    }
    setSaving(true);
    try {
      await api.post("/admin/companies", {
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        phone: form.phone.trim() || undefined,
        address: form.address.trim() || undefined,
        description: form.description.trim() || undefined,
      });
      toast.success("Company created.");
      setForm(EMPTY_FORM);
      setShowForm(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to create company.");
    } finally {
      setSaving(false);
    }
  }

  function openEdit(c) {
    setEditing({
      id: c.id,
      name: c.name || "",
      email: c.email || "",
      phone: c.phone === "N/A" ? "" : c.phone || "",
      address: c.address === "N/A" ? "" : c.address || "",
      description: c.description === "N/A" ? "" : c.description || "",
      password: "",
    });
  }

  async function handleEdit(e) {
    e.preventDefault();
    if (!editing) return;
    if (!editing.name.trim()) {
      toast.error("Company name is required.");
      return;
    }
    setSavingEdit(true);
    try {
      const payload = {
        name: editing.name.trim(),
        phone: editing.phone.trim(),
        address: editing.address.trim(),
        description: editing.description.trim(),
      };
      // only send the password when the admin actually typed one in
      if (editing.password) payload.password = editing.password;
      await api.patch(`/admin/companies/${editing.id}`, payload);
      toast.success("Company updated.");
      setEditing(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to update company.");
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleToggleStatus(c) {
    if (c.is_active) {
      const ok = window.confirm(
        "This will prevent the company from logging in. Continue?"
      );
      if (!ok) return;
    }
    try {
      await api.patch(`/admin/companies/${c.id}/toggle-status`);
      toast.success(c.is_active ? "Company deactivated." : "Company activated.");
      load();
    } catch (err) {
      toast.error(
        err.response?.data?.message || "Failed to update account status."
      );
    }
  }

  async function handleDelete(c) {
    const ok = window.confirm(
      "Permanently delete this company? This cannot be undone. " +
        "This will fail if the account has order history."
    );
    if (!ok) return;
    try {
      await api.delete(`/admin/companies/${c.id}`);
      toast.success("Company permanently deleted.");
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to delete company.");
    }
  }

  const inputClass =
    "w-full rounded-lg border border-border px-3 py-2 text-sm outline-none transition-colors duration-150 focus:border-primary focus:ring-2 focus:ring-primary/25";

  return (
    <DashboardLayout role="admin" title="Companies">
      {/* Top bar: search + filters + add */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-1 flex-wrap items-center gap-3">
          <div className="relative w-full sm:max-w-xs">
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name or email…"
              className={`${inputClass} pl-9`}
            />
          </div>
          <select
            value={account}
            onChange={(e) => setAccount(e.target.value)}
            className="rounded-lg border border-border px-3 py-2 text-sm outline-none transition-colors duration-150 focus:border-primary focus:ring-2 focus:ring-primary/25"
            aria-label="Account status"
          >
            <option value="">All accounts</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <select
            value={regStatus}
            onChange={(e) => setRegStatus(e.target.value)}
            className="rounded-lg border border-border px-3 py-2 text-sm capitalize outline-none transition-colors duration-150 focus:border-primary focus:ring-2 focus:ring-primary/25"
            aria-label="Registration status"
          >
            <option value="">All statuses</option>
            {REG_STATUSES.map((s) => (
              <option key={s} value={s} className="capitalize">
                {s}
              </option>
            ))}
          </select>
          {hasFilters && (
            <button
              onClick={clearFilters}
              className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-sm font-medium text-text-secondary transition-colors duration-150 hover:bg-slate-50"
            >
              <X size={15} /> Clear
            </button>
          )}
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white transition duration-150 hover:bg-green-700 active:scale-[0.98]"
        >
          <Plus size={18} /> Add Company
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-100 bg-white shadow-sm">
        <table className="w-full min-w-230 text-left text-sm">
          <thead>
            <tr className="border-b border-border bg-slate-50 text-xs uppercase tracking-wide text-text-secondary">
              <th className="px-4 py-3 font-semibold">Company</th>
              <th className="px-4 py-3 font-semibold">Email</th>
              <th className="px-4 py-3 font-semibold">Phone</th>
              <th className="px-4 py-3 font-semibold">Address</th>
              <th className="px-4 py-3 font-semibold">Description</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Account</th>
              <th className="px-4 py-3 font-semibold">Registered</th>
              <th className="px-4 py-3 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => <SkeletonRow key={i} cols={COLS} />)
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={COLS} className="px-4 py-16">
                  <div className="flex flex-col items-center justify-center text-center text-text-secondary">
                    <Building2 size={40} className="mb-3 text-slate-300" />
                    <p className="text-sm font-medium">No companies found</p>
                  </div>
                </td>
              </tr>
            ) : (
              filtered.map((c) => (
                <tr
                  key={c.id}
                  className="border-b border-border last:border-0 transition-colors duration-150 hover:bg-slate-50/60"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <img
                        src={c.logo_url || avatarUrl(c.name)}
                        alt={c.name}
                        className="h-9 w-9 shrink-0 rounded-full object-cover"
                        onError={(e) => {
                          e.currentTarget.src = avatarUrl(c.name);
                        }}
                      />
                      <span className="font-medium text-text-primary">{c.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-text-secondary">{c.email}</td>
                  <td className="px-4 py-3 text-text-secondary">{c.phone || "—"}</td>
                  <td className="px-4 py-3 text-text-secondary">{c.address || "—"}</td>
                  <td className="px-4 py-3 text-text-secondary">
                    <span className="block max-w-64 truncate" title={c.description || ""}>
                      {c.description || "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={c.registration_status} />
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block whitespace-nowrap rounded-full px-2 py-1 text-xs font-medium ${
                        c.is_active
                          ? "bg-green-100 text-green-700"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {c.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-text-secondary">
                    {formatDate(c.registered_at || c.user_created_at)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openEdit(c)}
                        title="Edit company details"
                        className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-text-secondary transition-colors duration-150 hover:bg-slate-50 hover:text-text-primary"
                      >
                        <Pencil size={14} /> Edit
                      </button>
                      <button
                        onClick={() => handleToggleStatus(c)}
                        className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors duration-150 ${
                          c.is_active
                            ? "border border-red-200 text-red-600 hover:bg-red-50"
                            : "border border-green-200 text-green-700 hover:bg-green-50"
                        }`}
                      >
                        {c.is_active ? "Deactivate" : "Activate"}
                      </button>
                      {c.registration_status === "accepted" && (
                        <button
                          onClick={() => handleDelete(c)}
                          title="Permanently delete"
                          className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 transition-colors duration-150 hover:bg-red-50"
                        >
                          <Trash2 size={14} /> Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add company modal */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => !saving && setShowForm(false)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
          >
            <motion.form
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              onSubmit={handleAdd}
              className="w-full max-w-md rounded-2xl bg-white shadow-xl"
            >
              <div className="flex items-center justify-between border-b border-border px-6 py-4">
                <h3 className="text-lg font-bold text-text-primary">Add Company</h3>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="text-text-secondary transition-colors duration-150 hover:text-text-primary"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="grid gap-4 p-6">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-text-primary">
                    Company Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    className={inputClass}
                    required
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-text-primary">
                    Email <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    className={inputClass}
                    required
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-text-primary">
                    Password <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="password"
                    value={form.password}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, password: e.target.value }))
                    }
                    className={inputClass}
                    required
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-text-primary">
                    Phone
                  </label>
                  <input
                    type="text"
                    value={form.phone}
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-text-primary">
                    Address
                  </label>
                  <input
                    type="text"
                    maxLength={255}
                    value={form.address}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, address: e.target.value }))
                    }
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-text-primary">
                    Description
                  </label>
                  <textarea
                    rows={3}
                    value={form.description}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, description: e.target.value }))
                    }
                    className={`${inputClass} resize-y`}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 border-t border-border bg-slate-50 px-6 py-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setForm(EMPTY_FORM);
                  }}
                  className="rounded-lg border border-border bg-white px-4 py-2 text-sm font-semibold text-text-primary transition duration-150 hover:bg-slate-50 active:scale-[0.98]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white transition duration-150 hover:bg-green-700 active:scale-[0.98] disabled:opacity-70"
                >
                  {saving ? "Saving…" : "Create Company"}
                </button>
              </div>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Edit description + address modal */}
      <AnimatePresence>
        {editing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => !savingEdit && setEditing(null)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
          >
            <motion.form
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              onSubmit={handleEdit}
              className="w-full max-w-md rounded-2xl bg-white shadow-xl"
            >
              <div className="flex items-center justify-between border-b border-border px-6 py-4">
                <h3 className="text-lg font-bold text-text-primary">
                  Edit {editing.name}
                </h3>
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="text-text-secondary transition-colors duration-150 hover:text-text-primary"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="grid gap-4 p-6">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-text-primary">
                    Company Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={editing.name}
                    onChange={(e) =>
                      setEditing((s) => ({ ...s, name: e.target.value }))
                    }
                    className={inputClass}
                    required
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-text-primary">
                    Email
                  </label>
                  <input
                    type="email"
                    value={editing.email}
                    readOnly
                    disabled
                    className={`${inputClass} cursor-not-allowed bg-slate-50 text-text-secondary`}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-text-primary">
                    Phone
                  </label>
                  <input
                    type="text"
                    value={editing.phone}
                    onChange={(e) =>
                      setEditing((s) => ({ ...s, phone: e.target.value }))
                    }
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-text-primary">
                    Address
                  </label>
                  <input
                    type="text"
                    maxLength={255}
                    value={editing.address}
                    onChange={(e) =>
                      setEditing((s) => ({ ...s, address: e.target.value }))
                    }
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-text-primary">
                    Description
                  </label>
                  <textarea
                    rows={4}
                    value={editing.description}
                    onChange={(e) =>
                      setEditing((s) => ({ ...s, description: e.target.value }))
                    }
                    className={`${inputClass} resize-y`}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-text-primary">
                    Password
                  </label>
                  <input
                    type="password"
                    value={editing.password}
                    onChange={(e) =>
                      setEditing((s) => ({ ...s, password: e.target.value }))
                    }
                    placeholder="Leave blank to keep current password"
                    className={inputClass}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 border-t border-border bg-slate-50 px-6 py-3">
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="rounded-lg border border-border bg-white px-4 py-2 text-sm font-semibold text-text-primary transition duration-150 hover:bg-slate-50 active:scale-[0.98]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white transition duration-150 hover:bg-green-700 active:scale-[0.98] disabled:opacity-70"
                >
                  {savingEdit ? "Saving…" : "Save Changes"}
                </button>
              </div>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>
    </DashboardLayout>
  );
}
