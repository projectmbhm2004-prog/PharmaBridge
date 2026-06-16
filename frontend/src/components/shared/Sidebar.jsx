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
} from "lucide-react";
import useAuth from "@/hooks/useAuth";
import useCart from "@/hooks/useCart";

// nav links keyed by role, shared between the Sidebar and the mobile BottomNav
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

// desktop sidebar, hidden on mobile (the BottomNav covers that)
export default function Sidebar({ role }) {
  const { user, logout } = useAuth();
  const { totalItems } = useCart();
  const links = NAV_LINKS[role] ?? [];
  const email = user?.email ?? "";

  return (
    <aside className="fixed left-0 top-0 hidden h-screen w-60 flex-col bg-primary text-white md:flex">
      {/* Logo */}
      <div className="flex items-center gap-2 px-5 py-5">
        <img src="/icon.png" alt="PharmaBridge" className="w-8 h-8 object-contain" />
        <span className="text-lg font-bold tracking-tight text-white">PharmaBridge</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 px-3 py-2">
        {links.map(({ icon: Icon, label, to }) => (
          <Fragment key={to}>
            <NavLink
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors duration-150 ${
                  isActive
                    ? "bg-white/15 font-semibold text-white shadow-sm"
                    : "font-medium text-white/80 hover:bg-white/10 hover:text-white"
                }`
              }
            >
              <Icon size={20} className="shrink-0" />
              <span>{label}</span>
            </NavLink>

            {role === "pharmacy" && to === "/pharmacy/market" && (
              <NavLink
                to="/pharmacy/cart"
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors duration-150 ${
                    isActive
                      ? "bg-white/15 font-semibold text-white shadow-sm"
                      : "font-medium text-white/80 hover:bg-white/10 hover:text-white"
                  }`
                }
              >
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
  );
}
