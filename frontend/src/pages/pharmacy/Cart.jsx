import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Minus, Plus, X, ShoppingCart, Store } from "lucide-react";
import { toast } from "sonner";

import { formatCurrency } from "@/lib/utils";
import useCart from "@/hooks/useCart";
import DashboardLayout from "@/components/shared/DashboardLayout";

const PLACEHOLDER = "https://placehold.co/400x400/166534/ffffff?text=Product";

export default function Cart() {
  const navigate = useNavigate();
  const { groups, totalItems, totalPrice, updateQuantity, removeItem, checkout } =
    useCart();

  const [placing, setPlacing] = useState(false);

  async function placeOrder() {
    setPlacing(true);
    try {
      const orders = await checkout();
      const count = orders.length;
      toast.success(`${count} order${count === 1 ? "" : "s"} placed successfully`);
      navigate("/pharmacy/orders");
    } catch (err) {
      // e.g. a 400 for unavailable items - keep them on the cart page to fix it and show
      // whatever specific message the backend gave us
      toast.error(err.response?.data?.message || "Failed to place order");
    } finally {
      setPlacing(false);
    }
  }

  if (groups.length === 0) {
    return (
      <DashboardLayout role="pharmacy" title="My Cart">
        <div className="flex flex-col items-center justify-center rounded-xl border border-slate-100 bg-white py-20 text-center text-text-secondary shadow-sm">
          <ShoppingCart size={44} className="mb-3 text-slate-300" />
          <p className="text-sm font-medium">Your cart is empty</p>
          <button
            onClick={() => navigate("/pharmacy/market")}
            className="mt-4 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white transition duration-150 hover:bg-green-700 active:scale-[0.98]"
          >
            Browse Marketplace
          </button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout role="pharmacy" title="My Cart">
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        {/* Items, grouped by company */}
        <div className="space-y-6">
          {groups.map((group) => (
            <section
              key={group.company_id}
              className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
            >
              {/* Company section header */}
              <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-4 py-3">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-subtle text-primary">
                  <Store size={15} />
                </span>
                <h2 className="text-sm font-bold text-text-primary">
                  {group.company_name}
                </h2>
                <span className="ml-auto text-xs text-text-secondary">
                  {group.items.length} item{group.items.length === 1 ? "" : "s"}
                </span>
              </div>

              {/* Items in this company group */}
              <div className="divide-y divide-slate-100">
                {group.items.map((item, i) => {
                  const unit = Number(item.effective_price ?? item.price) || 0;
                  // max_quantity is how many PACKAGES the stock can cover
                  const maxQty =
                    item.max_quantity != null
                      ? Number(item.max_quantity)
                      : Number(item.quantity_in_stock) || 0;
                  return (
                    <motion.div
                      key={item.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.25, delay: Math.min(i * 0.04, 0.2) }}
                      className="flex gap-4 p-3"
                    >
                      <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                        <img
                          src={item.image || PLACEHOLDER}
                          alt={item.name}
                          onError={(e) => {
                            e.currentTarget.src = PLACEHOLDER;
                          }}
                          className="h-full w-full object-cover"
                        />
                      </div>

                      <div className="flex min-w-0 flex-1 flex-col">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h3 className="truncate text-sm font-semibold text-text-primary">
                              {item.name}
                            </h3>
                            {item.unit_name && (
                              <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-primary-subtle px-2 py-0.5 text-[11px] font-medium text-primary">
                                {item.unit_name}
                                {Number(item.discount_percent) > 0 &&
                                  ` · Save ${Number(item.discount_percent).toFixed(0)}%`}
                              </span>
                            )}
                          </div>
                          <button
                            onClick={() => removeItem(item.id)}
                            className="rounded-lg p-1 text-text-secondary transition-colors duration-150 hover:bg-slate-100 hover:text-red-600"
                            aria-label="Remove item"
                          >
                            <X size={16} />
                          </button>
                        </div>

                        <p className="mt-1 text-xs text-text-secondary">
                          {item.has_offer && item.list_price > unit ? (
                            <>
                              <span className="font-medium text-green-600">
                                {formatCurrency(unit)}
                              </span>{" "}
                              <span className="text-slate-400 line-through">
                                {formatCurrency(item.list_price ?? item.price)}
                              </span>{" "}
                              per {item.unit_name || "unit"}
                            </>
                          ) : (
                            <>
                              {formatCurrency(unit)} per {item.unit_name || "unit"}
                            </>
                          )}
                        </p>

                        <div className="mt-auto flex items-center justify-between pt-2">
                          <div className="flex items-center rounded-lg border border-border">
                            <button
                              onClick={() =>
                                updateQuantity(item.id, Math.max(1, item.quantity - 1))
                              }
                              disabled={item.quantity <= 1}
                              className="flex h-8 w-8 items-center justify-center text-text-secondary transition-colors duration-150 hover:bg-slate-50 disabled:opacity-40"
                              aria-label="Decrease quantity"
                            >
                              <Minus size={14} />
                            </button>
                            <span className="w-9 text-center text-sm font-semibold">
                              {item.quantity}
                            </span>
                            <button
                              onClick={() =>
                                updateQuantity(
                                  item.id,
                                  maxQty
                                    ? Math.min(maxQty, item.quantity + 1)
                                    : item.quantity + 1
                                )
                              }
                              disabled={maxQty > 0 && item.quantity >= maxQty}
                              className="flex h-8 w-8 items-center justify-center text-text-secondary transition-colors duration-150 hover:bg-slate-50 disabled:opacity-40"
                              aria-label="Increase quantity"
                            >
                              <Plus size={14} />
                            </button>
                          </div>
                          <span className="text-sm font-bold text-text-primary">
                            {formatCurrency(
                              item.subtotal ?? unit * item.quantity
                            )}
                          </span>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              {/* Group subtotal */}
              <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/60 px-4 py-2.5">
                <span className="text-xs font-medium text-text-secondary">
                  {group.company_name} subtotal
                </span>
                <span className="text-sm font-bold text-text-primary">
                  {formatCurrency(group.subtotal)}
                </span>
              </div>
            </section>
          ))}
        </div>

        {/* Summary */}
        <div className="lg:sticky lg:top-20 lg:self-start">
          <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
            <h2 className="text-base font-bold text-text-primary">Order Summary</h2>

            <p className="mt-1 text-xs text-text-secondary">
              Your cart will be split into one order per company.
            </p>

            <div className="mt-4 space-y-2 border-t border-border pt-4 text-sm">
              {groups.map((group) => (
                <div
                  key={group.company_id}
                  className="flex justify-between text-text-secondary"
                >
                  <span className="flex items-center gap-1.5 truncate">
                    <Store size={13} className="shrink-0" /> {group.company_name}
                  </span>
                  <span className="shrink-0 font-medium text-text-primary">
                    {formatCurrency(group.subtotal)}
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-4 flex items-baseline justify-between border-t border-border pt-4">
              <span className="text-sm font-medium text-text-primary">
                Total ({totalItems} item{totalItems === 1 ? "" : "s"})
              </span>
              <span className="text-2xl font-bold text-text-primary">
                {formatCurrency(totalPrice)}
              </span>
            </div>

            <button
              onClick={placeOrder}
              disabled={placing}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-3 text-base font-semibold text-white transition duration-150 hover:bg-green-700 active:scale-[0.98] disabled:opacity-60"
            >
              {placing
                ? "Placing order…"
                : `Place Order${groups.length > 1 ? `s (${groups.length})` : ""}`}
            </button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
