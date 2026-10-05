'use client';

import AccountMenu from './AccountMenu';
import QrCompartir from './QrCompartir';
import { useHeaderTitle } from './HeaderTitleContext';
import type { Role } from '@/db/types';

export default function Header({
  loggedIn,
  displayName,
  role,
}: {
  loggedIn: boolean;
  displayName: string | null;
  role: Role | null;
}) {
  const title = useHeaderTitle();

  return (
    <header className="bg-surface border-b border-border sticky top-0 z-20">
      <div className="max-w-5xl mx-auto px-3 sm:px-4 h-12 flex items-center gap-2 sm:gap-3">
        {loggedIn ? (
          <a href="/" className="flex items-center hover:opacity-80 transition-opacity flex-shrink-0" title="Competicions">
            <Logo />
          </a>
        ) : (
          <div className="flex-shrink-0">
            <Logo />
          </div>
        )}

        {title ? (
          <span className="font-display font-bold text-base text-ink truncate flex-1 min-w-0">{title.name}</span>
        ) : (
          <span className="font-display font-bold text-base text-ink truncate hidden sm:inline">Classificat</span>
        )}

        <div className="ml-auto flex items-center gap-1 flex-shrink-0">
          {title && <QrCompartir tournamentId={title.id} />}
          <AccountMenu displayName={displayName} role={role} />
        </div>
      </div>
    </header>
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
