import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Search,
  Trophy,
  Tag,
  ChevronLeft,
  ChevronRight,
  Star,
  ShoppingCart,
  PackageOpen,
  X,
} from "lucide-react";
import { toast } from "sonner";

import api from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import useCart from "@/hooks/useCart";
import DashboardLayout from "@/components/shared/DashboardLayout";
import CountdownTimer from "@/components/market/CountdownTimer";

const PLACEHOLDER = "https://placehold.co/400x400/166534/ffffff?text=Product";
const LIMIT = 12;

const SORT_OPTIONS = [
  { value: "newest", label: "Newest" },
  { value: "price_asc", label: "Price: Low to High" },
  { value: "price_desc", label: "Price: High to Low" },
  { value: "rating", label: "Top Rated" },
  { value: "popular", label: "Most Popular" },
];

const inputClass =
  "rounded-lg border border-border px-3 py-2 text-sm outline-none transition-colors duration-150 focus:border-primary focus:ring-2 focus:ring-primary/25";

export default function Market() {
  const navigate = useNavigate();
  const { addItem } = useCart();

  // Filters
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState(""); // debounced
  const [companyId, setCompanyId] = useState("");
  const [sort, setSort] = useState("newest");
  // Price range — typed inputs are debounced into the applied values.
  const [minInput, setMinInput] = useState("");
  const [maxInput, setMaxInput] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");

  // Data
  const [companies, setCompanies] = useState([]);
  const [top5, setTop5] = useState([]);
  const [offers, setOffers] = useState([]);
  const [products, setProducts] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  // Add-to-cart in-flight tracking (per product)
  const [addingId, setAddingId] = useState(null);

  // Debounce the search input (400ms).
  useEffect(() => {
    const id = setTimeout(() => setSearch(searchInput.trim()), 400);
    return () => clearTimeout(id);
  }, [searchInput]);

  // Debounce the price range (400ms) so typing doesn't refetch on every keystroke.
  useEffect(() => {
    const id = setTimeout(() => {
      setMinPrice(minInput.trim());
      setMaxPrice(maxInput.trim());
    }, 400);
    return () => clearTimeout(id);
  }, [minInput, maxInput]);

  // One-time loads: companies, top 5, offers.
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
        const { data } = await api.get("/market/products/top5");
        setTop5(data?.data ?? []);
      } catch {
        setTop5([]);
      }
    })();
    (async () => {
      try {
        const { data } = await api.get("/market/products/offers");
        setOffers(data?.data ?? []);
      } catch {
        setOffers([]);
      }
    })();
  }, []);

  // Reset to page 1 whenever a server-side filter changes.
  useEffect(() => {
    setPage(1);
  }, [search, companyId, sort, minPrice, maxPrice]);

  // Fetch products (page 1 replaces, later pages append).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const params = { page, limit: LIMIT, sort };
        if (search) params.search = search;
        if (companyId) params.company_id = companyId;
        if (minPrice !== "") params.min_price = minPrice;
        if (maxPrice !== "") params.max_price = maxPrice;
        const { data } = await api.get("/market/products", { params });
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
  }, [page, search, companyId, sort, minPrice, maxPrice]);

  const companyName = useMemo(() => {
    const match = companies.find((c) => String(c.id) === String(companyId));
    return match?.name ?? "";
  }, [companies, companyId]);

  const canLoadMore = products.length < total;

  // ── Add to cart ──────────────────────────────────────────────
  // Multi-company cart: adding always succeeds unless the backend rejects it
  // (stock / availability), which addItem surfaces as a toast.
  async function addToCart(product) {
    setAddingId(product.id);
    const res = await addItem(product.id, 1);
    if (res.ok) toast.success("Added to cart");
    setAddingId(null);
  }

  // Active filter chips
  const chips = [];
  if (search) chips.push({ key: "search", label: `"${search}"`, clear: () => { setSearchInput(""); setSearch(""); } });
  if (companyId) chips.push({ key: "company", label: companyName || "Company", clear: () => setCompanyId("") });
  if (minPrice !== "" || maxPrice !== "") {
    const label =
      minPrice !== "" && maxPrice !== ""
        ? `${minPrice}–${maxPrice}`
        : minPrice !== ""
          ? `≥ ${minPrice}`
          : `≤ ${maxPrice}`;
    chips.push({
      key: "price",
      label,
      clear: () => {
        setMinInput("");
        setMaxInput("");
        setMinPrice("");
        setMaxPrice("");
      },
    });
  }
  if (sort !== "newest") {
    const label = SORT_OPTIONS.find((s) => s.value === sort)?.label;
    chips.push({ key: "sort", label, clear: () => setSort("newest") });
  }

  return (
    <DashboardLayout role="pharmacy" title="Marketplace">
      {/* Search + filters bar (sticky) */}
      <div className="sticky top-16 z-10 -mx-4 mb-6 border-b border-border bg-background/80 px-4 py-3 backdrop-blur md:-mx-6 md:px-6">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-1 flex-col gap-1 min-w-[200px]">
            <label className="text-xs font-medium text-text-secondary">Search</label>
            <div className="relative">
              <Search
                size={16}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary"
              />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
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
            <label className="text-xs font-medium text-text-secondary">Price range</label>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min="0"
                inputMode="decimal"
                value={minInput}
                onChange={(e) => setMinInput(e.target.value)}
                placeholder="Min"
                className={`${inputClass} w-24`}
              />
              <span className="text-text-secondary">–</span>
              <input
                type="number"
                min="0"
                inputMode="decimal"
                value={maxInput}
                onChange={(e) => setMaxInput(e.target.value)}
                placeholder="Max"
                className={`${inputClass} w-24`}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-text-secondary">Sort by</label>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className={inputClass}
            >
              {SORT_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {chips.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
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
      </div>

      {/* Top 5 most ordered */}
      {top5.length > 0 && (
        <Carousel
          title="Top 5 Most Ordered"
          icon={Trophy}
          iconClass="text-amber-500"
        >
          {top5.map((p) => (
            <MiniCard key={p.id} product={p} onClick={() => navigate(`/pharmacy/product/${p.id}`)} />
          ))}
        </Carousel>
      )}

      {/* Current offers */}
      {offers.length > 0 && (
        <Carousel
          title="Current Offers"
          subtitle="Limited time"
          icon={Tag}
          iconClass="text-red-500"
        >
          {offers.map((p) => (
            <OfferCard
              key={p.id}
              product={p}
              onClick={() => navigate(`/pharmacy/product/${p.id}`)}
            />
          ))}
        </Carousel>
      )}

      {/* Browse by company tabs */}
      <div className="mb-5">
        <div className="flex flex-wrap gap-2">
          <PillTab active={!companyId} onClick={() => setCompanyId("")}>
            All
          </PillTab>
          {companies.map((c) => (
            <PillTab
              key={c.id}
              active={String(companyId) === String(c.id)}
              onClick={() => setCompanyId(String(c.id))}
            >
              {c.name}
            </PillTab>
          ))}
        </div>
      </div>

      {/* All products grid */}
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
              <ProductCard
                key={p.id}
                product={p}
                index={i}
                adding={addingId === p.id}
                onAdd={() => addToCart(p)}
                onOpen={() => navigate(`/pharmacy/product/${p.id}`)}
              />
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

/** Horizontal scroller with a header and prev/next arrows. */
function Carousel({ title, subtitle, icon: Icon, iconClass, children }) {
  const scrollerRef = useRef(null);

  function scrollBy(dir) {
    const el = scrollerRef.current;
    if (el) el.scrollBy({ left: dir * 320, behavior: "smooth" });
  }

  return (
    <section className="mb-8">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {Icon && <Icon size={20} className={iconClass} />}
          <h2 className="text-base font-bold text-text-primary">{title}</h2>
          {subtitle && (
            <span className="text-xs font-medium text-red-500">{subtitle}</span>
          )}
        </div>
        <div className="hidden gap-2 sm:flex">
          <button
            onClick={() => scrollBy(-1)}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-white text-text-secondary transition-colors duration-150 hover:bg-slate-50"
            aria-label="Previous"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            onClick={() => scrollBy(1)}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-white text-text-secondary transition-colors duration-150 hover:bg-slate-50"
            aria-label="Next"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
      <div
        ref={scrollerRef}
        className="flex gap-4 overflow-x-auto scroll-smooth pb-2 [scrollbar-width:thin]"
      >
        {children}
      </div>
    </section>
  );
}

/** Compact carousel card (top 5). */
function MiniCard({ product, onClick }) {
  const hasOffer = !!product.has_offer && product.offer_price != null;
  return (
    <button
      onClick={onClick}
      className="w-44 shrink-0 overflow-hidden rounded-xl border border-slate-100 bg-white text-left shadow-sm transition duration-150 hover:-translate-y-0.5 hover:shadow-md"
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
          <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur">
            {product.company_name}
          </span>
        )}
      </div>
      <div className="p-2.5">
        <h3 className="line-clamp-1 text-sm font-semibold text-text-primary">
          {product.name}
        </h3>
        <div className="mt-1 flex items-baseline gap-2">
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
        <Stars value={Number(product.rating_avg) || 0} count={product.rating_count} />
      </div>
    </button>
  );
}

/** Carousel offer card with countdown. */
function OfferCard({ product, onClick }) {
  return (
    <button
      onClick={onClick}
      className="w-52 shrink-0 overflow-hidden rounded-xl border border-red-100 bg-white text-left shadow-sm transition duration-150 hover:-translate-y-0.5 hover:shadow-md"
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
        <span className="absolute right-2 top-2 rounded-full bg-red-600 px-2 py-0.5 text-xs font-bold text-white">
          OFFER
        </span>
      </div>
      <div className="p-3">
        <h3 className="line-clamp-1 text-sm font-semibold text-text-primary">
          {product.name}
        </h3>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-sm font-bold text-green-600">
            {formatCurrency(product.offer_price)}
          </span>
          <span className="text-xs text-slate-400 line-through">
            {formatCurrency(product.price)}
          </span>
        </div>
        <div className="mt-2">
          <CountdownTimer offerEndsAt={product.offer_ends_at} />
        </div>
      </div>
    </button>
  );
}

/** Main grid product card with add-to-cart. */
function ProductCard({ product, index, adding, onAdd, onOpen }) {
  const hasOffer = !!product.has_offer && product.offer_price != null;
  const lowStock =
    product.quantity_in_stock != null && product.quantity_in_stock < 10;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.03, 0.3) }}
      onClick={onOpen}
      className="flex cursor-pointer flex-col overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm transition duration-150 hover:-translate-y-0.5 hover:shadow-md"
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

      <div className="flex flex-1 flex-col p-3">
        <h3 className="line-clamp-2 text-sm font-semibold text-text-primary">
          {product.name}
        </h3>

        <div className="mt-1 flex flex-wrap gap-1">
          {product.product_type_name && (
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-text-secondary">
              {product.product_type_name}
            </span>
          )}
          {product.category_name && (
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-text-secondary">
              {product.category_name}
            </span>
          )}
        </div>

        <Stars value={Number(product.rating_avg) || 0} count={product.rating_count} />

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

        {product.has_bulk_discount && (
          <p className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-green-600">
            <Tag size={12} /> Bulk discounts available
          </p>
        )}

        {lowStock && (
          <p className="mt-1 text-xs font-medium text-amber-600">Low stock</p>
        )}

        <button
          onClick={(e) => {
            e.stopPropagation();
            onAdd();
          }}
          disabled={adding}
          className="mt-3 inline-flex items-center justify-center gap-1.5 rounded-lg bg-green-600 px-3 py-2 text-sm font-semibold text-white transition duration-150 hover:bg-green-700 active:scale-[0.98] disabled:opacity-60"
        >
          <ShoppingCart size={16} />
          {adding ? "Adding…" : "Add to Cart"}
        </button>
      </div>
    </motion.div>
  );
}

/** Read-only 5-star display. */
function Stars({ value, count }) {
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

/** Pill tab for "Browse by company". */
function PillTab({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium transition-colors duration-150 ${
        active
          ? "bg-primary text-white"
          : "border border-border bg-white text-text-secondary hover:bg-slate-50"
      }`}
    >
      {children}
    </button>
  );
}
