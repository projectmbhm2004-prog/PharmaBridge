import { Menu, ShoppingCart } from "lucide-react";
import { useNavigate } from "react-router-dom";
import NotificationBell from "@/components/shared/NotificationBell";
import useAuth from "@/hooks/useAuth";
import useCart from "@/hooks/useCart";

// the top bar on dashboard pages
export default function Navbar({ title }) {
  const { user, role } = useAuth();
  const { totalItems } = useCart();
  const navigate = useNavigate();
  const email = user?.email || "";
  const initials = email ? email[0].toUpperCase() : "?";

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200/70 bg-white/90 px-4 backdrop-blur-sm md:px-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 transition-colors duration-150 hover:bg-slate-100 active:scale-95 md:hidden"
          aria-label="Menu"
        >
          <Menu size={20} />
        </button>
        <h1 className="truncate text-lg font-bold tracking-tight text-slate-900">
          {title}
        </h1>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <NotificationBell />

        {role === "pharmacy" && (
          <button
            type="button"
            onClick={() => navigate("/pharmacy/cart")}
            className="relative flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 transition-colors duration-150 hover:bg-slate-100 active:scale-95"
            aria-label="Cart"
          >
            <ShoppingCart size={20} />
            {totalItems > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
                {totalItems}
              </span>
            )}
          </button>
        )}

        {role && (
          <span className="hidden rounded-full bg-primary-subtle px-2.5 py-1 text-xs font-medium capitalize text-primary ring-1 ring-inset ring-primary/10 sm:inline">
            {role}
          </span>
        )}

        <span
          className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-xs font-bold text-white ring-2 ring-primary/15"
          title={email}
        >
          {initials}
        </span>
      </div>
    </header>
  );
}
