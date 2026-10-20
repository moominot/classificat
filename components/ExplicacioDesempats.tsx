/**
 * Botó «i» que desplega l'explicació dels desempats. És un `<details>`
 * natiu: sense estat, així serveix igual en un component de servidor
 * (l'inici) que dins del formulari de fase.
 */
export default function ExplicacioDesempats({
  desempats,
  ordenats = false,
}: {
  desempats: { key: string; label: string; description: string }[];
  /** Si és cert, la llista és l'ordre en què s'apliquen i es numera. */
  ordenats?: boolean;
}) {
  if (desempats.length === 0) return null;

  return (
    <details className="group text-xs">
      <summary className="inline-flex items-center gap-1 cursor-pointer select-none list-none text-accent-ink font-medium hover:underline [&::-webkit-details-marker]:hidden">
        <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path
            fillRule="evenodd"
            d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
            clipRule="evenodd"
          />
        </svg>
        <span className="group-open:hidden">Com funcionen els desempats?</span>
        <span className="hidden group-open:inline">Amaga l&apos;explicació</span>
      </summary>
      <div className="mt-2 rounded-lg bg-surface-2 p-3 space-y-2 text-ink-2 leading-relaxed">
        <p>
          Primer compten els punts de classificació. Si dos o més jugadors hi empaten, es mira el primer desempat;
          si hi continuen empatats, el següent, i així successivament.
        </p>
        <dl className="space-y-2">
          {desempats.map((d, i) => (
            <div key={d.key}>
              <dt className="font-semibold text-ink">
                {ordenats && `${i + 1}. `}
                {d.label}
              </dt>
              <dd>{d.description}</dd>
            </div>
          ))}
        </dl>
      </div>
    </details>
  );
}
