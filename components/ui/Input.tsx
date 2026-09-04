import { type InputHTMLAttributes, forwardRef } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, className = '', id, ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-');
    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label htmlFor={inputId} className="text-sm font-medium text-ink-2">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={`
            w-full rounded-xl border px-3 py-2 text-sm text-ink placeholder:text-ink-3 bg-surface
            focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent
            disabled:bg-surface-2 disabled:text-ink-3
            ${error ? 'border-loss' : 'border-border'}
            ${className}
          `}
          {...props}
        />
        {error && <p className="text-xs text-loss">{error}</p>}
        {hint && !error && <p className="text-xs text-ink-3">{hint}</p>}
      </div>
    );
  }
);
Input.displayName = 'Input';
export default Input;
