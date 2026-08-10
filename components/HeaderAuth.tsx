'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function HeaderAuth({ isDirector }: { isDirector: boolean }) {
  const router = useRouter();

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.refresh();
  }

  if (!isDirector) {
    return (
      <Link href="/login" className="ml-auto text-xs text-gray-400 hover:text-blue-600 transition-colors">
        Director
      </Link>
    );
  }

  return (
    <div className="ml-auto flex items-center gap-3">
      <span className="text-xs bg-blue-50 text-blue-700 font-semibold px-2 py-1 rounded-full">Director</span>
      <button
        onClick={handleLogout}
        className="text-xs text-gray-400 hover:text-red-500 transition-colors"
      >
        Surt
      </button>
    </div>
  );
}
