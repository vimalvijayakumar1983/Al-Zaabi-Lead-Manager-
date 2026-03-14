import { NextRequest, NextResponse } from 'next/server';

// App Router route segment config for large file uploads
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

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
  // Use arrayBuffer() to preserve binary data (multipart/form-data, file uploads)
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const buffer = await req.arrayBuffer();
    if (buffer.byteLength > 0) {
      init.body = buffer;
    }
  }

  try {
    const res = await fetch(target, {
      ...init,
      // @ts-expect-error duplex is needed for streaming request bodies
      duplex: 'half',
      signal: AbortSignal.timeout(60000),
    });

    const resContentType = res.headers.get('content-type') || '';

    // For binary responses (files, images, etc.), preserve raw bytes
    if (
      !resContentType.includes('application/json') &&
      !resContentType.includes('text/')
    ) {
      const buffer = await res.arrayBuffer();
      return new NextResponse(buffer, {
        status: res.status,
        headers: {
          'content-type': resContentType,
          ...(res.headers.get('content-disposition')
            ? { 'content-disposition': res.headers.get('content-disposition')! }
            : {}),
          ...(res.headers.get('content-length')
            ? { 'content-length': res.headers.get('content-length')! }
            : {}),
          ...(res.headers.get('cache-control')
            ? { 'cache-control': res.headers.get('cache-control')! }
            : {}),
        },
      });
    }

    // For text/JSON responses, use text
    const body = await res.text();

    // Log non-2xx responses for debugging
    if (!res.ok) {
      console.error(`[API Proxy] ${req.method} ${target} → ${res.status}: ${body.substring(0, 200)}`);
    }

    return new NextResponse(body, {
      status: res.status,
      headers: {
        'content-type': resContentType || 'application/json',
      },
    });
  } catch (error: any) {
    console.error(`[API Proxy] Failed to reach backend at ${target}:`, error.message);
    return NextResponse.json(
      {
        error: 'Backend unavailable',
        details: error.message,
        target,
        backendUrl: BACKEND_URL,
      },
      { status: 502 }
    );
  }
}

export const GET = proxyRequest;
export const POST = proxyRequest;
export const PUT = proxyRequest;
export const PATCH = proxyRequest;
export const DELETE = proxyRequest;
