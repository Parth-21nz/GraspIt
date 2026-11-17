let csrfToken: string | null = null;
export const setCsrfToken = (value: string | null) => { csrfToken = value; };
export const getCsrfToken = () => csrfToken;
export function apiRequest(input: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set('X-GraspIt-Client', 'web');
  if (!['GET', 'HEAD', 'OPTIONS'].includes((init.method ?? 'GET').toUpperCase()) && csrfToken) headers.set('X-CSRF-Token', csrfToken);
  return fetch(input, { ...init, headers, credentials: 'same-origin' });
}
