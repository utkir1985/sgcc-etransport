const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('etransport_orders_realtime') : null;

/** Barcha rollar / panellar uchun bir xil avto-yangilanish oralig‘i. */
export const AUTO_REFRESH_MS = 30000;

export function notifyOrdersChanged(): void {
  if (channel) {
    channel.postMessage({ type: 'ORDERS_CHANGED', timestamp: Date.now() });
  }
  window.dispatchEvent(new CustomEvent('orders_updated'));
  try {
    localStorage.setItem('orders_updated_timestamp', `${Date.now()}_${Math.random()}`);
  } catch {
    // ignore
  }
}

export function subscribeOrdersChanged(callback: () => void): () => void {
  const handleMessage = () => callback();
  const handleStorage = (e: StorageEvent) => {
    if (e.key === 'orders_updated_timestamp') {
      callback();
    }
  };

  if (channel) {
    channel.addEventListener('message', handleMessage);
  }
  window.addEventListener('orders_updated', handleMessage);
  window.addEventListener('storage', handleStorage);

  return () => {
    if (channel) {
      channel.removeEventListener('message', handleMessage);
    }
    window.removeEventListener('orders_updated', handleMessage);
    window.removeEventListener('storage', handleStorage);
  };
}

/**
 * Sahifa ochiq bo‘lganda ma’lumotni avtomatik yangilaydi (default: 5 soniya).
 * Amaldan keyin `notifyOrdersChanged()` + `load()` ham chaqiriladi;
 * bu polling boshqa foydalanuvchi / tab o‘zgarishlarini ham ushlaydi.
 */
export function startAutoRefresh(callback: () => void, intervalMs = AUTO_REFRESH_MS): () => void {
  let timer: ReturnType<typeof setInterval> | null = null;

  const tick = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    callback();
  };

  const start = () => {
    if (timer != null) return;
    timer = setInterval(tick, intervalMs);
  };

  const stop = () => {
    if (timer == null) return;
    clearInterval(timer);
    timer = null;
  };

  const onVisibility = () => {
    if (document.visibilityState === 'visible') {
      callback();
      start();
    } else {
      stop();
    }
  };

  const onFocus = () => callback();

  start();
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('focus', onFocus);

  return () => {
    stop();
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('focus', onFocus);
  };
}
