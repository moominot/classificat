import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import Anthropic from '@anthropic-ai/sdk';

export interface OcrFields {
  p1Score: number | null;
  p2Score: number | null;
  p1Scrabbles: number | null;
  p2Scrabbles: number | null;
  p1BestWord: string | null;
  p2BestWord: string | null;
  p1BestWordScore: number | null;
  p2BestWordScore: number | null;
}

const CLAUDE_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const;
type ClaudeImageType = typeof CLAUDE_IMAGE_TYPES[number];

function detectMimeType(buf: Buffer): ClaudeImageType {
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return 'image/png';
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'image/jpeg';
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'image/gif';
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
      buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return 'image/webp';
  return 'image/jpeg';
}

async function extractWithClaude(
  buffer: Buffer,
  mimeType: ClaudeImageType,
  p1Name: string,
  p2Name: string,
): Promise<OcrFields> {
  const client = new Anthropic();

  const prompt = `Ets un assistent d'extracció de dades de fulls de puntuació de Scrabble en català (full "Scrabble Pòrtol").

Els dos jugadors d'aquesta partida són "${p1Name}" i "${p2Name}".
L'ordre de les columnes (esquerra/dreta) es decideix per sorteig, de manera que qualsevol dels dos pot estar a qualsevol costat. Llegeix els noms escrits al full per saber qui és a cada columna.

ESTRUCTURA DEL FULL:
- Dues meitats simètriques amb el nom del jugador a la capçalera de cada meitat
- Cada meitat té columnes: Jugada | Punts | Subtotal (fins a 22 files numerades al centre)
- Sota la taula: "Punts fixtes faristol" i "Penalització temps excedit"
- Fila destacada en negreta: "PUNTUACIÓ FINAL" → és la puntuació definitiva de cada jugador
- Sota PUNTUACIÓ FINAL: "Millor jugada:" (nom de la paraula i puntuació al costat)
- Última fila: "Total scrabbles" (nombre de bingos)

REGLES D'EXTRACCIÓ:
- Identifica quina columna pertany a "${p1Name}" i quina a "${p2Name}" llegint els noms escrits
- p1Score: "PUNTUACIÓ FINAL" de la columna de "${p1Name}" (NO el darrer Subtotal)
- p2Score: "PUNTUACIÓ FINAL" de la columna de "${p2Name}" (NO el darrer Subtotal)
- p1Scrabbles / p2Scrabbles: "Total scrabbles" de la columna de cada jugador
- p1BestWord / p2BestWord: paraula de "Millor jugada:" de cada jugador (en majúscules)
- p1BestWordScore / p2BestWordScore: puntuació numèrica al costat de "Millor jugada:" de cada jugador
- Els scrabbles/bingos es reconeixen perquè la puntuació a la columna "Punts" apareix encerclada

Si un camp és il·legible o buit, retorna null. Respon ÚNICAMENT amb el JSON, sense cap text addicional.

Format esperat:
{"p1Score":423,"p2Score":387,"p1Scrabbles":2,"p2Scrabbles":1,"p1BestWord":"QUIXOTS","p2BestWord":"FUGIDA","p1BestWordScore":98,"p2BestWordScore":34}`;

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: mimeType,
            data: buffer.toString('base64'),
          },
        },
        { type: 'text', text: prompt },
      ],
    }],
  });

  const text = message.content[0].type === 'text' ? message.content[0].text : '';
  const json = text.match(/\{[\s\S]*\}/)?.[0];
  if (!json) return emptyFields();

  const parsed = JSON.parse(json);
  return {
    p1Score: toInt(parsed.p1Score),
    p2Score: toInt(parsed.p2Score),
    p1Scrabbles: toInt(parsed.p1Scrabbles),
    p2Scrabbles: toInt(parsed.p2Scrabbles),
    p1BestWord: toStr(parsed.p1BestWord),
    p2BestWord: toStr(parsed.p2BestWord),
    p1BestWordScore: toInt(parsed.p1BestWordScore),
    p2BestWordScore: toInt(parsed.p2BestWordScore),
  };
}

function toInt(v: unknown): number | null {
  const n = parseInt(String(v));
  return isNaN(n) ? null : n;
}
function toStr(v: unknown): string | null {
  if (v == null || v === 'null' || v === '') return null;
  return String(v).toUpperCase();
}
function emptyFields(): OcrFields {
  return { p1Score: null, p2Score: null, p1Scrabbles: null, p2Scrabbles: null,
           p1BestWord: null, p2BestWord: null, p1BestWordScore: null, p2BestWordScore: null };
}

export async function POST(req: Request) {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Cal multipart/form-data' }, { status: 400 });
  }

  const file = formData.get('file') as File | null;
  const pairingId = formData.get('pairingId') as string | null;
  const p1Name = (formData.get('p1Name') as string | null) ?? 'Jugador 1';
  const p2Name = (formData.get('p2Name') as string | null) ?? 'Jugador 2';

  if (!file) return NextResponse.json({ error: 'Cal un fitxer' }, { status: 400 });
  if (!pairingId) return NextResponse.json({ error: 'Cal pairingId' }, { status: 400 });
  if (!file.type.startsWith('image/'))
    return NextResponse.json({ error: 'El fitxer ha de ser una imatge' }, { status: 400 });

  const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'score-sheets');
  fs.mkdirSync(uploadDir, { recursive: true });

  const buffer = Buffer.from(await file.arrayBuffer());
  const mimeType = detectMimeType(buffer);
  const extMap: Record<ClaudeImageType, string> = {
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp',
  };
  const filename = `${pairingId}-${Date.now()}.${extMap[mimeType]}`;
  fs.writeFileSync(path.join(uploadDir, filename), buffer);

  const url = `/uploads/score-sheets/${filename}`;

  // Extracció OCR amb Claude Vision
  let fields: OcrFields = emptyFields();
  try {
    fields = await extractWithClaude(buffer, mimeType, p1Name, p2Name);
  } catch (err) {
    console.error('Claude OCR error:', err);
  }

  return NextResponse.json({ url, fields }, { status: 201 });
}
