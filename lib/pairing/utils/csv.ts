import type { CsvMatchRow } from '../types';

/**
 * Llegeix un CSV d'aparellaments manuals.
 *
 * Format (amb capçalera o sense), amb tants participants com calgui:
 *   taula,jugador1,jugador2[,jugador3,...]
 *   1,uuid-a,uuid-b
 *   2,uuid-c,uuid-d,uuid-e,uuid-f     <- taula de quatre
 *   3,uuid-g                          <- bye
 *
 * Els identificadors són d'inscripció (`entries.id`), no de persona.
 */
export function parseMatchCsv(
  csvText: string,
  validEntryIds: Set<string>
): { rows: CsvMatchRow[]; errors: string[] } {
  const lines = csvText.trim().split('\n').map((l) => l.trim()).filter(Boolean);
  const errors: string[] = [];
  const rows: CsvMatchRow[] = [];
  const usedEntries = new Set<string>();
  const usedTables = new Set<number>();

  // Capçalera: si la primera columna no és un número, se salta la línia.
  const startLine = lines.length > 0 && isNaN(Number(lines[0].split(',')[0].trim())) ? 1 : 0;

  for (let i = startLine; i < lines.length; i++) {
    const lineNum = i + 1;
    const parts = lines[i].split(',').map((p) => p.trim());

    if (parts.length < 2) {
      errors.push(`Línia ${lineNum}: cal almenys 2 columnes (taula, jugador1)`);
      continue;
    }

    const tableNumber = Number(parts[0]);
    if (!Number.isInteger(tableNumber) || tableNumber < 1) {
      errors.push(`Línia ${lineNum}: número de taula invàlid: "${parts[0]}"`);
      continue;
    }
    if (usedTables.has(tableNumber)) {
      errors.push(`Línia ${lineNum}: número de taula duplicat: ${tableNumber}`);
      continue;
    }

    const entryIds = parts.slice(1).filter(Boolean);
    if (entryIds.length === 0) {
      errors.push(`Línia ${lineNum}: cal com a mínim un jugador`);
      continue;
    }

    const unknown = entryIds.filter((id) => !validEntryIds.has(id));
    if (unknown.length > 0) {
      errors.push(`Línia ${lineNum}: jugador desconegut: "${unknown[0]}"`);
      continue;
    }

    const repeatedInRow = entryIds.filter((id, idx) => entryIds.indexOf(id) !== idx);
    if (repeatedInRow.length > 0) {
      errors.push(`Línia ${lineNum}: un jugador no pot ocupar dues cadires de la mateixa taula`);
      continue;
    }

    const alreadyPlaced = entryIds.filter((id) => usedEntries.has(id));
    if (alreadyPlaced.length > 0) {
      errors.push(`Línia ${lineNum}: el jugador "${alreadyPlaced[0]}" ja és a una altra taula`);
      continue;
    }

    usedTables.add(tableNumber);
    for (const id of entryIds) usedEntries.add(id);
    rows.push({ tableNumber, entryIds });
  }

  return { rows, errors };
}
