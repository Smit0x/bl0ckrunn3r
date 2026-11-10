'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { formatEther, parseEther } from 'viem';
import Ladder, { type NumberInfo } from './Ladder';
import BetDistribution from './BetDistribution';
import BetModal from './BetModal';
import Toasts from './Toasts';
import type { ToastData } from './Toast';
import hamsterGlasses from '../images/hamster_glasses_papers.png';

// Offchain demo game — same rules as the onchain SqueekPredict game, but
// simulated entirely in the browser (no wallet / chain needed). Bots bet a
// random number each round; the result is a simulated block count.

const ROUND_SECONDS = 60; // demo rounds are shorter than onchain (180s)
const MAX_NUMBER = 256n; // matches onchain maxBetSpan
const BOT_COUNT = 6;
const TIER_WEIGHTS = [5000n, 2500n, 1500n, 1000n]; // 50/25/15/10%
const STARTING_BALANCE = parseEther('1');

interface OffchainRound {
  id: number;
  status: 'betting' | 'finalized';
  startTime: number;
  endTime: number;
  target: bigint; // final blocks produced (revealed at finalize)
  result: bigint;
  pot: bigint;
  numberStakes: Record<string, { users: number; stake: bigint }>;
  userBet: { number: bigint; stake: bigint } | null;
  userClaimed: boolean;
  winningDistances: bigint[];
  tierReward: Record<string, bigint>;
  distanceTotalStake: Record<string, bigint>;
}

function makeRound(id: number): OffchainRound {
  const target = BigInt(Math.floor(Math.random() * Number(MAX_NUMBER) + 1));
  const numberStakes: Record<string, { users: number; stake: bigint }> = {};
  let pot = 0n;
  for (let i = 0; i < BOT_COUNT; i++) {
    const num = BigInt(Math.floor(Math.random() * Number(MAX_NUMBER) + 1));
    const stake = parseEther((0.01 + Math.random() * 0.09).toFixed(3));
    pot += stake;
    const key = num.toString();
    const cell = numberStakes[key] ?? { users: 0, stake: 0n };
    cell.users += 1;
    cell.stake += stake;
    numberStakes[key] = cell;
  }
  return {
    id,
    status: 'betting',
    startTime: Date.now(),
    endTime: Date.now() + ROUND_SECONDS * 1000,
    target,
    result: 0n,
    pot,
    numberStakes,
    userBet: null,
    userClaimed: false,
    winningDistances: [],
    tierReward: {},
    distanceTotalStake: {},
  };
}

// Same winner selection as SqueekPredict._resolveWinners: up to 4 smallest
// distinct distances win, split 50/25/15/10% (normalized), pro-rata by stake.
function finalizeRound(r: OffchainRound): OffchainRound {
  const result = r.target;
  const byDistance = new Map<string, bigint>();
  for (const [numStr, cell] of Object.entries(r.numberStakes)) {
    if (cell.stake <= 0n) continue;
    const n = BigInt(numStr);
    const d = n > result ? n - result : result - n;
    const key = d.toString();
    byDistance.set(key, (byDistance.get(key) ?? 0n) + cell.stake);
  }
  const dists = [...byDistance.entries()]
    .map(([d, stake]) => ({ d: BigInt(d), stake }))
    .sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));

  const winCount = Math.min(4, dists.length);
  let weightSum = 0n;
  for (let i = 0; i < winCount; i++) weightSum += TIER_WEIGHTS[i];

  const winningDistances: bigint[] = [];
  const tierReward: Record<string, bigint> = {};
  const distanceTotalStake: Record<string, bigint> = {};
  const rewardPool = r.pot; // no fee in the demo
  for (let i = 0; i < winCount; i++) {
    const d = dists[i].d;
    winningDistances.push(d);
    distanceTotalStake[d.toString()] = dists[i].stake;
    tierReward[d.toString()] = (rewardPool * TIER_WEIGHTS[i]) / weightSum;
  }

  return { ...r, status: 'finalized', result, winningDistances, tierReward, distanceTotalStake };
}

export default function OffchainGame() {
  const [round, setRound] = useState<OffchainRound | null>(null);
  const [balance, setBalance] = useState<bigint>(STARTING_BALANCE);
  const [now, setNow] = useState(() => Date.now());
  const [betOpen, setBetOpen] = useState(false);
  const [betNumber, setBetNumber] = useState<bigint | undefined>(undefined);
  const [celebrate, setCelebrate] = useState(false);
  const [toasts, setToasts] = useState<ToastData[]>([]);

  const nextIdRef = useRef(1);
  const toastId = useRef(0);
  const celebrateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pushMessage = useCallback((text: string) => {
    const id = ++toastId.current;
    setToasts((prev) => [...prev, { id, text }]);
  }, []);

  const dismissMessage = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const triggerCelebrate = useCallback(() => {
    setCelebrate(true);
    if (celebrateTimer.current) clearTimeout(celebrateTimer.current);
    celebrateTimer.current = setTimeout(() => setCelebrate(false), 3500);
  }, []);

  const startRound = useCallback(() => {
    setBetOpen(false);
    setRound(makeRound(nextIdRef.current++));
  }, []);

  // tick once per second for the countdown + ladder animation
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // start the first round
  useEffect(() => {
    startRound();
  }, [startRound]);

  // finalize when the betting window expires
  useEffect(() => {
    if (!round || round.status !== 'betting') return;
    if (now < round.endTime) return;
    setRound((r) => (r && r.status === 'betting' ? finalizeRound(r) : r));
  }, [now, round]);

  // auto-advance to the next round shortly after finalize (auto-claims winnings)
  useEffect(() => {
    if (!round || round.status !== 'finalized') return;
    let autoAmount = 0n;
    if (round.userBet && !round.userClaimed) {
      const { number, stake } = round.userBet;
      const d = number > round.result ? number - round.result : round.result - number;
      const reward = round.tierReward[d.toString()] ?? 0n;
      const total = round.distanceTotalStake[d.toString()] ?? 0n;
      if (reward > 0n && total > 0n) autoAmount = (reward * stake) / total;
    }
    const t = setTimeout(() => {
      if (autoAmount > 0n) {
        setBalance((b) => b + autoAmount);
        pushMessage(`Round ${round.id} auto-claimed ${formatEther(autoAmount)} ETH`);
      }
      startRound();
    }, 12000);
    return () => clearTimeout(t);
  }, [round, startRound, pushMessage]);

  const openBet = useCallback(() => {
    setBetNumber(undefined);
    setBetOpen(true);
  }, []);

  const openBetFor = useCallback((n: bigint) => {
    setBetNumber(n);
    setBetOpen(true);
  }, []);

  const closeBet = useCallback(() => setBetOpen(false), []);

  const placeBet = useCallback(
    (number: bigint, amountStr: string) => {
      let amount: bigint;
      try {
        amount = parseEther(amountStr || '0');
      } catch {
        pushMessage('Invalid amount');
        return;
      }
      if (amount <= 0n) {
        pushMessage('Enter an amount');
        return;
      }
      if (!round || round.status !== 'betting') {
        pushMessage('Round not active');
        return;
      }
      if (amount > balance) {
        pushMessage('Not enough balance');
        return;
      }
      setBalance((b) => b - amount);
      setRound((r) => {
        if (!r) return r;
        const key = number.toString();
        const prev = r.numberStakes[key] ?? { users: 0, stake: 0n };
        const numberStakes = { ...r.numberStakes, [key]: { users: prev.users + 1, stake: prev.stake + amount } };
        return { ...r, pot: r.pot + amount, userBet: { number, stake: amount }, numberStakes };
      });
      setBetOpen(false);
      pushMessage(`Bet ${formatEther(amount)} ETH on #${number.toString()}`);
    },
    [round, balance, pushMessage],
  );

  const claim = useCallback(() => {
    if (!round || round.status !== 'finalized' || !round.userBet || round.userClaimed) return;
    const { number, stake } = round.userBet;
    const d = number > round.result ? number - round.result : round.result - number;
    const reward = round.tierReward[d.toString()] ?? 0n;
    const total = round.distanceTotalStake[d.toString()] ?? 0n;
    const amount = reward > 0n && total > 0n ? (reward * stake) / total : 0n;
    setRound((r) => (r ? { ...r, userClaimed: true } : r));
    if (amount > 0n) {
      setBalance((b) => b + amount);
      pushMessage(`You won ${formatEther(amount)} ETH!`);
      triggerCelebrate();
    } else {
      pushMessage('No winnings this round');
    }
  }, [round, pushMessage, triggerCelebrate]);

  const resetBalance = useCallback(() => {
    setBalance(STARTING_BALANCE);
    pushMessage('Balance reset to 1 ETH');
  }, [pushMessage]);

  const numberInfo: Record<string, NumberInfo> = {};
  if (round) {
    for (const [k, v] of Object.entries(round.numberStakes)) {
      numberInfo[k] = { users: BigInt(v.users), stake: v.stake };
    }
  }

  const blocksSoFar = round
    ? round.status === 'finalized'
      ? round.result
      : BigInt(Math.floor(Number(round.target) * Math.max(0, Math.min(1, (now - round.startTime) / (ROUND_SECONDS * 1000)))))
    : 0n;

  const remaining = round && round.status === 'betting' ? Math.max(0, Math.ceil((round.endTime - now) / 1000)) : 0;
  const mm = Math.floor(remaining / 60);
  const ss = remaining % 60;
  const canBet = !!round && round.status === 'betting';
  const canClaim = !!round && round.status === 'finalized' && !!round.userBet && !round.userClaimed;

  return (
    <>
      <div className="ladder-head">
        <div className="round-counter">
          Round {round?.id ?? 0}
          <span className="offchain-badge">Offchain demo</span>
        </div>
        {round?.status === 'betting' && (
          <div className="timer">⏳ {mm}:{String(ss).padStart(2, '0')}</div>
        )}
        {round?.status === 'finalized' && <span className="result">🏁 Result: {round.result.toString()} blocks</span>}
      </div>

      <div className="balance-bar">
        <span>
          Your balance: <strong>{formatEther(balance)} ETH</strong>
        </span>
        <button className="reset-btn" onClick={resetBalance}>
          Reset balance
        </button>
      </div>

      <Ladder max={MAX_NUMBER} info={numberInfo} blocksSoFar={blocksSoFar} active={canBet} disabled={!canBet} onPick={openBetFor} />

      <div className="pot-bar">
        <span className="pot">Pot: {formatEther(round?.pot ?? 0n)} ETH</span>
      </div>

      <BetDistribution info={numberInfo} blocksSoFar={blocksSoFar} pot={round?.pot} />

      <section className="controls">
        <button className="bet-cta" disabled={!canBet} onClick={openBet}>
          BET
        </button>
        {canClaim && (
          <button className="bet-cta" onClick={claim}>
            Claim winnings
          </button>
        )}
        {round?.status === 'finalized' && round.userClaimed && <span className="claimed">Claimed ✓</span>}
      </section>

      <BetModal open={betOpen} initialNumber={betNumber} maxNumber={MAX_NUMBER} busy={false} onClose={closeBet} onSubmit={placeBet} />

      <img className={`glasses-hamster${celebrate ? ' show' : ''}`} src={hamsterGlasses.src} alt="" />
      <Toasts toasts={toasts} onDismiss={dismissMessage} />
    </>
  );
}

