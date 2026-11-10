'use client';

import { useEffect, useState } from 'react';
import icon from '../images/icon.png';

type Theme = 'light' | 'dark';

function readTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  return localStorage.getItem('theme') === 'dark' ? 'dark' : 'light';
}

export default function Header({
  authenticated,
  address,
  onLogin,
  onLogout,
  needsWallet,
  creatingWallet,
  onCreateWallet,
  onOpenWallet,
  onOpenGuide,
  mode,
  onToggleMode,
}: {
  authenticated: boolean;
  address?: string;
  onLogin: () => void;
  onLogout: () => void;
  needsWallet: boolean;
  creatingWallet: boolean;
  onCreateWallet: () => void;
  onOpenWallet: () => void;
  onOpenGuide: () => void;
  mode: 'onchain' | 'offchain';
  onToggleMode: () => void;
}) {
  const [theme, setTheme] = useState<Theme>(readTheme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  return (
    <header className="header">
      <div className="brand">
        <img className="brand-logo" src={icon.src} alt="BlockRunner" />BlockRunner
      </div>
      <div className="auth">
        <button
          className="theme-toggle"
          onClick={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
          aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
          title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
        >
          {theme === 'light' ? '🌙' : '☀️'}
        </button>
        <button
          className="theme-toggle"
          onClick={onOpenGuide}
          aria-label="Open guide"
          title="Guide"
        >
          ?
        </button>
        <button
          className="theme-toggle"
          onClick={onToggleMode}
          aria-label="Switch game mode"
          title={mode === 'onchain' ? 'Try offchain demo' : 'Back to onchain game'}
        >
          {mode === 'onchain' ? '🎮 Offchain' : '⛓ Onchain'}
        </button>
        {mode === 'onchain' &&
          (!authenticated ? (
            <button onClick={onLogin}>Log in</button>
          ) : (
            <>
              {address ? (
                <button className="addr-btn" onClick={onOpenWallet} title="Switch wallet">
                  {`${address.slice(0, 6)}…${address.slice(-4)}`}
                  <span className="caret">▾</span>
                </button>
              ) : needsWallet ? (
                <button onClick={onCreateWallet} disabled={creatingWallet}>
                  {creatingWallet ? 'Creating…' : 'Create wallet'}
                </button>
              ) : null}
              <button onClick={onLogout}>Log out</button>
            </>
          ))}
      </div>
    </header>
  );
}

