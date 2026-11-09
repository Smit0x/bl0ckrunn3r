'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface ToastData {
  id: number;
  text: string;
}

const AUTO_DISMISS_MS = 5000;
const EXIT_MS = 300;
const DRAG_THRESHOLD = 80;

export default function Toast({
  toast,
  onDismiss,
}: {
  toast: ToastData;
  onDismiss: (id: number) => void;
}) {
  const [leaving, setLeaving] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [offset, setOffset] = useState(0);

  const startX = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const leave = useCallback((dir: 'left' | 'right') => {
    setLeaving(true);
    setDragging(false);
    setOffset(dir === 'left' ? -window.innerWidth : window.innerWidth);
  }, []);

  const startTimer = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => leave('right'), AUTO_DISMISS_MS);
  }, [leave]);

  useEffect(() => {
    startTimer();
    return () => {
      if (timer.current) clearTimeout(timer.current);
      if (exitTimer.current) clearTimeout(exitTimer.current);
    };
  }, [startTimer]);

  useEffect(() => {
    if (!leaving) return;
    exitTimer.current = setTimeout(() => onDismiss(toast.id), EXIT_MS);
    return () => {
      if (exitTimer.current) clearTimeout(exitTimer.current);
    };
  }, [leaving, toast.id, onDismiss]);

  return (
    <div
      className={`toast${leaving ? ' toast-leaving' : ''}${dragging ? ' toast-dragging' : ''}`}
      style={{ transform: `translateX(${offset}px)` }}
      onPointerDown={(e) => {
        if (leaving) return;
        if (timer.current) clearTimeout(timer.current);
        startX.current = e.clientX;
        setDragging(true);
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!dragging || leaving) return;
        setOffset(e.clientX - startX.current);
      }}
      onPointerUp={(e) => {
        if (!dragging) return;
        setDragging(false);
        const dx = e.clientX - startX.current;
        if (dx < -DRAG_THRESHOLD) {
          leave('left');
        } else if (dx > DRAG_THRESHOLD) {
          leave('right');
        } else {
          setOffset(0);
          startTimer();
        }
      }}
      onPointerCancel={() => {
        if (!dragging) return;
        setDragging(false);
        setOffset(0);
        startTimer();
      }}
    >
      {toast.text}
    </div>
  );
}
