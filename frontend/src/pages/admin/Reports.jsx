import { useEffect, useState } from "react";
import {
  ShoppingBag,
  DollarSign,
  CircleAlert,
  Building2,
  Hospital,
  Inbox,
  Star,
  TrendingUp,
  TrendingDown,
  X,
} from "lucide-react";
import { toast } from "sonner";

import api from "@/lib/api";
import { formatDate, formatCurrency, toISODate } from "@/lib/utils";
import DashboardLayout from "@/components/shared/DashboardLayout";
import StatusBadge from "@/components/shared/StatusBadge";
import DateRangePicker from "@/components/ui/date-range-picker";

const COLS = 6; // Order ID, Pharmacy, Company, Amount, Status, Date
const EMPTY_FILTERS = { from: "", to: "" };

export default function Reports() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    total_orders: 0,
    completed_orders: 0,
    total_revenue: 0,
    total_debt: 0,
    pending_orders: 0,
    total_companies: 0,
    total_pharmacies: 0,
  });
  const [topProducts, setTopProducts] = useState([]);
  const [topDebtors, setTopDebtors] = useState([]);
  const [topCompanies, setTopCompanies] = useState([]);

  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [recentOrders, setRecentOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(true);

  // the whole-dataset numbers (KPIs, leaderboards, top products) don't change with the Recent
  // Orders date filter, so we just load them once
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [statsRes, topRes, debtorsRes, companiesRes] = await Promise.all([
          api.get("/admin/stats"),
          api.get("/market/products/top5"),
          api.get("/admin/top-debtors"),
          api.get("/admin/top-companies"),
        ]);

        setStats(statsRes?.data?.data ?? {});
        setTopProducts(topRes?.data?.data ?? []);
        setTopDebtors(debtorsRes?.data?.data ?? []);
        setTopCompanies(companiesRes?.data?.data ?? []);
      } catch {
        toast.error("Failed to load reports.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Recent Orders reloads whenever the date range changes. we push `to` out to end-of-day so
  // the selected day is actually included - the API does created_at <= bound and the timestamps
  // carry a time, otherwise the last day gets dropped
  useEffect(() => {
    (async () => {
      setOrdersLoading(true);
      try {
        const params = { limit: 10 };
        if (filters.from) params.from = filters.from;
        if (filters.to) params.to = `${filters.to} 23:59:59`;

        const { data } = await api.get("/admin/orders", { params });
        setRecentOrders(data?.data?.orders ?? []);
      } catch {
        toast.error("Failed to load recent orders.");
        setRecentOrders([]);
      } finally {
        setOrdersLoading(false);
      }
    })();
  }, [filters]);

  const num = (v) => (Number(v) || 0).toLocaleString("en-US");
  const cards = [
    {
      label: "Total Orders",
      value: num(stats.total_orders),
      icon: ShoppingBag,
      tint: "bg-blue-50 text-blue-600",
    },
    {
      label: "Pending Orders",
      value: num(stats.pending_orders),
      icon: Inbox,
      tint: "bg-amber-50 text-amber-600",
    },
    {
      label: "Total Revenue",
      value: formatCurrency(stats.total_revenue),
      icon: DollarSign,
      tint: "bg-green-50 text-green-600",
    },
    {
      label: "Total Debt",
      value: formatCurrency(stats.total_debt),
      icon: CircleAlert,
      tint: "bg-red-50 text-red-600",
    },
    {
      label: "Total Companies",
      value: num(stats.total_companies),
      icon: Building2,
      tint: "bg-indigo-50 text-indigo-600",
    },
    {
      label: "Total Pharmacies",
      value: num(stats.total_pharmacies),
      icon: Hospital,
      tint: "bg-purple-50 text-purple-600",
    },
  ];

  const hasFilters = filters.from || filters.to;
  const inputClass =
    "rounded-lg border border-border px-3 py-2 text-sm outline-none transition-colors duration-150 focus:border-primary focus:ring-2 focus:ring-primary/25";

  return (
    <DashboardLayout role="admin" title="Platform Reports">
      {/* Summary cards */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {loading
          ? Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-24 animate-pulse rounded-xl border border-slate-100 bg-white shadow-sm"
              />
            ))
          : cards.map((c) => (
              <div
                key={c.label}
                className="flex items-center gap-4 rounded-xl border border-slate-100 bg-white p-5 shadow-sm transition-shadow duration-200 hover:shadow-md"
              >
                <div className={`rounded-xl p-3 ${c.tint}`}>
                  <c.icon size={22} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-text-secondary">
                    {c.label}
                  </p>
                  <p className="truncate text-xl font-bold text-text-primary">
                    {c.value}
                  </p>
                </div>
              </div>
            ))}
      </div>

      {/* the two money leaderboards - who owes us most vs. who brings in most */}
      <div className="mb-8 grid gap-4 lg:grid-cols-2">
        <Leaderboard
          title="Top 5 Pharmacies by Debt"
          icon={TrendingDown}
          iconTint="bg-red-50 text-red-600"
          loading={loading}
          items={topDebtors}
          empty="No outstanding balances"
          renderItem={(d, i) => (
            <LeaderRow
              key={d.pharmacy_id}
              rank={i + 1}
              name={d.pharmacy_name}
              value={formatCurrency(d.total_debt)}
              valueClass="text-red-600"
            />
          )}
        />

        <Leaderboard
          title="Top 5 Companies by Revenue"
          icon={TrendingUp}
          iconTint="bg-green-50 text-green-600"
          loading={loading}
          items={topCompanies}
          empty="No revenue recorded yet"
          renderItem={(c, i) => (
            <LeaderRow
              key={c.company_id}
              rank={i + 1}
              name={c.company_name}
              value={formatCurrency(c.total_revenue)}
              valueClass="text-green-600"
              sub={`${num(c.total_orders)} order${c.total_orders === 1 ? "" : "s"}`}
            />
          )}
        />
      </div>

      {/* Top 5 products */}
      <h2 className="mb-3 text-base font-bold text-text-primary">
        Top 5 Products
      </h2>
      {loading ? (
        <div className="mb-8 h-24 animate-pulse rounded-xl border border-slate-100 bg-white shadow-sm" />
      ) : topProducts.length === 0 ? (
        <div className="mb-8 flex flex-col items-center justify-center rounded-xl border border-slate-100 bg-white py-10 text-center text-text-secondary shadow-sm">
          <Star size={36} className="mb-2 text-slate-300" />
          <p className="text-sm font-medium">No product data yet</p>
        </div>
      ) : (
        <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {topProducts.map((p, i) => (
            <div
              key={p.id}
              className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm transition-shadow duration-200 hover:shadow-md"
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary-subtle text-xs font-bold text-primary">
                  {i + 1}
                </span>
                <span className="inline-flex items-center gap-1 text-xs text-text-secondary">
                  <Star size={12} className="fill-amber-400 text-amber-400" />
                  {Number(p.rating_avg).toFixed(1)}
                </span>
              </div>
              <p className="truncate font-semibold text-text-primary" title={p.name}>
                {p.name}
              </p>
              <p className="truncate text-xs text-text-secondary">
                {p.company_name}
              </p>
              <p className="mt-1 text-xs font-medium text-primary">
                {p.total_orders} orders
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Recent orders */}
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-base font-bold text-text-primary">Recent Orders</h2>

        <div className="flex flex-wrap items-end gap-3">
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
          {hasFilters && (
            <button
              onClick={() => setFilters(EMPTY_FILTERS)}
              className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-sm font-medium text-text-secondary transition-colors duration-150 hover:bg-slate-50"
            >
              <X size={15} /> Clear
            </button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-100 bg-white shadow-sm">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-border bg-slate-50 text-xs uppercase tracking-wide text-text-secondary">
              <th className="px-4 py-3 font-semibold">Order ID</th>
              <th className="px-4 py-3 font-semibold">Pharmacy</th>
              <th className="px-4 py-3 font-semibold">Company</th>
              <th className="px-4 py-3 font-semibold">Amount</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Date</th>
            </tr>
          </thead>
          <tbody>
            {ordersLoading ? (
              <tr>
                <td colSpan={COLS} className="px-4 py-10 text-center text-text-secondary">
                  Loading…
                </td>
              </tr>
            ) : recentOrders.length === 0 ? (
              <tr>
                <td colSpan={COLS} className="px-4 py-16">
                  <div className="flex flex-col items-center justify-center text-center text-text-secondary">
                    <Inbox size={40} className="mb-3 text-slate-300" />
                    <p className="text-sm font-medium">No orders found</p>
                  </div>
                </td>
              </tr>
            ) : (
              recentOrders.map((o) => (
                <tr
                  key={o.id}
                  className="border-b border-border last:border-0 transition-colors duration-150 hover:bg-slate-50/60"
                >
                  <td className="px-4 py-3 font-medium text-text-primary">#{o.id}</td>
                  <td className="px-4 py-3 text-text-secondary">{o.pharmacy_name}</td>
                  <td className="px-4 py-3 text-text-secondary">{o.company_name}</td>
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
    </DashboardLayout>
  );
}

// ranked card list used for both the debtors and the companies boards, handles loading/empty
function Leaderboard({ title, icon: Icon, iconTint, loading, items, empty, renderItem }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <span className={`rounded-lg p-2 ${iconTint}`}>
          <Icon size={18} />
        </span>
        <h2 className="text-sm font-bold text-text-primary">{title}</h2>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-slate-100" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center text-text-secondary">
          <Inbox size={32} className="mb-2 text-slate-300" />
          <p className="text-sm font-medium">{empty}</p>
        </div>
      ) : (
        <ol className="space-y-1.5">{items.map(renderItem)}</ol>
      )}
    </div>
  );
}

function LeaderRow({ rank, name, value, valueClass, sub }) {
  return (
    <li className="flex items-center gap-3 rounded-lg border border-slate-100 px-3 py-2.5 transition-colors duration-150 hover:bg-slate-50/70">
      <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-subtle text-xs font-bold text-primary">
        {rank}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-text-primary" title={name}>
          {name}
        </p>
        {sub && <p className="text-xs text-text-secondary">{sub}</p>}
      </div>
      <span className={`shrink-0 text-sm font-bold ${valueClass}`}>{value}</span>
    </li>
  );
}
