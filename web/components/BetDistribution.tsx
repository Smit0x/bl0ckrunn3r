'use client';

import { useState } from 'react';
import { formatEther } from 'viem';
import type { NumberInfo } from './Ladder';

interface BetRow {
  num: bigint;
  users: bigint;
  stake: bigint;
}

export default function BetDistribution({
  info,
  blocksSoFar,
  pot,
}: {
  info: Record<string, NumberInfo>;
  blocksSoFar?: bigint;
  pot?: bigint;
}) {
  const [open, setOpen] = useState(false);
  const n = blocksSoFar ?? 0n;
  const potVal = pot ?? 0n;

  const rows: BetRow[] = Object.entries(info).map(([k, v]) => ({
    num: BigInt(k),
    users: v.users,
    stake: v.stake,
  }));

  // Left column: numbers below the current block (descending -> closest first).
  const below = rows.filter((r) => r.num < n).sort((a, b) => (a.num < b.num ? 1 : -1));
  // Right column: numbers above the current block (ascending -> closest first).
  const above = rows.filter((r) => r.num > n).sort((a, b) => (a.num < b.num ? -1 : 1));

  const potEth = potVal > 0n ? parseFloat(formatEther(potVal)) : 0;

  const column = (list: BetRow[], side: 'below' | 'above') => (
    <div className={`bd-side ${side}`}>
      <div className="bd-cols">
        <span>Block</span>
        <span>Total ETH</span>
        <span>Users</span>
      </div>
      {list.map((r) => {
        const stakeEth = parseFloat(formatEther(r.stake));
        const pct = potEth > 0 ? Math.min(100, (stakeEth / potEth) * 100) : 0;
        return (
          <div className="bd-row" key={`${side}-${r.num.toString()}`}>
            <span className="bd-bar" style={{ width: `${pct}%` }} />
            <span className="bd-num">{r.num.toString()}</span>
            <span className="bd-eth">{formatEther(r.stake)}</span>
            <span className="bd-users">{r.users.toString()}</span>
          </div>
        );
      })}
    </div>
  );

  const hasBets = below.length > 0 || above.length > 0;

  return (
    <section className="bet-distribution">
      <button className="bd-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span>Bet Distribution</span>
        <span className="bd-triangle">{open ? '▲' : '▼'}</span>
      </button>
      <div className={`bd-body${open ? ' open' : ''}`}>
        <div className="bd-inner">
          {hasBets ? (
            <div className="bd-grid">
              {column(below, 'below')}
              {column(above, 'above')}
            </div>
          ) : (
            <p className="bd-empty">No bets yet.</p>
          )}
        </div>
      </div>
    </section>
  );
}
