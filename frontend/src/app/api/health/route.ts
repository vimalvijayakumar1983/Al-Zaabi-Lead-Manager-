import { NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

export async function GET() {
  const result: Record<string, any> = {
    proxy: 'ok',
    backendUrl: BACKEND_URL,
    env: {
      BACKEND_URL: process.env.BACKEND_URL || '(not set)',
      NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || '(not set)',
    },
  };

  // Test connectivity to the backend
  try {
    const res = await fetch(`${BACKEND_URL}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    const body = await res.text();
    result.backend = { status: res.status, body };
  } catch (error: any) {
    result.backend = { error: error.message };
  }

  return NextResponse.json(result);
}
