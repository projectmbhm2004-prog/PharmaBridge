import { useEffect, useState } from "react";
import {
  Inbox,
  Search,
  ChevronLeft,
  ChevronRight,
  X,
  Printer,
} from "lucide-react";
import { toast } from "sonner";

import api from "@/lib/api";
import { formatDate, formatCurrency, getStatusLabel, toISODate } from "@/lib/utils";
import DashboardLayout from "@/components/shared/DashboardLayout";
import StatusBadge from "@/components/shared/StatusBadge";
import SkeletonRow from "@/components/shared/SkeletonRow";
import PrintReport from "@/components/shared/PrintReport";
import DateRangePicker from "@/components/ui/date-range-picker";

const STATUSES = [
  "pending",
  "accepted",
  "rejected",
  "picked_up",
  "on_the_way",
  "arrived",
  "delivered",
  "partially_delivered",
];

const COLS = 7; // Order ID, Pharmacy, Company, Driver, Amount, Status, Date
const LIMIT = 20;

const EMPTY_FILTERS = {
  status: "",
  from: "",
  to: "",
  search: "",
  pharmacy: "",
  company: "",
  product: "",
};

export default function Orders() {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [orders, setOrders] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  // product search is debounced so we don't fire a request on every keystroke
  const [debouncedProduct, setDebouncedProduct] = useState("");

  async function load() {
    setLoading(true);
    try {
      // All filters are server-side so they apply across the whole dataset,
      // not just the current page.
      const params = { page, limit: LIMIT };
      if (filters.status) params.status = filters.status;
      if (filters.from) params.from = filters.from;
      if (filters.to) params.to = filters.to;
      if (filters.search.trim()) params.search = filters.search.trim();
      if (filters.pharmacy.trim()) params.pharmacy = filters.pharmacy.trim();
      if (filters.company.trim()) params.company = filters.company.trim();
      if (debouncedProduct) params.product_name = debouncedProduct;
      const { data } = await api.get("/admin/orders", { params });
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
  }, [
    page,
    filters.status,
    filters.from,
    filters.to,
    filters.search,
    filters.pharmacy,
    filters.company,
    debouncedProduct,
  ]);

  // debounce the product input 400ms before it becomes a server-side filter
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedProduct(filters.product.trim());
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [filters.product]);

  function update(key, value) {
    setPage(1);
    setFilters((f) => ({ ...f, [key]: value }));
  }

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));
  const hasFilters =
    filters.status ||
    filters.from ||
    filters.to ||
    filters.search ||
    filters.pharmacy ||
    filters.company ||
    filters.product;

  // Active filter chips (removable).
  const chips = [];
  if (filters.status)
    chips.push({ key: "status", label: getStatusLabel(filters.status) });
  if (filters.from) chips.push({ key: "from", label: `From ${filters.from}` });
  if (filters.to) chips.push({ key: "to", label: `To ${filters.to}` });
  if (filters.search)
    chips.push({ key: "search", label: `Order #${filters.search}` });
  if (filters.pharmacy)
    chips.push({ key: "pharmacy", label: `Pharmacy: ${filters.pharmacy}` });
  if (filters.company)
    chips.push({ key: "company", label: `Company: ${filters.company}` });
  if (filters.product)
    chips.push({ key: "product", label: `Product: ${filters.product}` });

  const inputClass =
    "w-full rounded-lg border border-border px-3 py-2 text-sm outline-none transition-colors duration-150 focus:border-primary focus:ring-2 focus:ring-primary/25";

  // every filter is listed in the printed report, with an explicit "All" default
  const dateRange =
    filters.from || filters.to
      ? [filters.from && `From ${filters.from}`, filters.to && `to ${filters.to}`]
          .filter(Boolean)
          .join(" ")
      : "All dates";
  const printFilters = [
    { label: "Status", value: filters.status ? getStatusLabel(filters.status) : "All" },
    { label: "Date Range", value: dateRange },
    { label: "Pharmacy", value: filters.pharmacy.trim() || "All" },
    { label: "Company", value: filters.company.trim() || "All" },
    { label: "Product", value: filters.product.trim() || "All" },
    { label: "Order ID", value: filters.search.trim() || "All" },
  ];

  // summary line is computed from the rows currently loaded (the visible page)
  const visibleAmount = orders.reduce(
    (sum, o) => sum + (Number(o.total_amount) || 0),
    0
  );

  return (
    <DashboardLayout role="admin" title="All Orders">
      <div className="financial-print-area">
      {/* Screen toolbar */}
      <div className="no-print mb-5 flex items-center justify-end">
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-4 py-2 text-sm font-semibold text-text-primary shadow-sm transition-colors duration-150 hover:bg-slate-50 active:scale-[0.98]"
        >
          <Printer size={16} /> Print Report
        </button>
      </div>

      <div className="no-print">
      {/* Filters bar */}
      <div className="mb-5 flex flex-wrap items-end gap-3 rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
        <div className="flex w-full flex-col gap-1 sm:w-auto">
          <label className="text-xs font-medium text-text-secondary">Status</label>
          <select
            value={filters.status}
            onChange={(e) => update("status", e.target.value)}
            className={inputClass}
          >
            <option value="">All</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {getStatusLabel(s)}
              </option>
            ))}
          </select>
        </div>

        <div className="flex w-full flex-col gap-1 sm:w-auto">
          <label className="text-xs font-medium text-text-secondary">Date range</label>
          <DateRangePicker
            from={filters.from}
            to={filters.to}
            onSelect={({ from, to }) => {
              setPage(1);
              setFilters((f) => ({
                ...f,
                from: toISODate(from),
                to: toISODate(to),
              }));
            }}
            placeholder="From – To"
          />
        </div>

        <div className="flex w-full flex-col gap-1 sm:w-auto">
          <label className="text-xs font-medium text-text-secondary">Order ID</label>
          <div className="relative">
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary"
            />
            <input
              type="text"
              value={filters.search}
              onChange={(e) => update("search", e.target.value)}
              placeholder="Search ID…"
              className={`${inputClass} pl-9`}
            />
          </div>
        </div>

        <div className="flex w-full flex-col gap-1 sm:w-auto">
          <label className="text-xs font-medium text-text-secondary">Pharmacy</label>
          <div className="relative">
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary"
            />
            <input
              type="text"
              value={filters.pharmacy}
              onChange={(e) => update("pharmacy", e.target.value)}
              placeholder="Pharmacy name…"
              className={`${inputClass} pl-9`}
            />
          </div>
        </div>

        <div className="flex w-full flex-col gap-1 sm:w-auto">
          <label className="text-xs font-medium text-text-secondary">Company</label>
          <div className="relative">
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary"
            />
            <input
              type="text"
              value={filters.company}
              onChange={(e) => update("company", e.target.value)}
              placeholder="Company name…"
              className={`${inputClass} pl-9`}
            />
          </div>
        </div>

        <div className="flex w-full flex-col gap-1 sm:w-auto">
          <label className="text-xs font-medium text-text-secondary">Product</label>
          <div className="relative">
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary"
            />
            <input
              type="text"
              value={filters.product}
              onChange={(e) =>
                setFilters((f) => ({ ...f, product: e.target.value }))
              }
              placeholder="Filter by product…"
              className={`${inputClass} pl-9`}
            />
          </div>
        </div>

        {hasFilters && (
          <button
            onClick={() => {
              setPage(1);
              setDebouncedProduct("");
              setFilters(EMPTY_FILTERS);
            }}
            className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-sm font-medium text-text-secondary transition-colors duration-150 hover:bg-slate-50"
          >
            <X size={15} /> Clear filters
          </button>
        )}
      </div>

      {/* Active filter chips */}
      {chips.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {chips.map((chip) => (
            <button
              key={chip.key}
              onClick={() => update(chip.key, "")}
              className="inline-flex items-center gap-1 rounded-full bg-primary-subtle px-3 py-1 text-xs font-medium text-primary transition-colors duration-150 hover:bg-green-100"
            >
              {chip.label}
              <X size={13} />
            </button>
          ))}
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-100 bg-white shadow-sm">
        <table className="w-full min-w-205 text-left text-sm">
          <thead>
            <tr className="border-b border-border bg-slate-50 text-xs uppercase tracking-wide text-text-secondary">
              <th className="px-4 py-3 font-semibold">Order ID</th>
              <th className="px-4 py-3 font-semibold">Pharmacy</th>
              <th className="px-4 py-3 font-semibold">Company</th>
              <th className="px-4 py-3 font-semibold">Driver</th>
              <th className="px-4 py-3 font-semibold">Amount</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Date</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => <SkeletonRow key={i} cols={COLS} />)
            ) : orders.length === 0 ? (
              <tr>
                <td colSpan={COLS} className="px-4 py-16">
                  <div className="flex flex-col items-center justify-center text-center text-text-secondary">
                    <Inbox size={40} className="mb-3 text-slate-300" />
                    <p className="text-sm font-medium">No orders found</p>
                  </div>
                </td>
              </tr>
            ) : (
              orders.map((o) => (
                <tr
                  key={o.id}
                  className="border-b border-border last:border-0 transition-colors duration-150 hover:bg-slate-50/60"
                >
                  <td className="px-4 py-3 font-medium text-text-primary">#{o.id}</td>
                  <td className="px-4 py-3 text-text-secondary">{o.pharmacy_name}</td>
                  <td className="px-4 py-3 text-text-secondary">{o.company_name}</td>
                  <td className="px-4 py-3 text-text-secondary">{o.driver_name || "—"}</td>
                  <td className="px-4 py-3 whitespace-nowrap font-medium text-text-primary">
                    {formatCurrency(o.total_amount)}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={o.status} />
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-text-secondary">
                    {formatDate(o.created_at)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {!loading && total > 0 && (
        <div className="mt-4 flex items-center justify-between text-sm text-text-secondary">
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
      </div>

      {/* Print-only report */}
      <PrintReport title="Orders Report" filters={printFilters}>
        <div className="print-summary-line">
          Showing <b>{orders.length}</b> order{orders.length === 1 ? "" : "s"}
          {totalPages > 1 ? ` (page ${page} of ${totalPages})` : ""} &nbsp;|&nbsp;
          Total Amount: <b>{formatCurrency(visibleAmount)}</b>
        </div>

        <table className="print-table">
          <thead>
            <tr>
              <th>Order #</th>
              <th>Pharmacy</th>
              <th>Company</th>
              <th>Driver</th>
              <th className="print-num">Amount</th>
              <th>Status</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id}>
                <td>#{o.id}</td>
                <td>{o.pharmacy_name}</td>
                <td>{o.company_name}</td>
                <td>{o.driver_name || "—"}</td>
                <td className="print-num">{formatCurrency(o.total_amount)}</td>
                <td>
                  <span className="print-status">{getStatusLabel(o.status)}</span>
                </td>
                <td>{formatDate(o.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </PrintReport>
      </div>
    </DashboardLayout>
  );
}
