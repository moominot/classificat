import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { eq } from 'drizzle-orm';
import Anthropic from '@anthropic-ai/sdk';
import { db } from '@/db';
import { matchParticipants, matches, rounds } from '@/db/schema';
import { canManageTournament, canReportResult, getViewer } from '@/lib/authz';

/**
 * Camps que l'OCR intenta llegir d'un full de puntuació, **per participant**.
 *
 * Abans eren camps fixos p1/p2; ara la llista té tants elements com jugadors a
 * la taula, en el mateix ordre que els noms rebuts.
 */
export interface OcrParticipantFields {
  score: number | null;
  bingos: number | null;
  bestWord: string | null;
  bestWordScore: number | null;
}

const CLAUDE_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const;
type ClaudeImageType = (typeof CLAUDE_IMAGE_TYPES)[number];

function detectMimeType(buf: Buffer): ClaudeImageType {
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'image/gif';
  if (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) {
    return 'image/webp';
  }
  return 'image/jpeg';
}

function emptyFields(count: number): OcrParticipantFields[] {
  return Array.from({ length: count }, () => ({
    score: null,
    bingos: null,
    bestWord: null,
    bestWordScore: null,
  }));
}

async function extractWithClaude(
  buffer: Buffer,
  mimeType: ClaudeImageType,
  names: string[]
): Promise<OcrParticipantFields[]> {
  const client = new Anthropic();

  const prompt = `Ets un assistent d'extracció de dades de fulls de puntuació de Scrabble en català (full "Scrabble Pòrtol").

Els jugadors d'aquesta partida són: ${names.map((n, i) => `${i + 1}. "${n}"`).join(', ')}.
L'ordre de les columnes al full es decideix per sorteig, de manera que qualsevol jugador pot estar a qualsevol costat. Llegeix els noms escrits al full per saber qui és a cada columna.

ESTRUCTURA DEL FULL:
- Una meitat per jugador, amb el seu nom a la capçalera
- Cada meitat té columnes: Jugada | Punts | Subtotal (fins a 22 files numerades al centre)
- Sota la taula: "Punts fixtes faristol" i "Penalització temps excedit"
- Fila destacada en negreta: "PUNTUACIÓ FINAL" → és la puntuació definitiva de cada jugador
- Sota PUNTUACIÓ FINAL: "Millor jugada:" (paraula i puntuació al costat)
- Última fila: "Total scrabbles" (nombre de bingos)

REGLES D'EXTRACCIÓ:
- Identifica quina columna pertany a cada jugador llegint els noms escrits
- score: "PUNTUACIÓ FINAL" de la seva columna (NO el darrer Subtotal)
- bingos: "Total scrabbles" de la seva columna
- bestWord: paraula de "Millor jugada:" (en majúscules)
- bestWordScore: puntuació numèrica al costat de "Millor jugada:"
- Els scrabbles/bingos es reconeixen perquè la puntuació a la columna "Punts" apareix encerclada

Si un camp és il·legible o buit, retorna null. Respon ÚNICAMENT amb el JSON, sense cap text addicional.

Format esperat: una llista amb un objecte per jugador, **en el mateix ordre que t'he donat els noms**:
{"participants":[{"score":423,"bingos":2,"bestWord":"QUIXOTS","bestWordScore":98},{"score":387,"bingos":1,"bestWord":"FUGIDA","bestWordScore":34}]}`;

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mimeType, data: buffer.toString('base64') },
          },
          { type: 'text', text: prompt },
        ],
      },
    ],
  });

  const text = message.content[0].type === 'text' ? message.content[0].text : '';
  const json = text.match(/\{[\s\S]*\}/)?.[0];
  if (!json) return emptyFields(names.length);

  const parsed = JSON.parse(json);
  const rows: unknown[] = Array.isArray(parsed?.participants) ? parsed.participants : [];

  return names.map((_, i) => {
    const row = (rows[i] ?? {}) as Record<string, unknown>;
    return {
      score: toInt(row.score),
      bingos: toInt(row.bingos),
      bestWord: toStr(row.bestWord),
      bestWordScore: toInt(row.bestWordScore),
    };
  });
}

function toInt(value: unknown): number | null {
  const n = parseInt(String(value));
  return isNaN(n) ? null : n;
}

function toStr(value: unknown): string | null {
  if (value == null || value === 'null' || value === '') return null;
  return String(value).toUpperCase();
}

/**
 * POST — Puja la foto d'un full de puntuació o d'un tauler.
 *
 * Hi pot pujar qui podria enviar el resultat d'aquesta partida: els mateixos
 * jugadors mentre la ronda és oberta, i l'admin sempre (§15.6).
 */
export async function POST(req: Request) {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Cal multipart/form-data' }, { status: 400 });
  }

  const file = formData.get('file') as File | null;
  const matchId = formData.get('matchId') as string | null;
  const names = String(formData.get('names') ?? '')
    .split('|')
    .map((n) => n.trim())
    .filter(Boolean);
  const kind = (formData.get('kind') as string | null) === 'board' ? 'board' : 'sheet';

  if (!file) return NextResponse.json({ error: 'Cal un fitxer' }, { status: 400 });
  if (!matchId) return NextResponse.json({ error: 'Cal matchId' }, { status: 400 });
  if (!file.type.startsWith('image/')) {
    return NextResponse.json({ error: 'El fitxer ha de ser una imatge' }, { status: 400 });
  }

  const [row] = await db
    .select({ tournamentId: rounds.tournamentId, roundStatus: rounds.status })
    .from(matches)
    .innerJoin(rounds, eq(rounds.id, matches.roundId))
    .where(eq(matches.id, matchId));
  if (!row) return NextResponse.json({ error: 'Partida no trobada' }, { status: 404 });

  const participants = await db
    .select({ entryId: matchParticipants.entryId })
    .from(matchParticipants)
    .where(eq(matchParticipants.matchId, matchId));

  const viewer = await getViewer(row.tournamentId);
  const managesTournament = viewer.account
    ? await canManageTournament(viewer.account, row.tournamentId)
    : false;

  const allowed = canReportResult(viewer, {
    participantEntryIds: participants.map((p) => p.entryId),
    roundIsOpen: row.roundStatus === 'open',
    managesTournament,
  });
  if (!allowed) {
    return NextResponse.json({ error: 'No pots pujar imatges d\'aquesta partida' }, { status: 403 });
  }

  const folder = kind === 'board' ? 'board-photos' : 'score-sheets';
  const uploadDir = path.join(process.cwd(), 'public', 'uploads', folder);
  fs.mkdirSync(uploadDir, { recursive: true });

  const buffer = Buffer.from(await file.arrayBuffer());
  const mimeType = detectMimeType(buffer);
  const extension: Record<ClaudeImageType, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
  };
  const filename = `${matchId}-${Date.now()}.${extension[mimeType]}`;
  fs.writeFileSync(path.join(uploadDir, filename), buffer);

  const url = `/uploads/${folder}/${filename}`;

  // La foto del tauler només es desa: no té sentit passar-la per l'OCR del
  // full de puntuació.
  if (kind === 'board') {
    return NextResponse.json({ url, participants: emptyFields(participants.length) }, { status: 201 });
  }

  let fields = emptyFields(names.length || participants.length);
  try {
    if (names.length > 0) fields = await extractWithClaude(buffer, mimeType, names);
  } catch (err) {
    console.error('Claude OCR error:', err);
  }

  return NextResponse.json({ url, participants: fields }, { status: 201 });
}
