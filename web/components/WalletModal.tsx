'use client';

import { useEffect, useState } from 'react';
import {
  useWallets,
  useActiveWallet,
  useCreateWallet,
  useConnectWallet,
  getEmbeddedConnectedWallet,
  type ConnectedWallet,
} from '@privy-io/react-auth';
import { createWalletClient, custom, parseEther } from 'viem';
import { sepolia } from 'viem/chains';

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export default function WalletModal({
  open,
  onClose,
  onMessage,
}: {
  open: boolean;
  onClose: () => void;
  onMessage: (text: string) => void;
}) {
  const { wallets } = useWallets();
  const { wallet: activeWallet, setActiveWallet } = useActiveWallet();
  const { createWallet } = useCreateWallet();
  const { connectWallet } = useConnectWallet();
  const [creating, setCreating] = useState(false);
  const [sendFrom, setSendFrom] = useState<ConnectedWallet | null>(null);
  const [sendTo, setSendTo] = useState('');
  const [sendAmount, setSendAmount] = useState('');
  const [sending, setSending] = useState(false);

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

  const embedded = getEmbeddedConnectedWallet(wallets);
  const activeAddress = activeWallet?.address.toLowerCase();

  const handleCreate = async () => {
    if (creating) return;
    setCreating(true);
    try {
      await createWallet();
      onMessage('Wallet created');
    } catch (e) {
      onMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  };

  const handleConnect = () => {
    try {
      connectWallet();
    } catch (e) {
      onMessage(e instanceof Error ? e.message : String(e));
    }
  };

  const handleSwitch = (wallet: ConnectedWallet) => {
    setActiveWallet(wallet);
    onClose();
  };

  const handleCopy = async (wallet: ConnectedWallet) => {
    try {
      await navigator.clipboard.writeText(wallet.address);
      onMessage('Address copied');
    } catch {
      // Fallback for older browsers / non-secure contexts.
      try {
        const el = document.createElement('textarea');
        el.value = wallet.address;
        el.style.position = 'fixed';
        el.style.opacity = '0';
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
        onMessage('Address copied');
      } catch {
        onMessage('Could not copy address');
      }
    }
  };

  const openSend = (wallet: ConnectedWallet) => {
    setSendFrom(wallet);
    setSendTo('');
    setSendAmount('');
  };

  const handleSend = async () => {
    if (!sendFrom) return;
    const to = sendTo.trim();
    if (!/^0x[a-fA-F0-9]{40}$/.test(to)) {
      onMessage('Enter a valid address');
      return;
    }
    let value: bigint;
    try {
      value = parseEther(sendAmount || '0');
    } catch {
      onMessage('Invalid amount');
      return;
    }
    if (value <= 0n) {
      onMessage('Enter an amount');
      return;
    }
    setSending(true);
    try {
      if (sendFrom.chainId && !sendFrom.chainId.endsWith(String(sepolia.id))) {
        await sendFrom.switchChain(sepolia.id);
      }
      const provider = await sendFrom.getEthereumProvider();
      const client = createWalletClient({
        account: sendFrom.address as `0x${string}`,
        chain: sepolia,
        transport: custom(provider as any),
      });
      const hash = await client.sendTransaction({
        account: sendFrom.address as `0x${string}`,
        chain: sepolia,
        to: to as `0x${string}`,
        value,
      });
      onMessage(`Sent ${sendAmount} ETH: ${hash.slice(0, 12)}…`);
      setSendFrom(null);
    } catch (e) {
      onMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal wallet-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">
          ✕
        </button>
        <h3 className="modal-title">Wallets</h3>

        {sendFrom ? (
          <div className="send-panel">
            <div className="send-from">
              From <span className="modal-accent">{shortAddr(sendFrom.address)}</span>
            </div>
            <input
              className="modal-input"
              value={sendTo}
              onChange={(e) => setSendTo(e.target.value)}
              placeholder="Recipient address (0x…)"
              autoFocus
            />
            <input
              className="modal-input"
              value={sendAmount}
              onChange={(e) => setSendAmount(e.target.value)}
              inputMode="decimal"
              placeholder="Amount (ETH)"
            />
            <button className="primary modal-cta" onClick={handleSend} disabled={sending}>
              {sending ? 'Sending…' : 'Send'}
            </button>
            <button className="modal-back" onClick={() => setSendFrom(null)}>
              Back
            </button>
          </div>
        ) : (
          <>
            <div className="wallet-list">
              {wallets.map((w) => {
                const isEmbedded = w.walletClientType === 'privy';
                const label = isEmbedded ? 'Privy wallet' : w.meta?.name || 'External wallet';
                const isActive = w.address.toLowerCase() === activeAddress;
                return (
                  <div key={w.address} className={`wallet-item${isActive ? ' active' : ''}`}>
                    <button className="wallet-item-main" onClick={() => handleSwitch(w)}>
                      <span className="wallet-item-name">{label}</span>
                      <span className="wallet-item-addr">{shortAddr(w.address)}</span>
                      {isActive && <span className="wallet-item-badge">Active</span>}
                    </button>
                    <button
                      className="wallet-icon-btn"
                      onClick={() => handleCopy(w)}
                      title="Copy address"
                      aria-label="Copy address"
                    >
                      📋
                    </button>
                    <button
                      className="wallet-icon-btn"
                      onClick={() => openSend(w)}
                      title="Send ETH"
                      aria-label="Send ETH"
                    >
                      ⌲
                    </button>
                  </div>
                );
              })}
              {wallets.length === 0 && <p className="wallet-empty">No wallets yet.</p>}
            </div>

            <div className="wallet-actions">
              {!embedded && (
                <button className="primary modal-cta" onClick={handleCreate} disabled={creating}>
                  {creating ? 'Creating…' : 'Create wallet'}
                </button>
              )}
              <button className="modal-secondary" onClick={handleConnect}>
                Connect external wallet
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
