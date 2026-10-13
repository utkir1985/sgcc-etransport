import { useEffect, useRef } from 'react';

/**
 * Yangi versiya chiqqanda brauzer keshini avtomatik tozalab,
 * sahifani avtomatik yangilovchi komponent.
 * Foydalanuvchidan hech qanday Ctrl+F5 talab qilinmaydi.
 */
export function AutoVersionUpdater() {
  const currentVersionRef = useRef<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const checkVersion = async () => {
      try {
        const res = await fetch(`/version.json?_t=${Date.now()}`, {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
        });
        if (!res.ok) return;
        const data = await res.json();
        const serverVersion = data?.version;
        if (!serverVersion) return;

        // Dastlabki yuklangandagi versiya
        if (!currentVersionRef.current) {
          const stored = localStorage.getItem('etransport_app_version');
          currentVersionRef.current = stored || serverVersion;
          localStorage.setItem('etransport_app_version', currentVersionRef.current ?? serverVersion);
          return;
        }

        // Agar serverdagi versiya o'zgargan bo'lsa (yangi build chiqqan bo'lsa)
        if (serverVersion !== currentVersionRef.current) {
          // 1. Brauzer Cache API ni tozalash
          if ('caches' in window) {
            try {
              const keys = await caches.keys();
              await Promise.all(keys.map(k => caches.delete(k)));
            } catch {}
          }

          // 2. Yangi versiyani saqlash
          localStorage.setItem('etransport_app_version', serverVersion);
          currentVersionRef.current = serverVersion;

          // 3. Sahifani avtomatik yangilash
          window.location.reload();
        }
      } catch {}
    };

    const initialTimer = setTimeout(() => {
      if (isMounted) void checkVersion();
    }, 4000);

    // Har 40 soniyada tekshirish
    const interval = setInterval(() => {
      if (isMounted) void checkVersion();
    }, 40000);

    const onFocus = () => void checkVersion();
    window.addEventListener('focus', onFocus);

    return () => {
      isMounted = false;
      clearTimeout(initialTimer);
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  return null;
}
