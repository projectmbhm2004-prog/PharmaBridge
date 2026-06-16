import useAuth from "@/hooks/useAuth";
import Sidebar from "@/components/shared/Sidebar";
import BottomNav from "@/components/shared/BottomNav";
import Navbar from "@/components/shared/Navbar";

// shell for the logged-in dashboard pages: sidebar on desktop, bottom nav on mobile,
// navbar up top, and a padded content area in the middle
export default function DashboardLayout({ role, title, children }) {
  const { user } = useAuth();
  const activeRole = role ?? user?.role;
  const email = user?.email ?? "";

  return (
    <div className="min-h-screen bg-background">
      <Sidebar role={activeRole} />

      {/* content sits to the right of the sidebar on desktop */}
      <div className="md:ml-60">
        <Navbar title={title} role={activeRole} userEmail={email} />

        {/* pb-20 keeps the mobile bottom nav from covering content */}
        <main className="p-4 pb-20 md:p-6 md:pb-6">{children}</main>
      </div>

      <BottomNav role={activeRole} />
    </div>
  );
}
