import { useState } from "react";
import useAuth from "@/hooks/useAuth";
import Sidebar from "@/components/shared/Sidebar";
import Navbar from "@/components/shared/Navbar";

// shell for the logged-in dashboard pages: docked sidebar on desktop, a
// hamburger-driven slide-in drawer on mobile, navbar up top, and a padded
// content area in the middle.
export default function DashboardLayout({ role, title, children }) {
  const { user } = useAuth();
  const activeRole = role ?? user?.role;
  const email = user?.email ?? "";
  const [navOpen, setNavOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <Sidebar role={activeRole} open={navOpen} onClose={() => setNavOpen(false)} />

      {/* content sits to the right of the sidebar on desktop */}
      <div className="md:ml-60">
        <Navbar
          title={title}
          role={activeRole}
          userEmail={email}
          onMenuClick={() => setNavOpen(true)}
        />

        <main className="p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
