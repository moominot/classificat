'use client';

const MAX_WIDTH = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-md',
  lg: 'sm:max-w-lg',
  xl: 'sm:max-w-xl',
  '2xl': 'sm:max-w-2xl',
} as const;

/** Full-screen al mòbil, panell centrat a pc — mateix patró a tots els "crear X". */
export default function Modal({
  open,
  onClose,
  title,
  children,
  maxWidth = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidth?: keyof typeof MAX_WIDTH;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative bg-surface w-full ${MAX_WIDTH[maxWidth]} rounded-t-2xl sm:rounded-2xl shadow-xl p-5 sm:p-6 max-h-[92vh] sm:max-h-[85vh] overflow-y-auto`}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-display text-lg font-bold text-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-ink-3 hover:text-ink text-2xl leading-none cursor-pointer p-1 -m-1"
            aria-label="Tanca"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
