import type { HTMLAttributes, ReactNode } from 'react';

function cn(...classes: (string | undefined | false)[]) {
  return classes.filter(Boolean).join(' ');
}

export type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'muted';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  children: ReactNode;
}

const variantClasses: Record<BadgeVariant, string> = {
  default:  'bg-[rgba(56,189,248,0.06)] text-[rgba(56,189,248,0.7)] border-[rgba(56,189,248,0.15)]',
  success:  'bg-emerald-950/70 text-emerald-400 border-emerald-800/60',
  warning:  'bg-amber-950/70 text-amber-400 border-amber-800/60',
  danger:   'bg-red-950/70 text-red-400 border-red-800/60',
  info:     'bg-sky-950/70 text-sky-400 border-sky-800/60',
  muted:    'bg-[rgba(2,6,23,0.4)] text-[rgba(148,163,184,0.5)] border-[rgba(56,189,248,0.06)]',
};

export function Badge({ variant = 'default', className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border',
        variantClasses[variant],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
