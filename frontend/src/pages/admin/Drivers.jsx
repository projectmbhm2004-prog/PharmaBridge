import { useEffect, useMemo, useState } from "react";
import { Users, Star, Search, X } from "lucide-react";
import { toast } from "sonner";

import api from "@/lib/api";
import { formatDate } from "@/lib/utils";
import DashboardLayout from "@/components/shared/DashboardLayout";
import StatusBadge from "@/components/shared/StatusBadge";
import SkeletonRow from "@/components/shared/SkeletonRow";

const COLS = 9; // Driver, Company, Phone, Vehicle, Address, Description, Status, Rating, Joined

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "active", label: "Active" },
  { value: "pending", label: "Pending" },
  { value: "rejected", label: "Rejected" },
  { value: "fired", label: "Fired" },
];

// work out which bucket a driver belongs in: active / pending / rejected / fired
function driverState(d) {
  if (d.is_fired) return "fired";
  if (d.registration_status === "accepted") return "active";
  if (d.registration_status === "rejected") return "rejected";
  return "pending";
}

function avatarUrl(name) {
  const label = encodeURIComponent(name || "Driver");
  return `https://ui-avatars.com/api/?name=${label}&background=166534&color=fff`;
}

export default function Drivers() {
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data } = await api.get("/admin/drivers");
        setDrivers(data?.data ?? []);
      } catch {
        toast.error("Failed to load drivers.");
        setDrivers([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Search by driver/company name + status bucket (bounded dataset).
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return drivers.filter((d) => {
      if (
        q &&
        !(d.full_name || "").toLowerCase().includes(q) &&
        !(d.company_name || "").toLowerCase().includes(q)
      )
        return false;
      if (status && driverState(d) !== status) return false;
      return true;
    });
  }, [drivers, search, status]);

  const hasFilters = search || status;

  return (
    <DashboardLayout role="admin" title="Drivers">
      {/* Filters */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:max-w-xs">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search driver or company…"
            className="w-full rounded-lg border border-border px-3 py-2 pl-9 text-sm outline-none transition-colors duration-150 focus:border-primary focus:ring-2 focus:ring-primary/25"
          />
        </div>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-lg border border-border px-3 py-2 text-sm outline-none transition-colors duration-150 focus:border-primary focus:ring-2 focus:ring-primary/25"
          aria-label="Driver status"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        {hasFilters && (
          <button
            onClick={() => {
              setSearch("");
              setStatus("");
            }}
            className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-sm font-medium text-text-secondary transition-colors duration-150 hover:bg-slate-50"
          >
            <X size={15} /> Clear
          </button>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-100 bg-white shadow-sm">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead>
            <tr className="border-b border-border bg-slate-50 text-xs uppercase tracking-wide text-text-secondary">
              <th className="px-4 py-3 font-semibold">Driver Name</th>
              <th className="px-4 py-3 font-semibold">Company</th>
              <th className="px-4 py-3 font-semibold">Phone</th>
              <th className="px-4 py-3 font-semibold">Vehicle</th>
              <th className="px-4 py-3 font-semibold">Address</th>
              <th className="px-4 py-3 font-semibold">Description</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Rating</th>
              <th className="px-4 py-3 font-semibold">Joined Date</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => <SkeletonRow key={i} cols={COLS} />)
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={COLS} className="px-4 py-16">
                  <div className="flex flex-col items-center justify-center text-center text-text-secondary">
                    <Users size={40} className="mb-3 text-slate-300" />
                    <p className="text-sm font-medium">
                      {hasFilters ? "No drivers match your filters" : "No drivers yet"}
                    </p>
                    {hasFilters && (
                      <button
                        onClick={() => {
                          setSearch("");
                          setStatus("");
                        }}
                        className="mt-2 text-sm font-medium text-primary hover:underline"
                      >
                        Clear filters
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              filtered.map((d) => (
                <tr
                  key={d.id}
                  className="border-b border-border last:border-0 transition-colors duration-150 hover:bg-slate-50/60"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <img
                        src={d.profile_photo_url || avatarUrl(d.full_name)}
                        alt={d.full_name}
                        className="h-9 w-9 shrink-0 rounded-full object-cover"
                        onError={(e) => {
                          e.currentTarget.src = avatarUrl(d.full_name);
                        }}
                      />
                      <span className="font-medium text-text-primary">{d.full_name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-text-secondary">{d.company_name}</td>
                  <td className="px-4 py-3 text-text-secondary">{d.phone || "—"}</td>
                  <td className="px-4 py-3 text-text-secondary">{d.vehicle_info || "—"}</td>
                  <td className="px-4 py-3 text-text-secondary">{d.address || "—"}</td>
                  <td className="px-4 py-3 text-text-secondary">
                    <span className="block max-w-[16rem] truncate" title={d.description || ""}>
                      {d.description || "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={d.is_fired ? "rejected" : d.registration_status} />
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1 text-text-primary">
                      <Star size={14} className="fill-amber-400 text-amber-400" />
                      {Number(d.rating_avg).toFixed(1)}
                      <span className="text-xs text-text-secondary">
                        ({d.rating_count})
                      </span>
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-text-secondary">
                    {formatDate(d.registered_at)}
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
