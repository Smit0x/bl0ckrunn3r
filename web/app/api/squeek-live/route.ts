import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Squeekchain publishes a live-stream descriptor (schemaVersion 2) here — the
// same endpoint their own site polls. It returns 200 + JSON while a stream is
// scheduled/live, otherwise 404. We fetch it server-side because its CORS
// allowlist only covers squeekchain.com origins.
const DESCRIPTOR_URL = 'https://media.squeekchain.com/live/current.json';

// The descriptor's `validUntil` sits ~60s ahead of `observedAt`, so a short
// cache keeps us close to real time without re-fetching on every client poll.
const CACHE_TTL_MS = 10_000;

export interface SqueekLive {
  live: boolean;
  kind: 'x' | 'twitch' | null;
  broadcastId: string | null;
  publicId: string | null;
  embedUrl: string | null;
  watchUrl: string | null;
}

interface Playback {
  kind?: string;
  broadcastId?: string;
  publicId?: string;
}

interface Descriptor {
  schemaVersion?: number;
  state?: string;
  playback?: Playback | null;
  observedAt?: string;
  validUntil?: string;
  errorCode?: string | null;
}

const NOT_LIVE: SqueekLive = {
  live: false,
  kind: null,
  broadcastId: null,
  publicId: null,
  embedUrl: null,
  watchUrl: null,
};

let cache: { data: SqueekLive; at: number } | null = null;

function resolve(d: Descriptor, now: number): SqueekLive {
  if (d.state !== 'live') return NOT_LIVE;
  const until = d.validUntil ? Date.parse(d.validUntil) : NaN;
  if (!Number.isFinite(until) || until <= now) return NOT_LIVE;

  const playback = d.playback ?? null;
  const kind = playback?.kind === 'x' ? 'x' : playback?.kind === 'twitch' ? 'twitch' : null;

  const broadcastId = kind === 'x' ? playback?.broadcastId ?? null : null;
  const publicId = kind === 'twitch' ? playback?.publicId ?? null : null;

  const embedUrl =
    kind === 'x' && broadcastId ? `https://studio.x.com/embed/broadcast/${broadcastId}` : null;
  const watchUrl =
    kind === 'x' && broadcastId
      ? `https://x.com/i/broadcasts/${broadcastId}`
      : kind === 'twitch' && publicId
        ? `https://twitch.tv/${publicId}`
        : null;

  return { live: true, kind, broadcastId, publicId, embedUrl, watchUrl };
}

async function fetchLive(): Promise<SqueekLive> {
  try {
    const res = await fetch(DESCRIPTOR_URL, {
      headers: {
        Accept: 'application/json',
        // media.squeekchain.com only serves this file to requests carrying a
        // squeekchain.com Origin (its CORS allowlist). Public data, no auth.
        Origin: 'https://squeekchain.com',
      },
      cache: 'no-store',
    });
    if (!res.ok) return NOT_LIVE;
    const d = (await res.json()) as Descriptor;
    return resolve(d, Date.now());
  } catch {
    return NOT_LIVE;
  }
}

export async function GET() {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) {
    return NextResponse.json(cache.data);
  }
  const data = await fetchLive();
  cache = { data, at: now };
  return NextResponse.json(data);
}
