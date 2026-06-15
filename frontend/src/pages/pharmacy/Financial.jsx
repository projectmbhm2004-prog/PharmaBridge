import { useEffect, useMemo, useState } from "react";
import { Wallet, TrendingUp, AlertCircle, FileX, X } from "lucide-react";
import { toast } from "sonner";

import api from "@/lib/api";
import { formatCurrency, formatDate, toISODate } from "@/lib/utils";
import DashboardLayout from "@/components/shared/DashboardLayout";
import StatusBadge from "@/components/shared/StatusBadge";
import DateRangePicker from "@/components/ui/date-range-picker";

const COLS = 7;
const EMPTY_FILTERS = { company_id: "", from: "", to: "", payment_status: "" };

const PAYMENT_STATUSES = [
  { value: "", label: "All" },
  { value: "paid", label: "Paid" },
  { value: "partial", label: "Partial" },
  { value: "unpaid", label: "Unpaid" },
];

// Classify a record by how much of the bill has been settled. Credit lines
// (debt < 0) count as fully paid. Mirrors the company-side semantics so a
// pharmacy and its supplier read the same ledger the same way.
function paymentStatusOf(r) {
  const debt = Number(r.debt_amount) || 0;
  const paid = Number(r.paid_amount) || 0;
  if (debt <= 0) return "paid";
  if (paid > 0) return "partial";
  return "unpaid";
}

export default function Financial() {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [records, setRecords] = useState([]);
  const [summary, setSummary] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data } = await api.get("/pharmacy/financial");
        setRecords(data?.data?.records ?? []);
        setSummary(data?.data?.summary ?? []);
      } catch {
        toast.error("Failed to load financial records.");
        setRecords([]);
        setSummary([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // summary = v_pharmacy_debts rows (one per company dealt with).
  const totals = summary.reduce(
    (acc, s) => ({
      spent: acc.spent + (Number(s.total_billed) || 0),
      paid: acc.paid + (Number(s.total_paid) || 0),
      debt: acc.debt + (Number(s.total_debt) || 0),
    }),
    { spent: 0, paid: 0, debt: 0 }
  );

  // Supplier list for the dropdown — built from the full (unfiltered) result
  // set so it doesn't shrink as the user narrows the records.
  const companies = useMemo(() => {
    const map = new Map();
    for (const r of records) {
      if (r.company_id && !map.has(r.company_id)) {
        map.set(r.company_id, r.company_name);
      }
    }
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [records]);

  // Client-side filtering (the API call is intentionally left untouched).
  const visibleRecords = useMemo(() => {
    return records.filter((r) => {
      if (filters.company_id && String(r.company_id) !== String(filters.company_id)) {
        return false;
      }
      if (filters.from && r.order_date && r.order_date < filters.from) {
        return false;
      }
      // `to` is an inclusive end-of-day bound; order_date carries a time
      // component, so compare against the date prefix only.
      if (filters.to && r.order_date && String(r.order_date).slice(0, 10) > filters.to) {
        return false;
      }
      if (filters.payment_status && paymentStatusOf(r) !== filters.payment_status) {
        return false;
      }
      return true;
    });
  }, [records, filters]);

  const hasFilters =
    filters.company_id || filters.from || filters.to || filters.payment_status;

  const inputClass =
    "rounded-lg border border-border px-3 py-2 text-sm outline-none transition-colors duration-150 focus:border-primary focus:ring-2 focus:ring-primary/25";

  return (
    <DashboardLayout role="pharmacy" title="Financial Records">
      {/* Summary cards */}
      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <SummaryCard icon={Wallet} label="Total Spent" value={totals.spent} tone="blue" />
        <SummaryCard icon={TrendingUp} label="Total Paid" value={totals.paid} tone="green" />
        <SummaryCard icon={AlertCircle} label="Total Debt" value={totals.debt} tone="red" />
      </div>

      {/* Filters */}
      <div className="mb-5 flex flex-wrap items-end gap-3 rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-text-secondary">Company</label>
          <select
            value={filters.company_id}
            onChange={(e) =>
              setFilters((f) => ({ ...f, company_id: e.target.value }))
            }
            className={inputClass}
          >
            <option value="">All Companies</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
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
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead>
            <tr className="border-b border-border bg-slate-50 text-xs uppercase tracking-wide text-text-secondary">
              <th className="px-4 py-3 font-semibold">Order #</th>
              <th className="px-4 py-3 font-semibold">Company</th>
              <th className="px-4 py-3 font-semibold">Date</th>
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
                    <td className="px-4 py-3 text-text-secondary">{r.company_name}</td>
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
    </DashboardLayout>
  );
}

const TONES = {
  blue: "border-blue-200 bg-blue-50 text-blue-700",
  green: "border-green-200 bg-green-50 text-green-700",
  red: "border-red-200 bg-red-50 text-red-700",
};

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
