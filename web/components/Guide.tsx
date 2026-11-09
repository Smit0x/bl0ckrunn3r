'use client';

import { useCallback, useEffect, useLayoutEffect, useState } from 'react';

interface GuideStep {
  selector: string;
  title: string;
  description: string;
  placement?: 'bottom' | 'top';
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const STEPS: GuideStep[] = [
  { selector: '.auth', title: 'Theme & wallet', description: 'Toggle light or dark mode. Manage your wallet here: create an in-app wallet for faster transactions, connect an external wallet, or switch wallets.', placement: 'bottom' },
  { selector: '.ladder-head', title: 'Round & timer', description: 'Shows the current round number and how much time is left to place a bet.', placement: 'bottom' },
  { selector: '.ladder-viewport', title: 'Block number ladder', description: 'Pick the block number you think the hamster will reach when the round ends.', placement: 'bottom' },
  { selector: '.pot-bar', title: 'The pot', description: 'The total ETH bet this round. The winning result shows up here once the round ends.', placement: 'bottom' },
  { selector: '.bet-distribution', title: 'Bet distribution', description: 'See how many people bet on each number and how much ETH is staked.', placement: 'bottom' },
  { selector: '.controls', title: 'Controls', description: 'Place a bet, claim your winnings, and manage rounds from here.', placement: 'top' },
];

const TIP_W = 320;
const GAP = 16;
const PAD = 10;
const EST_TIP_H = 240;

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

export default function Guide({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [placement, setPlacement] = useState<'bottom' | 'top'>('bottom');

  const measurePosition = useCallback(() => {
    const step = STEPS[index];
    const el = document.querySelector(step.selector);
    if (!el) {
      setRect(null);
      return;
    }
    const r = el.getBoundingClientRect();
    const nextRect: Rect = {
      top: r.top - PAD,
      left: r.left - PAD,
      width: r.width + PAD * 2,
      height: r.height + PAD * 2,
    };
    setRect(nextRect);

    const vh = window.innerHeight;
    const preferred = step.placement ?? 'bottom';
    let p: 'bottom' | 'top' = preferred;
    if (preferred === 'bottom' && nextRect.top + nextRect.height + GAP + EST_TIP_H > vh) {
      p = 'top';
    } else if (preferred === 'top' && nextRect.top - GAP - EST_TIP_H < 0) {
      p = 'bottom';
    }
    setPlacement(p);
  }, [index]);

  useEffect(() => {
    if (!open) setIndex(0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const el = document.querySelector(STEPS[index].selector);
    if (el) el.scrollIntoView({ block: 'center' });
    measurePosition();
    const onMove = () => measurePosition();
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    return () => {
      window.removeEventListener('resize', onMove);
      window.removeEventListener('scroll', onMove, true);
    };
  }, [open, index, measurePosition]);

  if (!open) return null;

  const step = STEPS[index];
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const centerX = rect ? rect.left + rect.width / 2 : vw / 2;
  const tipLeft = clamp(centerX - TIP_W / 2, 12, Math.max(12, vw - TIP_W - 12));

  let tipStyle: React.CSSProperties = {};
  let line: { x1: number; y1: number; x2: number; y2: number } | null = null;

  if (rect) {
    if (placement === 'bottom') {
      const top = rect.top + rect.height + GAP;
      tipStyle = { top, left: tipLeft };
      line = { x1: centerX, y1: rect.top + rect.height, x2: tipLeft + TIP_W / 2, y2: top };
    } else {
      const bottom = vh - rect.top + GAP;
      tipStyle = { bottom, left: tipLeft };
      line = { x1: centerX, y1: rect.top, x2: tipLeft + TIP_W / 2, y2: rect.top - GAP };
    }
  } else {
    tipStyle = { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
  }

  return (
    <div className="guide-overlay">
      {rect && (
        <>
          <div className="guide-mask" style={{ top: 0, left: 0, width: '100%', height: rect.top }} />
          <div
            className="guide-mask"
            style={{ top: rect.top + rect.height, left: 0, width: '100%', height: vh - (rect.top + rect.height) }}
          />
          <div className="guide-mask" style={{ top: rect.top, left: 0, width: rect.left, height: rect.height }} />
          <div
            className="guide-mask"
            style={{ top: rect.top, left: rect.left + rect.width, width: vw - (rect.left + rect.width), height: rect.height }}
          />
          <div
            className="guide-highlight"
            style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
          />
        </>
      )}

      {line && (
        <svg className="guide-svg">
          <line x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} strokeWidth={2} strokeDasharray="5 4" />
        </svg>
      )}

      <div className="guide-tip" style={tipStyle}>
        <div className="guide-step">
          Step {index + 1} of {STEPS.length}
        </div>
        <h4 className="guide-title">{step.title}</h4>
        <p className="guide-text">{step.description}</p>
        <div className="guide-nav">
          {index > 0 && (
            <button className="guide-nav-back" onClick={() => setIndex((i) => i - 1)}>
              Back
            </button>
          )}
          <button
            className="primary guide-nav-next"
            onClick={() => {
              if (index === STEPS.length - 1) onClose();
              else setIndex((i) => i + 1);
            }}
          >
            {index === STEPS.length - 1 ? 'Finish' : 'Next'}
          </button>
        </div>
        <button className="modal-back" onClick={onClose}>
          Skip tour
        </button>
      </div>
    </div>
  );
}
