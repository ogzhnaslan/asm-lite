import type { ButtonHTMLAttributes, ReactNode } from 'react';

function cn(...classes: (string | undefined | false)[]) {
  return classes.filter(Boolean).join(' ');
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger' | 'success';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  children: ReactNode;
}

const variantClasses: Record<Variant, string> = {
  primary:
    'bg-gradient-to-r from-blue-600 to-violet-600 text-white hover:from-blue-500 hover:to-violet-500 shadow-lg shadow-blue-900/30',
  secondary:
    'bg-[rgba(14,29,53,0.8)] text-slate-200 hover:bg-[rgba(14,29,53,1)] border border-[rgba(56,189,248,0.18)] hover:border-[rgba(56,189,248,0.3)]',
  ghost:
    'text-slate-400 hover:bg-[rgba(56,189,248,0.05)] hover:text-slate-200 border border-transparent',
  outline:
    'bg-transparent border border-[rgba(56,189,248,0.18)] text-slate-300 hover:bg-[rgba(56,189,248,0.05)] hover:border-[rgba(56,189,248,0.35)]',
  danger:
    'bg-red-950/60 border border-red-800/60 text-red-400 hover:bg-red-900/60 hover:text-red-300',
  success:
    'bg-emerald-950/60 border border-emerald-800/60 text-emerald-400 hover:bg-emerald-900/60 hover:text-emerald-300',
};

const sizeClasses: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-xs rounded-lg gap-1.5',
  md: 'px-4 py-2 text-sm rounded-xl gap-2',
  lg: 'px-5 py-2.5 text-sm rounded-xl gap-2',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center font-medium transition-all duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(56,189,248,0.4)] focus-visible:ring-offset-2 focus-visible:ring-offset-[#020617]',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    >
      {loading && (
        <div style={{
          width: 14, height: 14, borderRadius: '50%',
          border: '2px solid rgba(255,255,255,0.2)',
          borderTopColor: 'currentColor',
          animation: 'spin 0.7s linear infinite',
          flexShrink: 0,
        }} />
      )}
      {children}
    </button>
  );
}
