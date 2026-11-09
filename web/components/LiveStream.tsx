'use client';

import { useEffect, useState } from 'react';

const POLL_MS = 15_000;

interface SqueekLive {
  live: boolean;
  kind: 'x' | 'twitch' | null;
  broadcastId: string | null;
  publicId: string | null;
  embedUrl: string | null;
  watchUrl: string | null;
}

export default function LiveStream() {
  const [live, setLive] = useState<SqueekLive | null>(null);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const res = await fetch('/api/squeek-live', { cache: 'no-store' });
        const data = (await res.json()) as SqueekLive;
        if (alive) setLive(data);
      } catch {
        if (alive) setLive(null);
      }
    };
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  if (!live?.live) return null;

  return (
    <section className="live-stream" aria-label="Squeekchain live video">
      <div className="live-stream-head">
        <span className="live-dot" aria-hidden="true" />
        <span>Squeekchain live</span>
      </div>
      <div className="live-stream-host">
        {live.embedUrl ? (
          <iframe
            className="live-stream-frame"
            src={live.embedUrl}
            title="Squeekchain livestream"
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        ) : live.watchUrl ? (
          <a className="live-stream-link" href={live.watchUrl} target="_blank" rel="noopener noreferrer">
            Watch the live stream ↗
          </a>
        ) : null}
      </div>
    </section>
  );
}
