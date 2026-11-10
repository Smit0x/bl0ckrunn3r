'use client';

import { useEffect, useState } from 'react';
import { fetchSqueekStatus, type SqueekStatus } from '../lib/squeek';

const POLL_MS = 15_000;

type State = 'live' | 'idle' | 'offline';

function stateOf(s: SqueekStatus): State {
  if (s.freshness !== 'online') return 'offline';
  return (s.rpmMilli ?? 0) > 0 ? 'live' : 'idle';
}

export default function SqueekStatus() {
  const [status, setStatus] = useState<SqueekStatus | null>(null);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const next = await fetchSqueekStatus();
      if (alive) setStatus(next);
    };
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  if (!status) return null;

  const state = stateOf(status);
  // The game (and the ladder) settle on SqueekCore's frontier blockHeight, not
  // the optimistic/projected height, so show settled as the primary number and
  // surface the live projected height separately when it differs.
  const settled = status.blockHeight;
  const projected = status.projectedBlockHeight;
  const height = settled ?? projected;
  const rpm = status.rpmMilli != null ? (status.rpmMilli / 1000).toFixed(1) : null;

  const label =
    state === 'live' ? 'Squeekchain live' : state === 'idle' ? 'Squeekchain idle' : 'Squeekchain offline';
  const dotClass = state === 'live' ? '' : state === 'idle' ? ' idle' : ' off';

  return (
    <div className={`squeek-status ${state}`}>
      <span className={`live-dot${dotClass}`} aria-hidden="true" />
      <span className="squeek-status-label">{label}</span>
      {height != null && <span className="squeek-status-metric">settled {height.toString()}</span>}
      {settled != null && projected != null && projected !== settled && (
        <span className="squeek-status-metric">live {projected.toString()}</span>
      )}
      {state === 'live' && rpm && <span className="squeek-status-metric">{rpm} RPM</span>}
    </div>
  );
}
