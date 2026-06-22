import { useEffect, useMemo, useRef, useState } from "react";
import {
  Wallet,
  TrendingUp,
  AlertCircle,
  X,
  FileX,
  BadgeDollarSign,
} from "lucide-react";
import { toast } from "sonner";

import api from "@/lib/api";
import { formatCurrency, formatDate, toISODate } from "@/lib/utils";
import DashboardLayout from "@/components/shared/DashboardLayout";
import StatusBadge from "@/components/shared/StatusBadge";
import DateRangePicker from "@/components/ui/date-range-picker";

const COLS = 7;
const EMPTY_FILTERS = {
  pharmacy_id: "",
  from: "",
  to: "",
  payment_status: "",
  product: "",
};

const PAYMENT_STATUSES = [
  { value: "", label: "All" },
  { value: "paid", label: "Paid" },
  { value: "partial", label: "Partial (some paid)" },
  { value: "unpaid", label: "Unpaid (nothing paid)" },
];

export default function Financial() {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [records, setRecords] = useState([]);
  const [summary, setSummary] = useState([]);
  const [loading, setLoading] = useState(true);

  // which pharmacy the "Record Payment" modal is open for (null = modal closed)
  const [payTarget, setPayTarget] = useState(null);

  // build the pharmacy dropdown once from the unfiltered set so it doesn't shrink as they filter
  const pharmaciesRef = useRef([]);
  const [pharmacies, setPharmacies] = useState([]);

  async function load() {
    setLoading(true);
    try {
      const params = {};
      if (filters.pharmacy_id) params.pharmacy_id = filters.pharmacy_id;
      if (filters.from) params.from = filters.from;
      if (filters.to) params.to = filters.to;
      if (filters.payment_status) params.payment_status = filters.payment_status;

      const { data } = await api.get("/company/financial", { params });
      const recs = data?.data?.records ?? [];
      setRecords(recs);
      setSummary(data?.data?.summary ?? []);

      // first load (no filters yet) is where we seed the pharmacy filter list
      if (pharmaciesRef.current.length === 0) {
        const map = new Map();
        for (const r of recs) {
          if (r.pharmacy_id && !map.has(r.pharmacy_id)) {
            map.set(r.pharmacy_id, r.pharmacy_name);
          }
        }
        // the summary view lists every pharmacy, so pull from it too where we can
        for (const s of data?.data?.summary ?? []) {
          if (s.pharmacy_id && !map.has(s.pharmacy_id)) {
            map.set(s.pharmacy_id, s.pharmacy_name);
          }
        }
        pharmaciesRef.current = [...map.entries()].map(([id, name]) => ({
          id,
          name,
        }));
        setPharmacies(pharmaciesRef.current);
      }
    } catch {
      toast.error("Failed to load financial records.");
      setRecords([]);
      setSummary([]);
    } finally {
      setLoading(false);
    }
  }

  // product is a client-side filter, so it's deliberately left out of the deps — changing it
  // must not trigger a refetch (no new API call)
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.pharmacy_id, filters.from, filters.to, filters.payment_status]);

  // client-side product filter over the already-loaded records
  const visibleRecords = useMemo(() => {
    if (!filters.product) return records;
    const search = filters.product.toLowerCase();
    return records.filter(
      (r) => r.product_names && r.product_names.toLowerCase().includes(search)
    );
  }, [records, filters.product]);

  // when one pharmacy is selected, sum the visible records into a filtered summary —
  // all client-side off the loaded data, no extra API call
  const selectedPharmacy = filters.pharmacy_id
    ? pharmacies.find((p) => String(p.id) === String(filters.pharmacy_id))
    : null;

  const filteredTotals = useMemo(() => {
    if (!filters.pharmacy_id) return null;
    return visibleRecords.reduce(
      (acc, r) => ({
        billed: acc.billed + (Number(r.order_total) || 0),
        paid: acc.paid + (Number(r.paid_amount) || 0),
        debt: acc.debt + (Number(r.debt_amount) || 0),
      }),
      { billed: 0, paid: 0, debt: 0 }
    );
  }, [filters.pharmacy_id, visibleRecords]);

  // totals across every pharmacy (summary is the v_pharmacy_debts rows)
  const totals = summary.reduce(
    (acc, s) => ({
      billed: acc.billed + (Number(s.total_billed) || 0),
      paid: acc.paid + (Number(s.total_paid) || 0),
      debt: acc.debt + (Number(s.total_debt) || 0),
    }),
    { billed: 0, paid: 0, debt: 0 }
  );

  // only pharmacies still in the red can have a manual payment recorded against them
  const debtors = summary.filter((s) => Number(s.total_debt) > 0);

  const hasFilters =
    filters.pharmacy_id ||
    filters.from ||
    filters.to ||
    filters.payment_status ||
    filters.product;

  const inputClass =
    "rounded-lg border border-border px-3 py-2 text-sm outline-none transition-colors duration-150 focus:border-primary focus:ring-2 focus:ring-primary/25";

  return (
    <DashboardLayout role="company" title="Financial Records">
      {/* Summary cards */}
      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <SummaryCard
          icon={Wallet}
          label="Total Billed"
          value={totals.billed}
          tone="blue"
        />
        <SummaryCard
          icon={TrendingUp}
          label="Total Paid"
          value={totals.paid}
          tone="green"
        />
        <SummaryCard
          icon={AlertCircle}
          label="Total Debt"
          value={totals.debt}
          tone="red"
        />
      </div>

      {/* Filtered summary — only while a single pharmacy is selected */}
      {selectedPharmacy && filteredTotals && (
        <div className="mb-5">
          <h2 className="mb-2 px-1 text-sm font-semibold text-text-primary">
            {selectedPharmacy.name} — Summary
          </h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <MiniCard label="Total Billed" value={filteredTotals.billed} />
            <MiniCard label="Paid" value={filteredTotals.paid} />
            <MiniCard label="Debt" value={filteredTotals.debt} />
          </div>
        </div>
      )}

      {/* Outstanding balances — record a payment not tied to a new order */}
      {!loading && debtors.length > 0 && (
        <div className="mb-5 rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-bold text-text-primary">
            Outstanding Balances
          </h2>
          <ul className="divide-y divide-border">
            {debtors.map((d) => (
              <li
                key={d.pharmacy_id}
                className="flex items-center justify-between gap-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-text-primary">
                    {d.pharmacy_name}
                  </p>
                  <p className="text-xs text-text-secondary">
                    Owes{" "}
                    <span className="font-semibold text-red-600">
                      {formatCurrency(d.total_debt)}
                    </span>
                  </p>
                </div>
                <button
                  onClick={() =>
                    setPayTarget({
                      pharmacy_id: d.pharmacy_id,
                      pharmacy_name: d.pharmacy_name,
                      debt: Number(d.total_debt) || 0,
                    })
                  }
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-green-600 px-3 py-2 text-xs font-semibold text-white transition duration-150 hover:bg-green-700 active:scale-[0.98]"
                >
                  <BadgeDollarSign size={15} /> Record Payment
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Filters */}
      <div className="mb-5 flex flex-wrap items-end gap-3 rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-text-secondary">Pharmacy</label>
          <select
            value={filters.pharmacy_id}
            onChange={(e) =>
              setFilters((f) => ({ ...f, pharmacy_id: e.target.value }))
            }
            className={inputClass}
          >
            <option value="">All Pharmacies</option>
            {pharmacies.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-text-secondary">Date range</label>
          <DateRangePicker
            from={filters.from}
            to={filters.to}
            onSelect={({ from, to }) =>
              setFilters((f) => ({
                ...f,
                from: toISODate(from),
                to: toISODate(to),
              }))
            }
            placeholder="From – To"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-text-secondary">
            Payment Status
          </label>
          <select
            value={filters.payment_status}
            onChange={(e) =>
              setFilters((f) => ({ ...f, payment_status: e.target.value }))
            }
            className={inputClass}
          >
            {PAYMENT_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-text-secondary">Product</label>
          <input
            type="text"
            value={filters.product}
            onChange={(e) =>
              setFilters((f) => ({ ...f, product: e.target.value }))
            }
            placeholder="Filter by product..."
            className={inputClass}
          />
        </div>

        {hasFilters && (
          <button
            onClick={() => setFilters(EMPTY_FILTERS)}
            className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-sm font-medium text-text-secondary transition-colors duration-150 hover:bg-slate-50"
          >
            <X size={15} /> Clear
          </button>
        )}
      </div>

      {/* Records table */}
      <div className="overflow-x-auto rounded-xl border border-slate-100 bg-white shadow-sm">
        <table className="w-full min-w-190 text-left text-sm">
          <thead>
            <tr className="border-b border-border bg-slate-50 text-xs uppercase tracking-wide text-text-secondary">
              <th className="px-4 py-3 font-semibold">Order #</th>
              <th className="px-4 py-3 font-semibold">Pharmacy</th>
              <th className="px-4 py-3 font-semibold">Order Date</th>
              <th className="px-4 py-3 font-semibold">Order Total</th>
              <th className="px-4 py-3 font-semibold">Paid</th>
              <th className="px-4 py-3 font-semibold">Debt</th>
              <th className="px-4 py-3 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  {Array.from({ length: COLS }).map((__, j) => (
                    <td key={j} className="px-4 py-3.5">
                      <div className="h-4 w-full animate-pulse rounded bg-slate-200" />
                    </td>
                  ))}
                </tr>
              ))
            ) : visibleRecords.length === 0 ? (
              <tr>
                <td colSpan={COLS} className="px-4 py-16">
                  <div className="flex flex-col items-center justify-center text-center text-text-secondary">
                    <FileX size={40} className="mb-3 text-slate-300" />
                    <p className="text-sm font-medium">No financial records found</p>
                  </div>
                </td>
              </tr>
            ) : (
              visibleRecords.map((r) => {
                const debt = Number(r.debt_amount) || 0;
                const isCredit = debt < 0;
                return (
                  <tr
                    key={r.id}
                    className="border-b border-border last:border-0 transition-colors duration-150 hover:bg-slate-50/60"
                  >
                    <td className="px-4 py-3 font-medium text-text-primary">
                      <div className="flex items-center gap-2">
                        <span>#{r.order_id}</span>
                        {isCredit && (
                          <span
                            title="This order includes a payment toward previous debt"
                            className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700"
                          >
                            Credit
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-text-secondary">{r.pharmacy_name}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-text-secondary">
                      {formatDate(r.order_date)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap font-medium text-text-primary">
                      {formatCurrency(r.order_total)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-green-600">
                      {formatCurrency(r.paid_amount)}
                    </td>
                    <td
                      className={`px-4 py-3 whitespace-nowrap font-medium ${
                        debt > 0
                          ? "text-red-600"
                          : debt < 0
                            ? "text-green-600"
                            : "text-text-secondary"
                      }`}
                    >
                      {formatCurrency(debt)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={r.order_status} />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Ledger note */}
      <p className="mt-2 px-1 text-xs text-text-secondary">
        Negative debt indicates a credit applied to a previous balance.
      </p>

      {payTarget && (
        <RecordPaymentModal
          target={payTarget}
          onClose={() => setPayTarget(null)}
          onRecorded={() => {
            setPayTarget(null);
            load();
          }}
        />
      )}
    </DashboardLayout>
  );
}

const TONES = {
  blue: "border-blue-200 bg-blue-50 text-blue-700",
  green: "border-green-200 bg-green-50 text-green-700",
  red: "border-red-200 bg-red-50 text-red-700",
};

// compact card for the per-pharmacy filtered summary, with a green accent border
function MiniCard({ label, value }) {
  return (
    <div className="rounded-lg border border-slate-100 border-l-4 border-l-primary bg-white p-3 shadow-sm">
      <p className="text-xs font-medium text-text-secondary">{label}</p>
      <p className="mt-0.5 truncate text-lg font-bold text-text-primary">
        {formatCurrency(value)}
      </p>
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value, tone }) {
  return (
    <div className={`flex items-center gap-4 rounded-xl border p-4 shadow-sm ${TONES[tone]}`}>
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-white/70">
        <Icon size={22} />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium opacity-80">{label}</p>
        <p className="truncate text-xl font-bold">{formatCurrency(value)}</p>
      </div>
    </div>
  );
}

// modal for recording a one-off debt payment that isn't tied to a new order. we re-fetch the
// outstanding balance when it opens so the cap is current, then cap the amount both here and on
// the server.
function RecordPaymentModal({ target, onClose, onRecorded }) {
  const [debt, setDebt] = useState(target.debt);
  const [loadingDebt, setLoadingDebt] = useState(true);
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoadingDebt(true);
      try {
        const { data } = await api.get(
          `/company/financial/pharmacy-debt/${target.pharmacy_id}`
        );
        if (active) setDebt(Number(data?.data?.total_debt) || 0);
      } catch {
        // if that fails just keep the summary value we already have in `debt`
      } finally {
        if (active) setLoadingDebt(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [target.pharmacy_id]);

  function handleAmountChange(e) {
    const raw = e.target.value;
    if (raw === "") {
      setAmount("");
      return;
    }
    const num = Number(raw);
    if (Number.isNaN(num)) return;
    if (num > debt) {
      setAmount(String(debt));
    } else {
      setAmount(raw);
    }
  }

  async function submit() {
    const payAmount = Number(amount);
    if (Number.isNaN(payAmount) || payAmount <= 0) {
      toast.error("Enter an amount greater than 0.");
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/company/financial/record-payment", {
        pharmacy_id: target.pharmacy_id,
        amount: payAmount,
      });
      toast.success("Payment recorded.");
      onRecorded();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to record payment.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <h3 className="text-base font-bold text-text-primary">Record Payment</h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-text-secondary transition-colors duration-150 hover:bg-slate-100"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mb-4 space-y-2 rounded-lg border border-slate-100 bg-slate-50 p-3 text-sm">
          <div className="flex justify-between">
            <span className="text-text-secondary">Pharmacy</span>
            <span className="font-medium text-text-primary">
              {target.pharmacy_name}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-secondary">Outstanding debt</span>
            <span className="font-semibold text-red-600">
              {loadingDebt ? "…" : formatCurrency(debt)}
            </span>
          </div>
        </div>

        <label className="mb-1.5 block text-sm font-medium text-text-primary">
          Amount Received
        </label>
        <input
          type="number"
          min={0}
          max={debt}
          value={amount}
          onChange={handleAmountChange}
          placeholder="0.00"
          disabled={loadingDebt || debt <= 0}
          className="w-full rounded-lg border border-border px-3 py-2.5 text-base outline-none focus:ring-2 focus:ring-green-500 disabled:bg-slate-100"
        />
        <p className="mt-1 text-xs text-text-secondary">
          Maximum collectible is {formatCurrency(debt)}.
        </p>

        <div className="mt-5 flex gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2.5 text-sm font-semibold text-text-primary transition duration-150 hover:bg-slate-50 active:scale-[0.98]"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={submitting || loadingDebt || debt <= 0 || !amount}
            className="flex-1 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white transition duration-150 hover:bg-green-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Recording…" : "Record Payment"}
          </button>
        </div>
      </div>
    </div>
  );
}
