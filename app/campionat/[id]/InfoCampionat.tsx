import { Card } from '@/components/ui/Card';

/**
 * Lloc, dates i informació addicional del campionat. Cada dada que s'hagi
 * deixat en blanc als Ajustos no es mostra; si no n'hi ha cap, no hi ha targeta.
 */
export default function InfoCampionat({
  location,
  startDate,
  endDate,
  info,
}: {
  location: string | null;
  startDate: string | null;
  endDate: string | null;
  info: string | null;
}) {
  const dates = formatDates(startDate, endDate);
  if (!location && !dates && !info) return null;

  return (
    <Card className="space-y-3">
      {(location || dates) && (
        <dl className="grid gap-2 sm:grid-cols-2 text-sm">
          {dates && (
            <div>
              <dt className="text-[11px] font-semibold text-ink-3 uppercase tracking-wide">Dates</dt>
              <dd className="text-ink">{dates}</dd>
            </div>
          )}
          {location && (
            <div>
              <dt className="text-[11px] font-semibold text-ink-3 uppercase tracking-wide">Lloc</dt>
              <dd className="text-ink">{location}</dd>
            </div>
          )}
        </dl>
      )}
      {info && <p className="text-sm text-ink-2 whitespace-pre-line break-words">{linkify(info)}</p>}
    </Card>
  );
}

const FORMAT = new Intl.DateTimeFormat('ca', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

/** Les dates es desen com a AAAA-MM-DD; es llegeixen en UTC perquè no canviï el dia. */
function formatDate(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(+date) ? value : FORMAT.format(date);
}

function formatDates(start: string | null, end: string | null): string | null {
  if (start && end && end !== start) return `Del ${formatDate(start)} al ${formatDate(end)}`;
  if (start ?? end) return formatDate((start ?? end)!);
  return null;
}

const URL_RE = /(https?:\/\/[^\s]+)/g;

/** Els enllaços del text (p. ex. al reglament) es poden clicar. */
function linkify(text: string): React.ReactNode[] {
  return text.split(URL_RE).map((part, i) =>
    i % 2 === 1 ? (
      <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-accent-ink underline">
        {part}
      </a>
    ) : (
      part
    )
  );
}
