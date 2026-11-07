'use client';

import { useState } from 'react';
import { bracketTree, pathFor } from '@/lib/competition-scheme';

interface FaseQuadre {
  name: string;
  startRound: number;
  endRound: number;
}

/**
 * El quadre de l'eliminatòria per posicions, d'esquerra a dreta: cada grup
 * es parteix en dos, en verd la meitat de qui guanya i en vermell la de qui
 * perd. Amb els botons es pot seguir un camí («si guanyo la primera i perdo
 * la segona, on acabo?»); si qui mira és un jugador, comença pel seu camí.
 */
export default function QuadreEliminatoria({
  playerCount,
  fases,
  currentLevel,
  camiJugador,
  nomJugador,
}: {
  playerCount: number;
  /** Una per nivell; buida si el quadre és orientatiu. */
  fases: FaseQuadre[];
  /** Columna en joc ara mateix, si n'hi ha. */
  currentLevel: number | null;
  /** Resultats del jugador que mira, fase a fase (true = ha guanyat). */
  camiJugador: boolean[] | null;
  nomJugador: string | null;
}) {
  const depth = Math.log2(playerCount);
  const [resultats, setResultats] = useState<boolean[]>(camiJugador ?? []);
  const { levels, edges } = bracketTree(playerCount);
  const cami = pathFor(playerCount, resultats);
  const enCami = (from: number, to: number) => cami.some((r) => r.from === from && r.to === to);

  // Geometria: una columna per nivell i una fila per posició final.
  const rowH = playerCount <= 16 ? 26 : playerCount <= 32 ? 22 : 18;
  const colW = 78;
  const nodeW = 58;
  const nodeH = Math.min(20, rowH - 4);
  const top = 34;
  const left = 4;
  const width = left + depth * colW + nodeW + 4;
  const height = top + playerCount * rowH + 4;
  const x = (level: number) => left + level * colW;
  const y = (from: number, to: number) => top + ((from - 1 + to) / 2) * rowH;

  const ultim = cami[cami.length - 1];
  const acabat = ultim.from === ultim.to;

  function tria(fase: number, guanya: boolean) {
    setResultats([...resultats.slice(0, fase), guanya]);
  }

  return (
    <div className="space-y-4">
      {/* Simulador de camí */}
      <div className="space-y-2">
        <p className="text-sm text-ink-2">
          {camiJugador && camiJugador.length > 0 && nomJugador
            ? `Camí de ${nomJugador} fins ara. Prova què passaria a les fases següents:`
            : 'Segueix un camí: tria què passa a cada fase.'}
        </p>
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: depth }, (_, fase) => {
            const disponible = fase <= resultats.length;
            const triat = resultats[fase];
            return (
              <div
                key={fase}
                className={`flex items-center gap-1 rounded-lg border border-border px-2 py-1 ${disponible ? '' : 'opacity-40'}`}
              >
                <span className="text-xs text-ink-3 mr-1">Fase {fase + 1}</span>
                <button
                  type="button"
                  disabled={!disponible}
                  onClick={() => tria(fase, true)}
                  className={`text-xs font-semibold px-2 py-0.5 rounded ${triat === true ? 'bg-win text-surface' : 'text-win hover:bg-win-tint'}`}
                >
                  Guanyo
                </button>
                <button
                  type="button"
                  disabled={!disponible}
                  onClick={() => tria(fase, false)}
                  className={`text-xs font-semibold px-2 py-0.5 rounded ${triat === false ? 'bg-loss text-surface' : 'text-loss hover:bg-loss-tint'}`}
                >
                  Perdo
                </button>
              </div>
            );
          })}
          {resultats.length > 0 && (
            <button type="button" onClick={() => setResultats([])} className="text-xs text-ink-3 hover:text-ink-2 px-2">
              Esborra
            </button>
          )}
        </div>
        {resultats.length > 0 && (
          <p className="text-sm font-semibold text-ink">
            {acabat ? `Acabes en la posició ${ultim.from}.` : `Acabaràs entre la posició ${ultim.from} i la ${ultim.to}.`}
          </p>
        )}
      </div>

      {/* Quadre */}
      <div className="overflow-x-auto -mx-1 px-1">
        {/* Al mòbil, la mida natural (es llisca si cal); en pantalles amples,
            creix fins a una vegada i mitja perquè es llegeixi bé. */}
        <svg
          viewBox={`0 0 ${width} ${height}`}
          style={{ minWidth: width, width: '100%', maxWidth: width * 1.5, height: 'auto' }}
          role="img"
          aria-label={`Quadre de l'eliminatòria per posicions amb ${playerCount} jugadors`}
          className="block"
        >
          {/* Columna en joc */}
          {currentLevel !== null && currentLevel <= depth && (
            <rect
              x={x(currentLevel) - 6}
              y={0}
              width={nodeW + 12}
              height={height}
              rx={8}
              fill="var(--color-accent-tint)"
            />
          )}

          {/* Capçaleres */}
          {levels.map((_, level) => {
            const fase = fases[level];
            const titol = level === depth ? 'Final' : `Fase ${level + 1}`;
            const sub = level === depth ? 'posició' : fase ? `R${fase.startRound}–${fase.endRound}` : '';
            return (
              <g key={level}>
                <text x={x(level) + nodeW / 2} y={12} textAnchor="middle" fontSize={11} fontWeight={700} fill="var(--color-ink)">
                  {titol}
                </text>
                <text x={x(level) + nodeW / 2} y={25} textAnchor="middle" fontSize={10} fill="var(--color-ink-3)">
                  {sub}
                </text>
              </g>
            );
          })}

          {/* Arestes: guanya (verd) a dalt, perd (vermell) a baix */}
          {edges.map((e) => {
            const x1 = x(e.parent.level) + nodeW;
            const y1 = y(e.parent.from, e.parent.to);
            const x2 = x(e.child.level);
            const y2 = y(e.child.from, e.child.to);
            const mx = (x1 + x2) / 2;
            const actiu = enCami(e.parent.from, e.parent.to) && enCami(e.child.from, e.child.to);
            return (
              <path
                key={`${e.parent.name}-${e.child.name}`}
                d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`}
                fill="none"
                stroke={e.kind === 'win' ? 'var(--color-win)' : 'var(--color-loss)'}
                strokeWidth={actiu ? 3 : 1.25}
                strokeOpacity={resultats.length === 0 || actiu ? 1 : 0.35}
              />
            );
          })}

          {/* Grups */}
          {levels.flat().map((n) => {
            const actiu = enCami(n.from, n.to) && resultats.length > 0;
            return (
              <g key={n.name}>
                <rect
                  x={x(n.level)}
                  y={y(n.from, n.to) - nodeH / 2}
                  width={nodeW}
                  height={nodeH}
                  rx={5}
                  fill={actiu ? 'var(--color-accent)' : 'var(--color-surface)'}
                  stroke={actiu ? 'var(--color-accent)' : 'var(--color-border)'}
                />
                <text
                  x={x(n.level) + nodeW / 2}
                  y={y(n.from, n.to) + 3.5}
                  textAnchor="middle"
                  fontSize={10.5}
                  fontWeight={600}
                  fill={actiu ? 'var(--color-surface)' : 'var(--color-ink-2)'}
                  className="tabular-nums"
                >
                  {n.name}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="flex flex-wrap gap-4 text-xs text-ink-3">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-5 h-0.5 bg-win" /> Guanyes l&apos;eliminatòria: meitat de dalt
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-5 h-0.5 bg-loss" /> La perds: meitat de baix
        </span>
        {currentLevel !== null && (
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded bg-accent-tint border border-accent" /> Fase en joc
          </span>
        )}
      </div>
    </div>
  );
}
