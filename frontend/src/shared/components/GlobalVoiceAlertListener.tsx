import { useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { checkAndAnnouncePendingAlerts } from '../services/voiceAlertService';

/**
 * Butun tizim bo'ylab fonda, ko'rinmasdan ishlovchi avtomatik ovozli ogohlantiruvchi.
 * Login bo'lganda ham, logout (Login sahifasida) bo'lganda ham fonda ishlaydi.
 * UI'da hech qanday knopka yoki ortiqcha element ko'rsatmaydi (null qaytaradi).
 */
export function GlobalVoiceAlertListener() {
  const { user } = useAuth();

  useEffect(() => {
    let isMounted = true;

    const runCheck = async () => {
      // 1. Agar foydalanuvchi tizimga kirgan bo'lsa -> uning roli bo'yicha
      // 2. Agar logout bo'lsa -> ushbu kompyuterda oxirgi kirgan xodimning roli bo'yicha
      // 3. Agar hali hech kim kirmagan bo'lsa -> barcha kelgan navbatlar aytiladi (xizmat nomi bilan)
      const currentRole = user?.role || localStorage.getItem('etransport_last_role') || 'ALL';

      await checkAndAnnouncePendingAlerts(currentRole);
    };

    // Dastlabki tekshiruv 2 soniyadan so'ng
    const initialTimer = setTimeout(() => {
      if (isMounted) void runCheck();
    }, 2000);

    // Har 15 soniyada fonda uzluksiz tekshirib turish
    const interval = setInterval(() => {
      if (isMounted) void runCheck();
    }, 15000);

    return () => {
      isMounted = false;
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, [user?.role]);

  // Butunlay ko'rinmas
  return null;
}
