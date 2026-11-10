import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Proxies the keeper's /claimable endpoint so the browser stays same-origin
// and never reads the chain directly. Uses the same VPS base as /api/history.
const HISTORY_API_URL = process.env.HISTORY_API_URL || '';

export async function GET(req: Request) {
  const address = new URL(req.url).searchParams.get('address') || '';
  if (!HISTORY_API_URL) {
    return NextResponse.json({ error: 'HISTORY_API_URL not configured' }, { status: 500 });
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return NextResponse.json([], { status: 200 });
  }
  try {
    const res = await fetch(`${HISTORY_API_URL.replace(/\/$/, '')}/claimable?address=${address}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`upstream ${res.status}`);
    const data = await res.json();
    return NextResponse.json(data, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}
