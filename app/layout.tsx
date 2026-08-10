import type { Metadata } from 'next';
import './globals.css';
import { cookies } from 'next/headers';
import { getIronSession } from 'iron-session';
import { sessionOptions } from '@/lib/session';
import type { SessionData } from '@/lib/session';
import HeaderAuth from '@/components/HeaderAuth';

export const metadata: Metadata = {
  title: 'Classificat — Gestió de campionats de Scrabble',
  description: 'Aplicació per gestionar campionats de Scrabble en català',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions);

  return (
    <html lang="ca">
      <body className="min-h-screen bg-gray-50 text-gray-900 antialiased">
        <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
          <div className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-3">
            {session.isDirector ? (
              <a href="/" className="font-bold text-lg tracking-tight text-blue-700 hover:text-blue-900">
                Classificat
              </a>
            ) : (
              <span className="font-bold text-lg tracking-tight text-blue-700">Classificat</span>
            )}
            <span className="text-gray-300">|</span>
            <span className="text-sm text-gray-500">Gestió de campionats de Scrabble</span>
            <HeaderAuth isDirector={session.isDirector ?? false} />
          </div>
        </header>
        <main className="max-w-5xl mx-auto px-4 py-6">
          {children}
        </main>
      </body>
    </html>
  );
}
