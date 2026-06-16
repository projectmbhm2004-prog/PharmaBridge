import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Inbox,
  ChevronLeft,
  ChevronRight,
  X,
  Phone,
  Package,
  Truck,
  Check,
  Ban,
  Search,
} from "lucide-react";
import { toast } from "sonner";

import api from "@/lib/api";
import { formatDate, formatCurrency, getStatusLabel, toISODate } from "@/lib/utils";
import DashboardLayout from "@/components/shared/DashboardLayout";
import StatusBadge from "@/components/shared/StatusBadge";
import DateRangePicker from "@/components/ui/date-range-picker";

const LIMIT = 20;

// the filter tabs along the top. "" means All.
const TABS = [
  { value: "pending", label: "Pending" },
  { value: "accepted", label: "Accepted" },
  { value: "picked_up", label: "Picked Up" },
  { value: "on_the_way", label: "On the Way" },
  { value: "arrived", label: "Arrived" },
  { value: "delivered", label: "Delivered" },
  { value: "rejected", label: "Rejected" },
  { value: "", label: "All" },
];

// the full lifecycle, used to draw the status timeline on an order
const LIFECYCLE = [
  "pending",
  "accepted",
  "picked_up",
  "on_the_way",
  "arrived",
  "delivered",
];

const DETAIL_STATUSES = ["accepted", "picked_up", "on_the_way", "arrived"];

export default function Orders() {
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState(""); // order id / pharmacy name
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [orders, setOrders] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const [accepting, setAccepting] = useState(null); // order pending acceptance
  const [rejecting, setRejecting] = useState(null); // order pending rejection
  const [reassigning, setReassigning] = useState(null); // order pending driver swap
  const [detail, setDetail] = useState(null); // order shown in slide-over

  async function load() {
    setLoading(true);
    try {
      // filters are all server-side so they apply across every page, not just the loaded one
      const params = { page, limit: LIMIT };
      if (status) params.status = status;
      if (search.trim()) params.search = search.trim();
      if (from) params.from = from;
      if (to) params.to = `${to} 23:59:59`;
      const { data } = await api.get("/company/orders", { params });
      setOrders(data?.data?.orders ?? []);
      setTotal(data?.data?.total ?? 0);
    } catch {
      toast.error("Failed to load orders.");
      setOrders([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, status, search, from, to]);

  function changeTab(value) {
    setPage(1);
    setStatus(value);
  }

  // changing the date or search also bumps us back to page 1
  function updateFilter(setter, value) {
    setPage(1);
    setter(value);
  }

  const hasExtraFilters = search || from || to;

  function clearExtraFilters() {
    setPage(1);
    setSearch("");
    setFrom("");
    setTo("");
  }

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  return (
    <DashboardLayout role="company" title="Incoming Orders">
      {/* Search + date filters */}
      <div className="mb-5 flex flex-wrap items-end gap-3 rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
        <div className="flex flex-1 flex-col gap-1 min-w-50">
          <label className="text-xs font-medium text-text-secondary">Search</label>
          <div className="relative">
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => updateFilter(setSearch, e.target.value)}
              placeholder="Order # or pharmacy name…"
              className="w-full rounded-lg border border-border px-3 py-2 pl-9 text-sm outline-none transition-colors duration-150 focus:border-primary focus:ring-2 focus:ring-primary/25"
            />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-text-secondary">Date range</label>
          <DateRangePicker
            from={from}
            to={to}
            onSelect={({ from, to }) => {
              setPage(1);
              setFrom(toISODate(from));
              setTo(toISODate(to));
            }}
            placeholder="From – To"
          />
        </div>
        {hasExtraFilters && (
          <button
            onClick={clearExtraFilters}
            className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-sm font-medium text-text-secondary transition-colors duration-150 hover:bg-slate-50"
          >
            <X size={15} /> Clear
          </button>
        )}
      </div>

      {/* Status filter tabs */}
      <div className="mb-5 flex gap-1 overflow-x-auto border-b border-border">
        {TABS.map((tab) => {
          const active = status === tab.value;
          return (
            <button
              key={tab.value || "all"}
              onClick={() => changeTab(tab.value)}
              className={`relative whitespace-nowrap px-4 py-2.5 text-sm font-medium transition-colors duration-150 ${
                active
                  ? "text-primary"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              {tab.label}
              {active && (
                <motion.span
                  layoutId="company-orders-tab"
                  className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-green-600"
                />
              )}
            </button>
          );
        })}
      </div>

      {/* List */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-52 animate-pulse rounded-xl border border-slate-100 bg-white shadow-sm"
            />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-slate-100 bg-white py-20 text-center text-text-secondary shadow-sm">
          <Inbox size={44} className="mb-3 text-slate-300" />
          <p className="text-sm font-medium">No orders found</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {orders.map((order, i) => (
            <OrderCard
              key={order.id}
              order={order}
              index={i}
              onAccept={() => setAccepting(order)}
              onReject={() => setRejecting(order)}
              onReassign={() => setReassigning(order)}
              onView={() => setDetail(order)}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {!loading && total > 0 && (
        <div className="mt-5 flex items-center justify-between text-sm text-text-secondary">
          <span>
            {total} order{total === 1 ? "" : "s"} · Page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="inline-flex items-center gap-1 rounded-lg border border-border bg-white px-3 py-1.5 font-medium transition-colors duration-150 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ChevronLeft size={16} /> Prev
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="inline-flex items-center gap-1 rounded-lg border border-border bg-white px-3 py-1.5 font-medium transition-colors duration-150 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      <AcceptModal
        order={accepting}
        onClose={() => setAccepting(null)}
        onDone={() => {
          setAccepting(null);
          load();
        }}
      />
      <RejectModal
        order={rejecting}
        onClose={() => setRejecting(null)}
        onDone={() => {
          setRejecting(null);
          load();
        }}
      />
      <ReassignModal
        order={reassigning}
        onClose={() => setReassigning(null)}
        onDone={() => {
          setReassigning(null);
          load();
        }}
      />
      <DetailPanel order={detail} onClose={() => setDetail(null)} />
    </DashboardLayout>
  );
}

// one order's summary card
function OrderCard({ order, index, onAccept, onReject, onReassign, onView }) {
  const items = Array.isArray(order.items) ? order.items : [];
  const showDetail = DETAIL_STATUSES.includes(order.status);
// flag the accepted/in-flight orders where part of the quantity got rejected at accept time
  const hasRejections =
    order.status !== "pending" &&
    order.status !== "rejected" &&
    items.some((it) => Number(it.quantity_rejected) > 0);

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
          <p className="text-xs text-text-secondary">{formatDate(order.created_at)}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <StatusBadge status={order.status} />
          {hasRejections && (
            <span className="inline-flex items-center whitespace-nowrap rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-inset ring-amber-200">
              Items rejected
            </span>
          )}
        </div>
      </div>

      <div className="mt-3 space-y-1.5 text-sm">
        <p className="font-medium text-text-primary">{order.pharmacy_name}</p>
        {order.pharmacy_phone && (
          <p className="flex items-center gap-1.5 text-text-secondary">
            <Phone size={14} /> {order.pharmacy_phone}
          </p>
        )}
        <p className="flex items-center gap-1.5 text-text-secondary">
          <Package size={14} /> {items.length} item{items.length === 1 ? "" : "s"}
        </p>
        <p className="flex items-center gap-1.5 text-text-secondary">
          <Truck size={14} />
          {order.driver_name ? (
            <span className="text-text-primary">{order.driver_name}</span>
          ) : (
            <span className="text-slate-400">No driver assigned</span>
          )}
        </p>
      </div>

      <div className="mt-3 border-t border-border pt-3">
        <p className="text-lg font-bold text-text-primary">
          {formatCurrency(order.total_amount)}
        </p>
      </div>

      {/* Actions */}
      <div className="mt-3 flex gap-2">
        {order.status === "pending" ? (
          <>
            <button
              onClick={onAccept}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-green-600 px-3 py-2 text-sm font-semibold text-white transition duration-150 hover:bg-green-700 active:scale-[0.98]"
            >
              <Check size={16} /> Accept
            </button>
            <button
              onClick={onReject}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-red-300 px-3 py-2 text-sm font-semibold text-red-600 transition-colors duration-150 hover:bg-red-50"
            >
              <Ban size={16} /> Reject
            </button>
          </>
        ) : showDetail ? (
          <div className="flex w-full gap-2">
            <button
              onClick={onView}
              className="flex-1 rounded-lg border border-border px-3 py-2 text-sm font-semibold text-text-primary transition duration-150 hover:bg-slate-50 active:scale-[0.98]"
            >
              View Details
            </button>
            <button
              onClick={onReassign}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-amber-300 px-3 py-2 text-sm font-semibold text-amber-700 transition-colors duration-150 hover:bg-amber-50"
            >
              <Truck size={16} /> Reassign
            </button>
          </div>
        ) : (
          <button
            onClick={onView}
            className="w-full rounded-lg border border-border px-3 py-2 text-sm font-medium text-text-secondary transition-colors duration-150 hover:bg-slate-50"
          >
            View Details
          </button>
        )}
      </div>
    </motion.div>
  );
}

// accept modal - go through each line item, optionally reject part or all of it (with a reason),
// then pick a driver and confirm. leave every reject field at 0 and it's just a plain full accept.
// if every single item ends up fully rejected, it becomes a reject instead and no driver is needed.
function AcceptModal({ order, onClose, onDone }) {
  const [drivers, setDrivers] = useState([]);
  const [driverId, setDriverId] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
// keyed by order_item_id -> { qty: string, reason: string }
  const [rejections, setRejections] = useState({});

  const items = order && Array.isArray(order.items) ? order.items : [];

  useEffect(() => {
    if (!order) return;
    setDriverId("");
    setRejections({});
    setLoading(true);
    (async () => {
      try {
        const { data } = await api.get("/company/drivers", {
          params: { status: "accepted" },
        });
        // only accepted, non-fired drivers can be handed a delivery
        const list = (data?.data ?? []).filter((d) => !d.is_fired);
        setDrivers(list);
      } catch {
        setDrivers([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [order]);

// rejected qty for a line, clamped between 0 and the amount ordered
  function rejectedQty(it) {
    const raw = rejections[it.id]?.qty;
    const n = Math.floor(Number(raw));
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.min(n, Number(it.quantity_ordered) || 0);
  }

  function setRejectQty(it, value) {
    const max = Number(it.quantity_ordered) || 0;
    let n = Math.floor(Number(value));
    if (!Number.isFinite(n) || n < 0) n = 0;
    if (n > max) n = max;
    setRejections((prev) => ({
      ...prev,
      [it.id]: { ...prev[it.id], qty: n === 0 ? "" : String(n) },
    }));
  }

  function setRejectReason(it, reason) {
    setRejections((prev) => ({
      ...prev,
      [it.id]: { ...prev[it.id], reason },
    }));
  }

  const revisedTotal = items.reduce((sum, it) => {
    const accepted = (Number(it.quantity_ordered) || 0) - rejectedQty(it);
    return sum + accepted * (Number(it.unit_price) || 0);
  }, 0);

  const anyRejection = items.some((it) => rejectedQty(it) > 0);
  const fullyRejected =
    items.length > 0 &&
    items.every((it) => rejectedQty(it) === (Number(it.quantity_ordered) || 0));

  async function confirm() {
    if (!fullyRejected && !driverId) {
      toast.error("Please select a driver.");
      return;
    }
    // only bother sending the rejections that are actually > 0
    const item_rejections = items
      .filter((it) => rejectedQty(it) > 0)
      .map((it) => ({
        order_item_id: it.id,
        quantity_rejected: rejectedQty(it),
        rejection_reason: rejections[it.id]?.reason?.trim() || undefined,
      }));

    const payload = { item_rejections };
    if (!fullyRejected) payload.driver_id = Number(driverId);

    setSaving(true);
    try {
      const { data } = await api.patch(
        `/company/orders/${order.id}/accept`,
        payload
      );
      toast.success(
        data?.message ||
          (fullyRejected ? "Order rejected." : "Order accepted.")
      );
      onDone();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to accept order.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell
      open={!!order}
      onClose={saving ? undefined : onClose}
      title={`Review & accept order #${order?.id}`}
      size="lg"
    >
      <p className="text-sm text-text-secondary">
        Review the items below. Optionally reject some or all of an item&apos;s
        quantity — the rest is accepted. Leave the reject fields empty to accept
        the full order.
      </p>

      {/* Items */}
      <div className="mt-4 max-h-[45vh] divide-y divide-border overflow-y-auto rounded-lg border border-slate-100">
        {items.length === 0 ? (
          <p className="px-3 py-4 text-sm text-text-secondary">No items.</p>
        ) : (
          items.map((it) => {
            const qty = Number(it.quantity_ordered) || 0;
            const unit = Number(it.unit_price) || 0;
            const rej = rejectedQty(it);
            const accepted = qty - rej;
            return (
              <div key={it.id} className="px-3 py-3 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-text-primary">
                      {it.product_name}
                    </p>
                    <p className="text-text-secondary">
                      {it.unit_name ? `${it.unit_name} · ` : ""}
                      {qty} × {formatCurrency(unit)}
                    </p>
                  </div>
                  <span className="whitespace-nowrap font-medium text-text-primary">
                    {formatCurrency(accepted * unit)}
                    {rej > 0 && (
                      <span className="ml-1 text-xs font-normal text-slate-400 line-through">
                        {formatCurrency(qty * unit)}
                      </span>
                    )}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <label className="text-xs text-text-secondary">Reject</label>
                  <input
                    type="number"
                    min={0}
                    max={qty}
                    value={rejections[it.id]?.qty ?? ""}
                    onChange={(e) => setRejectQty(it, e.target.value)}
                    placeholder="0"
                    className="w-20 rounded-lg border border-border px-2 py-1.5 text-sm outline-none transition-colors duration-150 focus:border-primary focus:ring-2 focus:ring-primary/25"
                  />
                  <span className="text-xs text-text-secondary">of {qty}</span>
                  {rej > 0 && (
                    <input
                      type="text"
                      value={rejections[it.id]?.reason ?? ""}
                      onChange={(e) => setRejectReason(it, e.target.value)}
                      placeholder="Reason (optional)"
                      className="min-w-35 flex-1 rounded-lg border border-border px-2 py-1.5 text-sm outline-none transition-colors duration-150 focus:border-primary focus:ring-2 focus:ring-primary/25"
                    />
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Revised total */}
      <div className="mt-3 flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2.5 text-sm">
        <span className="font-medium text-text-secondary">Revised Total</span>
        <span className="text-base font-bold text-text-primary">
          {formatCurrency(revisedTotal)}
        </span>
      </div>

      {/* Full-rejection warning OR driver selector */}
      {fullyRejected ? (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
          All items are fully rejected. Confirming will{" "}
          <strong>reject the entire order</strong> — no driver is needed and the
          pharmacy will be notified.
        </div>
      ) : (
        <div className="mt-4">
          <label className="mb-1.5 block text-sm font-medium text-text-primary">
            Driver <span className="text-red-500">*</span>
          </label>
          {loading ? (
            <div className="h-10 animate-pulse rounded-lg bg-slate-100" />
          ) : drivers.length === 0 ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              No active drivers available. Accept a driver first on the Drivers
              page.
            </p>
          ) : (
            <select
              value={driverId}
              onChange={(e) => setDriverId(e.target.value)}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none transition-colors duration-150 focus:border-primary focus:ring-2 focus:ring-primary/25"
            >
              <option value="">Select a driver…</option>
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.full_name}
                  {d.vehicle_info ? ` — ${d.vehicle_info}` : ""}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      <div className="mt-6 flex justify-end gap-3">
        <button
          onClick={onClose}
          disabled={saving}
          className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-text-primary transition duration-150 hover:bg-slate-50 active:scale-[0.98] disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          onClick={confirm}
          disabled={saving || (!fullyRejected && drivers.length === 0)}
          className={`rounded-lg px-4 py-2 text-sm font-semibold text-white transition duration-150 active:scale-[0.98] disabled:opacity-60 ${
            fullyRejected
              ? "bg-red-600 hover:bg-red-700"
              : "bg-green-600 hover:bg-green-700"
          }`}
        >
          {saving
            ? fullyRejected
              ? "Rejecting…"
              : "Accepting…"
            : fullyRejected
              ? "Reject Order"
              : anyRejection
                ? "Accept with Rejections"
                : "Accept Order"}
        </button>
      </div>
    </ModalShell>
  );
}

// reject modal - reason is optional here
function RejectModal({ order, onClose, onDone }) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (order) setReason("");
  }, [order]);

  async function confirm() {
    setSaving(true);
    try {
      await api.patch(`/company/orders/${order.id}/reject`, {
        rejection_reason: reason.trim() || undefined,
      });
      toast.success("Order rejected.");
      onDone();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to reject order.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell open={!!order} onClose={saving ? undefined : onClose} title={`Reject order #${order?.id}`}>
      <label className="mb-1.5 block text-sm font-medium text-text-primary">
        Reason <span className="text-slate-400">(optional)</span>
      </label>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={3}
        placeholder="Why are you rejecting this order?"
        className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none transition-colors duration-150 focus:border-primary focus:ring-2 focus:ring-primary/25"
      />
      <div className="mt-6 flex justify-end gap-3">
        <button
          onClick={onClose}
          disabled={saving}
          className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-text-primary transition duration-150 hover:bg-slate-50 active:scale-[0.98] disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          onClick={confirm}
          disabled={saving}
          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition duration-150 hover:bg-red-700 active:scale-[0.98] disabled:opacity-60"
        >
          {saving ? "Rejecting…" : "Reject Order"}
        </button>
      </div>
    </ModalShell>
  );
}

// reassign modal - swap the driver on an order that's already in progress
function ReassignModal({ order, onClose, onDone }) {
  const [drivers, setDrivers] = useState([]);
  const [driverId, setDriverId] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!order) return;
    setDriverId("");
    setLoading(true);
    (async () => {
      try {
        const { data } = await api.get("/company/drivers", {
          params: { status: "accepted" },
        });
        // accepted, non-fired drivers, minus whoever's already on this order
        const list = (data?.data ?? []).filter(
          (d) => !d.is_fired && Number(d.id) !== Number(order.driver_id)
        );
        setDrivers(list);
      } catch {
        setDrivers([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [order]);

  async function confirm() {
    if (!driverId) {
      toast.error("Please select a driver.");
      return;
    }
    setSaving(true);
    try {
      await api.patch(`/company/orders/${order.id}/reassign`, {
        driver_id: Number(driverId),
      });
      toast.success("Driver reassigned.");
      onDone();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to reassign driver.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell
      open={!!order}
      onClose={saving ? undefined : onClose}
      title={`Reassign order #${order?.id}`}
    >
      <p className="text-sm text-text-secondary">
        Assign this in-progress order to a different driver — for example when the
        current driver is no longer available.
      </p>
      {order?.driver_name && (
        <p className="mt-2 text-sm text-text-secondary">
          Current driver:{" "}
          <span className="font-medium text-text-primary">{order.driver_name}</span>
        </p>
      )}
      <div className="mt-4">
        <label className="mb-1.5 block text-sm font-medium text-text-primary">
          New driver <span className="text-red-500">*</span>
        </label>
        {loading ? (
          <div className="h-10 animate-pulse rounded-lg bg-slate-100" />
        ) : drivers.length === 0 ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            No other active drivers available. Accept a driver first on the
            Drivers page.
          </p>
        ) : (
          <select
            value={driverId}
            onChange={(e) => setDriverId(e.target.value)}
            className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none transition-colors duration-150 focus:border-primary focus:ring-2 focus:ring-primary/25"
          >
            <option value="">Select a driver…</option>
            {drivers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.full_name}
                {d.vehicle_info ? ` — ${d.vehicle_info}` : ""}
              </option>
            ))}
          </select>
        )}
      </div>
      <div className="mt-6 flex justify-end gap-3">
        <button
          onClick={onClose}
          disabled={saving}
          className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-text-primary transition duration-150 hover:bg-slate-50 active:scale-[0.98] disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          onClick={confirm}
          disabled={saving || drivers.length === 0}
          className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition-colors duration-150 hover:bg-amber-700 disabled:opacity-60"
        >
          {saving ? "Reassigning…" : "Reassign Driver"}
        </button>
      </div>
    </ModalShell>
  );
}

// slide-over panel with the full order details + the status timeline
function DetailPanel({ order, onClose }) {
  const items = order && Array.isArray(order.items) ? order.items : [];

  return (
    <AnimatePresence>
      {order && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-50 flex justify-end bg-slate-900/50 backdrop-blur-sm"
        >
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "tween", duration: 0.25 }}
            onClick={(e) => e.stopPropagation()}
            className="flex h-full w-full max-w-md flex-col bg-white shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div>
                <h3 className="text-lg font-bold text-text-primary">Order #{order.id}</h3>
                <p className="text-xs text-text-secondary">{formatDate(order.created_at)}</p>
              </div>
              <button
                onClick={onClose}
                className="rounded-lg p-1.5 text-text-secondary transition-colors duration-150 hover:bg-slate-100 hover:text-text-primary"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 space-y-6 overflow-y-auto p-5">
              <div className="flex items-center gap-2">
                <StatusBadge status={order.status} />
                <span className="text-sm font-semibold text-text-primary">
                  {formatCurrency(order.total_amount)}
                </span>
              </div>

              {/* Pharmacy */}
              <section>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">
                  Pharmacy
                </h4>
                <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-sm">
                  <p className="font-medium text-text-primary">{order.pharmacy_name}</p>
                  {order.pharmacy_phone && (
                    <p className="mt-0.5 text-text-secondary">{order.pharmacy_phone}</p>
                  )}
                  {order.pharmacy_address && (
                    <p className="mt-0.5 text-text-secondary">{order.pharmacy_address}</p>
                  )}
                  <p className="mt-1 text-text-secondary">
                    Driver:{" "}
                    <span className="text-text-primary">
                      {order.driver_name || "Not assigned"}
                    </span>
                  </p>
                </div>
              </section>

              {/* Items */}
              <section>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">
                  Items
                </h4>
                <div className="divide-y divide-border rounded-lg border border-slate-100">
                  {items.length === 0 ? (
                    <p className="px-3 py-4 text-sm text-text-secondary">No items.</p>
                  ) : (
                    items.map((it) => {
                      const qty = Number(it.quantity_ordered) || 0;
                      const unit = Number(it.unit_price) || 0;
                      return (
                        <div
                          key={it.id}
                          className="flex items-start justify-between gap-3 px-3 py-2.5 text-sm"
                        >
                          <div className="min-w-0">
                            <p className="truncate font-medium text-text-primary">
                              {it.product_name}
                            </p>
                            <p className="text-text-secondary">
                              {qty} × {formatCurrency(unit)}
                              {Number(it.quantity_rejected) > 0 && (
                                <span className="ml-1 text-red-600">
                                  ({it.quantity_rejected} returned)
                                </span>
                              )}
                            </p>
                          </div>
                          <span className="whitespace-nowrap font-medium text-text-primary">
                            {formatCurrency(qty * unit)}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              </section>

              {/* Timeline */}
              <section>
                <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-secondary">
                  Status Timeline
                </h4>
                <Timeline status={order.status} />
                {order.status === "rejected" && (
                  <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    Order rejected
                    {order.rejection_reason ? `: ${order.rejection_reason}` : "."}
                  </div>
                )}
              </section>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// vertical timeline that lights up the statuses the order has reached
function Timeline({ status }) {
  if (status === "rejected") {
    return (
      <p className="text-sm text-text-secondary">
        This order did not progress beyond rejection.
      </p>
    );
  }
  const current = LIFECYCLE.indexOf(
    status === "partially_delivered" ? "delivered" : status
  );

  return (
    <ol className="space-y-3">
      {LIFECYCLE.map((s, i) => {
        const reached = i <= current;
        return (
          <li key={s} className="flex items-center gap-3">
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                reached
                  ? "bg-green-600 text-white"
                  : "bg-slate-200 text-slate-400"
              }`}
            >
              {reached ? "✓" : i + 1}
            </span>
            <span
              className={`text-sm ${
                reached ? "font-medium text-text-primary" : "text-text-secondary"
              }`}
            >
              {getStatusLabel(s)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

// centered modal with a backdrop, scales + fades in
function ModalShell({ open, onClose, title, children, size = "md" }) {
  const maxWidth = size === "lg" ? "max-w-lg" : "max-w-md";
  return (
    <AnimatePresence>
      {open && (
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
            className={`w-full ${maxWidth} rounded-2xl bg-white p-6 shadow-2xl shadow-slate-900/10 ring-1 ring-slate-900/5`}
          >
            <div className="mb-4 flex items-start justify-between">
              <h3 className="text-lg font-bold text-text-primary">{title}</h3>
              {onClose && (
                <button
                  onClick={onClose}
                  className="text-text-secondary transition-colors duration-150 hover:text-text-primary"
                >
                  <X size={20} />
                </button>
              )}
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
