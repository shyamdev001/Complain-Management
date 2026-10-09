import { Navigate, Outlet } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

/** Only office staff sign in, so everyone lands on the office dashboard. */
export const HOME = '/admin';

/** Pages only the super admin may open; office staff are sent back to the dashboard. */
export function SuperAdminRoute() {
  const { user } = useAuth();
  return user?.role === 'SUPER_ADMIN' ? <Outlet /> : <Navigate to={HOME} replace />;
}

export function ProtectedRoute() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  return <Outlet />;
}
