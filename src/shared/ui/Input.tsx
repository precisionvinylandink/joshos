import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: ReactNode;
  error?: string;
  helper?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, helper, id, className, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-xs font-medium text-dim">
          {label}
        </label>
      )}
      <input
        id={inputId}
        ref={ref}
        aria-invalid={error ? true : undefined}
        className={cn(
          'w-full rounded-theme bg-bg text-text placeholder:text-muted px-3 py-2 text-sm',
          'border transition focus:outline-none',
          error
            ? 'border-danger focus:border-danger'
            : 'border-border focus:border-brand',
          className,
        )}
        {...rest}
      />
      {error ? (
        <p className="text-xs text-danger">{error}</p>
      ) : helper ? (
        <p className="text-xs text-muted">{helper}</p>
      ) : null}
    </div>
  );
});
