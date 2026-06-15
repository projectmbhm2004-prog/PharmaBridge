import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Car,
  Phone,
  Mail,
  MapPin,
  FileText,
  Star,
  Check,
  X,
  UserX,
  Users,
  RotateCcw,
  Trash2,
  Search,
} from "lucide-react";
import { toast } from "sonner";

import api from "@/lib/api";
import { formatDate } from "@/lib/utils";
import DashboardLayout from "@/components/shared/DashboardLayout";

const TABS = [
  { value: "pending", label: "Pending" },
  { value: "active", label: "Active" },
  { value: "fired", label: "Fired" },
];

export default function Drivers() {
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("pending");
  const [search, setSearch] = useState("");

  const [rejecting, setRejecting] = useState(null);
  const [firing, setFiring] = useState(null);
  const [rehiring, setRehiring] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);
  const [acting, setActing] = useState(null); // id mid-accept

  async function load() {
    setLoading(true);
    try {
      const { data } = await api.get("/company/drivers");
      setDrivers(data?.data ?? []);
    } catch {
      toast.error("Failed to load drivers.");
      setDrivers([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  // Partition by registration_status + is_fired (fired wins over status).
  const buckets = useMemo(() => {
    const pending = [];
    const active = [];
    const fired = [];
    for (const d of drivers) {
      if (d.is_fired) fired.push(d);
      else if (d.registration_status === "accepted") active.push(d);
      else if (d.registration_status === "pending") pending.push(d);
    }
    return { pending, active, fired };
  }, [drivers]);

  // Search by driver name within the active tab bucket.
  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    const bucket = buckets[tab];
    if (!q) return bucket;
    return bucket.filter((d) => (d.full_name || "").toLowerCase().includes(q));
  }, [buckets, tab, search]);

  async function accept(driver) {
    setActing(driver.id);
    try {
      await api.patch(`/company/drivers/${driver.id}/accept`);
      toast.success("Driver accepted.");
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to accept driver.");
    } finally {
      setActing(null);
    }
  }

  async function confirmReject() {
    if (!rejecting) return;
    setBusy(true);
    try {
      await api.patch(`/company/drivers/${rejecting.id}/reject`, {
        rejection_reason: rejecting._reason?.trim() || undefined,
      });
      toast.success("Driver rejected.");
      setRejecting(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to reject driver.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmFire() {
    if (!firing) return;
    setBusy(true);
    try {
      await api.delete(`/company/drivers/${firing.id}`);
      toast.success("Driver terminated.");
      setFiring(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to fire driver.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmRehire() {
    if (!rehiring) return;
    setBusy(true);
    try {
      await api.patch(`/company/drivers/${rehiring.id}/accept`);
      toast.success("Driver rehired.");
      setRehiring(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to rehire driver.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setBusy(true);
    try {
      await api.delete(`/company/drivers/${deleting.id}/delete`);
      toast.success("Driver permanently deleted.");
      setDeleting(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to delete driver.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <DashboardLayout role="company" title="Drivers">
      {/* Search */}
      <div className="mb-4 flex justify-end">
        <div className="relative w-full sm:max-w-xs">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by driver name…"
            className="w-full rounded-lg border border-border px-3 py-2 pl-9 text-sm outline-none transition-colors duration-150 focus:border-primary focus:ring-2 focus:ring-primary/25"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-5 flex gap-1 border-b border-border">
        {TABS.map((t) => {
          const active = tab === t.value;
          const count = buckets[t.value].length;
          return (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              className={`relative px-4 py-2.5 text-sm font-medium transition-colors duration-150 ${
                active
                  ? "text-primary"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              {t.label}
              {!loading && (
                <span className="ml-1.5 text-xs text-slate-400">({count})</span>
              )}
              {active && (
                <motion.span
                  layoutId="company-drivers-tab"
                  className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-green-600"
                />
              )}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-44 animate-pulse rounded-xl border border-slate-100 bg-white shadow-sm"
            />
          ))}
        </div>
      ) : list.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-slate-100 bg-white py-20 text-center text-text-secondary shadow-sm">
          <Users size={44} className="mb-3 text-slate-300" />
          <p className="text-sm font-medium">No {tab} drivers</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((driver, i) => (
            <DriverCard
              key={driver.id}
              driver={driver}
              tab={tab}
              index={i}
              accepting={acting === driver.id}
              onAccept={() => accept(driver)}
              onReject={() => setRejecting({ ...driver, _reason: "" })}
              onFire={() => setFiring(driver)}
              onRehire={() => setRehiring(driver)}
              onDelete={() => setDeleting(driver)}
            />
          ))}
        </div>
      )}

      {/* Reject modal */}
      <AnimatePresence>
        {rejecting && (
          <Modal onClose={() => !busy && setRejecting(null)} title={`Reject ${rejecting.full_name}`}>
            <label className="mb-1.5 block text-sm font-medium text-text-primary">
              Reason <span className="text-slate-400">(optional)</span>
            </label>
            <textarea
              value={rejecting._reason}
              onChange={(e) =>
                setRejecting((r) => ({ ...r, _reason: e.target.value }))
              }
              rows={3}
              placeholder="Why are you rejecting this application?"
              className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none transition-colors duration-150 focus:border-primary focus:ring-2 focus:ring-primary/25"
            />
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setRejecting(null)}
                disabled={busy}
                className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-text-primary transition duration-150 hover:bg-slate-50 active:scale-[0.98] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmReject}
                disabled={busy}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition duration-150 hover:bg-red-700 active:scale-[0.98] disabled:opacity-70"
              >
                {busy ? "Rejecting…" : "Reject"}
              </button>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      {/* Fire confirm */}
      <AnimatePresence>
        {firing && (
          <Modal onClose={() => !busy && setFiring(null)} title="Fire driver?">
            <p className="text-sm text-text-secondary">
              Terminate{" "}
              <span className="font-semibold text-text-primary">{firing.full_name}</span>?
              They will no longer be able to log in or receive deliveries.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setFiring(null)}
                disabled={busy}
                className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-text-primary transition duration-150 hover:bg-slate-50 active:scale-[0.98] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmFire}
                disabled={busy}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition duration-150 hover:bg-red-700 active:scale-[0.98] disabled:opacity-70"
              >
                {busy ? "Terminating…" : "Fire Driver"}
              </button>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      {/* Rehire confirm */}
      <AnimatePresence>
        {rehiring && (
          <Modal onClose={() => !busy && setRehiring(null)} title="Rehire this driver?">
            <p className="text-sm text-text-secondary">
              Rehire{" "}
              <span className="font-semibold text-text-primary">{rehiring.full_name}</span>?
              They will regain access and can receive deliveries again.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setRehiring(null)}
                disabled={busy}
                className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-text-primary transition duration-150 hover:bg-slate-50 active:scale-[0.98] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmRehire}
                disabled={busy}
                className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white transition duration-150 hover:bg-green-700 active:scale-[0.98] disabled:opacity-70"
              >
                {busy ? "Rehiring…" : "Rehire"}
              </button>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      {/* Delete confirm */}
      <AnimatePresence>
        {deleting && (
          <Modal onClose={() => !busy && setDeleting(null)} title="Permanently delete this driver?">
            <p className="text-sm text-text-secondary">
              Permanently delete{" "}
              <span className="font-semibold text-text-primary">{deleting.full_name}</span>?
              This cannot be undone.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setDeleting(null)}
                disabled={busy}
                className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-text-primary transition duration-150 hover:bg-slate-50 active:scale-[0.98] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={busy}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition duration-150 hover:bg-red-700 active:scale-[0.98] disabled:opacity-70"
              >
                {busy ? "Deleting…" : "Delete"}
              </button>
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </DashboardLayout>
  );
}

function DriverCard({
  driver,
  tab,
  index,
  accepting,
  onAccept,
  onReject,
  onFire,
  onRehire,
  onDelete,
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.04, 0.3) }}
      className="flex flex-col rounded-xl border border-slate-100 bg-white p-4 shadow-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-text-primary">{driver.full_name}</h3>
          {tab === "active" && (
            <div className="mt-0.5 flex items-center gap-1 text-sm text-amber-500">
              <Star size={14} className="fill-amber-400 text-amber-400" />
              <span className="font-medium">
                {Number(driver.rating_avg) > 0
                  ? Number(driver.rating_avg).toFixed(1)
                  : "—"}
              </span>
              <span className="text-xs text-text-secondary">
                ({driver.rating_count || 0})
              </span>
            </div>
          )}
        </div>
        {tab === "fired" && (
          <span className="rounded-full bg-slate-200 px-2 py-1 text-xs font-medium text-slate-600">
            Terminated
          </span>
        )}
      </div>

      <div className="mt-3 space-y-1.5 text-sm text-text-secondary">
        {driver.phone && (
          <p className="flex items-center gap-1.5">
            <Phone size={14} /> {driver.phone}
          </p>
        )}
        {driver.email && (
          <p className="flex items-center gap-1.5">
            <Mail size={14} /> <span className="truncate">{driver.email}</span>
          </p>
        )}
        {driver.vehicle_info && (
          <p className="flex items-center gap-1.5">
            <Car size={14} /> {driver.vehicle_info}
          </p>
        )}
        {driver.address && (
          <p className="flex items-start gap-1.5">
            <MapPin size={14} className="mt-0.5 shrink-0" /> {driver.address}
          </p>
        )}
        {driver.description && (
          <p className="flex items-start gap-1.5">
            <FileText size={14} className="mt-0.5 shrink-0" />
            <span className="leading-relaxed">{driver.description}</span>
          </p>
        )}
        <p className="text-xs text-slate-400">
          Registered {formatDate(driver.registered_at)}
        </p>
      </div>

      {tab === "pending" && (
        <div className="mt-3 flex gap-2 border-t border-border pt-3">
          <button
            onClick={onAccept}
            disabled={accepting}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-green-600 px-3 py-2 text-sm font-semibold text-white transition duration-150 hover:bg-green-700 active:scale-[0.98] disabled:opacity-60"
          >
            <Check size={16} /> {accepting ? "Accepting…" : "Accept"}
          </button>
          <button
            onClick={onReject}
            disabled={accepting}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-red-300 px-3 py-2 text-sm font-semibold text-red-600 transition-colors duration-150 hover:bg-red-50 disabled:opacity-60"
          >
            <X size={16} /> Reject
          </button>
        </div>
      )}

      {tab === "active" && (
        <div className="mt-3 border-t border-border pt-3">
          <button
            onClick={onFire}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-red-300 px-3 py-2 text-sm font-semibold text-red-600 transition-colors duration-150 hover:bg-red-50"
          >
            <UserX size={16} /> Fire Driver
          </button>
        </div>
      )}

      {tab === "fired" && (
        <div className="mt-3 flex gap-2 border-t border-border pt-3">
          <button
            onClick={onRehire}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-green-300 px-3 py-2 text-sm font-semibold text-green-600 transition-colors duration-150 hover:bg-green-50"
          >
            <RotateCcw size={16} /> Rehire
          </button>
          <button
            onClick={onDelete}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-red-300 px-3 py-2 text-sm font-semibold text-red-600 transition-colors duration-150 hover:bg-red-50"
          >
            <Trash2 size={16} /> Delete
          </button>
        </div>
      )}
    </motion.div>
  );
}

function Modal({ onClose, title, children }) {
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
        <div className="mb-4 flex items-start justify-between">
          <h3 className="text-lg font-bold text-text-primary">{title}</h3>
          <button
            onClick={onClose}
            className="text-text-secondary transition-colors duration-150 hover:text-text-primary"
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </motion.div>
    </motion.div>
  );
}
