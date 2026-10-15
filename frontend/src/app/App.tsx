import { AutoVersionUpdater } from '../shared/components/AutoVersionUpdater';
import { processRedirectTo } from '../shared/utils/dashboardReturn';
import { Routes, Route, Navigate, useSearchParams, useLocation } from 'react-router-dom';
import { useAuth } from '../shared/contexts/AuthContext';
import { buildLoginHref, clearStoredReturnTo } from '../shared/utils/authReturnTo';
import MainLayout from '../shared/components/layout/MainLayout';
import LoginPage from '../modules/auth/pages/LoginPage';
import ProfilePage from '../modules/auth/pages/ProfilePage';
import DashboardPage from '../modules/dashboard/pages/DashboardPage';
import TransportVehiclesPage from '../modules/dashboard/pages/TransportVehiclesPage';
import HistoryPage from '../modules/dashboard/pages/HistoryPage';
import ReportsPage from '../modules/dashboard/pages/ReportsPage';
import StatisticsPage from '../modules/dashboard/pages/StatisticsPage';
import { LogisticsTariffsPage } from '../modules/dashboard/pages/LogisticsTariffsPage';
import { TelegramAlertsPage } from '../modules/dashboard/pages/TelegramAlertsPage';
import OrdersPage from '../modules/marketing/pages/OrdersPage';
import ShipmentsPage from '../modules/dispatching/pages/ShipmentsPage';
import DispatchJournalPage from '../modules/dispatching/pages/DispatchJournalPage';
import { EmptyWagonsPage } from '../modules/dispatching/pages/EmptyWagonsPage';
import RailwayWagonIntakePage from '../modules/railway/pages/RailwayWagonIntakePage';
import LoadingPage from '../modules/warehouse/pages/LoadingPage';
import { GateScalesPage } from '../modules/gate-scales/pages/GateScalesPage';
import RegistryPage from '../modules/documents/pages/RegistryPage';
import NormativeDocsPage from '../modules/documents/pages/NormativeDocsPage';
import RegistryAnnexPage from '../modules/documents/pages/RegistryAnnexPage';
import UsersPage from '../modules/admin/pages/UsersPage';
import RolesPage from '../modules/admin/pages/RolesPage';
import ReferencesPage from '../modules/admin/pages/ReferencesPage';
import IntegrationsPage from '../modules/admin/pages/IntegrationsPage';
import AuditPage from '../modules/admin/pages/AuditPage';
import TrashPage from '../modules/admin/pages/TrashPage';
import ServerStatusPage from '../modules/admin/pages/ServerStatusPage';
import { ForceChangePasswordModal } from '../shared/components/ForceChangePasswordModal';

/** Rol bo'yicha boshqariladigan sahifa: menyuda bo'lmasa, ochilmaydi. */
function MenuGuardedRoute({ menuKey, children }: { menuKey: string; children: React.ReactNode }) {
  const { menu } = useAuth();
  if (menu.length === 0) return null; // menyu hali yuklanmagan
  const allowed = menu.some(entry => entry.key === menuKey);
  return allowed ? <>{children}</> : <Navigate to="/dashboard" replace />;
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const location = useLocation();
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-primary-600 border-t-transparent" />
      </div>
    );
  }
  if (!user) {
    const returnTo = `${location.pathname}${location.search}`;
    return <Navigate to={buildLoginHref(returnTo)} replace />;
  }
  return (
    <>
      {children}
      {user.mustChangePassword && <ForceChangePasswordModal />}
    </>
  );
}

function AdminOnlyRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  return user?.role === 'Admin' ? <>{children}</> : <Navigate to="/dashboard" replace />;
}

function LoginRoute() {
  const { user } = useAuth();
  if (user) {
    clearStoredReturnTo();
    return <Navigate to="/dashboard" replace />;
  }
  return <LoginPage />;
}

function ProcessRedirect({ to }: { to: string }) {
  const location = useLocation();
  return <Navigate to={processRedirectTo(to, location.search)} state={location.state} replace />;
}

function OrdersIndexRedirect() {
  const [searchParams] = useSearchParams();
  const tab = searchParams.get('tab');
  return <ProcessRedirect to={tab === 'road' ? '/orders/road' : '/orders/railway'} />;
}

export default function App() {
  return (
    <>
      <AutoVersionUpdater />
      <Routes>
      <Route path="/login" element={<LoginRoute />} />
      <Route path="/" element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="profile" element={<ProfilePage />} />
        {/* 01 Marketing */}
        <Route path="orders" element={<OrdersIndexRedirect />} />
        <Route path="orders/:logisticsRoute" element={<OrdersPage />} />
        {/* 02 ICHDX */}
        <Route path="order-dispatch-approvals" element={<ProcessRedirect to="/orders/railway?view=tasdiq" />} />
        <Route path="order-deputy-approvals" element={<ProcessRedirect to="/orders/railway?view=tasdiq" />} />
        <Route path="empty-wagons" element={<EmptyWagonsPage />} />
        <Route path="railway-intake" element={<RailwayWagonIntakePage />} />
        <Route path="stats" element={<StatisticsPage />} />
        <Route path="plans" element={<Navigate to="/stats" replace />} />
        <Route path="shipments" element={<ShipmentsPage />} />
        <Route path="dispatch" element={<DispatchJournalPage />} />
        {/* 03 Temir yo'l */}
        <Route path="wagons" element={<ProcessRedirect to="/railway-intake" />} />
        <Route path="station" element={<ProcessRedirect to="/empty-wagons?work=toKengsoy" />} />
        {/* 09 Avtotransport */}
        <Route path="vehicles" element={<Navigate to="/orders/road" replace />} />
        <Route path="road-shipments" element={<Navigate to="/orders/road" replace />} />
        <Route path="routes" element={<Navigate to="/admin/references/stations" replace />} />
        {/* 04 TM va XA */}
        <Route path="loading" element={<LoadingPage />} />
        {/* 05 Darvoza va tarozi (Yuk xatlariga yo'naltirilgan) */}
        <Route path="weighing" element={<GateScalesPage />} />
        <Route path="seals" element={<ProcessRedirect to="/registry" />} />
        <Route path="seals/scale" element={<ProcessRedirect to="/registry" />} />
        <Route path="seals/security" element={<ProcessRedirect to="/registry" />} />
        <Route path="gate" element={<ProcessRedirect to="/empty-wagons?work=gateCheck" />} />
        {/* 06 Hujjatlar */}
        <Route path="registry/create" element={<RegistryPage />} />
        <Route path="registry/approve" element={<RegistryPage />} />
        <Route path="registry/agree" element={<ProcessRedirect to="/registry/agree/permit" />} />
        <Route path="registry/agree/permit" element={<RegistryPage />} />
        <Route path="registry/agree/security" element={<RegistryPage />} />
        <Route path="registry" element={<RegistryPage />} />
        <Route path="normative-docs" element={<NormativeDocsPage />} />
        <Route path="permits" element={<ProcessRedirect to="/registry/agree/permit" />} />
        {/* 07 Buxgalteriya */}
        <Route path="order-approvals" element={<ProcessRedirect to="/orders/railway?view=tasdiq" />} />
        <Route path="invoices" element={<Navigate to="/admin/integrations/1c" replace />} />
        <Route path="integrations" element={<Navigate to="/admin/integrations" replace />} />
        {/* 08 Dashboard */}
        <Route path="transport" element={<Navigate to="/transport/tared" replace />} />
        <Route path="transport/:zone" element={<TransportVehiclesPage />} />
        <Route path="reports" element={<MenuGuardedRoute menuKey="reports"><ReportsPage /></MenuGuardedRoute>} />
        <Route path="reports/demurrage" element={<Navigate to="/stats" replace />} />
        <Route path="reports/weight-control" element={<Navigate to="/stats" replace />} />
        <Route path="reports/contractor-limits" element={<Navigate to="/stats" replace />} />
        <Route path="reports/defects-gu23" element={<Navigate to="/stats" replace />} />
        <Route path="reports/tariffs" element={<AdminOnlyRoute><LogisticsTariffsPage /></AdminOnlyRoute>} />
        <Route path="reports/telegram" element={<AdminOnlyRoute><TelegramAlertsPage /></AdminOnlyRoute>} />
        <Route path="history" element={<HistoryPage />} />
        <Route path="analytics" element={<Navigate to="/reports" replace />} />
        <Route path="monitoring" element={<ServerStatusPage />} />
        {/* Admin */}
        <Route path="users" element={<Navigate to="/admin/users" replace />} />
        <Route path="settings" element={<Navigate to="/dashboard" replace />} />
        <Route path="admin/users" element={<AdminOnlyRoute><UsersPage /></AdminOnlyRoute>} />
        <Route path="admin/roles" element={<AdminOnlyRoute><RolesPage /></AdminOnlyRoute>} />
        <Route path="admin/roles/:section" element={<AdminOnlyRoute><RolesPage /></AdminOnlyRoute>} />
        <Route path="admin/references" element={<AdminOnlyRoute><ReferencesPage /></AdminOnlyRoute>} />
        <Route path="admin/references/:refType" element={<AdminOnlyRoute><ReferencesPage /></AdminOnlyRoute>} />
        <Route path="admin/integrations" element={<AdminOnlyRoute><IntegrationsPage /></AdminOnlyRoute>} />
        <Route path="admin/integrations/:system" element={<AdminOnlyRoute><IntegrationsPage /></AdminOnlyRoute>} />
        <Route path="admin/audit" element={<AuditPage />} />
        <Route path="admin/audit/:section" element={<AuditPage />} />
        <Route path="admin/trash" element={<AdminOnlyRoute><TrashPage /></AdminOnlyRoute>} />
        <Route path="admin/server-status" element={<AdminOnlyRoute><ServerStatusPage /></AdminOnlyRoute>} />
        <Route path="server-status" element={<Navigate to="/admin/server-status" replace />} />
      </Route>
      <Route
        path="/registry/annex"
        element={(
          <ProtectedRoute>
            <RegistryAnnexPage />
          </ProtectedRoute>
        )}
      />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
    </>
  );
}
