import { Navigate, Outlet } from "react-router-dom";
import useAuth from "@/hooks/useAuth";
import LoadingSpinner from "@/components/shared/LoadingSpinner";

// gate around a chunk of routes. only renders the <Outlet /> once the user is logged in
// (and, if allowedRoles is passed, has one of those roles).
export default function PrivateRoute({ allowedRoles }) {
  const { token, role, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!token) return <Navigate to="/login" replace />;

  if (allowedRoles && !allowedRoles.includes(role)) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
