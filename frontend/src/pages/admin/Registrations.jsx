import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Inbox, Check, X, Building2, Hospital, Trash2, Search } from "lucide-react";
import { toast } from "sonner";

import api from "@/lib/api";
import { formatDate } from "@/lib/utils";
import DashboardLayout from "@/components/shared/DashboardLayout";
import StatusBadge from "@/components/shared/StatusBadge";
import SkeletonRow from "@/components/shared/SkeletonRow";

const TABS = [
  { value: "company", label: "Companies", icon: Building2 },
  { value: "pharmacy", label: "Pharmacies", icon: Hospital },
];

const FILTERS = ["pending", "accepted", "rejected", "all"];

const COMPANY_COLS = 7; // Name, Email, Phone, Address, Date, Status, Actions
const PHARMACY_COLS = 8; // + Owner

export default function Registrations() {
  const [tab, setTab] = useState("company");
  const [filter, setFilter] = useState("pending");
  const [search, setSearch] = useState("");
  const [companies, setCompanies] = useState([]);
  const [pharmacies, setPharmacies] = useState([]);
  const [loading, setLoading] = useState(true);

  // Reject modal state.
  const [rejecting, setRejecting] = useState(null); // the row being rejected
  const [rejectReason, setRejectReason] = useState("");
  // Accept confirm state.
  const [accepting, setAccepting] = useState(null); // the row being accepted
  // Delete confirm state.
  const [deleting, setDeleting] = useState(null); // the row being deleted
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const { data } = await api.get("/admin/registrations", {
        params: { type: "all", status: filter },
      });
      setCompanies(data?.data?.companies ?? []);
      setPharmacies(data?.data?.pharmacies ?? []);
    } catch {
      toast.error("Failed to load registrations.");
      setCompanies([]);
      setPharmacies([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  // Search by name / email / owner over the loaded set (bounded per status).
  const filterRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const match = (list) =>
      !q
        ? list
        : list.filter(
            (r) =>
              (r.name || "").toLowerCase().includes(q) ||
              (r.email || "").toLowerCase().includes(q) ||
              (r.owner_name || "").toLowerCase().includes(q)
          );
    return { companies: match(companies), pharmacies: match(pharmacies) };
  }, [companies, pharmacies, search]);

  const rows = tab === "company" ? filterRows.companies : filterRows.pharmacies;
  const cols = tab === "company" ? COMPANY_COLS : PHARMACY_COLS;

  async function confirmAccept() {
    if (!accepting) return;
    setSubmitting(true);
    try {
      await api.patch(`/admin/registrations/${accepting.id}`, {
        type: accepting.entity_type ?? tab,
        action: "accept",
      });
      toast.success("Registration accepted.");
      setAccepting(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to accept registration.");
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmReject() {
    if (!rejecting) return;
    setSubmitting(true);
    try {
      await api.patch(`/admin/registrations/${rejecting.id}`, {
        type: rejecting.entity_type ?? tab,
        action: "reject",
        rejection_reason: rejectReason.trim() || undefined,
      });
      toast.success("Registration rejected.");
      setRejecting(null);
      setRejectReason("");
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to reject registration.");
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    const id = deleting.id;
    const type = deleting.entity_type ?? tab;
    setSubmitting(true);
    try {
      console.log(id, type);
      await api.delete(`/admin/registrations/${id}?type=${type}`);
      toast.success("Registration deleted.");
      setDeleting(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to delete registration.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DashboardLayout role="admin" title="Registrations">
      {/* Tabs */}
      <div className="mb-5 flex gap-2 border-b border-border">
        {TABS.map(({ value, label, icon: Icon }) => {
          const count =
            value === "company"
              ? filterRows.companies.length
              : filterRows.pharmacies.length;
          const active = tab === value;
          return (
            <button
              key={value}
              onClick={() => setTab(value)}
              className={`-mb-px flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors duration-150 ${
                active
                  ? "border-primary text-primary"
                  : "border-transparent text-text-secondary hover:text-text-primary"
              }`}
            >
              <Icon size={16} />
              {label}
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                  active ? "bg-primary-subtle text-primary" : "bg-slate-100 text-slate-600"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Filter buttons + search */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium capitalize transition-colors duration-150 ${
                filter === f
                  ? "bg-primary text-white"
                  : "border border-border bg-white text-text-secondary hover:bg-slate-50"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="relative w-full sm:max-w-xs">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email, owner…"
            className="w-full rounded-lg border border-border px-3 py-2 pl-9 text-sm outline-none transition-colors duration-150 focus:border-primary focus:ring-2 focus:ring-primary/25"
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-100 bg-white shadow-sm">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead>
            <tr className="border-b border-border bg-slate-50 text-xs uppercase tracking-wide text-text-secondary">
              <th className="px-4 py-3 font-semibold">Name</th>
              {tab === "pharmacy" && <th className="px-4 py-3 font-semibold">Owner</th>}
              <th className="px-4 py-3 font-semibold">Email</th>
              <th className="px-4 py-3 font-semibold">Phone</th>
              <th className="px-4 py-3 font-semibold">Address</th>
              <th className="px-4 py-3 font-semibold">Date</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => <SkeletonRow key={i} cols={cols} />)
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={cols} className="px-4 py-16">
                  <div className="flex flex-col items-center justify-center text-center text-text-secondary">
                    <Inbox size={40} className="mb-3 text-slate-300" />
                    <p className="text-sm font-medium">No {filter !== "all" ? filter : ""} registrations</p>
                  </div>
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={`${row.entity_type}-${row.id}`}
                  className="border-b border-border last:border-0 transition-colors duration-150 hover:bg-slate-50/60"
                >
                  <td className="px-4 py-3 font-medium text-text-primary">{row.name}</td>
                  {tab === "pharmacy" && (
                    <td className="px-4 py-3 text-text-secondary">{row.owner_name || "—"}</td>
                  )}
                  <td className="px-4 py-3 text-text-secondary">{row.email}</td>
                  <td className="px-4 py-3 text-text-secondary">{row.phone || "—"}</td>
                  <td className="px-4 py-3 text-text-secondary">{row.address || "—"}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-text-secondary">
                    {formatDate(row.registered_at || row.user_created_at)}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={row.registration_status} />
                  </td>
                  <td className="px-4 py-3">
                    {row.registration_status === "pending" ? (
                      <div className="flex gap-2">
                        <button
                          onClick={() => setAccepting(row)}
                          className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-2.5 py-1.5 text-xs font-semibold text-white transition duration-150 hover:bg-green-700 active:scale-[0.98]"
                        >
                          <Check size={14} /> Accept
                        </button>
                        <button
                          onClick={() => {
                            setRejecting(row);
                            setRejectReason("");
                          }}
                          className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-2.5 py-1.5 text-xs font-semibold text-white transition duration-150 hover:bg-red-700 active:scale-[0.98]"
                        >
                          <X size={14} /> Reject
                        </button>
                      </div>
                    ) : row.registration_status === "rejected" ? (
                      <button
                        onClick={() => setDeleting(row)}
                        className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-2.5 py-1.5 text-xs font-semibold text-white transition duration-150 hover:bg-red-700 active:scale-[0.98]"
                      >
                        <Trash2 size={14} /> Delete
                      </button>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Accept confirm dialog */}
      <AnimatePresence>
        {accepting && (
          <Modal onClose={() => !submitting && setAccepting(null)}>
            <h3 className="text-lg font-bold text-text-primary">Accept registration?</h3>
            <p className="mt-2 text-sm text-text-secondary">
              Approve <span className="font-semibold text-text-primary">{accepting.name}</span>?
              They will be notified by email and can log in.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setAccepting(null)}
                disabled={submitting}
                className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-text-primary transition duration-150 hover:bg-slate-50 active:scale-[0.98] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmAccept}
                disabled={submitting}
                className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white transition duration-150 hover:bg-green-700 active:scale-[0.98] disabled:opacity-70"
              >
                {submitting ? "Accepting…" : "Accept"}
              </button>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      {/* Delete confirm dialog */}
      <AnimatePresence>
        {deleting && (
          <Modal onClose={() => !submitting && setDeleting(null)}>
            <h3 className="text-lg font-bold text-text-primary">Delete registration?</h3>
            <p className="mt-2 text-sm text-text-secondary">
              Are you sure you want to delete this registration? The user will be
              able to register again.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setDeleting(null)}
                disabled={submitting}
                className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-text-primary transition duration-150 hover:bg-slate-50 active:scale-[0.98] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={submitting}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition duration-150 hover:bg-red-700 active:scale-[0.98] disabled:opacity-70"
              >
                {submitting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      {/* Reject modal */}
      <AnimatePresence>
        {rejecting && (
          <Modal onClose={() => !submitting && setRejecting(null)}>
            <h3 className="text-lg font-bold text-text-primary">Reject registration</h3>
            <p className="mt-2 text-sm text-text-secondary">
              Reject <span className="font-semibold text-text-primary">{rejecting.name}</span>?
              You may add an optional reason.
            </p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
              placeholder="Reason for rejection (optional)…"
              className="mt-4 w-full rounded-lg border border-border px-3 py-2 text-sm outline-none transition-colors duration-150 focus:border-primary focus:ring-2 focus:ring-primary/25"
            />
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setRejecting(null)}
                disabled={submitting}
                className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-text-primary transition duration-150 hover:bg-slate-50 active:scale-[0.98] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmReject}
                disabled={submitting}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition duration-150 hover:bg-red-700 active:scale-[0.98] disabled:opacity-70"
              >
                {submitting ? "Rejecting…" : "Reject"}
              </button>
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </DashboardLayout>
  );
}

/** Centered modal shell with a backdrop and scale/fade animation. */
function Modal({ children, onClose }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl shadow-slate-900/10 ring-1 ring-slate-900/5"
      >
        {children}
      </motion.div>
    </motion.div>
  );
}
