'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePrivy, useWallets, useCreateWallet, useActiveWallet, useSigners, getEmbeddedConnectedWallet, useUser, type WalletWithMetadata } from '@privy-io/react-auth';
import { createWalletClient, custom, encodeFunctionData, formatEther, parseEther } from 'viem';
import { sepolia } from 'viem/chains';
import { PREDICT_ADDRESS, predictAbi, publicClient, isConfigured, type Round } from '../lib/contracts';
import Header from './Header';
import WalletModal from './WalletModal';
import Ladder, { type NumberInfo } from './Ladder';
import BetDistribution from './BetDistribution';
import Controls from './Controls';
import BetModal from './BetModal';
import ClaimModal, { type ClaimRoundItem } from './ClaimModal';
import DisclaimerModal from './DisclaimerModal';
import Guide from './Guide';
import GuideIntro from './GuideIntro';
import LiveStream from './LiveStream';
import SqueekStatus from './SqueekStatus';
import Toasts from './Toasts';
import type { ToastData } from './Toast';
import hamsterGlasses from '../images/hamster_glasses_papers.png';
import loadingGif from '../images/loading.gif';

type HistoryRow = {
  id: number;
  startHeight: number;
  endHeight: number;
  result: number;
  status: number;
};

const DISCLAIMER_KEY = 'blockrunner.disclaimer.dismissed';
const GUIDE_KEY = 'blockrunner.guide.dismissed';

export default function Game() {
  const { ready, authenticated, login, logout } = usePrivy();
  const { wallets, ready: walletsReady } = useWallets();
  const { createWallet } = useCreateWallet();
  const { wallet: activeWallet } = useActiveWallet();
  const { addSigners } = useSigners();
  const { user } = useUser();

  const address = activeWallet?.address as `0x${string}` | undefined;
  const embeddedWalletId = (user?.linkedAccounts?.find(
    (a) => a.type === 'wallet' && a.walletClientType === 'privy',
  ) as WalletWithMetadata | undefined)?.id ?? undefined;

  const [blocksSoFar, setBlocksSoFar] = useState<bigint>();
  const [roundId, setRoundId] = useState(0n);
  const [round, setRound] = useState<Round | null>(null);
  const [gamePaused, setGamePaused] = useState(false);
  const [gracePeriod, setGracePeriod] = useState(0n);
  const [owner, setOwner] = useState('');
  const [maxNumber, setMaxNumber] = useState(100n);
  const [numberInfo, setNumberInfo] = useState<Record<string, NumberInfo>>({});
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [betOpen, setBetOpen] = useState(false);
  const [betNumber, setBetNumber] = useState<bigint | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [creatingWallet, setCreatingWallet] = useState(false);
  const [walletOpen, setWalletOpen] = useState(false);
  const [claimOpen, setClaimOpen] = useState(false);
  const [claimItems, setClaimItems] = useState<ClaimRoundItem[]>([]);
  const [claimLoading, setClaimLoading] = useState(false);
  const [claimingRound, setClaimingRound] = useState<bigint | null>(null);
  const [disclaimerOpen, setDisclaimerOpen] = useState(false);
  const [guideIntroOpen, setGuideIntroOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const celebrateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const toastId = useRef(0);
  const signerRef = useRef(false);

  const maybeShowGuideIntro = useCallback(() => {
    try {
      if (localStorage.getItem(GUIDE_KEY) !== '1') {
        setGuideIntroOpen(true);
      }
    } catch {
      setGuideIntroOpen(true);
    }
  }, []);

  // Show the "still in development" notice once, then offer the tour.
  useEffect(() => {
    let showDisclaimer = false;
    try {
      showDisclaimer = localStorage.getItem(DISCLAIMER_KEY) !== '1';
    } catch {
      showDisclaimer = true;
    }
    if (showDisclaimer) {
      setDisclaimerOpen(true);
    } else {
      maybeShowGuideIntro();
    }
  }, [maybeShowGuideIntro]);

  const handleDisclaimerClose = useCallback(
    (dontShowAgain: boolean) => {
      if (dontShowAgain) {
        try {
          localStorage.setItem(DISCLAIMER_KEY, '1');
        } catch {
          // Ignore storage failures.
        }
      }
      setDisclaimerOpen(false);
      maybeShowGuideIntro();
    },
    [maybeShowGuideIntro],
  );

  const handleGuideIntroStart = useCallback((dontShowAgain: boolean) => {
    if (dontShowAgain) {
      try {
        localStorage.setItem(GUIDE_KEY, '1');
      } catch {
        // Ignore storage failures.
      }
    }
    setGuideIntroOpen(false);
    setGuideOpen(true);
  }, []);

  const handleGuideIntroSkip = useCallback((dontShowAgain: boolean) => {
    if (dontShowAgain) {
      try {
        localStorage.setItem(GUIDE_KEY, '1');
      } catch {
        // Ignore storage failures.
      }
    }
    setGuideIntroOpen(false);
  }, []);

  const openGuide = useCallback(() => {
    setGuideOpen(true);
  }, []);

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

  // The countdown must track the chain's clock (block.timestamp), not the
  // device clock. Sepolia can drift ~100s from real time, which otherwise
  // leaves the UI showing time remaining while the contract has already
  // closed betting ("Betting closed").
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const clockOffsetRef = useRef(0);

  useEffect(() => {
    const id = setInterval(() => {
      setNow(Math.floor(Date.now() / 1000) + clockOffsetRef.current);
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // Provision a session signer (key quorum) on the embedded wallet once, so
  // transactions matching the signer's policy are signed without the per-
  // transaction "Approve transaction" prompt. This app uses TEE execution,
  // which requires signers instead of the older on-device delegated actions.
  // Create a signer + policy in the Privy dashboard, then set
  // NEXT_PUBLIC_PRIVY_SIGNER_ID (and NEXT_PUBLIC_PRIVY_POLICY_ID) in web/.env.local.
  useEffect(() => {
    const signerId = process.env.NEXT_PUBLIC_PRIVY_SIGNER_ID;
    if (!authenticated || !walletsReady || signerRef.current || !signerId) return;
    const embedded = getEmbeddedConnectedWallet(wallets);
    if (!embedded) return;
    signerRef.current = true;
    const policyIds = process.env.NEXT_PUBLIC_PRIVY_POLICY_ID
      ? [process.env.NEXT_PUBLIC_PRIVY_POLICY_ID]
      : undefined;
    addSigners({ address: embedded.address, signers: [{ signerId, policyIds }] })
      .then(() => pushMessage('Auto-sign enabled'))
      .catch((e) => pushMessage(e instanceof Error ? e.message : String(e)));
  }, [authenticated, walletsReady, wallets, addSigners, pushMessage]);

  const poll = useCallback(async () => {
    if (!isConfigured) return;
    try {
      const [bsf, cid, paused, grace, own, maxN, block] = await Promise.all([
        publicClient.readContract({ address: PREDICT_ADDRESS, abi: predictAbi, functionName: 'blocksProducedSoFar' }),
        publicClient.readContract({ address: PREDICT_ADDRESS, abi: predictAbi, functionName: 'currentRoundId' }),
        publicClient.readContract({ address: PREDICT_ADDRESS, abi: predictAbi, functionName: 'gamePaused' }),
        publicClient.readContract({ address: PREDICT_ADDRESS, abi: predictAbi, functionName: 'gracePeriod' }),
        publicClient.readContract({ address: PREDICT_ADDRESS, abi: predictAbi, functionName: 'owner' }),
        publicClient.readContract({ address: PREDICT_ADDRESS, abi: predictAbi, functionName: 'maxBetSpan' }),
        publicClient.getBlock({ blockTag: 'latest' }),
      ]);

      // Keep the visible countdown synced to the chain clock.
      clockOffsetRef.current = Number(block.timestamp) - Math.floor(Date.now() / 1000);

      setBlocksSoFar(bsf);
      setRoundId(cid);
      setGamePaused(paused);
      setGracePeriod(grace);
      setOwner(own.toLowerCase());
      setMaxNumber(maxN);

      if (cid > 0n) {
        const r = await publicClient.readContract({ address: PREDICT_ADDRESS, abi: predictAbi, functionName: 'getRound', args: [cid] });
        setRound({
          startHeight: r[0],
          endHeight: r[1],
          result: r[2],
          startTime: r[3],
          endTime: r[4],
          pot: r[5],
          totalUserStake: r[6],
          status: r[7],
        });

        const [numbers, stakes, users] = await publicClient.readContract({
          address: PREDICT_ADDRESS,
          abi: predictAbi,
          functionName: 'getActiveNumberStates',
          args: [cid],
        });
        const map: Record<string, NumberInfo> = {};
        numbers.forEach((n, i) => {
          map[n.toString()] = { users: users[i], stake: stakes[i] };
        });
        setNumberInfo(map);
      } else {
        setRound(null);
        setNumberInfo({});
      }
    } catch (e) {
      console.error('poll', e);
    }
  }, []);

  useEffect(() => {
    poll();
    const id = setInterval(poll, 2000);
    return () => clearInterval(id);
  }, [poll]);

  // Load recent round history from the keeper's history API.
  useEffect(() => {
    if (roundId === 0n) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/history', { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as HistoryRow[];
        if (!cancelled) setHistory(data);
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [roundId]);

  const run = useCallback(async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      pushMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [pushMessage]);

  // Explicitly create an embedded wallet when a user logged in but no wallet
  // exists yet (e.g. embedded wallets disabled in the dashboard, or the
  // create-on-login prompt was dismissed). Surfaces the real error in a toast.
  const handleCreateWallet = useCallback(async () => {
    if (creatingWallet) return;
    setCreatingWallet(true);
    try {
      await createWallet();
      pushMessage('Wallet created');
    } catch (e) {
      pushMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setCreatingWallet(false);
    }
  }, [creatingWallet, createWallet, pushMessage]);

  // Send via the connected wallet's EIP-1193 provider (works for Rabby/MetaMask
  // and Privy embedded wallets). Simulates first so a revert (e.g. "Too early")
  // is surfaced with its real reason instead of a confusing "sent" message.
  const sendTx = useCallback(
    async (functionName: string, args: unknown[] = [], value = 0n) => {
      const wallet = activeWallet;
      if (!wallet || wallet.type !== 'ethereum') throw new Error('No wallet connected');
      const account = wallet.address as `0x${string}`;
      if (wallet.chainId && !wallet.chainId.endsWith(String(sepolia.id))) {
        await wallet.switchChain(sepolia.id);
      }

      try {
        await publicClient.simulateContract({
          address: PREDICT_ADDRESS,
          abi: predictAbi,
          functionName,
          args,
          account,
          value,
        } as any);
      } catch (e) {
        const short = (e as { shortMessage?: string })?.shortMessage;
        throw new Error(short || (e instanceof Error ? e.message : String(e)));
      }

      // Embedded (Privy) wallet → sign server-side via the delegated signer so
      // the user is not prompted with "Approve transaction".
      if (wallet.walletClientType === 'privy') {
        if (!embeddedWalletId) throw new Error('Wallet not delegated yet');
        const data = encodeFunctionData({ abi: predictAbi, functionName: functionName as any, args: args as any });
        const res = await fetch('/api/sign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            walletId: embeddedWalletId,
            to: PREDICT_ADDRESS,
            data,
            value: value.toString(),
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || 'Sign failed');
        triggerCelebrate();
        return json.hash as `0x${string}`;
      }

      // External wallet (MetaMask/Rabby) → sign in the browser as before.
      const provider = await wallet.getEthereumProvider();
      const walletClient = createWalletClient({
        account,
        chain: sepolia,
        transport: custom(provider as any),
      });
      const hash = await walletClient.sendTransaction({
        account,
        chain: sepolia,
        to: PREDICT_ADDRESS,
        data: encodeFunctionData({ abi: predictAbi, functionName: functionName as any, args: args as any }),
        value,
      });
      triggerCelebrate();
      return hash;
    },
    [activeWallet, embeddedWalletId, triggerCelebrate],
  );

  const submitBet = useCallback(
    async (number: bigint, amount: string) => {
      if (!authenticated || !address) {
        pushMessage('Log in first');
        return;
      }
      let value: bigint;
      try {
        value = parseEther(amount || '0');
      } catch {
        pushMessage('Invalid amount');
        return;
      }
      if (value <= 0n) {
        pushMessage('Enter an amount');
        return;
      }
      await run(async () => {
        const hash = await sendTx('bet', [roundId, number], value);
        pushMessage(`Bet sent: ${hash.slice(0, 12)}…`);
      });
    },
    [authenticated, address, roundId, run, sendTx, pushMessage],
  );

  const openBet = useCallback(() => {
    setBetNumber(undefined);
    setBetOpen(true);
  }, []);

  const openBetFor = useCallback((n: bigint) => {
    setBetNumber(n);
    setBetOpen(true);
  }, []);

  const closeBet = useCallback(() => setBetOpen(false), []);

  const handleBetSubmit = useCallback(
    async (number: bigint, amount: string) => {
      await submitBet(number, amount);
      setBetOpen(false);
    },
    [submitBet],
  );

  // Build the list of rounds (1..currentRoundId) and whether the connected
  // wallet still has claimable winnings in each. A number is claimable when the
  // wallet's stake on it is non-zero AND its distance from the round result is
  // one of the winning distances (tierReward > 0).
  const loadClaimRounds = useCallback(async () => {
    if (!address) {
      setClaimItems([]);
      return;
    }
    const items: ClaimRoundItem[] = [];
    for (let i = 1n; i <= roundId; i++) {
      try {
        const r = await publicClient.readContract({ address: PREDICT_ADDRESS, abi: predictAbi, functionName: 'getRound', args: [i] });
        const status = Number(r[7]);
        if (status === 2) {
          const result = r[2] as bigint;
          const active = await publicClient.readContract({ address: PREDICT_ADDRESS, abi: predictAbi, functionName: 'getActiveNumbers', args: [i] });
          for (const n of active) {
            const s = await publicClient.readContract({ address: PREDICT_ADDRESS, abi: predictAbi, functionName: 'userStake', args: [i, address, n] });
            if (s <= 0n) continue;
            const d = n > result ? n - result : result - n;
            const reward = await publicClient.readContract({ address: PREDICT_ADDRESS, abi: predictAbi, functionName: 'tierReward', args: [i, d] });
            if (reward > 0n) {
              items.push({ roundId: i });
              break;
            }
          }
        }
      } catch {
        // Ignore per-round read failures; skip the round.
      }
    }
    setClaimItems(items);
  }, [address, roundId]);

  const openClaimModal = useCallback(async () => {
    if (!authenticated || !address) {
      pushMessage('Log in first');
      return;
    }
    setClaimOpen(true);
    setClaimLoading(true);
    try {
      await loadClaimRounds();
    } finally {
      setClaimLoading(false);
    }
  }, [authenticated, address, loadClaimRounds, pushMessage]);

  const claimRound = useCallback(
    async (roundIdToClaim: bigint) => {
      if (!authenticated || !address) {
        pushMessage('Log in first');
        return;
      }
      await run(async () => {
        const r = await publicClient.readContract({ address: PREDICT_ADDRESS, abi: predictAbi, functionName: 'getRound', args: [roundIdToClaim] });
        const result = r[2] as bigint;
        const active = await publicClient.readContract({ address: PREDICT_ADDRESS, abi: predictAbi, functionName: 'getActiveNumbers', args: [roundIdToClaim] });
        const mine: bigint[] = [];
        for (const n of active) {
          const s = await publicClient.readContract({ address: PREDICT_ADDRESS, abi: predictAbi, functionName: 'userStake', args: [roundIdToClaim, address, n] });
          if (s <= 0n) continue;
          const d = n > result ? n - result : result - n;
          const reward = await publicClient.readContract({ address: PREDICT_ADDRESS, abi: predictAbi, functionName: 'tierReward', args: [roundIdToClaim, d] });
          if (reward > 0n) mine.push(n);
        }
        if (mine.length === 0) {
          pushMessage('Nothing to claim');
          return;
        }
        setClaimingRound(roundIdToClaim);
        try {
          const hash = await sendTx('claim', [roundIdToClaim, mine]);
          pushMessage(`Claim sent: ${hash.slice(0, 12)}…`);
          await loadClaimRounds();
        } finally {
          setClaimingRound(null);
        }
      });
    },
    [authenticated, address, run, sendTx, loadClaimRounds, pushMessage],
  );

  const ownerAction = useCallback(
    async (fn: 'startRound' | 'finalize' | 'cancelRound') => {
      await run(async () => {
        const args = fn === 'startRound' ? [] : [roundId];
        const hash = await sendTx(fn, args);
        pushMessage(`${fn} sent: ${hash.slice(0, 12)}…`);
      });
    },
    [roundId, run, sendTx, pushMessage],
  );

  if (!ready)
    return (
      <div className="loading">
        <img className="loading-gif" src={loadingGif.src} alt="Loading" />
        <div className="loading-label">loading</div>
      </div>
    );

  if (!isConfigured) {
    return (
      <div className="setup">
        Set <code>NEXT_PUBLIC_PRIVY_APP_ID</code> and <code>NEXT_PUBLIC_PREDICT_ADDRESS</code> in <code>web/.env.local</code>
      </div>
    );
  }

  const isOwner = !!address && address.toLowerCase() === owner;
  const live = !!round && round.status === 1 && BigInt(now) < round.endTime;
  const bettingOpen = live && !gamePaused;
  const canBet = bettingOpen && authenticated;
  const remaining = live && round ? Math.max(0, Number(round.endTime - BigInt(now))) : 0;
  const mm = Math.floor(remaining / 60);
  const ss = remaining % 60;

  return (
    <main className={`game${live ? ' round-live' : ''}`}>
      <Header
        authenticated={authenticated}
        address={address}
        onLogin={login}
        onLogout={logout}
        needsWallet={authenticated && walletsReady && !address}
        creatingWallet={creatingWallet}
        onCreateWallet={handleCreateWallet}
        onOpenWallet={() => setWalletOpen(true)}
        onOpenGuide={openGuide}
      />

      <div className="ladder-head">
        <div className="round-counter">
          Round {roundId.toString()}
          {round && <span className="start-block"> · Started at block {round.startHeight.toString()}</span>}
          {gamePaused && <span className="paused-badge">⏸️ Paused</span>}
        </div>
        {live && (
          <div className="timer">⏳ {mm}:{String(ss).padStart(2, '0')}</div>
        )}
      </div>

      <SqueekStatus />

      <LiveStream />

      <Ladder max={maxNumber} info={numberInfo} blocksSoFar={blocksSoFar} active={live} disabled={busy || !canBet} onPick={openBetFor} />

      <div className="pot-bar">
        <span className="pot">Pot: {formatEther(round?.pot ?? 0n)} ETH</span>
        {round?.status === 2 && <span className="result">🏁 Result: {round.result.toString()} blocks</span>}
      </div>

      <BetDistribution info={numberInfo} blocksSoFar={blocksSoFar} pot={round?.pot} />
      <Controls
        round={round}
        roundId={roundId}
        gracePeriod={gracePeriod}
        now={now}
        isOwner={isOwner}
        busy={busy}
        canBet={canBet}
        onBet={openBet}
        onClaim={openClaimModal}
        onStart={() => ownerAction('startRound')}
        onFinalize={() => ownerAction('finalize')}
        onCancel={() => ownerAction('cancelRound')}
      />
      {history.length > 0 && (
        <section className="history">
          <h3 className="history-title">Round history</h3>
          <table className="history-table">
            <thead>
              <tr>
                <th>Round</th>
                <th>Start block</th>
                <th>End block</th>
                <th>Blocks produced</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {history.map((r) => (
                <tr key={r.id}>
                  <td>{r.id}</td>
                  <td>{r.startHeight}</td>
                  <td>{r.status === 2 ? r.endHeight : '—'}</td>
                  <td>{r.status === 2 ? r.result : '—'}</td>
                  <td className={r.status === 2 ? 'status-finalized' : r.status === 3 ? 'status-cancelled' : 'status-betting'}>
                    {r.status === 2 ? 'Finalized' : r.status === 3 ? 'Cancelled' : 'Betting'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      <BetModal
        open={betOpen}
        initialNumber={betNumber}
        maxNumber={maxNumber}
        busy={busy}
        onClose={closeBet}
        onSubmit={handleBetSubmit}
      />
      <img className={`glasses-hamster${celebrate ? ' show' : ''}`} src={hamsterGlasses.src} alt="" />
      <Toasts toasts={toasts} onDismiss={dismissMessage} />
      <ClaimModal
        open={claimOpen}
        items={claimItems}
        loading={claimLoading}
        claimingRound={claimingRound}
        onClose={() => setClaimOpen(false)}
        onClaim={claimRound}
      />
      <WalletModal open={walletOpen} onClose={() => setWalletOpen(false)} onMessage={pushMessage} />
      <DisclaimerModal open={disclaimerOpen} onClose={handleDisclaimerClose} />
      <GuideIntro open={guideIntroOpen} onStart={handleGuideIntroStart} onSkip={handleGuideIntroSkip} />
      <Guide open={guideOpen} onClose={() => setGuideOpen(false)} />
    </main>
  );
}

