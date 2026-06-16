import { createContext, useContext, useEffect, useState } from "react";
import { toast } from "sonner";
import api from "@/lib/api";
import { AuthContext } from "@/context/AuthContext";

export const CartContext = createContext(null);

export function CartProvider({ children }) {
  const auth = useContext(AuthContext);
  const role = auth?.role;

  // cart can hold items from several companies, grouped by company. checkout turns each
  // group into its own order on the backend.
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
      // swallow it - a failed cart fetch shouldn't block the page from loading
    }
  }

  // only pharmacies have a cart, load it once when we know the role
  useEffect(() => {
    if (role === "pharmacy") {
      refreshCart();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  async function addItem(productId, qty = 1, productUnitId = null) {
    try {
      // the cart endpoints only return { success, message }, they don't send the cart back,
      // so we re-fetch afterwards to keep local state honest
      const payload = { product_id: productId, quantity: qty };
      // leave it off when null so the backend picks the default packaging
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

  // checkout turns the cart into one order per company. hands back the created orders on success,
  // and deliberately throws on failure (e.g. 400 unavailable items) so the caller can show the
  // backend's message and keep them on the cart page to fix it.
  async function checkout() {
    const { data } = await api.post("/pharmacy/cart/checkout");
    const orders = data?.data?.orders ?? [];
    await refreshCart(); // should come back empty now
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
