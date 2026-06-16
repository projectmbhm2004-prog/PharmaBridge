import { Fragment } from "react";
import { NavLink } from "react-router-dom";
import {
  ClipboardList,
  ShoppingBag,
  Tag,
  Store,
  Building2,
  Hospital,
  Package,
  Car,
  Users,
  ChartColumn,
  ShoppingCart,
  LogOut,
  X,
} from "lucide-react";
import useAuth from "@/hooks/useAuth";
import useCart from "@/hooks/useCart";

// nav links keyed by role, consumed by the Sidebar (docked on desktop, drawer on mobile)
// eslint-disable-next-line react-refresh/only-export-components
export const NAV_LINKS = {
  admin: [
    { icon: ClipboardList, label: "Registrations", to: "/admin/registrations" },
    { icon: ShoppingBag, label: "Orders", to: "/admin/orders" },
    { icon: Tag, label: "Categories", to: "/admin/categories" },
    { icon: Package, label: "Product Types", to: "/admin/product-types" },
    { icon: Store, label: "Market", to: "/admin/market" },
    { icon: Building2, label: "Companies", to: "/admin/companies" },
    { icon: Hospital, label: "Pharmacies", to: "/admin/pharmacies" },
    { icon: Users, label: "Drivers", to: "/admin/drivers" },
    { icon: ChartColumn, label: "Reports", to: "/admin/reports" },
  ],
  company: [
    { icon: ShoppingBag, label: "Orders", to: "/company/orders" },
    { icon: Package, label: "Products", to: "/company/products" },
    { icon: Car, label: "Drivers", to: "/company/drivers" },
    { icon: ChartColumn, label: "Financial", to: "/company/financial" },
    { icon: Store, label: "Market", to: "/company/market" },
  ],
  pharmacy: [
    { icon: Store, label: "Market", to: "/pharmacy/market" },
    { icon: ShoppingBag, label: "My Orders", to: "/pharmacy/orders" },
    { icon: ChartColumn, label: "Financial", to: "/pharmacy/financial" },
  ],
  driver: [
    { icon: ClipboardList, label: "My Orders", to: "/driver/orders" },
  ],
};

// Navigation panel: a fixed sidebar on desktop (md+), and a slide-in drawer on
// mobile driven by the Navbar hamburger. `open`/`onClose` only matter on mobile;
// on desktop the panel is always docked (md:translate-x-0).
export default function Sidebar({ role, open = false, onClose = () => {} }) {
  const { user, logout } = useAuth();
  const { totalItems } = useCart();
  const links = NAV_LINKS[role] ?? [];
  const email = user?.email ?? "";

  // shared link styling, used for the role links and the pharmacy cart link
  const linkClass = ({ isActive }) =>
    `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors duration-150 ${
      isActive
        ? "bg-white/15 font-semibold text-white shadow-sm"
        : "font-medium text-white/80 hover:bg-white/10 hover:text-white"
    }`;

  return (
    <>
      {/* Mobile backdrop — tap to dismiss. Hidden on desktop. */}
      <div
        onClick={onClose}
        aria-hidden="true"
        className={`fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm transition-opacity duration-300 md:hidden ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      <aside
        className={`fixed left-0 top-0 z-50 flex h-screen w-60 flex-col bg-primary text-white transition-transform duration-300 ease-spring md:z-30 md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Logo + mobile close button */}
        <div className="flex items-center gap-2 px-5 py-5">
          <img src="/icon.png" alt="PharmaBridge" className="w-8 h-8 object-contain" />
          <span className="text-lg font-bold tracking-tight text-white">PharmaBridge</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="ml-auto flex h-9 w-9 items-center justify-center rounded-lg text-white/80 transition-colors duration-150 hover:bg-white/10 hover:text-white active:scale-95 md:hidden"
          >
            <X size={20} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
          {links.map(({ icon: Icon, label, to }) => (
            <Fragment key={to}>
              <NavLink to={to} onClick={onClose} className={linkClass}>
                <Icon size={20} className="shrink-0" />
                <span>{label}</span>
              </NavLink>

              {role === "pharmacy" && to === "/pharmacy/market" && (
                <NavLink to="/pharmacy/cart" onClick={onClose} className={linkClass}>
                  <ShoppingCart size={20} className="shrink-0" />
                  <span>My Cart</span>
                  {totalItems > 0 && (
                    <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold leading-none text-white">
                      {totalItems}
                    </span>
                  )}
                </NavLink>
              )}
            </Fragment>
          ))}
        </nav>

        {/* User + logout */}
        <div className="border-t border-white/15 px-4 py-4">
          <p className="mb-2 truncate text-xs text-white/60" title={email}>
            {email}
          </p>
          <button
            type="button"
            onClick={logout}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium text-white/80 transition-colors duration-150 hover:bg-white/10 hover:text-white active:scale-[0.98]"
          >
            <LogOut size={18} className="shrink-0" />
            <span>Logout</span>
          </button>
        </div>
      </aside>
    </>
  );
}
