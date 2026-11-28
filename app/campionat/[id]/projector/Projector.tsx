'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

interface Taula { id: string; taula: number; jugadors: { nom: string; punts: number | null }[] }
interface Aparellaments { ronda: number; fase: string | null; taules: Taula[] }
interface FilaClass { id: string; rank: number; nom: string; partides: number; v: number; e: number; d: number; punts: number }
type Pantalla = 'aparellaments' | 'classificacio';

const SEGONS_PAGINA = 10;
const SEGONS_REFRESC = 5;

/**
 * Pantalla completa per al màster: aparellaments i classificació, en pàgines
 * que s'avancen soles (o a mà amb ← → i espai). `f` = pantalla completa,
 * `a` = alterna automàtic/manual, `1`/`2` = tria la pantalla.
 *
 * Tapa la capçalera i la navegació del campionat (és un `fixed inset-0`),
 * perquè en projectar només es vegi el contingut.
 */
export default function Projector({
  nomCampionat,
  aparellaments,
  classificacio,
  inicial,
}: {
  nomCampionat: string;
  aparellaments: Aparellaments | null;
  classificacio: FilaClass[] | null;
  inicial: Pantalla;
}) {
  const router = useRouter();
  const [pantalla, setPantalla] = useState<Pantalla>(inicial);
  const [pagina, setPagina] = useState(0);
  const [auto, setAuto] = useState(true);
  const [alt, setAlt] = useState(800);
  const [ample, setAmple] = useState(1280);
  const [pantallaCompleta, setPantallaCompleta] = useState(false);
  const arrel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mesura = () => { setAlt(window.innerHeight); setAmple(window.innerWidth); };
    mesura();
    window.addEventListener('resize', mesura);
    const fs = () => setPantallaCompleta(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', fs);
    return () => { window.removeEventListener('resize', mesura); document.removeEventListener('fullscreenchange', fs); };
  }, []);

  // Refresc de dades (resultats i aparellaments nous).
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === 'visible') router.refresh(); }, SEGONS_REFRESC * 1000);
    return () => clearInterval(t);
  }, [router]);

  // Quantes files caben: capçalera ~110px, fila ~ 64px (més petita si la pantalla és baixa).
  const filaPx = alt < 700 ? 52 : 64;
  const filesPerPagina = Math.max(4, Math.floor((alt - 150) / filaPx));
  const columnes = ample >= 1500 ? 3 : ample >= 900 ? 2 : 1;
  const taulesPerPagina = Math.max(columnes, Math.floor((alt - 170) / 120) * columnes);

  const taules = aparellaments?.taules ?? [];
  const totalPagines = Math.max(
    1,
    pantalla === 'classificacio'
      ? Math.ceil((classificacio?.length ?? 0) / filesPerPagina)
      : Math.ceil(taules.length / taulesPerPagina)
  );
  const paginaActual = Math.min(pagina, totalPagines - 1);

  function seguent(delta: number) {
    setPagina((p) => (Math.min(p, totalPagines - 1) + delta + totalPagines) % totalPagines);
  }

  // Avanç automàtic: passa de pàgina i, en acabar, canvia de pantalla.
  useEffect(() => {
    if (!auto) return;
    const t = setTimeout(() => {
      if (paginaActual + 1 < totalPagines) { setPagina(paginaActual + 1); return; }
      const altra: Pantalla = pantalla === 'aparellaments' ? 'classificacio' : 'aparellaments';
      const teAltra = altra === 'classificacio' ? !!classificacio?.length : taules.length > 0;
      if (teAltra) setPantalla(altra);
      setPagina(0);
    }, SEGONS_PAGINA * 1000);
    return () => clearTimeout(t);
  }, [auto, paginaActual, totalPagines, pantalla, classificacio, taules.length]);

  function alternaPantallaCompleta() {
    if (document.fullscreenElement) document.exitFullscreen();
    else arrel.current?.requestFullscreen?.().catch(() => {});
  }

  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); seguent(1); }
      else if (e.key === 'ArrowLeft') seguent(-1);
      else if (e.key === 'f' || e.key === 'F') alternaPantallaCompleta();
      else if (e.key === 'a' || e.key === 'A') setAuto((v) => !v);
      else if (e.key === '1') { setPantalla('aparellaments'); setPagina(0); }
      else if (e.key === '2') { setPantalla('classificacio'); setPagina(0); }
    }
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  });

  const btn = (actiu: boolean) =>
    `px-4 py-1.5 rounded-full text-sm font-semibold transition-colors ${actiu ? 'bg-accent text-surface' : 'bg-surface-2 text-ink-2 hover:text-ink'}`;

  return (
    <div ref={arrel} className="fixed inset-0 z-[100] bg-surface text-ink flex flex-col overflow-hidden">
      <header className="flex items-center gap-4 px-8 py-4 border-b border-border flex-shrink-0">
        <div className="min-w-0 flex-1">
          <h1 className="font-display font-black text-3xl truncate">{nomCampionat}</h1>
          <p className="text-lg text-ink-3">
            {pantalla === 'aparellaments'
              ? aparellaments
                ? `Aparellaments · Ronda ${aparellaments.ronda}${aparellaments.fase ? ` · ${aparellaments.fase}` : ''}`
                : 'Aparellaments'
              : 'Classificació'}
          </p>
        </div>
        <div className="flex items-center gap-2 print:hidden opacity-60 hover:opacity-100 transition-opacity">
          <button className={btn(pantalla === 'aparellaments')} onClick={() => { setPantalla('aparellaments'); setPagina(0); }}>Aparellaments</button>
          <button className={btn(pantalla === 'classificacio')} onClick={() => { setPantalla('classificacio'); setPagina(0); }}>Classificació</button>
          <button className={btn(auto)} onClick={() => setAuto((v) => !v)} title="Avanç automàtic (a)">{auto ? 'Auto ✓' : 'Auto'}</button>
          <button className={btn(pantallaCompleta)} onClick={alternaPantallaCompleta} title="Pantalla completa (f)">⛶</button>
        </div>
      </header>

      <main className="flex-1 min-h-0 px-8 py-5">
        {pantalla === 'aparellaments' ? (
          !aparellaments ? (
            <Buit text="Encara no hi ha aparellaments publicats." />
          ) : taules.length === 0 ? (
            <Buit text={`La ronda ${aparellaments.ronda} encara no té aparellaments.`} />
          ) : (
            <div
              className="grid gap-4"
              style={{ gridTemplateColumns: `repeat(${columnes}, minmax(0, 1fr))` }}
            >
              {taules.slice(paginaActual * taulesPerPagina, (paginaActual + 1) * taulesPerPagina).map((t) => (
                <div key={t.id} className="rounded-2xl border-2 border-border bg-surface-2 px-5 py-3 flex items-center gap-5">
                  <span className="font-display font-black text-4xl text-accent-ink tabular-nums w-24 flex-shrink-0">
                    {t.jugadors.length > 1 ? `T${t.taula}` : 'Bye'}
                  </span>
                  <div className="flex-1 min-w-0 space-y-1">
                    {t.jugadors.map((j, i) => (
                      <div key={i} className="flex items-baseline justify-between gap-3">
                        <span className="text-2xl font-semibold truncate">{j.nom}</span>
                        {j.punts !== null && <span className="font-display font-bold text-2xl tabular-nums">{j.punts}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )
        ) : !classificacio?.length ? (
          <Buit text="La classificació encara no està publicada." />
        ) : (
          <table className="w-full text-2xl">
            <thead>
              <tr className="text-left text-base uppercase tracking-wide text-ink-3 border-b-2 border-border">
                <th className="px-3 py-2 w-20">#</th>
                <th className="px-3 py-2">Jugador</th>
                <th className="px-3 py-2 text-right">Partides</th>
                <th className="px-3 py-2 text-right">V-E-D</th>
                <th className="px-3 py-2 text-right">Punts</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {classificacio.slice(paginaActual * filesPerPagina, (paginaActual + 1) * filesPerPagina).map((f) => (
                <tr key={f.id} style={{ height: filaPx }}>
                  <td className="px-3 font-display font-black text-accent-ink tabular-nums">{f.rank}</td>
                  <td className="px-3 font-semibold truncate max-w-0 w-full">{f.nom}</td>
                  <td className="px-3 text-right tabular-nums text-ink-3">{f.partides}</td>
                  <td className="px-3 text-right tabular-nums text-ink-3 whitespace-nowrap">{f.v}-{f.e}-{f.d}</td>
                  <td className="px-3 text-right font-display font-black tabular-nums">{Number.isInteger(f.punts) ? f.punts : f.punts.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </main>

      {totalPagines > 1 && (
        <footer className="flex items-center justify-center gap-2 pb-3 flex-shrink-0">
          {Array.from({ length: totalPagines }, (_, i) => (
            <span key={i} className={`h-2.5 rounded-full transition-all ${i === paginaActual ? 'w-8 bg-accent' : 'w-2.5 bg-border'}`} />
          ))}
        </footer>
      )}
    </div>
  );
}

function Buit({ text }: { text: string }) {
  return <div className="h-full flex items-center justify-center text-3xl text-ink-3">{text}</div>;
}
