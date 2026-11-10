import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Proxies the keeper's /history endpoint so the browser stays same-origin
// (no CORS / mixed-content issues) and never touches the RPC directly.
const HISTORY_API_URL = process.env.HISTORY_API_URL || '';

export async function GET() {
  if (!HISTORY_API_URL) {
    return NextResponse.json({ error: 'HISTORY_API_URL not configured' }, { status: 500 });
  }
  try {
    const res = await fetch(`${HISTORY_API_URL.replace(/\/$/, '')}/history`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`upstream ${res.status}`);
    const data = await res.json();
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=30' },
    });
  } catch {
    return NextResponse.json([], {
      status: 200,
      headers: { 'Cache-Control': 'public, s-maxage=5, stale-while-revalidate=30' },
    });
  }
}
