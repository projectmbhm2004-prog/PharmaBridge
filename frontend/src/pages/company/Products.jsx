import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Pencil, Trash2, PackageOpen, X, ImagePlus, Star, Search, Package } from "lucide-react";
import { toast } from "sonner";

import api from "@/lib/api";
import { formatCurrency, toISODate, parseDateValue } from "@/lib/utils";
import DashboardLayout from "@/components/shared/DashboardLayout";
import DatePicker from "@/components/ui/date-picker";

const PLACEHOLDER = "https://placehold.co/400x400/166534/ffffff?text=Product";

const EMPTY_FORM = {
  name: "",
  product_type_id: "",
  category_id: "",
  price: "",
  quantity_in_stock: "",
  description: "",
  has_offer: false,
  offer_price: "",
  offer_ends_at: "",
};

const STOCK_OPTIONS = [
  { value: "", label: "All stock" },
  { value: "in", label: "In stock (>10)" },
  { value: "low", label: "Low stock (1–10)" },
  { value: "out", label: "Out of stock" },
];

function stockLevel(qty) {
  const n = Number(qty) || 0;
  if (n === 0) return "out";
  if (n <= 10) return "low";
  return "in";
}

export default function Products() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [productTypes, setProductTypes] = useState([]);
  const [loading, setLoading] = useState(true);

  // filtering happens on the client over this company's own catalogue
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [typeId, setTypeId] = useState("");
  const [stock, setStock] = useState("");

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState(null); // product being edited, or null = add
  const [deleting, setDeleting] = useState(null);
  const [removing, setRemoving] = useState(false);
  const [viewing, setViewing] = useState(null); // product being viewed (read-only)

  async function loadProducts() {
    setLoading(true);
    try {
      const { data } = await api.get("/company/products");
      setProducts(data?.data ?? []);
    } catch {
      toast.error("Failed to load products.");
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }

  async function loadCategories() {
    try {
      const { data } = await api.get("/company/categories");
      setCategories(data?.data ?? []);
    } catch {
      setCategories([]);
    }
  }

  async function loadProductTypes() {
    try {
      const { data } = await api.get("/admin/product-types");
      setProductTypes(data?.data ?? []);
    } catch {
      setProductTypes([]);
    }
  }

  useEffect(() => {
    loadProducts();
    loadCategories();
    loadProductTypes();
  }, []);

  const categoryOptions = categories.map((c) => ({ id: c.id, name: c.name }));
  const productTypeOptions = productTypes.map((type) => ({
    value: type.id,
    label: type.name,
  }));

  // run every active filter together
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (q && !(p.name || "").toLowerCase().includes(q)) return false;
      if (categoryId && String(p.category_id) !== String(categoryId)) return false;
      if (typeId && String(p.product_type_id) !== String(typeId)) return false;
      if (stock && stockLevel(p.quantity_in_stock) !== stock) return false;
      return true;
    });
  }, [products, search, categoryId, typeId, stock]);

  const hasFilters = search || categoryId || typeId || stock;

  function clearFilters() {
    setSearch("");
    setCategoryId("");
    setTypeId("");
    setStock("");
  }

  function openAdd() {
    setEditing(null);
    setSheetOpen(true);
  }

  function openEdit(product) {
    setEditing(product);
    setSheetOpen(true);
  }

  async function confirmDelete() {
    if (!deleting) return;
    setRemoving(true);
    try {
      await api.delete(`/company/products/${deleting.id}`);
      toast.success("Product deleted.");
      setDeleting(null);
      loadProducts();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to delete product.");
    } finally {
      setRemoving(false);
    }
  }

  return (
    <DashboardLayout role="company" title="My Products">
      <div className="mb-5 flex justify-end">
        <button
          onClick={openAdd}
          className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white transition duration-150 hover:bg-green-700 active:scale-[0.98]"
        >
          <Plus size={18} /> Add Product
        </button>
      </div>

      {/* Filters (only meaningful once there are products) */}
      {!loading && products.length > 0 && (
        <>
          <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
            <div className="flex flex-1 flex-col gap-1 min-w-45">
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
                  className="w-full rounded-lg border border-border px-3 py-2 pl-9 text-sm outline-none transition-colors duration-150 focus:border-primary focus:ring-2 focus:ring-primary/25"
                />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-text-secondary">Category</label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="rounded-lg border border-border px-3 py-2 text-sm outline-none transition-colors duration-150 focus:border-primary focus:ring-2 focus:ring-primary/25"
              >
                <option value="">All categories</option>
                {categoryOptions.map((c) => (
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
                className="rounded-lg border border-border px-3 py-2 text-sm outline-none transition-colors duration-150 focus:border-primary focus:ring-2 focus:ring-primary/25"
              >
                <option value="">All types</option>
                {productTypeOptions.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-text-secondary">Stock</label>
              <select
                value={stock}
                onChange={(e) => setStock(e.target.value)}
                className="rounded-lg border border-border px-3 py-2 text-sm outline-none transition-colors duration-150 focus:border-primary focus:ring-2 focus:ring-primary/25"
              >
                {STOCK_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            {hasFilters && (
              <button
                onClick={clearFilters}
                className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-sm font-medium text-text-secondary transition-colors duration-150 hover:bg-slate-50"
              >
                <X size={15} /> Clear
              </button>
            )}
          </div>
          <p className="mb-4 text-sm text-text-secondary">
            Showing {visible.length} of {products.length} products
          </p>
        </>
      )}

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm"
            >
              <div className="h-40 animate-pulse bg-slate-200" />
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
          <p className="text-sm font-medium">No products yet</p>
          <button
            onClick={openAdd}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white transition duration-150 hover:bg-green-700 active:scale-[0.98]"
          >
            <Plus size={18} /> Add your first product
          </button>
        </div>
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-slate-100 bg-white py-20 text-center text-text-secondary shadow-sm">
          <PackageOpen size={44} className="mb-3 text-slate-300" />
          <p className="text-sm font-medium">No products match your filters</p>
          <button
            onClick={clearFilters}
            className="mt-2 text-sm font-medium text-primary hover:underline"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((product, i) => (
            <ProductCard
              key={product.id}
              product={product}
              index={i}
              onView={() => setViewing(product)}
              onEdit={() => openEdit(product)}
              onDelete={() => setDeleting(product)}
            />
          ))}
        </div>
      )}

      <ProductSheet
        open={sheetOpen}
        product={editing}
        categories={categoryOptions}
        productTypes={productTypeOptions}
        onClose={() => setSheetOpen(false)}
        onSaved={() => {
          setSheetOpen(false);
          loadProducts();
        }}
      />

      <ProductDetailModal product={viewing} onClose={() => setViewing(null)} />

      {/* Delete confirm */}
      <AnimatePresence>
        {deleting && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => !removing && setDeleting(null)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl shadow-slate-900/10 ring-1 ring-slate-900/5"
            >
              <h3 className="mb-3 text-lg font-bold text-text-primary">Delete product?</h3>
              <p className="text-sm text-text-secondary">
                Delete{" "}
                <span className="font-semibold text-text-primary">{deleting.name}</span>?
                This permanently removes the product and its images.
              </p>
              <div className="mt-6 flex justify-end gap-3">
                <button
                  onClick={() => setDeleting(null)}
                  disabled={removing}
                  className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-text-primary transition duration-150 hover:bg-slate-50 active:scale-[0.98] disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDelete}
                  disabled={removing}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition duration-150 hover:bg-red-700 active:scale-[0.98] disabled:opacity-70"
                >
                  {removing ? "Deleting…" : "Delete"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </DashboardLayout>
  );
}

// stock badge colors: >10 green, 1-10 amber, 0 red
function stockBadge(qty) {
  const n = Number(qty) || 0;
  if (n === 0) return "bg-red-100 text-red-700";
  if (n <= 10) return "bg-amber-100 text-amber-700";
  return "bg-green-100 text-green-700";
}

function ProductCard({ product, index, onView, onEdit, onDelete }) {
  const images = Array.isArray(product.images) ? product.images : [];
  // always render exactly the first image, ignoring sort_order (some products
  // have multiple images sharing sort_order=0)
  const main = images[0];
  const hasOffer = !!product.has_offer && product.offer_price != null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.03, 0.3) }}
      onClick={onView}
      className="flex cursor-pointer flex-col overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm transition duration-150 hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="relative h-40 w-full overflow-hidden bg-slate-100">
        {main?.url ? (
          <img
            src={main.url}
            alt={product.name}
            loading="lazy"
            onError={(e) => {
              e.currentTarget.src = PLACEHOLDER;
            }}
            className="h-full w-full object-cover rounded-t-xl"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-slate-300">
            <PackageOpen size={32} />
          </div>
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

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${stockBadge(
              product.quantity_in_stock
            )}`}
          >
            {Number(product.quantity_in_stock) || 0} in stock
          </span>
          {product.category_name && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
              {product.category_name}
            </span>
          )}
          {product.product_type_name && (
            <span className="rounded-full bg-primary-subtle px-2 py-0.5 text-xs text-primary">
              {product.product_type_name}
            </span>
          )}
        </div>

        <div className="mt-3 flex justify-end gap-1 border-t border-border pt-3">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            aria-label="Edit product"
            className="rounded-lg p-2 text-text-secondary transition-colors duration-150 hover:bg-slate-100 hover:text-text-primary"
          >
            <Pencil size={17} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            aria-label="Delete product"
            className="rounded-lg p-2 text-red-600 transition-colors duration-150 hover:bg-red-50"
          >
            <Trash2 size={17} />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// read-only product detail modal for the company side - no buying here
function ProductDetailModal({ product, onClose }) {
  const [active, setActive] = useState(0);

  // jump the gallery back to the first image whenever a different product opens
  useEffect(() => {
    setActive(0);
  }, [product]);

  const images = Array.isArray(product?.images) ? product.images : [];
  const gallery = images.length > 0 ? images : null;
  const hasOffer = !!product?.has_offer && product?.offer_price != null;
  const ratingAvg = Number(product?.rating_avg) || 0;
  const ratingCount = Number(product?.rating_count) || 0;

  return (
    <AnimatePresence>
      {product && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="relative max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-xl"
          >
            <button
              onClick={onClose}
              aria-label="Close"
              className="absolute right-3 top-3 z-10 rounded-full bg-white/90 p-1.5 text-text-secondary shadow transition-colors duration-150 hover:bg-slate-100 hover:text-text-primary"
            >
              <X size={20} />
            </button>

            <div className="grid gap-5 p-5 sm:grid-cols-2">
              {/* Images gallery */}
              <div>
                <div className="relative aspect-square overflow-hidden rounded-xl bg-slate-100">
                  <img
                    src={gallery ? gallery[active]?.url : PLACEHOLDER}
                    alt={product.name}
                    onError={(e) => {
                      e.currentTarget.src = PLACEHOLDER;
                    }}
                    className="h-full w-full object-cover"
                  />
                  {hasOffer && (
                    <span className="absolute right-2 top-2 rounded-full bg-red-600 px-2 py-0.5 text-xs font-bold text-white">
                      OFFER
                    </span>
                  )}
                </div>
                {gallery && gallery.length > 1 && (
                  <div className="mt-2 grid grid-cols-4 gap-2">
                    {gallery.map((img, i) => (
                      <button
                        key={img.id ?? i}
                        type="button"
                        onClick={() => setActive(i)}
                        className={`aspect-square overflow-hidden rounded-lg border-2 transition-colors duration-150 ${
                          i === active ? "border-primary" : "border-transparent"
                        }`}
                      >
                        <img
                          src={img.url}
                          alt=""
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

              {/* Details */}
              <div className="flex flex-col">
                <h2 className="pr-8 text-xl font-bold text-text-primary">
                  {product.name}
                </h2>

                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {product.product_type_name && (
                    <span className="rounded-full bg-primary-subtle px-2 py-0.5 text-xs text-primary">
                      {product.product_type_name}
                    </span>
                  )}
                  {product.category_name && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                      {product.category_name}
                    </span>
                  )}
                </div>

                {ratingCount > 0 && (
                  <div className="mt-3 flex items-center gap-1.5">
                    <div className="flex">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star
                          key={i}
                          size={16}
                          className={
                            i < Math.round(ratingAvg)
                              ? "fill-amber-400 text-amber-400"
                              : "text-slate-300"
                          }
                        />
                      ))}
                    </div>
                    <span className="text-sm font-semibold text-text-primary">
                      {ratingAvg.toFixed(1)}
                    </span>
                    <span className="text-xs text-text-secondary">
                      ({ratingCount} {ratingCount === 1 ? "rating" : "ratings"})
                    </span>
                  </div>
                )}

                <div className="mt-3 flex items-baseline gap-2">
                  {hasOffer ? (
                    <>
                      <span className="text-2xl font-bold text-green-600">
                        {formatCurrency(product.offer_price)}
                      </span>
                      <span className="text-sm text-slate-400 line-through">
                        {formatCurrency(product.price)}
                      </span>
                    </>
                  ) : (
                    <span className="text-2xl font-bold text-text-primary">
                      {formatCurrency(product.price)}
                    </span>
                  )}
                </div>

                <div className="mt-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${stockBadge(
                      product.quantity_in_stock
                    )}`}
                  >
                    {Number(product.quantity_in_stock) || 0} in stock
                  </span>
                </div>

                {product.description && (
                  <div className="mt-4">
                    <p className="mb-1 text-sm font-semibold text-text-primary">
                      Description
                    </p>
                    <p className="whitespace-pre-line text-sm text-text-secondary">
                      {product.description}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// the add/edit side sheet - product fields plus the image management lives here
function ProductSheet({ open, product, categories, productTypes, onClose, onSaved }) {
  const isEdit = !!product;
  const [form, setForm] = useState(EMPTY_FORM);
  const [images, setImages] = useState([]); // existing images (edit mode)
  const [newFiles, setNewFiles] = useState([]); // File[] queued for upload
  const [units, setUnits] = useState([]); // packaging rows
  const [saving, setSaving] = useState(false);

  // wipe the form back to defaults each time the sheet opens for a (different) product
  useEffect(() => {
    if (!open) return;
    if (product) {
      setForm({
        name: product.name ?? "",
        product_type_id: product.product_type_id ?? "",
        category_id: product.category_id ?? "",
        price: product.price ?? "",
        quantity_in_stock: product.quantity_in_stock ?? "",
        description: product.description ?? "",
        has_offer: !!product.has_offer,
        offer_price: product.offer_price ?? "",
        offer_ends_at: toDateInput(product.offer_ends_at),
      });
      setImages(Array.isArray(product.images) ? product.images : []);
      const existingUnits = Array.isArray(product.units) ? product.units : [];
      setUnits(
        existingUnits.length > 0
          ? existingUnits
              .slice()
              .sort((a, b) => Number(a.units_count) - Number(b.units_count))
              .map(toUnitRow)
          : [defaultUnitRow()]
      );
    } else {
      setForm(EMPTY_FORM);
      setImages([]);
      setUnits([defaultUnitRow()]);
    }
    setNewFiles([]);
  }, [open, product]);

  // packaging row helpers below
  function setUnit(idx, key, value) {
    setUnits((list) =>
      list.map((u, i) => (i === idx ? { ...u, [key]: value } : u))
    );
  }
  function addUnit() {
    setUnits((list) => [
      ...list,
      { ...defaultUnitRow(), is_default: false, unit_name: "" },
    ]);
  }
  function removeUnit(idx) {
    setUnits((list) => {
      if (list.length <= 1) return list;
      const next = list.filter((_, i) => i !== idx);
// make sure exactly one row is still the default
      if (!next.some((u) => u.is_default)) next[0].is_default = true;
      return next;
    });
  }
  function makeDefaultUnit(idx) {
    setUnits((list) => list.map((u, i) => ({ ...u, is_default: i === idx })));
  }

  function set(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const totalImages = images.length + newFiles.length;

  function queueFiles(fileList) {
    const incoming = Array.from(fileList || []);
    if (incoming.length === 0) return;
    const room = 4 - totalImages;
    if (room <= 0) {
      toast.error("Maximum of 4 images per product.");
      return;
    }
    setNewFiles((prev) => [...prev, ...incoming.slice(0, room)]);
  }

  async function deleteExistingImage(img) {
    try {
      await api.delete(`/company/products/${product.id}/images/${img.id}`);
      setImages((prev) => prev.filter((im) => im.id !== img.id));
      toast.success("Image removed.");
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to remove image.");
    }
  }

  function validate() {
    if (!form.name.trim()) return "Product name is required.";
    if (!form.product_type_id) return "Product type is required.";
    if (!form.category_id) return "Category is required.";
    if (!(Number(form.price) > 0)) return "Price must be greater than 0.";
    if (form.quantity_in_stock === "" || Number(form.quantity_in_stock) < 0)
      return "Quantity in stock is required.";
    if (form.has_offer && !(Number(form.offer_price) > 0))
      return "Offer price must be greater than 0.";
    // an offer that expires today (or earlier) is already invisible - require a future date
    if (form.has_offer && form.offer_ends_at) {
      const ends = parseDateValue(form.offer_ends_at);
      if (!ends || ends < tomorrow())
        return "Offer expiry date must be in the future.";
    }

    // validate the packaging units, same rules the backend enforces
    if (units.length === 0) return "Add at least one packaging unit.";
    const seen = new Set();
    for (const u of units) {
      const nm = String(u.unit_name || "").trim();
      if (!nm) return "Each packaging unit needs a name.";
      const key = nm.toLowerCase();
      if (seen.has(key)) return `Duplicate packaging unit: "${nm}".`;
      seen.add(key);
      if (!(Number.isInteger(Number(u.units_count)) && Number(u.units_count) >= 1))
        return `"${nm}": units count must be a whole number ≥ 1.`;
      const disc = u.discount_percent === "" ? 0 : Number(u.discount_percent);
      if (Number.isNaN(disc) || disc < 0 || disc > 100)
        return `"${nm}": discount must be between 0 and 100.`;
      if (u.final_price !== "" && u.final_price != null && !(Number(u.final_price) > 0))
        return `"${nm}": price override must be greater than 0.`;
    }
    if (!units.some((u) => u.is_default))
      return "Mark one packaging unit as default.";
    return null;
  }

  // turn a form unit row into the shape the API wants
  function unitPayload(u) {
    return {
      unit_name: String(u.unit_name).trim(),
      units_count: Number(u.units_count),
      discount_percent: u.discount_percent === "" ? 0 : Number(u.discount_percent),
      final_price:
        u.final_price === "" || u.final_price == null ? null : Number(u.final_price),
      is_default: !!u.is_default,
    };
  }

  // sync packaging for an existing product through the per-unit endpoints:
  // delete the rows that went away, update the ones we kept, add the new ones
  async function syncUnits(productId) {
    const original = Array.isArray(product?.units) ? product.units : [];
    const currentIds = new Set(units.filter((u) => u.id).map((u) => u.id));

    // do the deletes first, otherwise a renamed row can clash with a deleted one on the unique name
    for (const o of original) {
      if (!currentIds.has(o.id)) {
        await api.delete(`/company/products/units/${o.id}`);
      }
    }
    for (const u of units) {
      const body = unitPayload(u);
      if (u.id) {
        await api.put(`/company/products/units/${u.id}`, body);
      } else {
        await api.post(`/company/products/${productId}/units`, body);
      }
    }
  }

  async function uploadFiles(productId) {
    if (newFiles.length === 0) return;
    const fd = new FormData();
    for (const file of newFiles) fd.append("images", file);
    await api.post(`/company/products/${productId}/images`, fd, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  }

  async function save() {
    const error = validate();
    if (error) {
      toast.error(error);
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        product_type_id: Number(form.product_type_id),
        category_id: Number(form.category_id),
        price: Number(form.price),
        quantity_in_stock: Number(form.quantity_in_stock),
        description: form.description.trim() || null,
        has_offer: form.has_offer,
        offer_price: form.has_offer ? Number(form.offer_price) : null,
        offer_ends_at: form.has_offer ? form.offer_ends_at || null : null,
      };

      if (isEdit) {
        await api.patch(`/company/products/${product.id}`, payload);
        await syncUnits(product.id);
        await uploadFiles(product.id);
        toast.success("Product updated.");
      } else {
        const { data } = await api.post("/company/products", {
          ...payload,
          units: units.map(unitPayload),
        });
        const newId = data?.data?.id;
        if (newId) await uploadFiles(newId);
        toast.success("Product added.");
      }
      onSaved();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to save product.");
    } finally {
      setSaving(false);
    }
  }

  const inputClass =
    "w-full rounded-lg border border-border px-3 py-2 text-sm outline-none transition-colors duration-150 focus:border-primary focus:ring-2 focus:ring-primary/25";

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={saving ? undefined : onClose}
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
              <h3 className="text-lg font-bold text-text-primary">
                {isEdit ? "Edit Product" : "Add Product"}
              </h3>
              <button
                onClick={onClose}
                disabled={saving}
                className="rounded-lg p-1.5 text-text-secondary transition-colors duration-150 hover:bg-slate-100 hover:text-text-primary disabled:opacity-50"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-5">
              <Field label="Product Name" required>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  className={inputClass}
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Product Type" required>
                  <select
                    value={form.product_type_id}
                    onChange={(e) => set("product_type_id", e.target.value)}
                    className={inputClass}
                  >
                    <option value="">Select…</option>
                    {productTypes.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Category" required>
                  <select
                    value={form.category_id}
                    onChange={(e) => set("category_id", e.target.value)}
                    className={inputClass}
                  >
                    <option value="">Select…</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Price" required>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.price}
                    onChange={(e) => set("price", e.target.value)}
                    className={inputClass}
                  />
                </Field>
                <Field label="Quantity in Stock" required>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={form.quantity_in_stock}
                    onChange={(e) => set("quantity_in_stock", e.target.value)}
                    className={inputClass}
                  />
                </Field>
              </div>

              <Field label="Description">
                <textarea
                  value={form.description}
                  onChange={(e) => set("description", e.target.value)}
                  rows={3}
                  className={inputClass}
                />
              </Field>

              {/* Offer */}
              <div className="rounded-lg border border-border p-3">
                <label className="flex items-center justify-between">
                  <span className="text-sm font-medium text-text-primary">
                    On Offer
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={form.has_offer}
                    onClick={() => set("has_offer", !form.has_offer)}
                    className={`relative h-6 w-11 rounded-full transition-colors duration-150 ${
                      form.has_offer ? "bg-green-600" : "bg-slate-300"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-colors duration-150 ${
                        form.has_offer ? "left-5.5" : "left-0.5"
                      }`}
                    />
                  </button>
                </label>

                {form.has_offer && (
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <Field label="Offer Price" required>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={form.offer_price}
                        onChange={(e) => set("offer_price", e.target.value)}
                        className={inputClass}
                      />
                    </Field>
                    <Field label="Offer End Date">
                      <DatePicker
                        value={form.offer_ends_at}
                        onChange={(d) => set("offer_ends_at", toISODate(d))}
                        minDate={tomorrow()}
                        placeholder="Pick a date"
                        className="w-full"
                      />
                    </Field>
                  </div>
                )}
              </div>

              {/* Packaging & Pricing */}
              <div className="rounded-lg border border-border p-3">
                <div className="mb-1 flex items-center gap-1.5">
                  <Package size={16} className="text-primary" />
                  <p className="text-sm font-semibold text-text-primary">
                    Packaging &amp; Pricing
                  </p>
                </div>
                <p className="mb-3 text-xs text-text-secondary">
                  Add the packaging options buyers can choose. Price is
                  base&nbsp;price&nbsp;× units, minus the discount (or a fixed
                  override).
                </p>

                <div className="space-y-3">
                  {units.map((u, idx) => {
                    const calc = calcUnitPrice(form.price, u);
                    return (
                      <div
                        key={u.id ?? `new-${idx}`}
                        className="rounded-lg border border-border bg-slate-50/60 p-3"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <input
                            type="text"
                            value={u.unit_name}
                            onChange={(e) => setUnit(idx, "unit_name", e.target.value)}
                            placeholder="e.g. Box (10)"
                            className="w-full rounded-lg border border-border px-2.5 py-1.5 text-sm outline-none transition-colors duration-150 focus:border-primary focus:ring-2 focus:ring-primary/25"
                          />
                          <button
                            type="button"
                            onClick={() => removeUnit(idx)}
                            disabled={units.length <= 1}
                            aria-label="Remove packaging unit"
                            className="shrink-0 rounded-lg p-1.5 text-text-secondary transition-colors duration-150 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>

                        <div className="mt-2 grid grid-cols-3 gap-2">
                          <label className="flex flex-col gap-1">
                            <span className="text-[11px] font-medium text-text-secondary">
                              Units
                            </span>
                            <input
                              type="number"
                              min="1"
                              step="1"
                              value={u.units_count}
                              onChange={(e) => setUnit(idx, "units_count", e.target.value)}
                              className="rounded-lg border border-border px-2 py-1.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/25"
                            />
                          </label>
                          <label className="flex flex-col gap-1">
                            <span className="text-[11px] font-medium text-text-secondary">
                              Discount %
                            </span>
                            <input
                              type="number"
                              min="0"
                              max="100"
                              step="0.01"
                              value={u.discount_percent}
                              onChange={(e) =>
                                setUnit(idx, "discount_percent", e.target.value)
                              }
                              className="rounded-lg border border-border px-2 py-1.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/25"
                            />
                          </label>
                          <label className="flex flex-col gap-1">
                            <span className="text-[11px] font-medium text-text-secondary">
                              Override
                            </span>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={u.final_price}
                              onChange={(e) => setUnit(idx, "final_price", e.target.value)}
                              placeholder="auto"
                              className="rounded-lg border border-border px-2 py-1.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/25"
                            />
                          </label>
                        </div>

                        <div className="mt-2 flex items-center justify-between">
                          <label className="flex items-center gap-1.5 text-xs font-medium text-text-secondary">
                            <input
                              type="radio"
                              name="default_unit"
                              checked={!!u.is_default}
                              onChange={() => makeDefaultUnit(idx)}
                              className="accent-green-600"
                            />
                            Default
                          </label>
                          <span className="text-sm font-bold text-green-600">
                            {formatCurrency(calc)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={addUnit}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-1.5 text-sm font-medium text-primary transition-colors duration-150 hover:bg-primary-subtle"
                >
                  <Plus size={15} /> Add packaging
                </button>
              </div>

              {/* Images */}
              <div>
                <p className="mb-1.5 text-sm font-medium text-text-primary">
                  Images <span className="text-slate-400">(up to 4)</span>
                </p>
                <div className="grid grid-cols-4 gap-2">
                  {images.map((img) => (
                    <div
                      key={img.id}
                      className="group relative aspect-square overflow-hidden rounded-lg border border-border"
                    >
                      <img
                        src={img.url}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => deleteExistingImage(img)}
                        className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white transition-colors duration-150 hover:bg-red-600"
                        aria-label="Delete image"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                  {newFiles.map((file, i) => (
                    <div
                      key={i}
                      className="relative aspect-square overflow-hidden rounded-lg border border-green-300"
                    >
                      <img
                        src={URL.createObjectURL(file)}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setNewFiles((prev) => prev.filter((_, idx) => idx !== i))
                        }
                        className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white transition-colors duration-150 hover:bg-red-600"
                        aria-label="Remove image"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                  {totalImages < 4 && (
                    <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border text-text-secondary transition-colors duration-150 hover:border-primary hover:text-primary">
                      <ImagePlus size={20} />
                      <span className="text-[10px]">Add</span>
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={(e) => {
                          queueFiles(e.target.files);
                          e.target.value = "";
                        }}
                      />
                    </label>
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t border-border bg-slate-50 px-5 py-3">
              <button
                onClick={onClose}
                disabled={saving}
                className="rounded-lg border border-border bg-white px-4 py-2 text-sm font-semibold text-text-primary transition-colors duration-150 hover:bg-slate-100 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white transition duration-150 hover:bg-green-700 active:scale-[0.98] disabled:opacity-60"
              >
                {saving ? "Saving…" : isEdit ? "Save Changes" : "Add Product"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Field({ label, required, children }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-text-primary">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}

// tomorrow at local midnight - the earliest an offer can validly expire (an offer ending today
// is effectively already expired). used both as the picker's min and for submit-time validation.
function tomorrow() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 1);
  return d;
}

// ISO/datetime string -> "yyyy-mm-dd" for a date input (or "" if there's nothing)
function toDateInput(str) {
  if (!str) return "";
  const d = new Date(str);
  if (isNaN(d)) return "";
  return d.toISOString().slice(0, 10);
}

// a brand-new default packaging row: "Single", 1 unit, no discount, marked default
function defaultUnitRow() {
  return {
    unit_name: "Single",
    units_count: 1,
    discount_percent: 0,
    final_price: "",
    is_default: true,
  };
}

// turn an API unit into the editable form-row shape (nulls become "")
function toUnitRow(u) {
  return {
    id: u.id,
    unit_name: u.unit_name ?? "",
    units_count: u.units_count ?? 1,
    discount_percent: u.discount_percent ?? 0,
    final_price: u.final_price == null ? "" : u.final_price,
    is_default: u.is_default === 1 || u.is_default === true,
  };
}

// live packaging price for the form preview: the explicit override if they set one, else
// base price * units_count * (1 - discount/100). no offer pricing here - the company is
// editing the base price directly.
function calcUnitPrice(basePrice, row) {
  if (row.final_price !== "" && row.final_price != null) {
    return Number(row.final_price) || 0;
  }
  const base = Number(basePrice) || 0;
  const count = Number(row.units_count) || 1;
  const disc = Number(row.discount_percent) || 0;
  return base * count * (1 - disc / 100);
}
