/**
 * Client API Configuration & URL Resolver
 * 
 * In development and when using reverse proxy / Vercel rewrites:
 * - VITE_API_URL is unset or empty, and relative `/api/...` calls route cleanly.
 * 
 * In cross-origin deployments (e.g., Vercel frontend calling Railway backend directly):
 * - VITE_API_URL is set to the Railway URL (e.g., `https://faculty-flow-production.up.railway.app`).
 * - getApiUrl() prepends the base URL without duplicating `/api`.
 * - Browser fetch calls to `/api/...` are transparently routed to VITE_API_URL.
 */

export const API_BASE_URL = (import.meta.env.VITE_API_URL || '').trim();

/**
 * Resolves an API path against the configured VITE_API_URL.
 */
export function getApiUrl(path: string): string {
  if (!API_BASE_URL) {
    return path;
  }

  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const cleanBase = API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL;

  // Prevent `/api/api/...` duplication if VITE_API_URL already contains `/api`
  if (cleanBase.endsWith('/api') && cleanPath.startsWith('/api')) {
    return `${cleanBase}${cleanPath.slice(4)}`;
  }

  return `${cleanBase}${cleanPath}`;
}

// Transparently intercept window.fetch for /api paths in the browser if VITE_API_URL is configured
if (typeof window !== 'undefined' && API_BASE_URL) {
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof input === 'string' && input.startsWith('/api')) {
      return originalFetch(getApiUrl(input), init);
    }
    return originalFetch(input, init);
  };
}
