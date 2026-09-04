'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function HeaderAuth({ isDirector, directorName }: { isDirector: boolean; directorName?: string }) {
  const router = useRouter();

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.refresh();
  }

  if (!isDirector) {
    return (
      <Link href="/login" className="text-xs text-ink-3 hover:text-accent-ink transition-colors">
        Director
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs bg-accent-tint text-accent-ink font-semibold px-2.5 py-1 rounded-full">
        {directorName ?? 'Director'}
      </span>
      <button
        onClick={handleLogout}
        className="text-xs text-ink-3 hover:text-loss transition-colors cursor-pointer"
      >
        Surt
      </button>
    </div>
  );
}
