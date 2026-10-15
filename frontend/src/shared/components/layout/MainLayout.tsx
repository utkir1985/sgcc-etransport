import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import Sidebar from './Sidebar';
import Header from './Header';
// realtime sync handled per-component

export default function MainLayout() {
  // 1024px dan tor oynada (planshet, kichik noutbuk oynasi) menyu ochiladigan panel bo‘ladi;
  // 1024–1439px da (1366/1280 noutbuklar) avtomatik ikonkalarga yig‘iladi, keng ekranda to‘liq ochiq.
  // Foydalanuvchi tugma bilan o‘zgartirsa — uning tanlovi ustun (ekran o‘lchami o‘zgarguncha).
  const [userCollapsed, setUserCollapsed] = useState<boolean | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const isWide = useMediaQuery('(min-width: 1440px)');
  const sidebarCollapsed = userCollapsed ?? !isWide;
  const location = useLocation();

  useEffect(() => {
    setUserCollapsed(null);
  }, [isWide]);

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

  // Global reaktiv o'zgarishlar faqat real harakat (yaratish/tasdiqlash) bo'lganda notifyOrdersChanged orqali tarqaladi

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
        onSidebarToggle={() => setUserCollapsed(!sidebarCollapsed)}
        onMobileMenuToggle={() => setMobileOpen(o => !o)}
      />

      <main
        className="pt-[var(--layout-header-height)] min-h-screen transition-[padding] duration-300"
        style={{ paddingLeft: isDesktop ? (sidebarCollapsed ? 72 : 280) : 0 }}
      >
        <div className="app-content-inner">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
