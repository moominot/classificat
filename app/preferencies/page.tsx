import { cookies } from 'next/headers';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import ThemeToggle from '@/components/ThemeToggle';

export default async function PreferenciesPage() {
  const cookieStore = await cookies();
  const theme = (cookieStore.get('theme')?.value ?? 'system') as 'light' | 'dark' | 'system';

  return (
    <div className="max-w-md mx-auto space-y-5">
      <div>
        <h1 className="font-display text-xl font-bold text-ink">Preferències</h1>
        <p className="text-sm text-ink-3 mt-1">Ajustos de visualització de l&apos;aplicació.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Aparença</CardTitle>
        </CardHeader>
        <p className="text-sm text-ink-3 mb-3">Tria com es mostra Classificat en aquest dispositiu.</p>
        <ThemeToggle current={theme} />
      </Card>
    </div>
  );
}
