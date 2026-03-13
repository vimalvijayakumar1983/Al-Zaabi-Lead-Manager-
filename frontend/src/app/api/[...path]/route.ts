import { NextRequest, NextResponse } from 'next/server';

// Server-side env var (not NEXT_PUBLIC_) — only accessible on the server
const BACKEND_URL = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

async function proxyRequest(req: NextRequest) {
  const url = new URL(req.url);
  // Strip the leading /api and forward the rest to the backend
  const path = url.pathname.replace(/^\/api/, '');
  const search = url.search;
  const target = `${BACKEND_URL}${path}${search}`;

  const headers = new Headers();
  // Forward relevant headers
  const authHeader = req.headers.get('authorization');
  if (authHeader) headers.set('authorization', authHeader);
  const contentType = req.headers.get('content-type');
  if (contentType) headers.set('content-type', contentType);

  const init: RequestInit = {
    method: req.method,
    headers,
  };

  // Forward body for non-GET/HEAD requests
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    init.body = await req.text();
  }

  try {
    const res = await fetch(target, init);
    const body = await res.text();

    return new NextResponse(body, {
      status: res.status,
      headers: {
        'content-type': res.headers.get('content-type') || 'application/json',
      },
    });
  } catch (error: any) {
    console.error(`[API Proxy] Failed to reach backend at ${target}:`, error.message);
    return NextResponse.json(
      { error: 'Backend unavailable', details: `Could not connect to ${BACKEND_URL}` },
      { status: 502 }
    );
  }
}

export const GET = proxyRequest;
export const POST = proxyRequest;
export const PUT = proxyRequest;
export const PATCH = proxyRequest;
export const DELETE = proxyRequest;
