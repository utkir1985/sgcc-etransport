import { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from 'react';
import { User, MenuItem } from '../types';
import { api } from '../services/api';
import { clearStoredReturnTo, redirectToLogin } from '../utils/authReturnTo';
import { SessionTimeoutWarningModal } from '../components/SessionTimeoutWarningModal';

const IDLE_TIMEOUT_MS = 60 * 60 * 1000; // 60 daqiqa (1 soat) harakatsizlik
const WARNING_THRESHOLD_MS = 60 * 1000; // Chiqishdan 60 soniya oldin ogohlantirish (9-daqiqada)
const STORAGE_KEY_USER = 'etransport_user';
const STORAGE_KEY_ACTIVITY = 'etransport_last_activity';
const CHANNEL_NAME = 'etransport_auth_sync';

interface AuthContextType {
  user: User | null;
  menu: MenuItem[];
  login: (username: string, password: string) => Promise<void>;
  logout: (reason?: unknown) => void;
  refreshProfile: () => Promise<void>;
  clearMustChangePassword: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

function persistUser(next: User) {
  sessionStorage.setItem(STORAGE_KEY_USER, JSON.stringify(next));
  localStorage.removeItem(STORAGE_KEY_USER);
}

function readStoredUser(): User | null {
  localStorage.removeItem(STORAGE_KEY_USER);
  const stored = sessionStorage.getItem(STORAGE_KEY_USER);
  if (!stored) return null;
  try {
    const parsed = JSON.parse(stored) as User;
    if (new Date(parsed.expiresAt) <= new Date()) {
      sessionStorage.removeItem(STORAGE_KEY_USER);
      return null;
    }
    return parsed;
  } catch {
    sessionStorage.removeItem(STORAGE_KEY_USER);
    return null;
  }
}

function readLastActivity(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_ACTIVITY);
    if (raw) {
      const val = parseInt(raw, 10);
      if (!isNaN(val) && val > 0) return val;
    }
  } catch {
    /* ignore */
  }
  return Date.now();
}

function writeLastActivity(ts: number) {
  try {
    localStorage.setItem(STORAGE_KEY_ACTIVITY, ts.toString());
  } catch {
    /* ignore */
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => readStoredUser());
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [showWarning, setShowWarning] = useState(false);
  const showWarningRef = useRef(false);
  const [secondsRemaining, setSecondsRemaining] = useState(60);
  const sessionRef = useRef(0);
  const lastActivityRef = useRef<number>(readLastActivity());
  const isLoading = false;

  const updateShowWarning = useCallback((val: boolean) => {
    showWarningRef.current = val;
    setShowWarning(val);
  }, []);

  const loadMenu = async () => {
    try {
      const res = await api.getMenu();
      if (res.data) setMenu(res.data);
    } catch {
      setMenu([]);
    }
  };

  const clearMustChangePassword = useCallback(() => {
    setUser(prev => {
      if (!prev) return null;
      // Parol almashtirilgach server yangi token beradi va u saqlangan sessiyaga yozilgan
      // bo‘ladi. Shu yerda eski nusxani qayta yozib yubormaslik uchun tokenni saqlangan
      // qiymatdan olamiz.
      const stored = readStoredUser();
      const next: User = {
        ...prev,
        ...(stored ? { token: stored.token, expiresAt: stored.expiresAt } : {}),
        mustChangePassword: false,
      };
      persistUser(next);
      return next;
    });
  }, []);

  const refreshProfile = useCallback(async () => {
    const session = sessionRef.current;
    const stored = sessionStorage.getItem(STORAGE_KEY_USER);
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored) as User;
      const res = await api.getProfile();
      if (session !== sessionRef.current) return;
      if (!sessionStorage.getItem(STORAGE_KEY_USER)) return;
      if (!res.data) return;

      const newMustChange = (res.data as any).mustChangePassword !== undefined
        ? Boolean((res.data as any).mustChangePassword)
        : parsed.mustChangePassword;

      // Faqat biror maydon haqiqatdan o'zgargandagina setUser chaqiriladi
      if (
        parsed.fullName === res.data.fullName &&
        parsed.email === res.data.email &&
        parsed.role === res.data.role &&
        parsed.department === res.data.department &&
        (parsed.position || '') === (res.data.position || '') &&
        parsed.username === res.data.username &&
        (parsed.avatarUrl || '') === (res.data.avatarUrl || '') &&
        parsed.mustChangePassword === newMustChange
      ) {
        return;
      }

      const next: User = {
        ...parsed,
        fullName: res.data.fullName,
        email: res.data.email,
        role: res.data.role,
        department: res.data.department,
        position: res.data.position || '',
        username: res.data.username,
        avatarUrl: res.data.avatarUrl || '',
        mustChangePassword: newMustChange,
      };
      persistUser(next);
      setUser(next);
    } catch {
      // keep local session unless user already logged out
    }
  }, []);

  const logout = useCallback((reason?: unknown) => {
    const cleanReason = typeof reason === 'string' ? reason : undefined;
    sessionRef.current += 1;
    sessionStorage.removeItem(STORAGE_KEY_USER);
    localStorage.removeItem(STORAGE_KEY_USER);
    localStorage.removeItem(STORAGE_KEY_ACTIVITY);
    clearStoredReturnTo();
    setUser(null);
    setMenu([]);
    updateShowWarning(false);
    void api.logout(cleanReason);
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        const bc = new BroadcastChannel(CHANNEL_NAME);
        bc.postMessage({ type: 'LOGOUT', reason: cleanReason });
        bc.close();
      } catch {
        /* ignore */
      }
    }
    redirectToLogin(cleanReason);
  }, [updateShowWarning]);

  const resetActivity = useCallback(() => {
    const now = Date.now();
    lastActivityRef.current = now;
    writeLastActivity(now);
    updateShowWarning(false);
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        const bc = new BroadcastChannel(CHANNEL_NAME);
        bc.postMessage({ type: 'ACTIVITY', timestamp: now });
        bc.close();
      } catch {
        /* ignore */
      }
    }
  }, [updateShowWarning]);

  // Multi-tab cross-synchronization via BroadcastChannel
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const channel = new BroadcastChannel(CHANNEL_NAME);

    channel.onmessage = (event) => {
      const { type, user: incomingUser, timestamp, reason } = event.data || {};
      if (type === 'REQUEST_SESSION') {
        const current = readStoredUser();
        if (current) {
          channel.postMessage({ type: 'SESSION_TRANSFER', user: current });
        }
      } else if (type === 'SESSION_TRANSFER') {
        if (!readStoredUser() && incomingUser) {
          persistUser(incomingUser);
          setUser(incomingUser);
        }
      } else if (type === 'LOGIN') {
        if (incomingUser) {
          persistUser(incomingUser);
          setUser(incomingUser);
          writeLastActivity(Date.now());
          void loadMenu();
        }
      } else if (type === 'LOGOUT') {
        sessionStorage.removeItem(STORAGE_KEY_USER);
        localStorage.removeItem(STORAGE_KEY_USER);
        localStorage.removeItem(STORAGE_KEY_ACTIVITY);
        setUser(null);
        setMenu([]);
        updateShowWarning(false);
        redirectToLogin(reason);
      } else if (type === 'ACTIVITY') {
        if (timestamp) {
          lastActivityRef.current = Math.max(lastActivityRef.current, timestamp);
          writeLastActivity(timestamp);
          updateShowWarning(false);
        }
      }
    };

    if (!readStoredUser()) {
      channel.postMessage({ type: 'REQUEST_SESSION' });
    }

    return () => {
      channel.close();
    };
  }, [updateShowWarning]);

  const isLoggedIn = Boolean(user?.token);

  // 10 daqiqalik harakatsizlik va 60 soniyalik ogohlantirish taymeri
  // user obyektiga emas, faqat login holatiga bog'liq (profil yangilanganda taymer nolga tushib ketmaydi)
  useEffect(() => {
    if (!isLoggedIn) {
      updateShowWarning(false);
      return;
    }

    // Brauzer yoki tab ochilganda oxirgi saqlangan harakat vaqtini olamiz
    const initialActivity = readLastActivity();
    lastActivityRef.current = initialActivity;

    let lastBroadcast = 0;
    let lastHandledActivity = Date.now();

    const recordActivity = (force = false) => {
      const now = Date.now();
      // Ogohlantirish modali ochiq turganda tasodifiy mayda mousemove uni yo'qotmasligi kerak
      if (showWarningRef.current && !force) return;

      lastActivityRef.current = now;
      writeLastActivity(now);

      if (now - lastBroadcast > 3000) {
        lastBroadcast = now;
        if (typeof BroadcastChannel !== 'undefined') {
          try {
            const bc = new BroadcastChannel(CHANNEL_NAME);
            bc.postMessage({ type: 'ACTIVITY', timestamp: now });
            bc.close();
          } catch {
            /* ignore */
          }
        }
      }
    };

    // Sichqoncha harakatini 5 soniyaga throttle qilamiz
    const onMouseMove = () => {
      const now = Date.now();
      if (now - lastHandledActivity > 5000) {
        lastHandledActivity = now;
        recordActivity(false);
      }
    };

    // Tugma bosish, klaviatura yoki scroll - aniq foydalanuvchi harakati
    const onDirectAction = () => {
      lastHandledActivity = Date.now();
      recordActivity(true);
    };

    const checkIdleStatus = () => {
      const last = Math.max(lastActivityRef.current, readLastActivity());
      lastActivityRef.current = last;
      const elapsed = Date.now() - last;
      const remaining = Math.max(0, IDLE_TIMEOUT_MS - elapsed);

      if (remaining <= 0) {
        updateShowWarning(false);
        logout('timeout');
      } else if (remaining <= WARNING_THRESHOLD_MS) {
        updateShowWarning(true);
        setSecondsRemaining(Math.ceil(remaining / 1000));
      } else {
        updateShowWarning(false);
      }
    };

    // Foydalanuvchi hodisalarini tinglash
    window.addEventListener('mousedown', onDirectAction, { passive: true });
    window.addEventListener('keydown', onDirectAction, { passive: true });
    window.addEventListener('touchstart', onDirectAction, { passive: true });
    window.addEventListener('scroll', onDirectAction, { passive: true });
    window.addEventListener('click', onDirectAction, { passive: true });
    window.addEventListener('mousemove', onMouseMove, { passive: true });

    // Boshqa tablarda harakat bo'lsa, localStorage orqali sinxronlash
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY_ACTIVITY && e.newValue) {
        const ts = parseInt(e.newValue, 10);
        if (!isNaN(ts) && ts > 0) {
          lastActivityRef.current = Math.max(lastActivityRef.current, ts);
          checkIdleStatus();
        }
      }
    };
    window.addEventListener('storage', onStorage);

    // Firefox va fondagi tablar uchun:
    // Tab ochilganda yoki unga qaytilganda DARHOL real vaqt bo'yicha tekshirish
    const onVisibilityOrFocus = () => {
      checkIdleStatus();
    };
    document.addEventListener('visibilitychange', onVisibilityOrFocus);
    window.addEventListener('focus', onVisibilityOrFocus);

    // Boshlang'ich tekshiruv
    checkIdleStatus();

    // Har 1 soniyada tekshirib turish
    const timer = window.setInterval(checkIdleStatus, 1000);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener('mousedown', onDirectAction);
      window.removeEventListener('keydown', onDirectAction);
      window.removeEventListener('touchstart', onDirectAction);
      window.removeEventListener('scroll', onDirectAction);
      window.removeEventListener('click', onDirectAction);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('storage', onStorage);
      document.removeEventListener('visibilitychange', onVisibilityOrFocus);
      window.removeEventListener('focus', onVisibilityOrFocus);
    };
  }, [isLoggedIn, logout, updateShowWarning]);

  useEffect(() => {
    if (!user?.token) return;
    void loadMenu();
    void refreshProfile();
  }, [refreshProfile, user?.token]);

  const login = async (username: string, password: string) => {
    const res = await api.login(username, password);
    if (!res.data) throw new Error('Login muvaffaqiyatsiz');
    sessionRef.current += 1;
    const now = Date.now();
    lastActivityRef.current = now;
    writeLastActivity(now);
    updateShowWarning(false);
    const userData: User = {
      username: res.data.username,
      fullName: res.data.fullName,
      role: res.data.role,
      department: res.data.department,
      position: res.data.position || '',
      email: res.data.email,
      token: res.data.token,
      expiresAt: res.data.expiresAt,
      avatarUrl: (res.data as User).avatarUrl || '',
      mustChangePassword: Boolean((res.data as any).mustChangePassword),
    };
    persistUser(userData);
    clearStoredReturnTo();
    setUser(userData);
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        const bc = new BroadcastChannel(CHANNEL_NAME);
        bc.postMessage({ type: 'LOGIN', user: userData });
        bc.close();
      } catch {
        /* ignore */
      }
    }
    await loadMenu();
  };

  return (
    <AuthContext.Provider value={{ user, menu, login, logout, refreshProfile, clearMustChangePassword, isLoading }}>
      {children}
      <SessionTimeoutWarningModal
        open={showWarning}
        secondsRemaining={secondsRemaining}
        totalWarningSeconds={60}
        onContinue={resetActivity}
        onLogout={() => logout()}
      />
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
