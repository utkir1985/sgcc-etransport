const STORAGE_KEY = 'etransport_return_to';

export function sanitizeReturnTo(value: string | null | undefined): string | null {
  if (!value) return null;
  const path = value.split('#')[0];
  if (!path.startsWith('/') || path.startsWith('//')) return null;
  if (path === '/login' || path.startsWith('/login?')) return null;
  return path;
}

export function resolveReturnTo(searchParams?: URLSearchParams): string {
  const fromQuery = searchParams ? sanitizeReturnTo(searchParams.get('returnTo')) : null;
  if (fromQuery) return fromQuery;

  try {
    const fromStorage = sanitizeReturnTo(sessionStorage.getItem(STORAGE_KEY));
    if (fromStorage) return fromStorage;
  } catch {
    /* ignore */
  }

  return '/dashboard';
}

export function clearStoredReturnTo() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function buildLoginHref(returnTo?: string | null, _reason?: string | null): string {
  const target = sanitizeReturnTo(returnTo ?? `${window.location.pathname}${window.location.search}`);
  const params = new URLSearchParams();
  if (target && target !== '/dashboard') {
    try {
      sessionStorage.setItem(STORAGE_KEY, target);
    } catch {
      /* ignore */
    }
    params.set('returnTo', target);
  }
  const query = params.toString();
  return query ? `/login?${query}` : '/login';
}

export function redirectToLogin(_reason?: string) {
  sessionStorage.removeItem('etransport_user');
  localStorage.removeItem('etransport_user');
  window.location.href = buildLoginHref(undefined, _reason);
}
