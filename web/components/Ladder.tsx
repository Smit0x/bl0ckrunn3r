'use client';

import { useEffect, useRef, useState } from 'react';
import { formatEther } from 'viem';
import hamsterAnvil from '../images/hamster_anvil.png';
import hamsterGlasses from '../images/hamster_glasses.png';
import hamsterGrin from '../images/hamster_grin.png';
import hamsterHugegrin from '../images/hamster_hugegrin.png';
import hamsterLollipop from '../images/hamster_lollipop.png';
import hamsterMog from '../images/hamster_mog.png';
import hamsterPainter from '../images/hamster_painter.png';
import hamsterPokerface from '../images/hamster_pokerface.png';
import hamsterScheme from '../images/hamster_scheme.png';
import hamsterSmoke from '../images/hamster_smoke.png';

const IMAGES = [
  hamsterAnvil,
  hamsterGlasses,
  hamsterGrin,
  hamsterHugegrin,
  hamsterLollipop,
  hamsterMog,
  hamsterPainter,
  hamsterPokerface,
  hamsterScheme,
  hamsterSmoke,
];

export interface NumberInfo {
  users: bigint;
  stake: bigint;
}

const TILE_W = 76;
const GAP = 12;
const STEP = TILE_W + GAP; // px per slot
const MAX_TILES = 512;
const DISAPPEAR_MS = 700; // must match the anvil-disappear animation duration

interface LeavingAnvil {
  n: bigint;
  key: string;
  src: string;
}

function scaleFor(dist: number): number {
  if (dist === 0) return 1;
  if (dist === 1) return 0.8;
  if (dist === 2) return 0.6;
  if (dist === 3) return 0.45;
  return 0.35;
}

export default function Ladder({
  max,
  info,
  blocksSoFar,
  active,
  disabled,
  onPick,
}: {
  max: bigint;
  info: Record<string, NumberInfo>;
  blocksSoFar?: bigint;
  active?: boolean;
  disabled: boolean;
  onPick: (n: bigint) => void;
}) {
  const n = blocksSoFar ?? 0n;
  const currentImage = IMAGES[Number(n % BigInt(IMAGES.length))];
  const prevNRef = useRef<bigint | null>(null);
  const [leaving, setLeaving] = useState<LeavingAnvil[]>([]);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Clean up any pending removal timers on unmount.
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
      timers.length = 0;
    };
  }, []);

  // When the produced block number advances, keep the anvil on the previous
  // box (playing the disappear animation) while the new box gets a fresh
  // appear animation.
  useEffect(() => {
    const prev = prevNRef.current;
    prevNRef.current = n;

    if (!active || prev === null || prev === n) return;

    const prevImage = IMAGES[Number(prev % BigInt(IMAGES.length))];
    const item: LeavingAnvil = {
      n: prev,
      key: `${prev.toString()}-${n.toString()}`,
      src: prevImage.src,
    };
    setLeaving((l) => (l.some((x) => x.n === prev) ? l : [...l, item]));

    const t = setTimeout(() => {
      setLeaving((cur) => cur.filter((x) => x.key !== item.key));
    }, DISAPPEAR_MS);
    timersRef.current.push(t);
  }, [n, active]);

  const count = Math.min(Number(max), MAX_TILES);
  if (!Number.isFinite(count) || count < 0) return null;

  const tiles: bigint[] = [];
  for (let i = 0; i <= count; i++) tiles.push(BigInt(i));

  // Center the current block number in the viewport.
  const offsetPx = Number(n) * STEP + TILE_W / 2;

  return (
    <div className="ladder-viewport">
      <div className="ladder-track" style={{ transform: `translate(${-offsetPx}px, -50%)` }}>
        {tiles.map((b) => {
          const dist = b >= n ? Number(b - n) : Number(n - b);
          const d = info[b.toString()];
          const center = b === n;
          const leavingItem = leaving.find((x) => x.n === b);
          return (
            <div
              key={b.toString()}
              className="tile-cell"
              style={{ transform: `scale(${scaleFor(dist)})` }}
            >
              {active && center && (
                <img
                  key={`appear-${b.toString()}`}
                  className="hamster-anvil appear"
                  src={currentImage.src}
                  alt="hamster"
                />
              )}
              {active && leavingItem && (
                <img
                  key={`disappear-${leavingItem.key}`}
                  className="hamster-anvil disappear"
                  src={leavingItem.src}
                  alt="hamster"
                />
              )}
              <button
                className={`tile${center ? ' center' : ''}`}
                disabled={disabled}
                onClick={() => onPick(b)}
              >
                <span className="tile-num">{b.toString()}</span>
                {d && d.users > 0n && <span className="tile-users">{d.users.toString()}</span>}
                {d && d.stake > 0n && <span className="tile-stake">{formatEther(d.stake)}</span>}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
