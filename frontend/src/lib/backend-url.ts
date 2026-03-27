import type { NextRequest } from 'next/server';

/**
 * Express API base URL (must include `/api`). Used only on the server by the Next proxy.
 * Do not set this to the Next.js origin (e.g. http://localhost:3000) or the proxy will loop or return HTML 404s.
 */
export function getBackendApiBase(): string {
  let base =
    process.env.BACKEND_URL?.trim() ||
    process.env.NEXT_PUBLIC_API_URL?.trim() ||
    'http://localhost:4000/api';
  base = base.replace(/\/+$/, '');
  if (!base.endsWith('/api')) {
    base = `${base}/api`;
  }
  return base;
}

/** True when the proxy target is the same origin as this Next request (misconfiguration). */
export function isBackendSameOriginAsRequest(req: NextRequest, backendBase: string): boolean {
  try {
    return new URL(req.url).origin === new URL(backendBase).origin;
  } catch {
    return false;
  }
}
