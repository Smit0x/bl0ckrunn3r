'use client';

import { Fragment, useEffect } from 'react';
import { formatEther } from 'viem';
import happyHamster from '../images/happyhamster.png';
import hamsterCashFan from '../images/hamster_cash_fan.png';
import loadingGif from '../images/loading.gif';

export interface ClaimRoundItem {
  roundId: bigint;
  amount: bigint;
  numbers: bigint[];
}

export default function ClaimModal({
  open,
  items,
  loading,
  claimingRound,
  onClose,
  onClaim,
}: {
  open: boolean;
  items: ClaimRoundItem[];
  loading: boolean;
  claimingRound: bigint | null;
  onClose: () => void;
  onClaim: (item: ClaimRoundItem) => void;
}) {
  // Lock page scroll while open and close on Escape.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal claim-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">
          ✕
        </button>
        <h3 className="modal-title">Claim winnings</h3>

        <div className="claim-grid">
          <div className="claim-cell claim-head">Round</div>
          <div className="claim-cell claim-head" />

          {items.map((it) => (
            <Fragment key={it.roundId.toString()}>
              <div className="claim-cell claim-round">{it.roundId.toString()}</div>
              <div className="claim-cell">
                <div className="claim-wrap">
                  <img
                    className={`celebrate-hamster h-left${claimingRound === it.roundId ? ' show' : ''}`}
                    src={happyHamster.src}
                    alt=""
                  />
                  <img
                    className={`celebrate-hamster h-right delay${claimingRound === it.roundId ? ' show' : ''}`}
                    src={hamsterCashFan.src}
                    alt=""
                  />
                  <button
                    className="primary claim-btn"
                    disabled={claimingRound !== null}
                    onClick={() => onClaim(it)}
                  >
                    {claimingRound === it.roundId ? 'Claiming…' : `Claim ${formatEther(it.amount)} ETH`}
                  </button>
                </div>
              </div>
            </Fragment>
          ))}
        </div>

        {loading && items.length === 0 && (
          <div className="claim-empty">
            <img className="loading-gif" src={loadingGif.src} alt="Loading" />
            <div className="loading-label">loading</div>
          </div>
        )}
        {!loading && items.length === 0 && <p className="claim-empty">No rounds to claim.</p>}
      </div>
    </div>
  );
}
