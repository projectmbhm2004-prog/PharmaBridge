import { createContext, useContext, useEffect, useState } from "react";
import { toast } from "sonner";
import api from "@/lib/api";
import { AuthContext } from "@/context/AuthContext";

export const CartContext = createContext(null);

export function CartProvider({ children }) {
  const auth = useContext(AuthContext);
  const role = auth?.role;

  // Multi-company cart: items are grouped by company. At checkout the backend
  // splits the cart into one order per company.
  const [groups, setGroups] = useState([]);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPrice, setTotalPrice] = useState(0);

  function applyCart(cart) {
    const list = cart?.groups ?? [];
    setGroups(list);
    setTotalItems(
      cart?.total_items ??
        cart?.totalItems ??
        list.reduce(
          (sum, g) =>
            sum + (g.items ?? []).reduce((s, it) => s + (it.quantity || 0), 0),
          0
        )
    );
    setTotalPrice(
      cart?.total_price ??
        cart?.totalPrice ??
        list.reduce((sum, g) => sum + (g.subtotal || 0), 0)
    );
  }

  async function refreshCart() {
    try {
      const { data } = await api.get("/pharmacy/cart");
      applyCart(data?.data ?? data);
    } catch {
      // Silent — cart is non-critical to page load.
    }
  }

  // Pharmacies load their cart on mount.
  useEffect(() => {
    if (role === "pharmacy") {
      refreshCart();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  async function addItem(productId, qty = 1, productUnitId = null) {
    try {
      // These cart endpoints return only { success, message } — they do NOT
      // echo the cart back, so we must re-fetch to keep local state in sync.
      const payload = { product_id: productId, quantity: qty };
      // Omit when null so the backend falls back to the default packaging.
      if (productUnitId != null) payload.product_unit_id = productUnitId;
      await api.post("/pharmacy/cart", payload);
      await refreshCart();
      return { ok: true };
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not add to cart");
      return { ok: false };
    }
  }

  async function removeItem(id) {
    try {
      await api.delete(`/pharmacy/cart/${id}`);
      await refreshCart();
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not remove item");
    }
  }

  async function updateQuantity(id, qty) {
    try {
      await api.patch(`/pharmacy/cart/${id}`, { quantity: qty });
      await refreshCart();
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not update quantity");
    }
  }

  // Checkout splits the cart into one order per company. Returns the created
  // orders on success; throws on failure (e.g. 400 unavailable items) so the
  // caller can show the backend message and keep the user on the cart page.
  async function checkout() {
    const { data } = await api.post("/pharmacy/cart/checkout");
    const orders = data?.data?.orders ?? [];
    await refreshCart(); // cart should now be empty
    return orders;
  }

  const value = {
    groups,
    totalItems,
    totalPrice,
    addItem,
    removeItem,
    updateQuantity,
    checkout,
    refreshCart,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}
