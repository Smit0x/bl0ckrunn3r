import dynamic from 'next/dynamic';

// Load the game only on the client (Privy + wallet polling).
const Game = dynamic(() => import('../components/Game'), { ssr: false });

export default function Page() {
  if (!process.env.NEXT_PUBLIC_PRIVY_APP_ID) {
    return (
      <div className="setup">
        Set <code>NEXT_PUBLIC_PRIVY_APP_ID</code> and <code>NEXT_PUBLIC_PREDICT_ADDRESS</code> in <code>web/.env.local</code>
      </div>
    );
  }
  return <Game />;
}

