'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

type Theme = 'light' | 'dark' | 'system';

const OPTIONS: { value: Theme; label: string }[] = [
  { value: 'light', label: 'Clar' },
  { value: 'dark', label: 'Fosc' },
  { value: 'system', label: 'Sistema' },
];

export default function ThemeToggle({ current }: { current: Theme }) {
  const router = useRouter();
  const [theme, setTheme] = useState<Theme>(current);
  const [saving, setSaving] = useState(false);

  async function choose(value: Theme) {
    if (value === theme || saving) return;
    setTheme(value);
    setSaving(true);
    await fetch('/api/preferences/theme', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme: value }),
    });
    setSaving(false);
    router.refresh();
  }

  return (
    <div className="inline-flex rounded-xl border border-border bg-surface-2 p-1 gap-1">
      {OPTIONS.map(opt => (
        <button
          key={opt.value}
          type="button"
          onClick={() => choose(opt.value)}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
            theme === opt.value
              ? 'bg-surface text-ink shadow-sm border border-border'
              : 'text-ink-3 hover:text-ink-2'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
