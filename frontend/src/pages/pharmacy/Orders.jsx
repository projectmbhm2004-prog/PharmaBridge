import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Inbox, X, Phone, Star, Truck } from "lucide-react";
import { toast } from "sonner";

import api from "@/lib/api";
import { formatCurrency, formatDate, formatDateTime, getStatusLabel, toISODate } from "@/lib/utils";
import DashboardLayout from "@/components/shared/DashboardLayout";
import StatusBadge from "@/components/shared/StatusBadge";
import DateRangePicker from "@/components/ui/date-range-picker";

const PLACEHOLDER = "https://placehold.co/400x400/166534/ffffff?text=Product";

// Tabs map to one or more backend statuses (filtered client-side).
const TABS = [
  { value: "pending", label: "Pending", statuses: ["pending"] },
  { value: "accepted", label: "Accepted", statuses: ["accepted"] },
  {
    value: "in_transit",
    label: "In Transit",
    statuses: ["picked_up", "on_the_way", "arrived"],
  },
  {
    value: "delivered",
    label: "Delivered",
    statuses: ["delivered", "partially_delivered"],
  },
  { value: "rejected", label: "Rejected", statuses: ["rejected"] },
  { value: "all", label: "All", statuses: null },
];

export default function Orders() {
  const [tab, setTab] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detailId, setDetailId] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const { data } = await api.get("/pharmacy/orders", {
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
      // created_at carries a time component, so compare on the date prefix.
      const day = o.created_at ? String(o.created_at).slice(0, 10) : "";
      if (from && day && day < from) return false;
      if (to && day && day > to) return false;
      return true;
    });
  }, [orders, tab, from, to]);

  const hasDateFilter = from || to;

  return (
    <DashboardLayout role="pharmacy" title="My Orders">
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
                  layoutId="pharmacy-orders-tab"
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
              className="h-48 animate-pulse rounded-xl border border-slate-100 bg-white shadow-sm"
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
              onView={() => setDetailId(order.id)}
            />
          ))}
        </div>
      )}

      <DetailPanel
        orderId={detailId}
        onClose={() => setDetailId(null)}
        onRated={load}
      />
    </DashboardLayout>
  );
}

/** Order summary card. */
function OrderCard({ order, index, onView }) {
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
        <StatusBadge status={order.status} />
      </div>

      <p className="mt-3 text-sm font-medium text-text-primary">
        {order.company_name}
      </p>

      {order.driver_name && (
        <div className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-text-secondary">
          <p className="flex items-center gap-1.5 font-medium text-text-primary">
            <Truck size={13} /> {order.driver_name}
          </p>
          {order.driver_phone && (
            <p className="mt-0.5 flex items-center gap-1.5">
              <Phone size={12} /> {order.driver_phone}
            </p>
          )}
          {Number(order.driver_rating) > 0 && (
            <p className="mt-0.5 flex items-center gap-1">
              <Star size={12} className="fill-amber-400 text-amber-400" />
              {Number(order.driver_rating).toFixed(1)}
            </p>
          )}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
        <span className="text-lg font-bold text-text-primary">
          {formatCurrency(order.total_amount)}
        </span>
        <button
          onClick={onView}
          className="rounded-lg border border-border px-3 py-2 text-sm font-semibold text-text-primary transition duration-150 hover:bg-slate-50 active:scale-[0.98]"
        >
          View Details
        </button>
      </div>
    </motion.div>
  );
}

/** Slide-over with items, timeline, and (when eligible) a rating form. */
function DetailPanel({ orderId, onClose, onRated }) {
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!orderId) {
      setOrder(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data } = await api.get(`/pharmacy/orders/${orderId}`);
        if (!cancelled) setOrder(data?.data ?? null);
      } catch {
        if (!cancelled) {
          toast.error("Failed to load order details.");
          onClose();
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  return (
    <AnimatePresence>
      {orderId && (
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
                <h3 className="text-lg font-bold text-text-primary">
                  Order #{order?.id ?? orderId}
                </h3>
                {order && (
                  <p className="text-xs text-text-secondary">
                    {formatDate(order.created_at)} · {order.company_name}
                  </p>
                )}
              </div>
              <button
                onClick={onClose}
                className="rounded-lg p-1.5 text-text-secondary transition-colors duration-150 hover:bg-slate-100 hover:text-text-primary"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 space-y-6 overflow-y-auto p-5">
              {loading || !order ? (
                <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div
                      key={i}
                      className="h-16 animate-pulse rounded-lg bg-slate-100"
                    />
                  ))}
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={order.status} />
                    <span className="text-sm font-semibold text-text-primary">
                      {formatCurrency(order.total_amount)}
                    </span>
                  </div>

                  {order.status === "rejected" && (
                    <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                      Order rejected
                      {order.rejection_reason ? `: ${order.rejection_reason}` : "."}
                    </div>
                  )}

                  {/* Items */}
                  <section>
                    <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">
                      Items
                    </h4>
                    <div className="divide-y divide-border rounded-lg border border-slate-100">
                      {(order.items ?? []).map((it) => {
                        const qty = Number(it.quantity_ordered) || 0;
                        const unit = Number(it.unit_price) || 0;
                        return (
                          <div
                            key={it.id}
                            className="flex items-center gap-3 px-3 py-2.5 text-sm"
                          >
                            <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                              <img
                                src={it.main_image || PLACEHOLDER}
                                alt={it.product_name}
                                onError={(e) => {
                                  e.currentTarget.src = PLACEHOLDER;
                                }}
                                className="h-full w-full object-cover"
                              />
                            </div>
                            <div className="min-w-0 flex-1">
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
                      })}
                    </div>
                  </section>

                  {/* Timeline */}
                  <section>
                    <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-secondary">
                      Status Timeline
                    </h4>
                    <Timeline log={order.status_log} createdAt={order.created_at} />
                  </section>

                  {/* Rating */}
                  {order.can_rate && (
                    <RatingSection order={order} onRated={onRated} onClose={onClose} />
                  )}
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Chronological status log. */
function Timeline({ log, createdAt }) {
  const entries = [
    { status: "pending", changed_at: createdAt },
    ...(Array.isArray(log) ? log : []),
  ];
  return (
    <ol className="space-y-3">
      {entries.map((e, i) => (
        <li key={i} className="flex items-start gap-3">
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green-600 text-xs font-bold text-white">
            ✓
          </span>
          <div>
            <p className="text-sm font-medium text-text-primary">
              {getStatusLabel(e.status)}
            </p>
            {e.changed_at && (
              <p className="text-xs text-text-secondary">
                {formatDateTime(e.changed_at)}
              </p>
            )}
            {e.note && (
              <p className="mt-0.5 text-xs text-text-secondary">{e.note}</p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Post-delivery rating form: one star input per product + one for the driver. */
function RatingSection({ order, onRated, onClose }) {
  const products = useMemo(() => {
    const seen = new Map();
    for (const it of order.items ?? []) {
      if (it.product_id != null && !seen.has(it.product_id)) {
        seen.set(it.product_id, it.product_name);
      }
    }
    return [...seen.entries()].map(([id, name]) => ({ id, name }));
  }, [order]);

  const [productStars, setProductStars] = useState({});
  const [driverStars, setDriverStars] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const hasDriver = order.driver_id != null;

  async function submit() {
    const ratings = [];
    for (const p of products) {
      if (productStars[p.id]) {
        ratings.push({ order_id: order.id, product_id: p.id, stars: productStars[p.id] });
      }
    }
    if (hasDriver && driverStars) {
      ratings.push({ order_id: order.id, driver_id: order.driver_id, stars: driverStars });
    }

    if (ratings.length === 0) {
      toast.error("Please rate at least one item.");
      return;
    }

    setSubmitting(true);
    try {
      const results = await Promise.allSettled(
        ratings.map((r) => api.post("/pharmacy/ratings", r))
      );
      const failed = results.filter((r) => r.status === "rejected").length;
      if (failed > 0) {
        toast.error(`${failed} rating(s) could not be submitted.`);
      } else {
        toast.success("Thank you for your rating!");
      }
      onRated();
      onClose();
    } catch {
      toast.error("Failed to submit ratings.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="rounded-xl border border-green-200 bg-primary-subtle p-4">
      <h4 className="mb-3 text-sm font-bold text-text-primary">Rate this order</h4>

      <div className="space-y-3">
        {products.map((p) => (
          <div key={p.id} className="flex items-center justify-between gap-3">
            <span className="min-w-0 truncate text-sm text-text-primary">{p.name}</span>
            <StarInput
              value={productStars[p.id] || 0}
              onChange={(v) => setProductStars((s) => ({ ...s, [p.id]: v }))}
            />
          </div>
        ))}

        {hasDriver && (
          <div className="flex items-center justify-between gap-3 border-t border-green-200 pt-3">
            <span className="flex items-center gap-1.5 text-sm font-medium text-text-primary">
              <Truck size={14} /> {order.driver_name || "Driver"}
            </span>
            <StarInput value={driverStars} onChange={setDriverStars} />
          </div>
        )}
      </div>

      <button
        onClick={submit}
        disabled={submitting}
        className="mt-4 inline-flex w-full items-center justify-center rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white transition duration-150 hover:bg-green-700 active:scale-[0.98] disabled:opacity-60"
      >
        {submitting ? "Submitting…" : "Submit Rating"}
      </button>
    </section>
  );
}

/** Interactive 1–5 star picker. */
function StarInput({ value, onChange }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex shrink-0">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(0)}
          className="p-0.5"
          aria-label={`${n} star${n > 1 ? "s" : ""}`}
        >
          <Star
            size={20}
            className={
              n <= (hover || value)
                ? "fill-amber-400 text-amber-400"
                : "fill-slate-200 text-slate-300"
            }
          />
        </button>
      ))}
    </div>
  );
}
