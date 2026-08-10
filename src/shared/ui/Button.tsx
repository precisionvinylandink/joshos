import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  leftIcon?: ReactNode;
}

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand text-white hover:brightness-110 disabled:hover:brightness-100',
  secondary: 'bg-surface2 text-text border border-border hover:bg-surface',
  ghost: 'bg-transparent text-dim hover:text-text hover:bg-white/5',
  danger: 'bg-danger text-white hover:brightness-110',
};

const SIZES: Record<Size, string> = {
  sm: 'text-xs px-2.5 py-1.5 gap-1.5',
  md: 'text-sm px-3.5 py-2 gap-2',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading = false, leftIcon, disabled, className, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center rounded-theme font-medium transition disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/60',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="animate-spin" size={size === 'sm' ? 14 : 16} /> : leftIcon}
      {children}
    </button>
  );
});
