import { NavLink } from "react-router-dom";
import { ShoppingCart } from "lucide-react";
import { NAV_LINKS } from "@/components/shared/Sidebar";
import useCart from "@/hooks/useCart";

// mobile-only bottom tab bar, hidden from md up
export default function BottomNav({ role }) {
  const links = NAV_LINKS[role] ?? [];
  const { totalItems } = useCart();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 flex border-t border-slate-200 bg-white md:hidden">
      {links.map(({ icon: Icon, label, to }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            `flex flex-1 flex-col items-center gap-1 py-2 text-[11px] font-medium transition-colors duration-150 active:scale-95 ${
              isActive ? "text-primary" : "text-slate-400 hover:text-slate-600"
            }`
          }
        >
          <Icon size={20} className="shrink-0" />
          <span className="truncate">{label}</span>
        </NavLink>
      ))}

      {role === "pharmacy" && (
        <NavLink
          to="/pharmacy/cart"
          className={({ isActive }) =>
            `flex flex-1 flex-col items-center gap-1 py-2 text-[11px] font-medium transition-colors duration-150 active:scale-95 ${
              isActive ? "text-primary" : "text-slate-400 hover:text-slate-600"
            }`
          }
        >
          <span className="relative">
            <ShoppingCart size={20} className="shrink-0" />
            {totalItems > 0 && (
              <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
                {totalItems}
              </span>
            )}
          </span>
          <span className="truncate">Cart</span>
        </NavLink>
      )}
    </nav>
  );
}
