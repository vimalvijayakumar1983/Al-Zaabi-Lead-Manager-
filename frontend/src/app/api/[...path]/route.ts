import { NextRequest, NextResponse } from 'next/server';
import { getBackendApiBase, isBackendSameOriginAsRequest } from '@/lib/backend-url';

// App Router route segment config for large file uploads
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

async function proxyRequest(req: NextRequest) {
  const BACKEND_URL = getBackendApiBase();

  if (isBackendSameOriginAsRequest(req, BACKEND_URL)) {
    return NextResponse.json(
      {
        error: 'API proxy misconfigured',
        details:
          'BACKEND_URL or NEXT_PUBLIC_API_URL points at this Next.js server. Set BACKEND_URL to your Express API base, e.g. http://localhost:4000/api (see frontend/.env.example).',
      },
      { status: 503 }
    );
  }

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
        details: `${error.message}. Start the API (e.g. cd backend && npm run dev) and set BACKEND_URL in frontend/.env.local (see .env.example).`,
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
export const OPTIONS = proxyRequest;
