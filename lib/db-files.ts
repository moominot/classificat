import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

/**
 * Fitxers de la base de dades i importació d'una còpia.
 *
 * Aquest mòdul NO importa `@/db`: `db/index.ts` el fa servir en arrencar, abans
 * d'obrir la connexió, per aplicar una importació pendent.
 *
 * Importar no substitueix la BD en calent. Hi ha diverses connexions obertes
 * (Next compila `db/index.ts` en diversos bundles) i canviar el fitxer sota
 * d'elles, o deixar-hi un `-wal` d'una altra BD, la podria corrompre. La ruta
 * d'importació valida el fitxer, el deixa com a `import-pendent.db` i reinicia
 * el procés; en arrencar, `applyPendingImport()` en fa la substitució amb cap
 * connexió oberta, després d'una còpia de seguretat de la BD actual.
 */

export const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), '.data');
export const DB_PATH = path.join(DATA_DIR, 'classificat.db');
export const PENDING_IMPORT_PATH = path.join(DATA_DIR, 'import-pendent.db');
export const BACKUPS_DIR = path.join(DATA_DIR, 'backups');

const SQLITE_HEADER = 'SQLite format 3\0';
const REQUIRED_TABLES = ['accounts', 'people', 'tournaments', 'app_settings', '__drizzle_migrations'];

/** Nombre de migracions que coneix aquesta versió de l'app (`null` si no es pot llegir). */
function knownMigrations(): number | null {
  try {
    const journal = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), 'db/migrations/meta/_journal.json'), 'utf8')
    );
    return Array.isArray(journal.entries) ? journal.entries.length : null;
  } catch {
    return null;
  }
}

function removeSidecars(dbPath: string) {
  for (const suffix of ['-wal', '-shm', '-journal']) fs.rmSync(dbPath + suffix, { force: true });
}

/**
 * Comprova que `file` és una BD d'aquesta aplicació que es pot importar.
 * Retorna el motiu del rebuig, o `null` si és vàlida. No toca la BD en ús.
 */
export function validateImportCandidate(file: string): string | null {
  const fd = fs.openSync(file, 'r');
  const header = Buffer.alloc(16);
  try {
    fs.readSync(fd, header, 0, 16, 0);
  } finally {
    fs.closeSync(fd);
  }
  if (header.toString('latin1') !== SQLITE_HEADER) return "El fitxer no és una base de dades SQLite";

  let candidate: Database.Database | null = null;
  try {
    // Lectura-escriptura sobre la còpia temporal: una BD en mode WAL sense
    // `-shm` no sempre s'obre en només lectura.
    candidate = new Database(file, { fileMustExist: true });

    const integrity = candidate.pragma('integrity_check', { simple: true });
    if (integrity !== 'ok') return 'La base de dades està malmesa (integrity_check)';

    const tables = new Set(
      (candidate.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map(
        (t) => t.name
      )
    );
    const missing = REQUIRED_TABLES.filter((t) => !tables.has(t));
    if (missing.length > 0) return `No sembla una BD d'aquesta aplicació (falten: ${missing.join(', ')})`;

    // Una BD més nova que l'app tindria columnes que aquesta versió no coneix.
    // Una de més antiga no és problema: en arrencar s'hi apliquen les migracions.
    const known = knownMigrations();
    const { n } = candidate.prepare('SELECT count(*) n FROM __drizzle_migrations').get() as { n: number };
    if (known !== null && n > known) {
      return "La BD és d'una versió més nova de l'aplicació. Actualitza l'app abans d'importar-la";
    }

    // Sense cap administrador actiu ningú podria tornar a entrar-hi.
    const { admins } = candidate
      .prepare("SELECT count(*) admins FROM accounts WHERE is_active = 1 AND role IN ('superadmin', 'admin')")
      .get() as { admins: number };
    if (admins === 0) return 'La BD no té cap compte administrador actiu: no podries tornar a entrar-hi';

    return null;
  } catch (err) {
    return `No s'ha pogut llegir la base de dades: ${(err as Error).message}`;
  } finally {
    candidate?.close();
    removeSidecars(file);
  }
}

/**
 * Aplica una importació pendent. S'ha de cridar abans d'obrir la BD. És
 * síncrona (diverses instàncies del mòdul s'hi poden trobar) i, si alguna cosa
 * falla, deixa la BD actual com està.
 */
export function applyPendingImport(): void {
  if (!fs.existsSync(PENDING_IMPORT_PATH)) return;

  try {
    if (fs.existsSync(DB_PATH)) {
      fs.mkdirSync(BACKUPS_DIR, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backup = path.join(BACKUPS_DIR, `abans-d-importar-${stamp}.db`);
      // VACUUM INTO inclou el contingut del WAL i no depèn de cap altra connexió.
      const current = new Database(DB_PATH);
      try {
        current.exec(`VACUUM INTO '${backup.replace(/'/g, "''")}'`);
      } finally {
        current.close();
      }
    }
    removeSidecars(DB_PATH);
    fs.renameSync(PENDING_IMPORT_PATH, DB_PATH);
    console.log('[importació] BD substituïda; còpia de l\'anterior a data/backups/');
  } catch (err) {
    console.error("[importació] No s'ha pogut aplicar la importació; es manté la BD actual:", err);
    fs.rmSync(PENDING_IMPORT_PATH, { force: true });
  }
}
