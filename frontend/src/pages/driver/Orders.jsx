import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Inbox,
  X,
  Phone,
  MapPin,
  Building2,
  Check,
  Truck,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";

import api from "@/lib/api";
import { formatCurrency, formatDate, toISODate } from "@/lib/utils";
import DashboardLayout from "@/components/shared/DashboardLayout";
import StatusBadge from "@/components/shared/StatusBadge";
import DateRangePicker from "@/components/ui/date-range-picker";

// each tab covers one or more backend statuses, filtered on the client
const TABS = [
  { value: "pending", label: "Pending", statuses: ["pending"] },
  { value: "accepted", label: "Accepted", statuses: ["accepted"] },
  {
    value: "in_progress",
    label: "In Progress",
    statuses: ["picked_up", "on_the_way", "arrived"],
  },
  {
    value: "delivered",
    label: "Delivered",
    statuses: ["delivered", "partially_delivered"],
  },
  { value: "all", label: "All", statuses: null },
];

const IN_PROGRESS = ["picked_up", "on_the_way", "arrived"];
const COMPLETED = ["delivered", "partially_delivered"];

export default function Orders() {
  const navigate = useNavigate();
  const [tab, setTab] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [rejectId, setRejectId] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const { data } = await api.get("/driver/orders", {
        params: { limit: 100 },
      });
      setOrders(data?.data?.orders ?? []);
    } catch {
      toast.error("Failed to load orders.");
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const visible = useMemo(() => {
    const active = TABS.find((t) => t.value === tab);
    return orders.filter((o) => {
      if (active?.statuses && !active.statuses.includes(o.status)) return false;
      const day = o.created_at ? String(o.created_at).slice(0, 10) : "";
      if (from && day && day < from) return false;
      if (to && day && day > to) return false;
      return true;
    });
  }, [orders, tab, from, to]);

  const hasDateFilter = from || to;

  async function accept(id) {
    setBusyId(id);
    try {
      await api.patch(`/driver/orders/${id}/accept`);
      toast.success("Order accepted.");
      // accepting leaves it in 'accepted', so just drop them straight into the delivery
      // wizard at step 1 (warehouse pickup)
      navigate(`/driver/delivery/${id}`);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to accept order.");
      setBusyId(null);
    }
  }

  return (
    <DashboardLayout role="driver" title="My Assigned Orders">
      {/* Status filter tabs */}
      <div className="mb-5 flex gap-1 overflow-x-auto border-b border-border">
        {TABS.map((t) => {
          const active = tab === t.value;
          return (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              className={`relative whitespace-nowrap px-4 py-2.5 text-sm font-medium transition-colors duration-150 ${
                active
                  ? "text-primary"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              {t.label}
              {active && (
                <motion.span
                  layoutId="driver-orders-tab"
                  className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-green-600"
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Date range */}
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-text-secondary">Date range</label>
          <DateRangePicker
            from={from}
            to={to}
            onSelect={({ from, to }) => {
              setFrom(toISODate(from));
              setTo(toISODate(to));
            }}
            placeholder="From – To"
          />
        </div>
        {hasDateFilter && (
          <button
            onClick={() => {
              setFrom("");
              setTo("");
            }}
            className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-sm font-medium text-text-secondary transition-colors duration-150 hover:bg-slate-50"
          >
            <X size={15} /> Clear
          </button>
        )}
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-56 animate-pulse rounded-xl border border-slate-100 bg-white shadow-sm"
            />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-slate-100 bg-white py-20 text-center text-text-secondary shadow-sm">
          <Inbox size={44} className="mb-3 text-slate-300" />
          <p className="text-sm font-medium">No orders found</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((order, i) => (
            <OrderCard
              key={order.id}
              order={order}
              index={i}
              busy={busyId === order.id}
              onAccept={() => accept(order.id)}
              onReject={() => setRejectId(order.id)}
              onContinue={() => navigate(`/driver/delivery/${order.id}`)}
            />
          ))}
        </div>
      )}

      <RejectModal
        orderId={rejectId}
        onClose={() => setRejectId(null)}
        onRejected={() => {
          setRejectId(null);
          load();
        }}
      />
    </DashboardLayout>
  );
}

// order summary card, the action buttons depend on the status
function OrderCard({ order, index, busy, onAccept, onReject, onContinue }) {
  const inProgress = IN_PROGRESS.includes(order.status);
  const completed = COMPLETED.includes(order.status);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.04, 0.3) }}
      className="flex flex-col rounded-xl border border-slate-100 bg-white p-4 shadow-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-text-primary">#{order.id}</p>
          <p className="text-xs text-text-secondary">
            {formatDate(order.created_at)}
          </p>
        </div>
        <StatusBadge status={order.status} />
      </div>

      {/* Pharmacy */}
      <div className="mt-3 space-y-1 rounded-lg bg-slate-50 px-3 py-2.5 text-sm">
        <p className="font-semibold text-text-primary">{order.pharmacy_name}</p>
        {order.pharmacy_address && (
          <p className="flex items-start gap-1.5 text-xs text-text-secondary">
            <MapPin size={13} className="mt-0.5 shrink-0" />
            <span>{order.pharmacy_address}</span>
          </p>
        )}
        {order.pharmacy_phone && (
          <p className="flex items-center gap-1.5 text-xs text-text-secondary">
            <Phone size={12} className="shrink-0" />
            <a href={`tel:${order.pharmacy_phone}`} className="hover:underline">
              {order.pharmacy_phone}
            </a>
          </p>
        )}
      </div>

      <p className="mt-2 flex items-center gap-1.5 text-xs text-text-secondary">
        <Building2 size={13} className="shrink-0" />
        {order.company_name}
      </p>

      <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
        <span className="text-lg font-bold text-text-primary">
          {formatCurrency(order.total_amount)}
        </span>
      </div>

      {/* Actions */}
      <div className="mt-3">
        {order.status === "accepted" && (
          <div className="flex gap-2">
            <button
              onClick={onAccept}
              disabled={busy}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-green-600 px-3 py-2.5 text-sm font-semibold text-white transition duration-150 hover:bg-green-700 active:scale-[0.98] disabled:opacity-60"
            >
              <Check size={16} /> {busy ? "..." : "Accept"}
            </button>
            <button
              onClick={onReject}
              disabled={busy}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-red-300 px-3 py-2.5 text-sm font-semibold text-red-600 transition-colors duration-150 hover:bg-red-50 disabled:opacity-60"
            >
              <X size={16} /> Reject
            </button>
          </div>
        )}

        {inProgress && (
          <button
            onClick={onContinue}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-green-600 px-3 py-2.5 text-sm font-semibold text-white transition duration-150 hover:bg-green-700 active:scale-[0.98]"
          >
            <Truck size={16} /> Continue Delivery
          </button>
        )}

        {completed && (
          <p className="flex items-center gap-1.5 text-sm font-medium text-green-700">
            <CheckCircle2 size={16} />
            Completed{order.updated_at ? ` · ${formatDate(order.updated_at)}` : ""}
          </p>
        )}
      </div>
    </motion.div>
  );
}

// reject modal - they have to give a reason here
function RejectModal({ orderId, onClose, onRejected }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (orderId) {
      setReason("");
      setError("");
      setSubmitting(false);
    }
  }, [orderId]);

  async function submit() {
    if (reason.trim() === "") {
      setError("A rejection reason is required.");
      return;
    }
    setSubmitting(true);
    try {
      await api.patch(`/driver/orders/${orderId}/reject`, {
        rejection_reason: reason.trim(),
      });
      toast.success("Order rejected.");
      onRejected();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to reject order.");
      setSubmitting(false);
    }
  }

  return (
    <AnimatePresence>
      {orderId && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-4 backdrop-blur-sm sm:items-center"
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl"
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-bold text-text-primary">
                Reject Order #{orderId}
              </h3>
              <button
                onClick={onClose}
                className="rounded-lg p-1.5 text-text-secondary transition-colors duration-150 hover:bg-slate-100"
              >
                <X size={20} />
              </button>
            </div>

            <label className="mb-1.5 block text-sm font-medium text-text-primary">
              Reason for rejection <span className="text-red-600">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                if (error) setError("");
              }}
              rows={4}
              placeholder="Explain why you're rejecting this order…"
              className="w-full resize-none rounded-lg border border-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-500"
            />
            {error && <p className="mt-1.5 text-sm text-red-600">{error}</p>}

            <div className="mt-4 flex gap-2">
              <button
                onClick={onClose}
                className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-semibold text-text-primary transition duration-150 hover:bg-slate-50 active:scale-[0.98]"
              >
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={submitting}
                className="flex-1 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition duration-150 hover:bg-red-700 active:scale-[0.98] disabled:opacity-60"
              >
                {submitting ? "Rejecting…" : "Reject Order"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
