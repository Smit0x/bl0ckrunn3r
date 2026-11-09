'use client';

import { useEffect, useState } from 'react';

export default function DisclaimerModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: (dontShowAgain: boolean) => void;
}) {
  const [dontShowAgain, setDontShowAgain] = useState(false);

  // Lock page scroll while open and close on Escape.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose(dontShowAgain);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose, dontShowAgain]);

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={() => onClose(dontShowAgain)}>
      <div className="modal disclaimer-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={() => onClose(dontShowAgain)} aria-label="Close">
          ✕
        </button>
        <h3 className="modal-title">Heads up</h3>
        <p className="disclaimer-text">
          This app is still not in its final form. Things may change or break while we keep building.
        </p>
        <label className="disclaimer-toggle">
          <input
            type="checkbox"
            checked={dontShowAgain}
            onChange={(e) => setDontShowAgain(e.target.checked)}
          />
          <span>Don&apos;t show this again</span>
        </label>
        <button className="primary modal-cta" onClick={() => onClose(dontShowAgain)}>
          Continue
        </button>
      </div>
    </div>
  );
}
