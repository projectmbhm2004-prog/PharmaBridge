import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Package, Trash2, X, Search } from "lucide-react";
import { toast } from "sonner";

import api from "@/lib/api";
import DashboardLayout from "@/components/shared/DashboardLayout";

const EMPTY_FORM = { name: "" };

export default function ProductTypes() {
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [deleting, setDeleting] = useState(null); // type being deleted
  const [removing, setRemoving] = useState(false);

  async function loadTypes() {
    setLoading(true);
    try {
      const { data } = await api.get("/admin/product-types");
      setTypes(data?.data ?? []);
    } catch {
      toast.error("Failed to load product types.");
      setTypes([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTypes();
  }, []);

  async function handleAdd(e) {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Product type name is required.");
      return;
    }
    setSaving(true);
    try {
      await api.post("/admin/product-types", {
        name: form.name.trim(),
      });
      toast.success("Product type added.");
      setForm(EMPTY_FORM);
      setShowForm(false);
      loadTypes();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to add product type.");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setRemoving(true);
    try {
      await api.delete(`/admin/product-types/${deleting.id}`);
      toast.success("Product type deleted.");
      setDeleting(null);
      loadTypes();
    } catch (err) {
      toast.error(err.response?.data?.message || "Cannot delete this product type.");
    } finally {
      setRemoving(false);
    }
  }

  const inputClass =
    "w-full rounded-lg border border-border px-3 py-2 text-sm outline-none transition-colors duration-150 focus:border-primary focus:ring-2 focus:ring-primary/25";

  // Search by type name (bounded list).
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return types;
    return types.filter((t) => (t.name || "").toLowerCase().includes(q));
  }, [types, search]);

  return (
    <DashboardLayout role="admin" title="Product Types">
      {/* Top action */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full sm:max-w-xs">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search product types…"
            className={`${inputClass} pl-9`}
          />
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white transition duration-150 hover:bg-green-700 active:scale-[0.98]"
        >
          <Plus size={18} /> Add Product Type
        </button>
      </div>

      {/* Add form */}
      <AnimatePresence>
        {showForm && (
          <motion.form
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            onSubmit={handleAdd}
            className="mb-5 overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm"
          >
            <div className="grid gap-4 p-5">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-text-primary">
                  Product Type Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className={inputClass}
                  required
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 border-t border-border bg-slate-50 px-5 py-3">
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setForm(EMPTY_FORM);
                }}
                className="rounded-lg border border-border bg-white px-4 py-2 text-sm font-semibold text-text-primary transition duration-150 hover:bg-slate-50 active:scale-[0.98]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white transition duration-150 hover:bg-green-700 active:scale-[0.98] disabled:opacity-70"
              >
                {saving ? "Saving…" : "Save Product Type"}
              </button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-16 animate-pulse rounded-xl border border-slate-100 bg-white shadow-sm"
            />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-slate-100 bg-white py-16 text-center text-text-secondary shadow-sm">
          <Package size={40} className="mb-3 text-slate-300" />
          <p className="text-sm font-medium">
            {search ? "No product types match your search" : "No product types yet"}
          </p>
          {search && (
            <button
              onClick={() => setSearch("")}
              className="mt-2 text-sm font-medium text-primary hover:underline"
            >
              Clear search
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((type) => (
            <motion.div
              key={type.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-start justify-between gap-4 rounded-xl border border-slate-100 bg-white p-4 shadow-sm"
            >
              <div className="min-w-0">
                <h3 className="font-semibold text-text-primary">{type.name}</h3>
              </div>
              <button
                onClick={() => setDeleting(type)}
                aria-label="Delete product type"
                className="shrink-0 rounded-lg p-2 text-red-600 transition-colors duration-150 hover:bg-red-50"
              >
                <Trash2 size={18} />
              </button>
            </motion.div>
          ))}
        </div>
      )}

      {/* Delete confirm dialog */}
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
              <div className="mb-4 flex items-start justify-between">
                <h3 className="text-lg font-bold text-text-primary">Delete product type?</h3>
                <button
                  onClick={() => setDeleting(null)}
                  className="text-text-secondary transition-colors duration-150 hover:text-text-primary"
                >
                  <X size={20} />
                </button>
              </div>
              <p className="text-sm text-text-secondary">
                Delete <span className="font-semibold text-text-primary">{deleting.name}</span>?
                This cannot be undone. Types in use by products cannot be deleted.
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
