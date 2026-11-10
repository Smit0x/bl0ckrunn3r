'use client';

export default function Controls({
  busy,
  canBet,
  claimableCount,
  onBet,
  onClaim,
}: {
  busy: boolean;
  canBet: boolean;
  claimableCount: number;
  onBet: () => void;
  onClaim: () => void;
}) {
  return (
    <section className="controls">
      <button className="bet-cta" disabled={busy || !canBet} onClick={onBet}>
        BET
      </button>

      {claimableCount > 0 && (
        <button className="bet-cta" disabled={busy} onClick={onClaim}>
          Claim winnings ({claimableCount})
        </button>
      )}
    </section>
  );
}

