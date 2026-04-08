import type { CsvPairingRow } from '../types';

/**
 * Parseja un CSV d'aparellaments manual.
 * Format esperat (amb o sense capçalera):
 *   taula,jugador1_id,jugador2_id
 *   1,uuid-a,uuid-b
 *   2,uuid-c,          <- bye (camp buit)
 *
 * Retorna les files vàlides i els errors de validació.
 */
export function parsePairingCsv(
  csvText: string,
  validPlayerIds: Set<string>
): { rows: CsvPairingRow[]; errors: string[] } {
  const lines = csvText.trim().split('\n').map((l) => l.trim()).filter(Boolean);
  const errors: string[] = [];
  const rows: CsvPairingRow[] = [];
  const usedPlayers = new Set<string>();
  const usedTables = new Set<number>();

  let startLine = 0;
  // Detecta capçalera: si la primera columna no és un número, saltem
  if (lines.length > 0 && isNaN(Number(lines[0].split(',')[0].trim()))) {
    startLine = 1;
  }

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

    const player1Id = parts[1];
    if (!validPlayerIds.has(player1Id)) {
      errors.push(`Línia ${lineNum}: jugador1 desconegut: "${player1Id}"`);
      continue;
    }
    if (usedPlayers.has(player1Id)) {
      errors.push(`Línia ${lineNum}: jugador1 apareix més d'una vegada: "${player1Id}"`);
      continue;
    }

    const player2Id = parts[2] || null;
    if (player2Id !== null) {
      if (!validPlayerIds.has(player2Id)) {
        errors.push(`Línia ${lineNum}: jugador2 desconegut: "${player2Id}"`);
        continue;
      }
      if (usedPlayers.has(player2Id)) {
        errors.push(`Línia ${lineNum}: jugador2 apareix més d'una vegada: "${player2Id}"`);
        continue;
      }
      if (player1Id === player2Id) {
        errors.push(`Línia ${lineNum}: un jugador no es pot enfrontar a ell mateix`);
        continue;
      }
    }

    usedTables.add(tableNumber);
    usedPlayers.add(player1Id);
    if (player2Id) usedPlayers.add(player2Id);
    rows.push({ tableNumber, player1Id, player2Id });
  }

  return { rows, errors };
}
