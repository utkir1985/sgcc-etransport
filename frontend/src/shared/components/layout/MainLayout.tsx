import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import Sidebar from './Sidebar';
import Header from './Header';
import { notifyOrdersChanged, startAutoRefresh } from '../../utils/realtimeSync';

export default function MainLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const location = useLocation();

  useEffect(() => {
    if (isDesktop) setMobileOpen(false);
  }, [isDesktop]);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (mobileOpen && !isDesktop) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
    document.body.style.overflow = '';
    return undefined;
  }, [mobileOpen, isDesktop]);

  // Barcha rollar / ochiq panellar: har 5 soniyada global yangilanish signali
  useEffect(() => startAutoRefresh(() => notifyOrdersChanged()), []);

  return (
    <div className="min-h-screen bg-[#F5F7FA] dark:bg-[var(--color-dark-base)] transition-colors duration-300">
      {mobileOpen && !isDesktop && (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-black/50"
          aria-label="Menyuni yopish"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <Sidebar
        isDesktop={isDesktop}
        collapsed={sidebarCollapsed}
        mobileOpen={mobileOpen}
        onNavigate={() => setMobileOpen(false)}
      />

      <Header
        isDesktop={isDesktop}
        sidebarCollapsed={sidebarCollapsed}
        mobileOpen={mobileOpen}
        onSidebarToggle={() => setSidebarCollapsed(c => !c)}
        onMobileMenuToggle={() => setMobileOpen(o => !o)}
      />

      <main
        className="pt-[var(--layout-header-height)] min-h-screen transition-[padding] duration-300"
        style={{ paddingLeft: isDesktop ? (sidebarCollapsed ? 72 : 260) : 0 }}
      >
        <div className="app-content-inner">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
