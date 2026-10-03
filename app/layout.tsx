import type { Metadata } from 'next';
import './globals.css';
import { cookies } from 'next/headers';
import AccountMenu from '@/components/AccountMenu';
import { getCurrentAccount } from '@/lib/authz';

export const metadata: Metadata = {
  title: 'Classificat — Gestió de campionats de Scrabble',
  description: 'Aplicació per gestionar campionats de Scrabble en català',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const account = await getCurrentAccount();
  const theme = cookieStore.get('theme')?.value;

  return (
    <html lang="ca" data-theme={theme === 'light' || theme === 'dark' ? theme : undefined}>
      <body className="min-h-screen bg-bg text-ink antialiased">
        <header className="bg-surface border-b border-border sticky top-0 z-20">
          <div className="max-w-5xl mx-auto px-3 sm:px-4 h-12 flex items-center gap-2 sm:gap-3">
            {account ? (
              <a href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity min-w-0">
                <Logo />
                <span className="font-display font-bold text-base text-ink truncate hidden sm:inline">Classificat</span>
              </a>
            ) : (
              <div className="flex items-center gap-2 min-w-0">
                <Logo />
                <span className="font-display font-bold text-base text-ink truncate hidden sm:inline">Classificat</span>
              </div>
            )}
            <div className="ml-auto flex items-center flex-shrink-0">
              <AccountMenu displayName={account?.displayName ?? null} role={account?.role ?? null} />
            </div>
          </div>
        </header>
        <main className="max-w-5xl mx-auto px-3 sm:px-4 py-5 sm:py-6">
          {children}
        </main>
      </body>
    </html>
  );
}

function Logo() {
  return (
    <span className="relative w-7 h-7 rounded-lg bg-accent-tint border border-border flex items-center justify-center flex-shrink-0">
      <span className="font-display font-bold text-sm text-ink">C</span>
      <span className="absolute bottom-0.5 right-1 text-[6px] font-bold text-accent-ink">3</span>
    </span>
  );
}
