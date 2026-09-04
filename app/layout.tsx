import type { Metadata } from 'next';
import './globals.css';
import { cookies } from 'next/headers';
import { getIronSession } from 'iron-session';
import { sessionOptions } from '@/lib/session';
import type { SessionData } from '@/lib/session';
import HeaderAuth from '@/components/HeaderAuth';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Classificat — Gestió de campionats de Scrabble',
  description: 'Aplicació per gestionar campionats de Scrabble en català',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const session = await getIronSession<SessionData>(cookieStore, sessionOptions);
  const theme = cookieStore.get('theme')?.value;

  return (
    <html lang="ca" data-theme={theme === 'light' || theme === 'dark' ? theme : undefined}>
      <body className="min-h-screen bg-bg text-ink antialiased">
        <header className="bg-surface border-b border-border sticky top-0 z-10">
          <div className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-3">
            <div className="flex items-center gap-2.5">
              {session.isDirector ? (
                <a href="/" className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
                  <Logo />
                  <span className="font-display font-bold text-lg text-ink">Classificat</span>
                </a>
              ) : (
                <>
                  <Logo />
                  <span className="font-display font-bold text-lg text-ink">Classificat</span>
                </>
              )}
            </div>
            <span className="w-px h-4 bg-border hidden sm:block" />
            <span className="text-sm text-ink-3 hidden sm:block">Gestió de campionats de Scrabble</span>
            <div className="ml-auto flex items-center gap-3">
              <Link href="/preferencies" className="text-xs text-ink-3 hover:text-accent-ink transition-colors" title="Preferències">
                Preferències
              </Link>
              {session.isDirector && (
                <Link href="/directors" className="text-xs text-ink-3 hover:text-accent-ink transition-colors">
                  Usuaris
                </Link>
              )}
              <HeaderAuth isDirector={session.isDirector ?? false} directorName={session.directorName} />
            </div>
          </div>
        </header>
        <main className="max-w-5xl mx-auto px-4 py-6">
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
