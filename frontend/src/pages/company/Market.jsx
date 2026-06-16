import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Search, Info, Star, PackageOpen, X } from "lucide-react";
import { toast } from "sonner";

import api from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import DashboardLayout from "@/components/shared/DashboardLayout";

const PLACEHOLDER = "https://placehold.co/400x400/166534/ffffff?text=Product";
const LIMIT = 12;

export default function Market() {
  const [search, setSearch] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [typeId, setTypeId] = useState("");

  const [companies, setCompanies] = useState([]);
  const [types, setTypes] = useState([]);
  const [products, setProducts] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  // grab the company + product-type lists once, just to populate the filter dropdowns
  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/market/companies");
        setCompanies(data?.data ?? []);
      } catch {
        setCompanies([]);
      }
    })();
    (async () => {
      try {
        const { data } = await api.get("/admin/product-types");
        setTypes(data?.data ?? []);
      } catch {
        setTypes([]);
      }
    })();
  }, []);

  // any filter change resets to page 1
  useEffect(() => {
    setPage(1);
  }, [search, companyId, typeId]);

  // load products - page 1 replaces, later pages append. filters are server-side so they
  // apply across the whole catalogue, not just the page we have loaded
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const params = { page, limit: LIMIT };
        if (search.trim()) params.search = search.trim();
        if (companyId) params.company_id = companyId;
        if (typeId) params.type_id = typeId;
        const { data } = await api.get("/company/market", { params });
        if (cancelled) return;
        const list = data?.data?.products ?? [];
        setProducts((prev) => (page === 1 ? list : [...prev, ...list]));
        setTotal(data?.data?.total ?? 0);
      } catch {
        if (!cancelled) {
          toast.error("Failed to load products.");
          if (page === 1) setProducts([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [page, search, companyId, typeId]);

  const canLoadMore = products.length < total;

  const companyName = useMemo(
    () => companies.find((c) => String(c.id) === String(companyId))?.name ?? "",
    [companies, companyId]
  );
  const typeName = useMemo(
    () => types.find((t) => String(t.id) === String(typeId))?.name ?? "",
    [types, typeId]
  );

  // removable chips for whatever filters are on
  const chips = [];
  if (search.trim())
    chips.push({ key: "search", label: `"${search.trim()}"`, clear: () => setSearch("") });
  if (companyId)
    chips.push({ key: "company", label: companyName || "Company", clear: () => setCompanyId("") });
  if (typeId)
    chips.push({ key: "type", label: typeName || "Type", clear: () => setTypeId("") });

  const inputClass =
    "rounded-lg border border-border px-3 py-2 text-sm outline-none transition-colors duration-150 focus:border-primary focus:ring-2 focus:ring-primary/25";

  return (
    <DashboardLayout role="company" title="Marketplace (View Only)">
      {/* Info banner */}
      <div className="mb-5 flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
        <Info size={18} className="mt-0.5 shrink-0" />
        <span>
          You are viewing the marketplace. Companies cannot purchase products.
        </span>
      </div>

      {/* Filters */}
      <div className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
        <div className="flex flex-1 flex-col gap-1 min-w-[180px]">
          <label className="text-xs font-medium text-text-secondary">Search</label>
          <div className="relative">
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search products…"
              className={`${inputClass} w-full pl-9`}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-text-secondary">Company</label>
          <select
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
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
          <label className="text-xs font-medium text-text-secondary">Type</label>
          <select
            value={typeId}
            onChange={(e) => setTypeId(e.target.value)}
            className={inputClass}
          >
            <option value="">All Types</option>
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        {chips.length > 0 && (
          <button
            onClick={() => {
              setSearch("");
              setCompanyId("");
              setTypeId("");
            }}
            className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-sm font-medium text-text-secondary transition-colors duration-150 hover:bg-slate-50"
          >
            <X size={15} /> Clear all
          </button>
        )}
      </div>

      {/* Active filter chips */}
      {chips.length > 0 && (
        <div className="-mt-2 mb-5 flex flex-wrap items-center gap-2">
          {chips.map((chip) => (
            <button
              key={chip.key}
              onClick={chip.clear}
              className="inline-flex items-center gap-1 rounded-full bg-primary-subtle px-3 py-1 text-xs font-medium text-primary transition-colors duration-150 hover:bg-green-100"
            >
              {chip.label}
              <X size={13} />
            </button>
          ))}
        </div>
      )}

      {/* Grid */}
      {loading && page === 1 ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm"
            >
              <div className="aspect-square animate-pulse bg-slate-200" />
              <div className="space-y-2 p-3">
                <div className="h-4 w-3/4 animate-pulse rounded bg-slate-200" />
                <div className="h-4 w-1/2 animate-pulse rounded bg-slate-200" />
              </div>
            </div>
          ))}
        </div>
      ) : products.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-slate-100 bg-white py-20 text-center text-text-secondary shadow-sm">
          <PackageOpen size={44} className="mb-3 text-slate-300" />
          <p className="text-sm font-medium">No products found</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {products.map((p, i) => (
              <ProductCard key={p.id} product={p} index={i} />
            ))}
          </div>

          {canLoadMore && (
            <div className="mt-6 flex justify-center">
              <button
                onClick={() => setPage((prev) => prev + 1)}
                disabled={loading}
                className="rounded-lg border border-border bg-white px-6 py-2.5 text-sm font-semibold text-text-primary transition duration-150 hover:bg-slate-50 active:scale-[0.98] disabled:opacity-60"
              >
                {loading ? "Loading…" : "Load more"}
              </button>
            </div>
          )}
        </>
      )}
    </DashboardLayout>
  );
}

// market product card for the company view - read-only, no add-to-cart here
function ProductCard({ product, index }) {
  const hasOffer = !!product.has_offer && product.offer_price != null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.03, 0.3) }}
      className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm transition duration-150 hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="relative aspect-square overflow-hidden bg-slate-100">
        <img
          src={product.main_image || PLACEHOLDER}
          alt={product.name}
          loading="lazy"
          onError={(e) => {
            e.currentTarget.src = PLACEHOLDER;
          }}
          className="h-full w-full object-cover"
        />
        {product.company_name && (
          <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-xs font-medium text-white backdrop-blur">
            {product.company_name}
          </span>
        )}
        {hasOffer && (
          <span className="absolute right-2 top-2 rounded-full bg-red-600 px-2 py-0.5 text-xs font-bold text-white">
            OFFER
          </span>
        )}
      </div>

      <div className="p-3">
        <h3 className="line-clamp-2 text-sm font-semibold text-text-primary">
          {product.name}
        </h3>

        <div className="mt-1.5 flex items-baseline gap-2">
          {hasOffer ? (
            <>
              <span className="text-sm font-bold text-green-600">
                {formatCurrency(product.offer_price)}
              </span>
              <span className="text-xs text-slate-400 line-through">
                {formatCurrency(product.price)}
              </span>
            </>
          ) : (
            <span className="text-sm font-bold text-text-primary">
              {formatCurrency(product.price)}
            </span>
          )}
        </div>

        <StarRating value={Number(product.rating_avg) || 0} count={product.rating_count} />
      </div>
    </motion.div>
  );
}

// plain read-only 5-star display
function StarRating({ value, count }) {
  return (
    <div className="mt-2 flex items-center gap-1">
      <div className="flex">
        {[1, 2, 3, 4, 5].map((n) => (
          <Star
            key={n}
            size={14}
            className={
              n <= Math.round(value)
                ? "fill-amber-400 text-amber-400"
                : "fill-slate-200 text-slate-200"
            }
          />
        ))}
      </div>
      <span className="text-xs text-text-secondary">
        {value > 0 ? value.toFixed(1) : "—"}
        {count != null && ` (${count})`}
      </span>
    </div>
  );
}
