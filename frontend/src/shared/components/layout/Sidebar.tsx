import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  LayoutDashboard, FileText, Calendar, Train, Users, BarChart3, Settings,
  BookOpen, CalendarCheck, Receipt, Package, MapPin, PackageOpen, Scale,
  Lock, FileCheck, Shield, ShieldCheck, FileSearch, Plug, TrendingUp, Activity,
  TrainFront, Truck, X, ChevronDown, UserPlus, Menu, Layers, KeyRound,
  Building2, Database, Flame, ScrollText, LogIn, History, Factory, Clock,
  ArrowDownToLine, ArrowUpFromLine, PackageCheck, AlertTriangle, Trash2,
  Weight, Play, BadgeCheck, Target, Gauge,
} from 'lucide-react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import {
  augmentMenuItems,
  findActiveMenuTrail,
  menuHasKey,
  menuItemMatches,
} from '../../utils/menuNav';
import type { MenuItem } from '../../types';
import { api } from '../../services/api';
import { useRbacPermission } from '../../hooks/useRbacPermission';
import { buildRoleNotifications } from '../../utils/roleNotifications';
import { subscribeOrdersChanged } from '../../utils/realtimeSync';

const ICONS: Record<string, React.ComponentType<{ className?: string; strokeWidth?: number; style?: React.CSSProperties }>> = {
  LayoutDashboard, FileText, Calendar, Train, Users, BarChart3, Settings,
  BookOpen, CalendarCheck, Receipt, Package, MapPin, PackageOpen, Scale,
  Lock, FileCheck, Shield, ShieldCheck, FileSearch, Plug, TrendingUp, Activity, Truck,
  TrainFront, UserPlus, Menu, Layers, KeyRound, Building2, Database, Flame, ScrollText, LogIn, History, Factory, Clock,
  ArrowDownToLine, ArrowUpFromLine, PackageCheck, AlertTriangle, Trash2,
  Weight, Play, BadgeCheck, Target, Gauge,
};


const MENU_ITEM_COLORS: Record<string, string> = {
  dashboard: '#818cf8',         // Indigo: Boshqaruv paneli
  orders: '#34d399',            // Emerald: Buyurtmalar
  'orders-railway': '#38bdf8',  // Sky: Temir yo'l
  'orders-road': '#fbbf24',     // Amber: Avtotransport
  'loading-docs': '#fbbf24',    // Amber: Yuklash jarayonlari
  registry: '#34d399',          // Emerald: Yuk xatlari
  'empty-wagons': '#fb923c',    // Orange: Kiritish xizmat xatlari
  'defect-acts': '#f43f5e',     // Rose: Dalolatnomalar
  transport: '#38bdf8',         // Sky: Majmuadagi vagonlar
  'transport-tared': '#818cf8', // Indigo: Tara qilingan
  'transport-loading': '#fbbf24',// Amber: Yuklanmoqda
  'transport-loaded': '#34d399',// Emerald: Yuklangan
  'transport-dispatched': '#22d3ee', // Cyan: Chiqishga tayyor
  history: '#94a3b8',           // Slate: Jarayonlar tarixi
  statistics: '#c084fc',        // Purple: Statistika
  reports: '#c084fc',           // Purple: Hisobotlar
  plans: '#a855f7',             // Purple: Rejalar
  'normative-docs': '#2dd4bf',  // Teal: Normativ hujjatlar
  sfera: '#f97316',             // Orange: Sfera Balance
  'railway-intake': '#22d3ee',  // Cyan: Vagonlar reestri
  'wagon-registry': '#22d3ee',  // Cyan
  loading: '#fb923c',           // Orange: Yuklash (TM va XA)
  users: '#60a5fa',             // Blue: Foydalanuvchilar
  roles: '#10b981',             // Emerald: Rollar va Huquqlar
  catalogs: '#a78bfa',          // Violet: Ma'lumotnomalar
  integrations: '#facc15',      // Yellow: Integratsiyalar
  audit: '#38bdf8',             // Sky: Audit Log
  'recycle-bin': '#f43f5e',     // Rose: O'chirilganlar
  'server-status': '#4ade80',   // Green: Server holati
  seals: '#f59e0b',             // Amber: Plombalar
  weighing: '#818cf8',          // Indigo: Tarozi
  'wagon-gate-check': '#10b981',// Emerald: Tekshirish va kiritish
};

const ICON_COLORS: Record<string, string> = {
  LayoutDashboard: '#818cf8',
  FileText: '#34d399',
  FileCheck: '#fbbf24',
  Train: '#38bdf8',
  TrainFront: '#22d3ee',
  Truck: '#fbbf24',
  BarChart3: '#c084fc',
  TrendingUp: '#c084fc',
  BookOpen: '#2dd4bf',
  Package: '#fb923c',
  PackageOpen: '#fb923c',
  PackageCheck: '#34d399',
  Users: '#60a5fa',
  Shield: '#10b981',
  ShieldCheck: '#10b981',
  Book: '#a78bfa',
  Database: '#a78bfa',
  Layers: '#a78bfa',
  Plug: '#facc15',
  FileSearch: '#38bdf8',
  History: '#38bdf8',
  ScrollText: '#38bdf8',
  Trash2: '#f43f5e',
  Activity: '#4ade80',
  Scale: '#818cf8',
  Weight: '#818cf8',
  Factory: '#fb923c',
  Clock: '#fbbf24',
  ArrowDownToLine: '#38bdf8',
  ArrowUpFromLine: '#34d399',
  KeyRound: '#10b981',
  AlertTriangle: '#f59e0b',
  Play: '#3b82f6',
  BadgeCheck: '#10b981',
  Target: '#ec4899',
};

function getMenuItemColor(item: MenuItem): string {
  if (MENU_ITEM_COLORS[item.key]) return MENU_ITEM_COLORS[item.key];
  if (ICON_COLORS[item.icon]) return ICON_COLORS[item.icon];
  return '#60a5fa';
}

interface SidebarProps {
  isDesktop: boolean;
  collapsed: boolean;
  mobileOpen: boolean;
  onNavigate: () => void;
}

function navClass(isActive: boolean, isDark: boolean, showLabels: boolean, sub = false) {
  return [
    'sidebar-nav-item group flex items-center gap-3 rounded-[10px] min-h-[44px]',
    sub && showLabels && 'sidebar-nav-sub-item',
    !showLabels && 'sidebar-nav-item--collapsed',
    showLabels ? (sub ? 'px-3 py-2 ml-3' : 'px-3.5 py-2.5') : 'justify-center px-0 py-3',
    isActive
      ? isDark ? 'nav-item-active-dark' : 'nav-item-active-light'
      : isDark ? 'nav-item-dark' : 'nav-item-light',
  ].join(' ');
}

function subNavClass(isActive: boolean, isDark: boolean, showLabels: boolean) {
  return [
    'sidebar-nav-item group flex items-center gap-3 rounded-[10px] min-h-[44px]',
    showLabels && 'sidebar-nav-sub-item',
    showLabels ? 'px-3 py-2 ml-3' : 'justify-center px-0 py-3',
    isActive
      ? isDark ? 'nav-sub-item-active-dark' : 'nav-sub-item-active-light'
      : isDark ? 'nav-item-dark' : 'nav-item-light',
  ].join(' ');
}

function SidebarMenuItem({
  item,
  isDark,
  showLabels,
  expanded,
  flyoutOpen,
  isItemActive,
  onToggleExpand,
  onToggleFlyout,
  onNavigate,
  notificationCount = 0,
}: {
  item: MenuItem;
  isDark: boolean;
  showLabels: boolean;
  expanded: boolean;
  flyoutOpen: boolean;
  isItemActive: boolean;
  onToggleExpand: () => void;
  onToggleFlyout: () => void;
  onNavigate: () => void;
  notificationCount?: number;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const Icon = ICONS[item.icon] || LayoutDashboard;
  const itemColor = getMenuItemColor(item);
  const hasChildren = !!item.children?.length;
  const isGroupActive = hasChildren && item.children!.some(
    child => menuItemMatches(child, location.pathname, location.search),
  );

  useEffect(() => {
    if (!flyoutOpen || showLabels) return;

    function handleClickOutside(event: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) {
        onToggleFlyout();
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [flyoutOpen, showLabels, onToggleFlyout]);

  if (!hasChildren) {
    return (
      <NavLink
        to={item.path}
        end
        onClick={onNavigate}
        title={!showLabels ? item.label : undefined}
        className={() => `${navClass(isItemActive, isDark, showLabels)} relative`}
      >
        <Icon className="nav-icon" strokeWidth={isItemActive ? 2 : 1.75} style={!isItemActive ? { color: itemColor } : undefined} />
        {showLabels && <span className="nav-label min-w-0 flex-1 truncate">{item.label}</span>}
        {notificationCount > 0 && (
          <span
            className={showLabels
              ? 'inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[10px] font-bold tabular-nums text-white shadow-sm'
              : 'absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full border-2 border-[#0c2949] bg-rose-500'}
            aria-label={`${notificationCount} ta bo‘sh vagon xabarnomasi`}
          >
            {showLabels ? (notificationCount > 99 ? '99+' : notificationCount) : null}
          </span>
        )}
      </NavLink>
    );
  }

  if (!showLabels) {
    return (
      <div ref={wrapRef} className="sidebar-nav-flyout-wrap">
        <button
          type="button"
          onClick={onToggleFlyout}
          title={item.label}
          aria-expanded={flyoutOpen}
          aria-haspopup="true"
          className={[navClass(isGroupActive || flyoutOpen, isDark, showLabels), 'w-full'].join(' ')}
        >
          <Icon className="nav-icon" strokeWidth={isGroupActive || flyoutOpen ? 2 : 1.75} style={!(isGroupActive || flyoutOpen) ? { color: itemColor } : undefined} />
        </button>

        {flyoutOpen && (
          <div className={`sidebar-nav-flyout${isDark ? ' sidebar-nav-flyout--dark' : ''}`}>
            <div className="sidebar-nav-flyout__head">
              <p className="sidebar-nav-flyout__title">{item.label}</p>
            </div>
            <div className="sidebar-nav-flyout__items">
              {item.children!.map(child => {
                const ChildIcon = ICONS[child.icon] || Train;
                const childActive = menuItemMatches(child, location.pathname, location.search);
                const childColor = getMenuItemColor(child);
                return (
                  <NavLink
                    key={child.key}
                    to={child.path}
                    onClick={onNavigate}
                    className={`sidebar-flyout-item${childActive ? ' sidebar-flyout-item--active' : ''}`}
                  >
                    <span
                      className="sidebar-flyout-item__icon"
                      style={!childActive ? { color: childColor } : undefined}
                    >
                      <ChildIcon strokeWidth={childActive ? 2 : 1.75} />
                    </span>
                    <span className="sidebar-flyout-item__label">{child.label}</span>
                  </NavLink>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="sidebar-nav-group">
      <button
        type="button"
        onClick={() => onToggleExpand()}
        title={!showLabels ? item.label : undefined}
        className={[
          navClass(isGroupActive, isDark, showLabels),
          'w-full text-left sidebar-nav-group__trigger',
        ].join(' ')}
        aria-expanded={expanded}
      >
        <Icon className="nav-icon" strokeWidth={isGroupActive ? 2 : 1.75} style={!isGroupActive ? { color: itemColor } : undefined} />
        {showLabels && (
          <>
            <span className="nav-label truncate flex-1">{item.label}</span>
            <ChevronDown
              className={`w-4 h-4 shrink-0 opacity-60 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
              strokeWidth={1.75}
            />
          </>
        )}
      </button>

      {showLabels && expanded && (
        <div className="sidebar-nav-sub mt-0.5 space-y-0.5">
          {item.children!.map(child => {
            const ChildIcon = ICONS[child.icon] || Train;
            const childActive = menuItemMatches(child, location.pathname, location.search);
            const childColor = getMenuItemColor(child);
            return (
              <NavLink
                key={child.key}
                to={child.path}
                end
                onClick={onNavigate}
                className={subNavClass(childActive, isDark, showLabels)}
              >
                <ChildIcon
                  className="nav-icon nav-icon--sub"
                  strokeWidth={childActive ? 2 : 1.75}
                  style={!childActive ? { color: childColor } : undefined}
                />
                <span className="nav-label truncate">{child.label}</span>
              </NavLink>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function Sidebar({ isDesktop, collapsed, mobileOpen, onNavigate }: SidebarProps) {
  const { menu, user } = useAuth();
  const { theme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const isDark = theme === 'dark';
  const showLabels = !isDesktop || !collapsed;
  const isVisible = isDesktop || mobileOpen;

  const { can } = useRbacPermission();
  const canSfera = can('sfera.view');
  const items = useMemo(
    () => augmentMenuItems(menu, user?.role).filter(entry => entry.key !== 'sfera' || canSfera),
    [menu, user?.role, canSfera],
  );
  const [emptyWagonAlertCount, setEmptyWagonAlertCount] = useState(0);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [openFlyoutKey, setOpenFlyoutKey] = useState<string | null>(null);
  const activeTrail = useMemo(
    () => findActiveMenuTrail(items, location.pathname, location.search),
    [items, location.pathname, location.search],
  );

  const loadEmptyWagonAlerts = useCallback(() => {
    const role = user?.role || '';
    const hasEmptyWagonMenu = menuHasKey(items, 'empty-wagons')
      || menuHasKey(items, 'loading-docs')
      || menuHasKey(items, 'wagon-gate-check');
    if (!role || !hasEmptyWagonMenu) {
      setEmptyWagonAlertCount(0);
      return;
    }

    api.getEmptyWagonArrivals()
      .then(response => {
        const count = buildRoleNotifications(role, (response.data ?? []).filter(a => !a.arrivalNumber.startsWith('ZF-')))
          .filter(notification =>
            notification.id.startsWith('ew-')
            && notification.to.split('?')[0] === '/empty-wagons')
          .length;
        setEmptyWagonAlertCount(count);
      })
      .catch(() => setEmptyWagonAlertCount(0));
  }, [items, user?.role]);

  useEffect(() => {
    loadEmptyWagonAlerts();
    // MainLayout'dagi yagona 5s heartbeat allaqachon shu signalni yuboradi —
    // Sidebar o'zining alohida polling'ini yuritmaydi.
    const unsubscribe = subscribeOrdersChanged(loadEmptyWagonAlerts);
    return unsubscribe;
  }, [loadEmptyWagonAlerts]);

  useEffect(() => {
    const parentKey = activeTrail?.parent?.key;
    setExpandedGroups(parentKey ? { [parentKey]: true } : {});
  }, [activeTrail?.parent?.key]);

  useEffect(() => {
    setOpenFlyoutKey(null);
  }, [location.pathname, showLabels]);

  return (
    <aside
      aria-hidden={!isVisible}
      className={[
        'fixed left-0 top-0 h-full z-40 flex flex-col transition-transform duration-300 ease-in-out',
        isDark ? 'sidebar-dark' : 'sidebar-light',
        isDesktop
          ? collapsed ? 'w-[72px] translate-x-0 sidebar--collapsed' : 'w-[260px] translate-x-0'
          : 'w-[min(280px,85vw)]',
        !isDesktop && (mobileOpen ? 'translate-x-0' : '-translate-x-full'),
        !isVisible && 'pointer-events-none',
      ].join(' ')}
    >
      <div className="relative shrink-0 border-b border-white/[0.06] h-[var(--layout-header-height)] pl-5 pr-3">
        <div className="flex items-center gap-3 min-w-0 pt-5">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-[#2563EB] shadow-lg shadow-blue-600/20">
            <TrainFront className="w-[18px] h-[18px] text-white" strokeWidth={2} />
          </div>
          {showLabels && (
            <div className="min-w-0">
              <p className="text-[15px] font-semibold leading-tight truncate text-white">
                E-Transport
              </p>
              <p className="sidebar-brand-sub truncate mt-0.5">
                {isDark ? 'Admin paneli' : 'Yuklash logistikasi'}
              </p>
            </div>
          )}
        </div>

        {!isDesktop && (
          <button
            type="button"
            onClick={onNavigate}
            className="absolute top-5 right-2.5 flex items-center justify-center size-7 rounded-md text-white/60 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Menyuni yopish"
          >
            <X className="w-3.5 h-3.5" strokeWidth={1.75} />
          </button>
        )}
      </div>

      <nav className={`flex-1 py-4 px-3 space-y-0.5${!showLabels ? ' overflow-visible' : ' overflow-y-auto'}`}>
        {items.map(item => (
          <SidebarMenuItem
            key={item.key}
            item={item}
            isDark={isDark}
            showLabels={showLabels}
            expanded={!!expandedGroups[item.key]}
            flyoutOpen={openFlyoutKey === item.key}
            isItemActive={activeTrail?.item.key === item.key && !activeTrail?.parent}
            onToggleExpand={() => {
              const next = !expandedGroups[item.key];
              if (next) {
                setExpandedGroups({ [item.key]: true });
                if (item.children?.length && activeTrail?.parent?.key !== item.key) {
                  navigate(item.path);
                }
              } else {
                setExpandedGroups({});
              }
            }}
            onToggleFlyout={() => setOpenFlyoutKey(prev => (prev === item.key ? null : item.key))}
            notificationCount={(item.key === 'empty-wagons' || item.key === 'railway-wagon-entry' || item.key === 'loading-docs' || item.key === 'wagon-gate-check') ? emptyWagonAlertCount : 0}
            onNavigate={() => {
              setOpenFlyoutKey(null);
              onNavigate();
            }}
          />
        ))}
      </nav>
    </aside>
  );
}
