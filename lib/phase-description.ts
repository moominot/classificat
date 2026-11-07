import type { PhaseConfig } from '@/db/types';

/**
 * Explicació d'una fase per als jugadors: com es decideix contra qui jugues.
 * Es fa servir a l'inici i a l'esquema de la competició.
 */
export function describeScope(config: PhaseConfig, tagNameById: Map<string, string>): string {
  const noms = (ids: string[]) => ids.map((id) => tagNameById.get(id) ?? '?').join(', ');

  if (config.method === 'round_robin' && config.randomDraw) {
    const on = config.scope === 'intra_tag' ? ` dins de cada grup (${noms(config.tagIds)})` : ' entre tots';
    const voltes = config.doubleRound ? ', anada i tornada' : '';
    const partir = config.splitGroups
      ? ' Guanya qui suma més punts a les partides contra el mateix rival; els guanyadors passen a la meitat de dalt.'
      : '';
    return `Rival per sorteig${on}${voltes}.${partir}`;
  }
  if (config.method === 'round_robin') {
    const volta = config.doubleRound
      ? config.consecutiveLegs
        ? ' amb anada i tornada (les dues partides contra el mateix rival, seguides)'
        : ' a doble volta'
      : '';
    if (config.scope === 'intra_tag') return `Round Robin${volta}, intra-etiqueta (${noms(config.tagIds)}).`;
    if (config.scope === 'inter_tag') return `Round Robin${volta}, interetiquetes (${noms(config.tagIds)}).`;
    return `Round Robin${volta}, tots contra tots.`;
  }
  if (config.method === 'swiss_fide') {
    if (config.scope === 'intra_tag') return `Sistema suís FIDE, independent per etiqueta (${noms(config.tagIds)}).`;
    return 'Sistema suís FIDE, global.';
  }
  if (config.method === 'swiss') {
    if (config.scope === 'intra_tag') return `Sistema suís, independent per etiqueta (${noms(config.tagIds)}).`;
    return 'Sistema suís.';
  }
  if (config.method === 'king_of_the_hill') {
    const top = config.topN ? `limitat als ${config.topN} millors` : 'amb tots els jugadors';
    if (config.scope === 'intra_tag') return `Rei del turó, ${top}, independent per etiqueta (${noms(config.tagIds)}).`;
    return `Rei del turó, ${top}.`;
  }
  return 'Aparellaments manuals o importats per CSV.';
}
