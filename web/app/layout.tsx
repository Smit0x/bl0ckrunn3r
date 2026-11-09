import type { Metadata } from 'next';
import { Silkscreen } from 'next/font/google';
import './globals.css';
import { Providers } from '../components/Providers';

const silkscreen = Silkscreen({
  weight: ['400', '700'],
  subsets: ['latin'],
  variable: '--font-silkscreen',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'BlockRunner',
  description: 'Bet on how many blocks the hamster produces in 3 minutes',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={silkscreen.variable}>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var t=localStorage.getItem('theme');if(t!=='dark'){t='light';}document.documentElement.setAttribute('data-theme',t);}catch(e){document.documentElement.setAttribute('data-theme','light');}})();",
          }}
        />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

