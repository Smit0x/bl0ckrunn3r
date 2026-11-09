'use client';

import { useEffect, useState } from 'react';
import hamsterHugegrin from '../images/hamster_hugegrin.png';

const PRESETS = ['0.005', '0.01', '0.05'];

export default function BetModal({
  open,
  initialNumber,
  maxNumber,
  busy,
  onClose,
  onSubmit,
}: {
  open: boolean;
  initialNumber?: bigint;
  maxNumber?: bigint;
  busy: boolean;
  onClose: () => void;
  onSubmit: (number: bigint, amount: string) => void;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [number, setNumber] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string>();

  // Reset whenever the modal is (re)opened.
  useEffect(() => {
    if (open) {
      setStep(initialNumber !== undefined ? 2 : 1);
      setNumber(initialNumber !== undefined ? initialNumber.toString() : '');
      setAmount('');
      setError(undefined);
    }
  }, [open, initialNumber]);

  // Lock page scroll while the modal is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  const handleClose = () => {
    if (!busy) onClose();
  };

  const confirmNumber = () => {
    if (!/^\d+$/.test(number)) {
      setError('Enter a block number');
      return;
    }
    let n: bigint;
    try {
      n = BigInt(number);
    } catch {
      setError('Invalid block number');
      return;
    }
    if (maxNumber !== undefined && n > maxNumber) {
      setError(`Max block number is ${maxNumber.toString()}`);
      return;
    }
    setError(undefined);
    setStep(2);
  };

  const confirmAmount = () => {
    const v = parseFloat(amount);
    if (!amount || Number.isNaN(v) || v <= 0) {
      setError('Choose an amount');
      return;
    }
    setError(undefined);
    setStep(3);
  };

  const submit = () => {
    const v = parseFloat(amount);
    if (Number.isNaN(v) || v <= 0) {
      setError('Choose an amount');
      setStep(2);
      return;
    }
    onSubmit(BigInt(number), amount);
  };

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={handleClose} aria-label="Close">
          ✕
        </button>

        {step === 1 && (
          <>
            <h3 className="modal-title">What block number?</h3>
            <div className="modal-line">
              Bet on <span className="modal-accent">#{number || '…'}</span>
            </div>
            <input
              className="modal-input"
              value={number}
              onChange={(e) => setNumber(e.target.value.replace(/[^0-9]/g, ''))}
              inputMode="numeric"
              placeholder="block number"
              autoFocus
            />
            {error && <p className="modal-error">{error}</p>}
            <button className="primary modal-cta" disabled={!number} onClick={confirmNumber}>
              Confirm
            </button>
          </>
        )}

        {step === 2 && (
          <>
            <h3 className="modal-title">How much ETH?</h3>
            <div className="modal-line">
              Bet <span className="modal-accent">{amount || '…'}</span> ETH
            </div>
            <div className="modal-presets">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  className={`preset${amount === p ? ' selected' : ''}`}
                  onClick={() => setAmount(p)}
                >
                  {p}
                </button>
              ))}
            </div>
            <input
              className="modal-input"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              placeholder="custom amount"
            />
            {error && <p className="modal-error">{error}</p>}
            <button className="primary modal-cta" disabled={!amount} onClick={confirmAmount}>
              Confirm
            </button>
            <button className="modal-back" onClick={() => setStep(1)}>
              Back
            </button>
          </>
        )}

        {step === 3 && (
          <>
            <h3 className="modal-title">Confirm your bet</h3>
            <div className="modal-summary">
              <div className="summary-row">
                <span>Block number</span>
                <span className="modal-accent">#{number}</span>
              </div>
              <div className="summary-row">
                <span>Amount</span>
                <span className="modal-accent">{amount} ETH</span>
              </div>
            </div>
            {error && <p className="modal-error">{error}</p>}
            <div className="submit-wrap">
              <img className={`sign-hamster${busy ? ' show' : ''}`} src={hamsterHugegrin.src} alt="" />
              <button className="primary modal-cta" disabled={busy} onClick={submit}>
                {busy ? 'Sending…' : 'Submit'}
              </button>
            </div>
            <button className="modal-back" onClick={() => setStep(2)}>
              Back
            </button>
          </>
        )}
      </div>
    </div>
  );
}
