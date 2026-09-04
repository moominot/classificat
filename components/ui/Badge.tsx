type Color = 'blue' | 'green' | 'red' | 'yellow' | 'gray' | 'purple';

interface BadgeProps {
  color?: Color;
  children: React.ReactNode;
}

const colorClasses: Record<Color, string> = {
  blue:   'bg-accent-tint text-accent-ink',
  green:  'bg-win-tint text-win',
  red:    'bg-loss-tint text-loss',
  yellow: 'bg-accent-tint text-accent-ink',
  gray:   'bg-surface-2 text-ink-3',
  purple: 'bg-accent-tint text-accent-ink',
};

export default function Badge({ color = 'gray', children }: BadgeProps) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${colorClasses[color]}`}>
      {children}
    </span>
  );
}
