import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { ProtectedRoute, HOME } from '@/components/ProtectedRoute';
import { useAuth } from '@/hooks/useAuth';

import { LoginPage } from '@/pages/auth/LoginPage';
import { NotFoundPage } from '@/pages/NotFoundPage';

// Pages load on demand so the login screen stays light.
const AdminLayout = lazy(() => import('@/layouts/AdminLayout').then((m) => ({ default: m.AdminLayout })));
const AdminDashboardPage = lazy(() =>
  import('@/pages/admin/AdminDashboardPage').then((m) => ({ default: m.AdminDashboardPage })),
);
const ComplaintsPage = lazy(() => import('@/pages/admin/ComplaintsPage').then((m) => ({ default: m.ComplaintsPage })));
const ComplaintDetailPage = lazy(() =>
  import('@/pages/ComplaintDetailPage').then((m) => ({ default: m.ComplaintDetailPage })),
);
const NewComplaintPage = lazy(() =>
  import('@/pages/admin/NewComplaintPage').then((m) => ({ default: m.NewComplaintPage })),
);
const CustomersPage = lazy(() => import('@/pages/admin/CustomersPage').then((m) => ({ default: m.CustomersPage })));
const CustomerDetailPage = lazy(() =>
  import('@/pages/admin/CustomerDetailPage').then((m) => ({ default: m.CustomerDetailPage })),
);
const TeamPage = lazy(() => import('@/pages/admin/TeamPage').then((m) => ({ default: m.TeamPage })));
const SettingsPage = lazy(() => import('@/pages/admin/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const AuditLogPage = lazy(() => import('@/pages/admin/AuditLogPage').then((m) => ({ default: m.AuditLogPage })));

function RouteFallback() {
  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
    </div>
  );
}

function RootRedirect() {
  const { user, isLoading } = useAuth();
  if (isLoading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={HOME} replace />;
}

export default function App() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/login" element={<LoginPage />} />

        <Route element={<ProtectedRoute />}>
          <Route element={<AdminLayout />}>
            <Route path="/admin" element={<AdminDashboardPage />} />
            <Route path="/admin/complaints" element={<ComplaintsPage />} />
            <Route path="/admin/complaints/new" element={<NewComplaintPage />} />
            <Route path="/admin/complaints/:id" element={<ComplaintDetailPage />} />
            <Route path="/admin/customers" element={<CustomersPage />} />
            <Route path="/admin/customers/:id" element={<CustomerDetailPage />} />
            <Route path="/admin/team" element={<TeamPage />} />
            <Route path="/admin/settings" element={<SettingsPage />} />
            <Route path="/admin/audit-logs" element={<AuditLogPage />} />
          </Route>
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  );
}
