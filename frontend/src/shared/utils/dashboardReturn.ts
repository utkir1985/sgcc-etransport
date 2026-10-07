/** Only an explicit dashboard origin overrides a page's local Back action. */
export function dashboardReturnTo(search: string, state: unknown): string | null {
  const queryOrigin = new URLSearchParams(search).get('from');
  const stateOrigin = state && typeof state === 'object' && 'from' in state ? state.from : null;
  for (const origin of [queryOrigin, stateOrigin]) {
    if (typeof origin !== 'string') continue;
    if (origin === '/dashboard' || origin.startsWith('/dashboard?') || origin.startsWith('/dashboard#')) return origin;
  }
  return null;
}

/** Keep party, process and return context when an old process URL redirects. */
export function processRedirectTo(target: string, search: string): string {
  const [path, query = ''] = target.split('?');
  const params = new URLSearchParams(search);
  new URLSearchParams(query).forEach((value, key) => params.set(key, value));
  const merged = params.toString();
  return path + (merged ? `?${merged}` : '');
}
