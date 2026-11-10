'use client';

import type { Round } from '../lib/contracts';

export default function Controls({
  round,
  roundId,
  gracePeriod,
  now,
  isOwner,
  busy,
  canBet,
  onBet,
  onClaim,
  onStart,
  onFinalize,
  onCancel,
}: {
  round: Round | null;
  roundId: bigint;
  gracePeriod?: bigint;
  now: number;
  isOwner: boolean;
  busy: boolean;
  canBet: boolean;
  onBet: () => void;
  onClaim: () => void;
  onStart: () => void;
  onFinalize: () => void;
  onCancel: () => void;
}) {
  const finalizeIn =
    round && round.status === 1 ? Math.max(0, Number(round.endTime + (gracePeriod ?? 0n) - BigInt(now))) : 0;
  const canFinalize = round?.status === 1 && finalizeIn === 0;

  return (
    <section className="controls">
      <button className="bet-cta" disabled={busy || !canBet} onClick={onBet}>
        BET
      </button>

      {round?.status === 2 && (
        <button className="bet-cta" disabled={busy} onClick={onClaim}>
          Claim winnings
        </button>
      )}

      <div className="owner">
        <h3>Round control</h3>
        <button disabled={busy || (roundId !== 0n && round?.status === 1)} onClick={onStart}>
          Start round
        </button>
        <button disabled={busy || !canFinalize} onClick={onFinalize}>
          Finalize round
        </button>
        {isOwner && (
          <button disabled={busy || round?.status !== 1} onClick={onCancel}>
            Cancel round
          </button>
        )}
      </div>
    </section>
  );
}

