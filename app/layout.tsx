import type { Metadata } from 'next';
import './globals.css';
import { cookies } from 'next/headers';
import { getCurrentAccount } from '@/lib/authz';
import { HeaderTitleProvider } from '@/components/HeaderTitleContext';
import Header from '@/components/Header';

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
        <HeaderTitleProvider>
          <Header loggedIn={!!account} displayName={account?.displayName ?? null} role={account?.role ?? null} />
          <main className="max-w-5xl mx-auto px-3 sm:px-4 py-5 sm:py-6">
            {children}
          </main>
        </HeaderTitleProvider>
      </body>
    </html>
  );
}
