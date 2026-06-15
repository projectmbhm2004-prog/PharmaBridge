import useAuth from "@/hooks/useAuth";
import Sidebar from "@/components/shared/Sidebar";
import BottomNav from "@/components/shared/BottomNav";
import Navbar from "@/components/shared/Navbar";

/**
 * Shell for authenticated dashboard pages: fixed Sidebar on desktop, fixed
 * BottomNav on mobile, persistent Navbar, and a padded content area.
 *
 * @param {{ role?: string, title?: string, children?: React.ReactNode }} props
 */
export default function DashboardLayout({ role, title, children }) {
  const { user } = useAuth();
  const activeRole = role ?? user?.role;
  const email = user?.email ?? "";

  return (
    <div className="min-h-screen bg-background">
      <Sidebar role={activeRole} />

      {/* Content column — offset for the sidebar on desktop. */}
      <div className="md:ml-60">
        <Navbar title={title} role={activeRole} userEmail={email} />

        {/* pb-20 leaves room for the mobile BottomNav. */}
        <main className="p-4 pb-20 md:p-6 md:pb-6">{children}</main>
      </div>

      <BottomNav role={activeRole} />
    </div>
  );
}
