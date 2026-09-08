'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function HeaderAuth({ displayName }: { displayName?: string | null }) {
  const router = useRouter();

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.refresh();
  }

  if (!displayName) {
    return (
      <Link href="/login" className="text-xs text-ink-3 hover:text-accent-ink transition-colors">
        Entra
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
      <span
        title={displayName}
        className="hidden sm:inline text-xs bg-accent-tint text-accent-ink font-semibold px-2.5 py-1 rounded-full whitespace-nowrap"
      >
        {displayName}
      </span>
      <span
        title={displayName}
        aria-label={displayName}
        className="sm:hidden w-6 h-6 rounded-full bg-accent-tint text-accent-ink font-semibold text-[11px] flex items-center justify-center flex-shrink-0"
      >
        {displayName[0]?.toUpperCase()}
      </span>
      <button
        onClick={handleLogout}
        className="text-xs text-ink-3 hover:text-loss transition-colors cursor-pointer flex-shrink-0"
      >
        Surt
      </button>
    </div>
  );
}
