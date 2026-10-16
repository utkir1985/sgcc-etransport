import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Bell, Check, CheckCheck, ChevronDown, ChevronRight, LogOut, Menu, RefreshCw, User, X,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { findActiveMenuPath, augmentMenuItems } from '../../utils/menuNav';
import { ROLE_LABELS } from '../../types';
import { api } from '../../services/api';
import ThemeToggle from '../ThemeToggle';
import SidebarToggleIcon from '../SidebarToggleIcon';
import { ProfileEditModal } from '../ProfileEditModal';
import {
  buildRoleNotifications,
  dismissNotification,
  dismissNotifications,
  filterDismissedNotifications,
  type RoleNotification,
} from '../../utils/roleNotifications';
import { subscribeOrdersChanged } from '../../utils/realtimeSync';

interface HeaderProps {
  isDesktop: boolean;
  sidebarCollapsed: boolean;
  mobileOpen: boolean;
  onSidebarToggle: () => void;
  onMobileMenuToggle: () => void;
}

function compactPersonName(fullName?: string, username?: string) {
  const value = (fullName || username || 'U').trim();
  if (!value) return 'U';

  const parts = value.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return value;
  if (/^[A-Za-zА-Яа-яЁёO‘G‘ShCh]{1,3}\.$/.test(parts[0])) {
    return `${parts[0]} ${parts[1]}`;
  }

  const surname = parts[0];
  const givenName = parts[1];
  return `${givenName.charAt(0).toLocaleUpperCase('uz-UZ')}. ${surname}`;
}

export function compactPositionName(position?: string, role?: string): string {
  const raw = (position || '').trim();
  if (!raw) {
    return ROLE_LABELS[role || ''] || role || '';
  }

  // 1. Tarozibon
  if (/tarozibon/i.test(raw)) {
    return 'Tarozibon';
  }

  // 2. Military / Security commander & squad roles
  if (/komandir[ia]?\s+o[‘'ʼ`]rinbosari/i.test(raw) || /komandir.*o[‘'ʼ`]rinbosar/i.test(raw)) {
    return 'Komandir o‘rinbosari';
  }
  if (/(?:guruh|gurux)\s+komandiri/i.test(raw)) {
    return 'Guruh komandiri';
  }
  if (/komandir[ia]?/i.test(raw)) {
    return 'Komandir';
  }

  // 3. Specialists
  if (/yetakchi\s+mutaxassis/i.test(raw)) {
    return 'Yetakchi mutaxassis';
  }
  if (/bosh\s+mutaxassis/i.test(raw)) {
    return 'Bosh mutaxassis';
  }
  if (/katta\s+mutaxassis/i.test(raw)) {
    return 'Katta mutaxassis';
  }
  if (/mutaxassis/i.test(raw)) {
    return 'Mutaxassis';
  }

  // 4. Directors & management
  if (/bosh\s+direktor\s+o[‘'ʼ`]rinbosari/i.test(raw)) {
    return 'Bosh direktor o‘rinbosari';
  }
  if (/bosh\s+direktor/i.test(raw)) {
    return 'Bosh direktor';
  }

  // 5. Accounting
  if (/bosh\s+buxgalter\s+o[‘'ʼ`]rinbosari/i.test(raw)) {
    return 'Bosh buxgalter o‘rinbosari';
  }
  if (/bosh\s+buxgalter/i.test(raw)) {
    return 'Bosh buxgalter';
  }
  if (/yetakchi\s+hisobchi/i.test(raw)) {
    return 'Yetakchi hisobchi';
  }

  // 6. Service / Department heads
  if (/xizmat\s+boshlig[‘'ʼ`]?i\s+o[‘'ʼ`]rinbosari/i.test(raw)) {
    return 'Xizmat boshlig‘i o‘rinbosari';
  }
  if (/xizmat\s+boshlig[‘'ʼ`]?i/i.test(raw)) {
    return 'Xizmat boshlig‘i';
  }
  if (/sex\s+boshlig[‘'ʼ`]?i/i.test(raw)) {
    return 'Sex boshlig‘i';
  }
  if (/smena\s+boshlig[‘'ʼ`]?i/i.test(raw)) {
    return 'Smena boshlig‘i';
  }

  // 7. Dispatching / Transport
  if (/katta\s+disp[et]+cher/i.test(raw)) {
    return 'Katta dispetcher';
  }
  if (/vagon\s+qabul/i.test(raw)) {
    return 'Vagon qabul qiluvchi';
  }

  // 8. General cleanup: strip parenthetical remarks "(...)" and trailing military ranks/notes
  let cleaned = raw
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/,\s*(?:mayor|kapitan|katta leytenant|leytenant).*$/i, '')
    .replace(/^2-AB\s*\d+-otryad\s*/i, '')
    .trim();

  if (cleaned.length > 24 && cleaned.includes(',')) {
    cleaned = cleaned.split(',')[0].trim();
  }

  return cleaned || raw;
}

export default function Header({
  isDesktop,
  sidebarCollapsed,
  mobileOpen,
  onSidebarToggle,
  onMobileMenuToggle,
}: HeaderProps) {
  const { user, logout, menu, refreshProfile } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Sarlavhadagi yo'l (breadcrumb): menyudagi joylashuvdan — asosiy panel › ichki guruh › sahifa
  const menuPath = findActiveMenuPath(augmentMenuItems(menu, user?.role, true), location.pathname, location.search);
  const crumbs: Array<{ key: string; label: string; to?: string }> = location.pathname === '/profile'
    ? [{ key: 'profile', label: 'Profilni tahrirlash' }]
    : menuPath.length
      ? menuPath.map((entry, i) => ({
        key: entry.key,
        label: entry.label,
        // Faqat birinchi (asosiy panel) bosiladi; ichki guruh — oddiy matn; oxirgisi — joriy sahifa
        to: i === 0 && menuPath.length > 1 && entry.path ? entry.path : undefined,
      }))
      : [{ key: 'home', label: menu[0]?.label ?? 'Boshqaruv paneli' }];
  const isSferaPage = location.pathname === '/sfera';

  const [bellOpen, setBellOpen] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);
  const [notifLoading, setNotifLoading] = useState(true);
  const [notifications, setNotifications] = useState<RoleNotification[]>([]);

  const unreadCount = notifications.length;
  const headerLeft = isDesktop ? (sidebarCollapsed ? 72 : 280) : 0;
  const role = user?.role || '';
  const userKey = user?.username || '';
  const displayName = compactPersonName(user?.fullName, user?.username);

  useEffect(() => {
    const syncProfile = () => {
      if (!sessionStorage.getItem('etransport_user') && !localStorage.getItem('etransport_user')) return;
      void refreshProfile();
    };
    const timer = window.setInterval(syncProfile, 60_000);
    window.addEventListener('focus', syncProfile);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', syncProfile);
    };
  }, [refreshProfile]);

  const loadNotifications = useCallback((silent = false) => {
    if (!role) {
      setNotifications([]);
      setNotifLoading(false);
      return;
    }
    if (!silent) setNotifLoading(true);

    const wantsOrders = ['Accounting', 'Dispatching', 'DispatchSupervisor', 'Admin', 'Marketing', 'Management'].includes(role);
    const wantsPlans = ['Dispatching', 'Admin'].includes(role);

    Promise.all([
      api.getEmptyWagonArrivals().catch(() => ({ data: [] as Awaited<ReturnType<typeof api.getEmptyWagonArrivals>>['data'] })),
      wantsOrders
        ? api.getOrders().catch(() => ({ data: [] as Awaited<ReturnType<typeof api.getOrders>>['data'] }))
        : Promise.resolve({ data: [] as Awaited<ReturnType<typeof api.getOrders>>['data'] }),
      wantsPlans
        ? api.getPlans().catch(() => ({ data: [] as Awaited<ReturnType<typeof api.getPlans>>['data'] }))
        : Promise.resolve({ data: [] as Awaited<ReturnType<typeof api.getPlans>>['data'] }),
    ])
      .then(([arrivalsRes, ordersRes, plansRes]) => {
        const built = buildRoleNotifications(
          role,
          arrivalsRes.data ?? [],
          ordersRes.data ?? [],
          plansRes.data ?? [],
        );
        setNotifications(filterDismissedNotifications(built, userKey));
      })
      .catch(() => setNotifications([]))
      .finally(() => {
        if (!silent) setNotifLoading(false);
      });
  }, [role, userKey]);

  useEffect(() => {
    loadNotifications();
    // MainLayout'dagi yagona 5s heartbeat allaqachon shu signalni yuboradi —
    // Header o'zining alohida polling'ini yuritmaydi.
    const unsub = subscribeOrdersChanged(() => loadNotifications(true));
    return unsub;
  }, [loadNotifications]);

  useEffect(() => {
    if (!bellOpen) return;
    function handleClick(e: MouseEvent) {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
        setBellOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [bellOpen]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const openNotification = (n: RoleNotification) => {
    dismissNotification(userKey, n.id);
    setNotifications(prev => prev.filter(x => x.id !== n.id));
    setBellOpen(false);
    navigate(n.to);
  };

  const markOneRead = (n: RoleNotification, e: ReactMouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dismissNotification(userKey, n.id);
    setNotifications(prev => prev.filter(x => x.id !== n.id));
  };

  const markAllRead = () => {
    if (notifications.length === 0) return;
    dismissNotifications(userKey, notifications.map(n => n.id));
    setNotifications([]);
  };

  return (
    <header
      className="navbar-shadow fixed top-0 right-0 h-[var(--layout-header-height)] z-30 flex items-center justify-between px-4 sm:px-6 transition-[left] duration-300 bg-white dark:bg-transparent"
      style={{ left: headerLeft }}
    >
      <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
        {isDesktop ? (
          <button
            type="button"
            onClick={onSidebarToggle}
            className="btn-icon shrink-0"
            title={sidebarCollapsed ? 'Sidebarni ochish' : 'Sidebarni yopish'}
            aria-label="Sidebarni boshqarish"
          >
            <SidebarToggleIcon collapsed={sidebarCollapsed} />
          </button>
        ) : (
          <button
            type="button"
            onClick={onMobileMenuToggle}
            className="btn-icon shrink-0"
            aria-label={mobileOpen ? 'Menyuni yopish' : 'Menyuni ochish'}
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        )}

        <nav className="header-crumbs" aria-label="Joriy sahifa">
          {crumbs.map((crumb, i) => {
            const last = i === crumbs.length - 1;
            // Telefonda faqat oxirgi ikki qism
            const mobileHidden = i < crumbs.length - 2 ? ' header-crumbs__part--far' : '';
            return (
              <span key={crumb.key} className={`header-crumbs__part${mobileHidden}`}>
                {i > 0 ? <ChevronRight className="header-crumbs__sep" aria-hidden="true" /> : null}
                {last ? (
                  <h2 className="header-crumbs__current" title={crumb.label}>{crumb.label}</h2>
                ) : crumb.to ? (
                  <button type="button" className="header-crumbs__link" onClick={() => navigate(crumb.to!)} title={crumb.label}>{crumb.label}</button>
                ) : (
                  <span className="header-crumbs__text" title={crumb.label}>{crumb.label}</span>
                )}
              </span>
            );
          })}
        </nav>
      </div>

      <div className="flex items-center gap-2 sm:gap-4 shrink-0">
        {isSferaPage ? (
          <button
            type="button"
            className="btn-icon"
            title="Ko‘rsatkichlarni yangilash"
            aria-label="Ko‘rsatkichlarni yangilash"
            onClick={() => window.dispatchEvent(new Event('sfera:reload'))}
          >
            <RefreshCw className="w-[18px] h-[18px] mx-auto" />
          </button>
        ) : null}
        <ThemeToggle />

        <div className="hidden sm:block w-px h-6 bg-slate-200 dark:bg-[var(--color-dark-border)]" />

        <div className="relative" ref={bellRef}>
          <button
            type="button"
            className="btn-icon relative"
            aria-label="Bildirishnomalar"
            aria-expanded={bellOpen}
            onClick={() => setBellOpen(v => !v)}
          >
            <Bell className="w-[18px] h-[18px] mx-auto" />
            {unreadCount > 0 ? (
              <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold ring-2 ring-white dark:ring-[var(--color-dark-surface)]">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            ) : null}
          </button>

          {bellOpen && (
            <div className="absolute right-0 mt-2 w-[22rem] max-w-[calc(100vw-2rem)] bg-white dark:bg-[var(--color-dark-elevated)] rounded-xl shadow-xl shadow-slate-900/10 dark:shadow-black/50 border border-slate-200 dark:border-[var(--color-dark-border)] z-50">
              <div className="px-4 py-3 border-b border-slate-100 dark:border-[var(--color-dark-border-subtle)] flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Xabarnomalar
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-500 mt-0.5">
                    {unreadCount > 0
                      ? `${unreadCount} ta — matnni bosib jarayonga o‘ting`
                      : 'Yangi xabarnoma yo‘q'}
                  </p>
                </div>
                {unreadCount > 0 ? (
                  <button
                    type="button"
                    className="shrink-0 inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-blue-700 hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-blue-500/10"
                    onClick={markAllRead}
                    title="Barchasini o‘qilgan deb belgilash"
                  >
                    <CheckCheck className="w-3.5 h-3.5" strokeWidth={2} />
                    Barchasi
                  </button>
                ) : null}
              </div>

              {notifLoading && notifications.length === 0 ? (
                <div className="p-4 text-sm text-slate-500 dark:text-slate-400">
                  Yuklanmoqda...
                </div>
              ) : notifications.length === 0 ? (
                <div className="p-4 text-sm text-slate-500 dark:text-slate-400">
                  Hozircha sizga tegishli ish yo‘q.
                </div>
              ) : (
                <div className="max-h-96 overflow-y-auto py-1">
                  {notifications.map(n => (
                    <div
                      key={n.id}
                      className="group flex items-stretch gap-0.5 px-2 py-0.5 hover:bg-slate-50 dark:hover:bg-[var(--color-dark-hover)] transition-colors"
                    >
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left px-2 py-2 rounded-lg"
                        onClick={() => openNotification(n)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-900 dark:text-slate-100 leading-snug">
                              {n.title}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                              {n.subtitle}
                            </p>
                          </div>
                          {n.badge ? (
                            <span className="shrink-0 inline-flex items-center rounded-full bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300 px-2 py-0.5 text-[11px] font-medium">
                              {n.badge}
                            </span>
                          ) : null}
                        </div>
                      </button>
                      <button
                        type="button"
                        className="shrink-0 self-center mr-1 inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 opacity-70 hover:bg-emerald-50 hover:text-emerald-600 group-hover:opacity-100 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-300"
                        title="O‘qilgan deb belgilash"
                        aria-label="O‘qilgan deb belgilash"
                        onClick={e => markOneRead(n, e)}
                      >
                        <Check className="w-4 h-4" strokeWidth={2} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-2 sm:gap-3 pl-1 sm:pl-2 pr-1 sm:pr-2 py-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-[var(--color-dark-hover)] dark:border dark:border-transparent dark:hover:border-[var(--color-dark-border)] transition-colors min-h-[44px]"
          >
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-semibold text-sm shadow-md shadow-blue-500/20 ring-2 ring-blue-400/20 overflow-hidden">
              {user?.avatarUrl ? (
                <img src={user.avatarUrl} alt="" className="size-full object-cover" />
              ) : (
                displayName.charAt(0) || 'U'
              )}
            </div>
            <div className="hidden sm:block text-left">
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100 leading-tight truncate max-w-[180px] sm:max-w-[200px]" title={user?.fullName || displayName}>
                {displayName}
              </p>
              <p
                className="text-xs text-slate-500 dark:text-slate-500 truncate max-w-[180px] sm:max-w-[200px]"
                title={user?.position || ROLE_LABELS[user?.role || ''] || user?.role}
              >
                {compactPositionName(user?.position, user?.role)}
              </p>
            </div>
            <ChevronDown
              className={`hidden sm:block w-4 h-4 text-slate-400 transition-transform duration-200 ${dropdownOpen ? 'rotate-180' : ''}`}
            />
          </button>

          {dropdownOpen && (
            <div className="absolute right-0 mt-2 w-[220px] max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white py-1.5 shadow-lg shadow-slate-900/10 z-50 dark:border-[var(--color-dark-border)] dark:bg-[var(--color-dark-elevated)] dark:shadow-black/50">
              <button
                type="button"
                className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-slate-700 transition-colors hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-[var(--color-dark-hover)]"
                onClick={() => {
                  setDropdownOpen(false);
                  setProfileOpen(true);
                }}
              >
                <User className="size-4 shrink-0 text-slate-500 dark:text-slate-400" strokeWidth={1.75} />
                Profilni tahrirlash
              </button>
              <button
                type="button"
                onClick={() => logout()}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-slate-700 transition-colors hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-[var(--color-dark-hover)]"
              >
                <LogOut className="size-4 shrink-0 text-slate-500 dark:text-slate-400" strokeWidth={1.75} />
                Chiqish
              </button>
            </div>
          )}
        </div>
      </div>

      <ProfileEditModal open={profileOpen} onClose={() => setProfileOpen(false)} />
    </header>
  );
}
