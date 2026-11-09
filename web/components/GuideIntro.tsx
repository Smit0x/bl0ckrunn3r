'use client';

import { useEffect, useState } from 'react';

export default function GuideIntro({
  open,
  onStart,
  onSkip,
}: {
  open: boolean;
  onStart: (dontShowAgain: boolean) => void;
  onSkip: (dontShowAgain: boolean) => void;
}) {
  const [dontShowAgain, setDontShowAgain] = useState(false);

  // Lock page scroll while open and close on Escape.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onSkip(dontShowAgain);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onSkip, dontShowAgain]);

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={() => onSkip(dontShowAgain)}>
      <div className="modal disclaimer-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">Welcome to BlockRunner!</h3>
        <p className="disclaimer-text">
          Want a quick tour of the interface? We&apos;ll walk you through the main parts in a few steps.
        </p>
        <label className="disclaimer-toggle">
          <input
            type="checkbox"
            checked={dontShowAgain}
            onChange={(e) => setDontShowAgain(e.target.checked)}
          />
          <span>Don&apos;t show this guide again</span>
        </label>
        <button className="primary modal-cta" onClick={() => onStart(dontShowAgain)}>
          Start guide
        </button>
        <button className="modal-secondary" style={{ marginTop: 8 }} onClick={() => onSkip(dontShowAgain)}>
          Skip
        </button>
      </div>
    </div>
  );
}
