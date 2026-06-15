import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Package,
  MapPin,
  CheckCircle2,
  Check,
  Plus,
  X,
  ArrowLeft,
  Truck,
  Wallet,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";

import api from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import DashboardLayout from "@/components/shared/DashboardLayout";

const STEPS = [
  "Pickup",
  "On the Way",
  "Arrived",
  "Returns",
  "Payment",
  "Confirm",
];

// Map a persisted order status to the wizard step the driver should resume on.
const STATUS_TO_STEP = {
  accepted: 1,
  picked_up: 2,
  on_the_way: 3,
  arrived: 4,
};

export default function Delivery() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(1);
  const [advancing, setAdvancing] = useState(false);

  // Step 4 state
  const [noReturns, setNoReturns] = useState(true);
  const [rows, setRows] = useState([]); // { order_item_id, quantity_rejected, rejection_reason }

  // Step 5 state
  const [paidAmount, setPaidAmount] = useState("");

  // Step 6 state
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const { data } = await api.get(`/driver/orders/${id}`);
      const o = data?.data ?? null;
      setOrder(o);
      if (o) {
        if (["delivered", "partially_delivered"].includes(o.status)) {
          toast.info("This order has already been delivered.");
          navigate("/driver/orders", { replace: true });
          return;
        }
        const initial = STATUS_TO_STEP[o.status];
        if (!initial) {
          toast.error("This order is not ready for delivery.");
          navigate("/driver/orders", { replace: true });
          return;
        }
        setStep(initial);
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to load order.");
      navigate("/driver/orders", { replace: true });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const items = useMemo(() => order?.items ?? [], [order]);

  // Order total after client-side return deductions.
  const deduction = useMemo(() => {
    if (noReturns) return 0;
    return rows.reduce((sum, r) => {
      const item = items.find((it) => Number(it.id) === Number(r.order_item_id));
      const qty = Number(r.quantity_rejected) || 0;
      if (!item || qty <= 0) return sum;
      return sum + qty * (Number(item.unit_price) || 0);
    }, 0);
  }, [rows, items, noReturns]);

  const currentTotal = Math.max(0, Number(order?.total_amount || 0) - deduction);
  const previousDebt = Number(order?.previous_debt || 0);
  const totalDue = currentTotal + previousDebt;
  const paid = Number(paidAmount) || 0;
  const remainingDebt = Math.max(0, totalDue - paid);

  /** PATCH the order status, then advance the wizard. */
  async function advanceStatus(status, nextStep) {
    setAdvancing(true);
    try {
      await api.patch(`/driver/orders/${id}/status`, { status });
      setOrder((o) => (o ? { ...o, status } : o));
      setStep(nextStep);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to update status.");
    } finally {
      setAdvancing(false);
    }
  }

  function addRow() {
    setRows((r) => [
      ...r,
      { order_item_id: "", quantity_rejected: 1, rejection_reason: "" },
    ]);
  }

  function updateRow(i, patch) {
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }

  function removeRow(i) {
    setRows((r) => r.filter((_, idx) => idx !== i));
  }

  /** Validate step 4 and continue to payment. */
  function continueFromReturns() {
    if (!noReturns) {
      if (rows.length === 0) {
        toast.error("Add at least one item, or check “No returns”.");
        return;
      }
      for (const r of rows) {
        if (!r.order_item_id) {
          toast.error("Select a product for each return row.");
          return;
        }
        const item = items.find(
          (it) => Number(it.id) === Number(r.order_item_id)
        );
        const qty = Number(r.quantity_rejected) || 0;
        if (qty <= 0) {
          toast.error("Returned quantity must be at least 1.");
          return;
        }
        if (item && qty > Number(item.quantity_ordered)) {
          toast.error(
            `Cannot return more than ${item.quantity_ordered} of ${item.product_name}.`
          );
          return;
        }
        if (!r.rejection_reason.trim()) {
          toast.error("A rejection reason is required for each return.");
          return;
        }
      }
    }
    setStep(5);
  }

  /** Final delivery submission. */
  async function confirmDelivery() {
    const rejected_items = noReturns
      ? []
      : rows.map((r) => ({
          order_item_id: Number(r.order_item_id),
          quantity_rejected: Number(r.quantity_rejected) || 0,
          rejection_reason: r.rejection_reason.trim(),
        }));

    setSubmitting(true);
    try {
      await api.post(`/driver/orders/${id}/deliver`, {
        paid_amount: paid,
        rejected_items,
      });
      toast.success("Delivery confirmed!");
      navigate("/driver/orders");
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to confirm delivery.");
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <DashboardLayout role="driver" title="Delivery">
        <div className="mx-auto max-w-2xl space-y-4">
          <div className="h-24 animate-pulse rounded-xl bg-white shadow-sm" />
          <div className="h-16 animate-pulse rounded-xl bg-white shadow-sm" />
          <div className="h-64 animate-pulse rounded-xl bg-white shadow-sm" />
        </div>
      </DashboardLayout>
    );
  }

  if (!order) return null;

  return (
    <DashboardLayout role="driver" title={`Delivery · Order #${order.id}`}>
      <div className="mx-auto max-w-2xl">
        <button
          onClick={() => navigate("/driver/orders")}
          className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-text-secondary transition-colors duration-150 hover:text-text-primary"
        >
          <ArrowLeft size={16} /> Back to orders
        </button>

        <ProgressBar step={step} />

        <OrderSummary order={order} itemCount={items.length} />

        <div className="mt-4 rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
          {step === 1 && (
            <StepPickup
              items={items}
              busy={advancing}
              onConfirm={() => advanceStatus("picked_up", 2)}
            />
          )}
          {step === 2 && (
            <StepOnTheWay
              address={order.pharmacy_address}
              busy={advancing}
              onConfirm={() => advanceStatus("on_the_way", 3)}
            />
          )}
          {step === 3 && (
            <StepArrived
              busy={advancing}
              onConfirm={() => advanceStatus("arrived", 4)}
            />
          )}
          {step === 4 && (
            <StepReturns
              items={items}
              noReturns={noReturns}
              setNoReturns={setNoReturns}
              rows={rows}
              addRow={addRow}
              updateRow={updateRow}
              removeRow={removeRow}
              onContinue={continueFromReturns}
            />
          )}
          {step === 5 && (
            <StepPayment
              currentTotal={currentTotal}
              previousDebt={previousDebt}
              totalDue={totalDue}
              paidAmount={paidAmount}
              setPaidAmount={setPaidAmount}
              paid={paid}
              remainingDebt={remainingDebt}
              onBack={() => setStep(4)}
              onContinue={() => setStep(6)}
            />
          )}
          {step === 6 && (
            <StepConfirm
              order={order}
              items={items}
              noReturns={noReturns}
              rows={rows}
              paid={paid}
              remainingDebt={remainingDebt}
              submitting={submitting}
              onBack={() => setStep(5)}
              onConfirm={confirmDelivery}
            />
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

/* ------------------------------------------------------------------ */
/* Progress bar                                                        */
/* ------------------------------------------------------------------ */

function ProgressBar({ step }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className="flex items-start">
        {STEPS.map((label, i) => {
          const n = i + 1;
          const completed = n < step;
          const current = n === step;
          return (
            <div key={label} className="flex flex-1 flex-col items-center">
              <div className="flex w-full items-center">
                {/* left connector */}
                <span
                  className={`h-0.5 flex-1 ${
                    i === 0
                      ? "bg-transparent"
                      : n <= step
                      ? "bg-green-600"
                      : "bg-slate-200"
                  }`}
                />
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors duration-150 ${
                    completed
                      ? "bg-green-600 text-white"
                      : current
                      ? "bg-green-600 text-white ring-4 ring-green-100"
                      : "bg-slate-100 text-slate-400"
                  }`}
                >
                  {completed ? <Check size={15} /> : n}
                </span>
                {/* right connector */}
                <span
                  className={`h-0.5 flex-1 ${
                    i === STEPS.length - 1
                      ? "bg-transparent"
                      : n < step
                      ? "bg-green-600"
                      : "bg-slate-200"
                  }`}
                />
              </div>
              <span
                className={`mt-1.5 text-center text-[10px] font-medium leading-tight sm:text-xs ${
                  current ? "text-primary" : "text-text-secondary"
                }`}
              >
                {label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Order summary card                                                  */
/* ------------------------------------------------------------------ */

function OrderSummary({ order, itemCount }) {
  return (
    <div className="mt-4 rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-text-primary">
            {order.pharmacy_name}
          </p>
          {order.pharmacy_address && (
            <p className="mt-0.5 flex items-start gap-1.5 text-xs text-text-secondary">
              <MapPin size={13} className="mt-0.5 shrink-0" />
              <span>{order.pharmacy_address}</span>
            </p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-lg font-bold text-text-primary">
            {formatCurrency(order.total_amount)}
          </p>
          <p className="text-xs text-text-secondary">
            {itemCount} item{itemCount === 1 ? "" : "s"}
          </p>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Reusable step header + primary button                               */
/* ------------------------------------------------------------------ */

function StepHeader({ icon: Icon, title, description }) {
  return (
    <div className="mb-5">
      <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary-subtle text-primary">
        <Icon size={24} />
      </div>
      <h2 className="text-lg font-bold text-text-primary">{title}</h2>
      {description && (
        <p className="mt-1 text-sm text-text-secondary">{description}</p>
      )}
    </div>
  );
}

function PrimaryButton({ children, onClick, busy, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={busy || disabled}
      className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-3.5 text-base font-semibold text-white transition duration-150 hover:bg-green-700 active:scale-[0.98] disabled:opacity-60"
    >
      {busy ? "Please wait…" : children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Step 1 — Pickup                                                     */
/* ------------------------------------------------------------------ */

function StepPickup({ items, busy, onConfirm }) {
  return (
    <div>
      <StepHeader
        icon={Package}
        title="Confirm Warehouse Pickup"
        description="Confirm that you have picked up the order from the warehouse"
      />

      <div className="mb-5 divide-y divide-border rounded-lg border border-slate-100">
        {items.length === 0 ? (
          <p className="px-3 py-4 text-sm text-text-secondary">
            No items on this order.
          </p>
        ) : (
          items.map((it) => (
            <div
              key={it.id}
              className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm"
            >
              <span className="min-w-0 truncate font-medium text-text-primary">
                {it.product_name}
              </span>
              <span className="shrink-0 text-text-secondary">
                × {it.quantity_ordered}
              </span>
            </div>
          ))
        )}
      </div>

      <PrimaryButton onClick={onConfirm} busy={busy}>
        <Check size={18} /> I've Picked Up the Order
      </PrimaryButton>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Step 2 — On the Way                                                 */
/* ------------------------------------------------------------------ */

function StepOnTheWay({ address, busy, onConfirm }) {
  return (
    <div>
      <StepHeader icon={Truck} title="On the Way to Pharmacy" />

      <div className="mb-5 flex items-start gap-3 rounded-lg bg-primary-subtle p-4">
        <MapPin size={22} className="mt-0.5 shrink-0 text-primary" />
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
            Destination
          </p>
          <p className="mt-0.5 text-base font-semibold text-text-primary">
            {address || "Address not available"}
          </p>
        </div>
      </div>

      <PrimaryButton onClick={onConfirm} busy={busy}>
        <Truck size={18} /> I'm On the Way
      </PrimaryButton>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Step 3 — Arrived                                                    */
/* ------------------------------------------------------------------ */

function StepArrived({ busy, onConfirm }) {
  return (
    <div>
      <StepHeader icon={MapPin} title="Arrived at Pharmacy" />
      <PrimaryButton onClick={onConfirm} busy={busy}>
        <MapPin size={18} /> I've Arrived at the Pharmacy
      </PrimaryButton>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Step 4 — Returns                                                    */
/* ------------------------------------------------------------------ */

function StepReturns({
  items,
  noReturns,
  setNoReturns,
  rows,
  addRow,
  updateRow,
  removeRow,
  onContinue,
}) {
  return (
    <div>
      <StepHeader
        icon={RotateCcw}
        title="Enter Returned Items (if any)"
        description="If the pharmacy rejected any items, enter them here"
      />

      <label className="mb-4 flex items-center gap-2.5 rounded-lg border border-slate-100 bg-slate-50 px-3 py-3 text-sm font-medium text-text-primary">
        <input
          type="checkbox"
          checked={noReturns}
          onChange={(e) => setNoReturns(e.target.checked)}
          className="h-4 w-4 rounded border-slate-300 text-green-600 focus:ring-green-500"
        />
        No returns — everything was delivered
      </label>

      {!noReturns && (
        <div className="mb-5 space-y-3">
          {rows.map((row, i) => {
            const selected = items.find(
              (it) => Number(it.id) === Number(row.order_item_id)
            );
            const max = selected ? Number(selected.quantity_ordered) : undefined;
            return (
              <div
                key={i}
                className="rounded-lg border border-slate-100 bg-slate-50 p-3"
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                    Return #{i + 1}
                  </span>
                  <button
                    onClick={() => removeRow(i)}
                    className="rounded-md p-1 text-text-secondary transition-colors duration-150 hover:bg-slate-200 hover:text-red-600"
                    aria-label="Remove return"
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className="space-y-2">
                  <select
                    value={row.order_item_id}
                    onChange={(e) =>
                      updateRow(i, { order_item_id: e.target.value })
                    }
                    className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-500"
                  >
                    <option value="">Select product…</option>
                    {items.map((it) => (
                      <option key={it.id} value={it.id}>
                        {it.product_name} (ordered {it.quantity_ordered})
                      </option>
                    ))}
                  </select>

                  <div className="flex gap-2">
                    <input
                      type="number"
                      min={1}
                      max={max}
                      value={row.quantity_rejected}
                      onChange={(e) =>
                        updateRow(i, { quantity_rejected: e.target.value })
                      }
                      placeholder="Qty"
                      className="w-24 rounded-lg border border-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-500"
                    />
                    <input
                      type="text"
                      value={row.rejection_reason}
                      onChange={(e) =>
                        updateRow(i, { rejection_reason: e.target.value })
                      }
                      placeholder="Reason (required)"
                      className="min-w-0 flex-1 rounded-lg border border-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </div>
                </div>
              </div>
            );
          })}

          <button
            onClick={addRow}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-2.5 text-sm font-medium text-text-secondary transition-colors duration-150 hover:border-green-500 hover:text-green-700"
          >
            <Plus size={16} /> Add Item
          </button>
        </div>
      )}

      <button
        onClick={onContinue}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-3.5 text-base font-semibold text-white transition duration-150 hover:bg-green-700 active:scale-[0.98]"
      >
        Continue
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Step 5 — Payment                                                    */
/* ------------------------------------------------------------------ */

function StepPayment({
  currentTotal,
  previousDebt,
  totalDue,
  paidAmount,
  setPaidAmount,
  paid,
  remainingDebt,
  onBack,
  onContinue,
}) {
  // Set when the driver tries to enter more than totalDue; the input is then
  // capped at totalDue (the driver cannot overpay). Cleared on the next valid edit.
  const [exceeded, setExceeded] = useState(false);

  // The pharmacy already overpaid on previous orders, so nothing is collectible
  // here. Lock the input to 0 and default the collected amount to 0.
  const hasCredit = totalDue <= 0;

  useEffect(() => {
    if (hasCredit && paidAmount !== "0") {
      setPaidAmount("0");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasCredit]);

  function handleChange(e) {
    const raw = e.target.value;
    if (raw === "") {
      setExceeded(false);
      setPaidAmount("");
      return;
    }
    const num = Number(raw);
    if (Number.isNaN(num)) return;
    if (num > totalDue) {
      // cap at totalDue — driver cannot collect more than what is owed
      setExceeded(true);
      setPaidAmount(String(totalDue));
    } else {
      setExceeded(false);
      setPaidAmount(raw);
    }
  }

  return (
    <div>
      <StepHeader icon={Wallet} title="Collect Payment" />

      <div className="mb-4 space-y-2 rounded-lg border border-slate-100 bg-slate-50 p-4 text-sm">
        <Row label="Current order total" value={formatCurrency(currentTotal)} />
        {previousDebt > 0 && (
          <Row
            label="Previous debt"
            value={formatCurrency(previousDebt)}
            muted
          />
        )}
        <div className="border-t border-slate-200 pt-2">
          <Row
            label="Total due"
            value={formatCurrency(totalDue)}
            strong
          />
        </div>
      </div>

      <label className="mb-1.5 block text-sm font-medium text-text-primary">
        Amount Collected
      </label>
      <input
        type="number"
        min={0}
        max={hasCredit ? 0 : totalDue}
        value={hasCredit ? 0 : paidAmount}
        onChange={handleChange}
        disabled={hasCredit}
        placeholder="0.00"
        className="w-full rounded-lg border border-border px-3 py-2.5 text-base outline-none focus:ring-2 focus:ring-green-500 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-text-secondary"
      />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {hasCredit ? (
          <p className="rounded-lg bg-blue-50 px-3 py-2.5 text-sm font-medium text-blue-700">
            This pharmacy has a credit balance of{" "}
            {formatCurrency(Math.abs(totalDue))}. No payment is needed for this
            order.
          </p>
        ) : (
          <PaymentStatus
            exceeded={exceeded}
            paid={paid}
            currentTotal={currentTotal}
            previousDebt={previousDebt}
            totalDue={totalDue}
            remainingDebt={remainingDebt}
          />
        )}
      </div>

      <div className="mt-5 flex gap-2">
        <button
          onClick={onBack}
          className="rounded-lg border border-border px-4 py-3 text-sm font-semibold text-text-primary transition duration-150 hover:bg-slate-50 active:scale-[0.98]"
        >
          Back
        </button>
        <button
          onClick={onContinue}
          className="flex-1 rounded-lg bg-green-600 px-4 py-3 text-base font-semibold text-white transition duration-150 hover:bg-green-700 active:scale-[0.98]"
        >
          Proceed to Confirmation
        </button>
      </div>
    </div>
  );
}

/** Contextual feedback for the amount the driver entered (see scenarios 1–5). */
function PaymentStatus({
  exceeded,
  paid,
  currentTotal,
  previousDebt,
  totalDue,
  remainingDebt,
}) {
  const badge =
    "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold";

  // Over-payment attempt — input was capped at totalDue.
  if (exceeded) {
    return (
      <span className={`${badge} bg-red-100 text-red-700`}>
        Amount exceeds total due. Maximum collectible is{" "}
        {formatCurrency(totalDue)}
      </span>
    );
  }

  // No payment collected.
  if (paid <= 0) {
    return (
      <span className={`${badge} bg-slate-100 text-slate-600`}>
        No payment collected
      </span>
    );
  }

  // Full payment — everything (current order + previous debt) settled.
  if (paid >= totalDue) {
    return (
      <span className={`${badge} bg-green-100 text-green-700`}>
        <CheckCircle2 size={14} /> Full payment ✓
      </span>
    );
  }

  // Current order paid in full, previous debt left untouched.
  if (previousDebt > 0 && paid === currentTotal) {
    return (
      <span className={`${badge} bg-blue-100 text-blue-700`}>
        Current order paid. Previous debt of {formatCurrency(previousDebt)}{" "}
        remains
      </span>
    );
  }

  // Partial payment — the shortfall is added to debt.
  return (
    <span className={`${badge} bg-orange-100 text-orange-700`}>
      Partial payment. Remaining {formatCurrency(remainingDebt)} will be added to
      debt
    </span>
  );
}

function Row({ label, value, strong, muted }) {
  return (
    <div className="flex items-center justify-between">
      <span className={muted ? "text-text-secondary" : "text-text-primary"}>
        {label}
      </span>
      <span
        className={
          strong
            ? "text-base font-bold text-text-primary"
            : "font-medium text-text-primary"
        }
      >
        {value}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Step 6 — Confirm                                                    */
/* ------------------------------------------------------------------ */

function StepConfirm({
  order,
  items,
  noReturns,
  rows,
  paid,
  remainingDebt,
  submitting,
  onBack,
  onConfirm,
}) {
  const rejectedByItem = useMemo(() => {
    const map = new Map();
    if (!noReturns) {
      for (const r of rows) {
        const qty = Number(r.quantity_rejected) || 0;
        if (r.order_item_id && qty > 0) {
          map.set(Number(r.order_item_id), qty);
        }
      }
    }
    return map;
  }, [rows, noReturns]);

  return (
    <div>
      <StepHeader icon={CheckCircle2} title="Confirm Delivery" />

      <div className="mb-5 space-y-3 rounded-lg border border-slate-100 bg-slate-50 p-4">
        <Row label="Order" value={`#${order.id}`} />
        <Row label="Pharmacy" value={order.pharmacy_name} />

        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-text-secondary">
            Items delivered
          </p>
          <ul className="space-y-1 text-sm">
            {items.map((it) => {
              const rejected = rejectedByItem.get(Number(it.id)) || 0;
              const delivered = Number(it.quantity_ordered) - rejected;
              return (
                <li
                  key={it.id}
                  className="flex items-center justify-between gap-2"
                >
                  <span className="min-w-0 truncate text-text-primary">
                    {it.product_name}
                  </span>
                  <span className="shrink-0 text-text-secondary">
                    {delivered} delivered
                    {rejected > 0 && (
                      <span className="text-red-600"> · {rejected} returned</span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="border-t border-slate-200 pt-3">
          <Row label="Amount collected" value={formatCurrency(paid)} strong />
          {remainingDebt > 0 && (
            <div className="mt-1.5">
              <Row
                label="Remaining debt"
                value={formatCurrency(remainingDebt)}
                muted
              />
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={onBack}
          disabled={submitting}
          className="rounded-lg border border-border px-4 py-3.5 text-sm font-semibold text-text-primary transition duration-150 hover:bg-slate-50 active:scale-[0.98] disabled:opacity-60"
        >
          Back
        </button>
        <PrimaryButton onClick={onConfirm} busy={submitting}>
          <CheckCircle2 size={18} /> Confirm Delivery
        </PrimaryButton>
      </div>
    </div>
  );
}
