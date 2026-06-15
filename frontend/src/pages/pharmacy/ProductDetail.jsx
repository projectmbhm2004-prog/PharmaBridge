import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  ChevronRight,
  Star,
  ShoppingCart,
  Minus,
  Plus,
  PackageOpen,
  Package,
  Building2,
  MapPin,
} from "lucide-react";
import { toast } from "sonner";

import api from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/utils";
import useCart from "@/hooks/useCart";
import DashboardLayout from "@/components/shared/DashboardLayout";
import CountdownTimer from "@/components/market/CountdownTimer";

const PLACEHOLDER = "https://placehold.co/400x400/166534/ffffff?text=Product";
const AVATAR = (name) =>
  `https://ui-avatars.com/api/?name=${encodeURIComponent(
    name || "Company"
  )}&background=166534&color=fff`;

export default function ProductDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { addItem } = useCart();

  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [activeImage, setActiveImage] = useState(0);
  const [qty, setQty] = useState(1);
  const [selectedUnitId, setSelectedUnitId] = useState(null);

  const [adding, setAdding] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setNotFound(false);
      try {
        const { data } = await api.get(`/market/products/${id}`);
        if (cancelled) return;
        const prod = data?.data ?? null;
        setProduct(prod);
        setActiveImage(0);
        setQty(1);
        // Default packaging: the one flagged is_default, else the smallest.
        const units = prod?.units ?? [];
        const def =
          units.find((u) => u.is_default === 1 || u.is_default === true) ||
          units[0];
        setSelectedUnitId(def ? def.id : null);
      } catch (err) {
        if (cancelled) return;
        if (err.response?.status === 404) setNotFound(true);
        else toast.error("Failed to load product.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const images = useMemo(() => {
    const list = product?.images?.map((i) => i.image_url).filter(Boolean) ?? [];
    return list.length ? list : [PLACEHOLDER];
  }, [product]);

  const hasOffer = !!product?.has_offer && product?.offer_price != null;
  const stock = Number(product?.quantity_in_stock) || 0;

  // Packaging units. Fall back to a synthetic "Single" unit for older products
  // that predate packaging (so the page still works).
  const units = useMemo(() => {
    const list = product?.units ?? [];
    if (list.length > 0) return list;
    if (!product) return [];
    return [
      {
        id: null,
        unit_name: "Single",
        units_count: 1,
        discount_percent: 0,
        effective_price: hasOffer ? product.offer_price : product.price,
        list_price: product.price,
        is_default: true,
      },
    ];
  }, [product, hasOffer]);

  const selectedUnit = useMemo(
    () => units.find((u) => u.id === selectedUnitId) || units[0] || null,
    [units, selectedUnitId]
  );

  const unitsCount = Number(selectedUnit?.units_count) || 1;
  const unitPrice = Number(selectedUnit?.effective_price ?? product?.price) || 0;
  const unitList = Number(selectedUnit?.list_price ?? product?.price) || 0;
  const unitDiscount = Number(selectedUnit?.discount_percent) || 0;
  const unitHasDiscount = unitPrice < unitList - 0.001;
  // quantity is the number of PACKAGES; stock is base units.
  const maxPackages = Math.floor(stock / unitsCount);
  const inStock = maxPackages >= 1;

  // Clamp quantity if the selected packaging allows fewer packages than chosen.
  useEffect(() => {
    setQty((q) => Math.min(Math.max(1, q), Math.max(1, maxPackages)));
  }, [selectedUnitId, maxPackages]);

  // Rating breakdown
  const breakdown = useMemo(() => {
    const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const r of product?.ratings ?? []) {
      const s = Number(r.stars);
      if (counts[s] != null) counts[s] += 1;
    }
    return counts;
  }, [product]);
  const ratingsTotal = product?.ratings?.length ?? 0;

  // Multi-company cart: adding always succeeds unless the backend rejects it
  // (stock / availability), which addItem surfaces as a toast.
  async function addToCart() {
    if (!product) return;
    setAdding(true);
    const res = await addItem(product.id, qty, selectedUnit?.id ?? null);
    if (res.ok) toast.success("Added to cart");
    setAdding(false);
  }

  if (loading) {
    return (
      <DashboardLayout role="pharmacy" title="Product">
        <div className="grid gap-8 lg:grid-cols-2">
          <div className="aspect-square animate-pulse rounded-xl bg-slate-200" />
          <div className="space-y-4">
            <div className="h-8 w-3/4 animate-pulse rounded bg-slate-200" />
            <div className="h-5 w-1/3 animate-pulse rounded bg-slate-200" />
            <div className="h-10 w-1/2 animate-pulse rounded bg-slate-200" />
            <div className="h-12 w-full animate-pulse rounded bg-slate-200" />
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (notFound || !product) {
    return (
      <DashboardLayout role="pharmacy" title="Product">
        <div className="flex flex-col items-center justify-center rounded-xl border border-slate-100 bg-white py-20 text-center text-text-secondary shadow-sm">
          <PackageOpen size={44} className="mb-3 text-slate-300" />
          <p className="text-sm font-medium">Product not found</p>
          <button
            onClick={() => navigate("/pharmacy/market")}
            className="mt-4 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white transition duration-150 hover:bg-green-700 active:scale-[0.98]"
          >
            Back to Marketplace
          </button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout role="pharmacy" title="Product Details">
      {/* Breadcrumb */}
      <nav className="mb-5 flex flex-wrap items-center gap-1 text-sm text-text-secondary">
        <Link to="/pharmacy/market" className="hover:text-primary">
          Marketplace
        </Link>
        <ChevronRight size={14} />
        <span>{product.company_name}</span>
        <ChevronRight size={14} />
        <span className="font-medium text-text-primary">{product.name}</span>
      </nav>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Left — gallery */}
        <div>
          <div className="aspect-square overflow-hidden rounded-xl border border-slate-100 bg-slate-100">
            <img
              src={images[activeImage] || PLACEHOLDER}
              alt={product.name}
              onError={(e) => {
                e.currentTarget.src = PLACEHOLDER;
              }}
              className="h-full w-full object-cover"
            />
          </div>
          {images.length > 1 && (
            <div className="mt-3 grid grid-cols-4 gap-3">
              {images.slice(0, 4).map((src, i) => (
                <button
                  key={i}
                  onClick={() => setActiveImage(i)}
                  className={`aspect-square overflow-hidden rounded-lg border bg-slate-100 transition-colors duration-150 ${
                    activeImage === i
                      ? "border-primary ring-2 ring-green-500/30"
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <img
                    src={src || PLACEHOLDER}
                    alt={`${product.name} ${i + 1}`}
                    onError={(e) => {
                      e.currentTarget.src = PLACEHOLDER;
                    }}
                    className="h-full w-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right — info */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text-primary">
            {product.name}
          </h1>

          <div className="mt-2 flex items-center gap-2">
            <img
              src={AVATAR(product.company_name)}
              alt={product.company_name}
              className="h-7 w-7 rounded-full"
            />
            <span className="text-sm font-medium text-text-secondary">
              {product.company_name}
            </span>
          </div>

          {/* Company info — publicly shown description + address */}
          {(product.company_description || product.company_address) && (
            <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50/60 p-4">
              <h2 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-text-secondary">
                <Building2 size={14} className="text-primary" /> About the Company
              </h2>
              {product.company_description && (
                <p className="text-sm leading-relaxed text-text-secondary">
                  {product.company_description}
                </p>
              )}
              {product.company_address && (
                <p className="mt-2 flex items-start gap-1.5 text-sm text-text-secondary">
                  <MapPin size={15} className="mt-0.5 shrink-0 text-primary" />
                  <span>{product.company_address}</span>
                </p>
              )}
            </div>
          )}

          <div className="mt-3">
            <Stars
              value={Number(product.rating_avg) || 0}
              count={product.rating_count}
              size={18}
            />
          </div>

          {/* Price (reflects the selected packaging) */}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span
              className={`text-3xl font-bold ${
                unitHasDiscount || hasOffer
                  ? "text-green-600"
                  : "text-text-primary"
              }`}
            >
              {formatCurrency(unitPrice)}
            </span>
            {unitHasDiscount && (
              <span className="text-lg text-slate-400 line-through">
                {formatCurrency(unitList)}
              </span>
            )}
            {unitDiscount > 0 && (
              <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-bold text-green-700">
                Save {Number(unitDiscount).toFixed(0)}%
              </span>
            )}
            {hasOffer && <CountdownTimer offerEndsAt={product.offer_ends_at} />}
          </div>
          {unitsCount > 1 && (
            <p className="mt-1 text-sm text-text-secondary">
              {unitsCount} units · {formatCurrency(unitPrice / unitsCount)} per unit
            </p>
          )}

          {/* Packaging selector — replaces the old static Category row */}
          {units.length > 0 && (
            <div className="mt-5">
              <label
                htmlFor="packaging"
                className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-text-primary"
              >
                <Package size={16} className="text-primary" /> Packaging
              </label>
              <select
                id="packaging"
                value={selectedUnit?.id ?? ""}
                onChange={(e) => {
                  const val = e.target.value;
                  setSelectedUnitId(val === "" ? null : Number(val));
                }}
                className="w-full rounded-lg border border-border px-3 py-2.5 text-sm outline-none transition-colors duration-150 focus:border-primary focus:ring-2 focus:ring-primary/25"
              >
                {units.map((u) => (
                  <option key={u.id ?? "single"} value={u.id ?? ""}>
                    {u.unit_name} — {formatCurrency(u.effective_price)}
                    {Number(u.discount_percent) > 0
                      ? ` (${Number(u.discount_percent).toFixed(0)}% off)`
                      : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Stock badge */}
          <div className="mt-4">
            {inStock ? (
              <span
                className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${
                  stock < 10
                    ? "bg-amber-100 text-amber-700"
                    : "bg-green-100 text-green-700"
                }`}
              >
                {stock < 10 ? `Low stock — ${stock} left` : `In stock (${stock})`}
              </span>
            ) : (
              <span className="inline-block rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-700">
                Out of stock
              </span>
            )}
          </div>

          {/* Quantity selector (counts packages of the selected packaging) */}
          <div className="mt-5 flex items-center gap-4">
            <span className="text-sm font-medium text-text-primary">Quantity</span>
            <div className="flex items-center rounded-lg border border-border">
              <button
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                disabled={qty <= 1}
                className="flex h-9 w-9 items-center justify-center text-text-secondary transition-colors duration-150 hover:bg-slate-50 disabled:opacity-40"
                aria-label="Decrease quantity"
              >
                <Minus size={16} />
              </button>
              <span className="w-10 text-center text-sm font-semibold">{qty}</span>
              <button
                onClick={() =>
                  setQty((q) => Math.min(Math.max(1, maxPackages), q + 1))
                }
                disabled={qty >= maxPackages}
                className="flex h-9 w-9 items-center justify-center text-text-secondary transition-colors duration-150 hover:bg-slate-50 disabled:opacity-40"
                aria-label="Increase quantity"
              >
                <Plus size={16} />
              </button>
            </div>
            {selectedUnit && (
              <span className="text-sm font-semibold text-text-primary">
                = {formatCurrency(unitPrice * qty)}
              </span>
            )}
          </div>

          <button
            onClick={addToCart}
            disabled={adding || !inStock}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-3 text-base font-semibold text-white transition duration-150 hover:bg-green-700 active:scale-[0.98] disabled:opacity-60"
          >
            <ShoppingCart size={18} />
            {adding ? "Adding…" : "Add to Cart"}
          </button>

          {/* Details */}
          <div className="mt-6 border-t border-border pt-6">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-text-secondary">
              Product Details
            </h2>
            <dl className="space-y-3 text-sm">
              {product.description && (
                <div>
                  <dt className="font-medium text-text-primary">Description</dt>
                  <dd className="mt-1 leading-relaxed text-text-secondary">
                    {product.description}
                  </dd>
                </div>
              )}
              <div className="flex justify-between border-t border-border pt-3">
                <dt className="text-text-secondary">Product Type</dt>
                <dd className="font-medium text-text-primary">
                  {product.product_type_name || "—"}
                </dd>
              </div>
              <div className="flex justify-between border-t border-border pt-3">
                <dt className="text-text-secondary">Selected Packaging</dt>
                <dd className="font-medium text-text-primary">
                  {selectedUnit?.unit_name || "—"}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </div>

      {/* Ratings */}
      <section className="mt-10">
        <h2 className="mb-4 text-lg font-bold text-text-primary">
          Ratings & Reviews
        </h2>

        <div className="grid gap-6 rounded-xl border border-slate-100 bg-white p-5 shadow-sm md:grid-cols-[260px_1fr]">
          {/* Breakdown */}
          <div className="md:border-r md:border-border md:pr-6">
            <div className="flex items-end gap-2">
              <span className="text-4xl font-bold text-text-primary">
                {Number(product.rating_avg) > 0
                  ? Number(product.rating_avg).toFixed(1)
                  : "—"}
              </span>
              <span className="pb-1 text-sm text-text-secondary">/ 5</span>
            </div>
            <Stars value={Number(product.rating_avg) || 0} count={product.rating_count} />
            <div className="mt-4 space-y-1.5">
              {[5, 4, 3, 2, 1].map((star) => {
                const count = breakdown[star];
                const pct = ratingsTotal ? (count / ratingsTotal) * 100 : 0;
                return (
                  <div key={star} className="flex items-center gap-2 text-xs">
                    <span className="w-6 text-text-secondary">{star}★</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-amber-400"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="w-8 text-right text-text-secondary">{count}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Individual ratings */}
          <div>
            {ratingsTotal === 0 ? (
              <p className="py-8 text-center text-sm text-text-secondary">
                No ratings yet.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {product.ratings.map((r) => (
                  <li key={r.id} className="flex items-center justify-between py-3">
                    <div>
                      <p className="text-sm font-medium text-text-primary">
                        {r.pharmacy_name}
                      </p>
                      <p className="text-xs text-text-secondary">
                        {formatDate(r.created_at)}
                      </p>
                    </div>
                    <div className="flex">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <Star
                          key={n}
                          size={15}
                          className={
                            n <= Number(r.stars)
                              ? "fill-amber-400 text-amber-400"
                              : "fill-slate-200 text-slate-200"
                          }
                        />
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>
    </DashboardLayout>
  );
}

/** Read-only 5-star display. */
function Stars({ value, count, size = 14 }) {
  return (
    <div className="mt-1 flex items-center gap-1">
      <div className="flex">
        {[1, 2, 3, 4, 5].map((n) => (
          <Star
            key={n}
            size={size}
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
