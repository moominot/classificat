'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Badge from '@/components/ui/Badge';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import EmptyState from '@/components/ui/EmptyState';

interface Grup { id: string; name: string; order: number }
interface Jugador { id: string; name: string; groupId: string | null; isActive: boolean }

export default function GrupsClient({
  tournamentId,
  grups,
  jugadors,
}: {
  tournamentId: string;
  grups: Grup[];
  jugadors: Jugador[];
}) {
  const router = useRouter();
  const [nomNouGrup, setNomNouGrup] = useState('');
  const [loadingNou, setLoadingNou] = useState(false);
  const [assignant, setAssignant] = useState<string | null>(null); // jugadorId

  async function crearGrup() {
    if (!nomNouGrup.trim()) return;
    setLoadingNou(true);
    await fetch(`/api/tournaments/${tournamentId}/groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: nomNouGrup.trim() }),
    });
    setNomNouGrup('');
    setLoadingNou(false);
    router.refresh();
  }

  async function assignarGrup(jugadorId: string, grupId: string | null) {
    await fetch(`/api/tournaments/${tournamentId}/players/${jugadorId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupId: grupId }),
    });
    router.refresh();
  }

  const grupMap = new Map(grups.map(g => [g.id, g.name]));
  const senseGrup = jugadors.filter(j => !j.groupId);
  const perGrup = new Map(grups.map(g => [g.id, jugadors.filter(j => j.groupId === g.id)]));

  return (
    <div className="space-y-5">
      {/* Crear nou grup */}
      <Card>
        <CardHeader><CardTitle>Crear grup</CardTitle></CardHeader>
        <div className="flex gap-3">
          <Input
            value={nomNouGrup}
            onChange={e => setNomNouGrup(e.target.value)}
            placeholder="ex. A, B, Preferent, Regional..."
            onKeyDown={e => e.key === 'Enter' && crearGrup()}
          />
          <Button onClick={crearGrup} loading={loadingNou} disabled={!nomNouGrup.trim()}>
            Crear
          </Button>
        </div>
        {grups.length === 0 && (
          <p className="text-sm text-gray-500 mt-3">
            Els grups permeten fer round robin intern i Swiss global a la fase final.
          </p>
        )}
      </Card>

      {grups.length === 0 ? (
        <EmptyState
          title="Sense grups"
          description="Crea grups per separar els jugadors en categories o divisions. Si no cal, pots deixar tots els jugadors sense grup."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {/* Grups amb els seus jugadors */}
          {grups.map(g => {
            const jj = perGrup.get(g.id) ?? [];
            return (
              <Card key={g.id} padding={false}>
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">Grup {g.name}</span>
                    <Badge color="blue">{jj.length} jugadors</Badge>
                  </div>
                </div>
                {jj.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-6">Cap jugador assignat</p>
                ) : (
                  <ul className="divide-y divide-gray-50">
                    {jj.map(j => (
                      <li key={j.id} className="flex items-center gap-3 px-4 py-2.5">
                        <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-xs font-semibold flex-shrink-0">
                          {j.name[0]}
                        </div>
                        <span className="flex-1 text-sm text-gray-800">{j.name}</span>
                        <div className="relative">
                          <select
                            value={j.groupId ?? ''}
                            onChange={e => assignarGrup(j.id, e.target.value || null)}
                            className="text-xs border border-gray-200 rounded px-2 py-1 text-gray-500 bg-white"
                          >
                            <option value="">Sense grup</option>
                            {grups.map(gg => (
                              <option key={gg.id} value={gg.id}>Grup {gg.name}</option>
                            ))}
                          </select>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            );
          })}

          {/* Jugadors sense grup */}
          {senseGrup.length > 0 && (
            <Card padding={false}>
              <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
                <span className="font-semibold text-sm text-gray-500">Sense grup</span>
                <Badge color="gray">{senseGrup.length}</Badge>
              </div>
              <ul className="divide-y divide-gray-50">
                {senseGrup.map(j => (
                  <li key={j.id} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 text-xs font-semibold flex-shrink-0">
                      {j.name[0]}
                    </div>
                    <span className="flex-1 text-sm text-gray-700">{j.name}</span>
                    <select
                      value=""
                      onChange={e => assignarGrup(j.id, e.target.value || null)}
                      className="text-xs border border-gray-200 rounded px-2 py-1 text-gray-500 bg-white"
                    >
                      <option value="">Assignar grup...</option>
                      {grups.map(g => (
                        <option key={g.id} value={g.id}>Grup {g.name}</option>
                      ))}
                    </select>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
