import type { HTMLAttributes, ReactNode } from 'react';

function cn(...classes: (string | undefined | false)[]) {
  return classes.filter(Boolean).join(' ');
}

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function Card({ className, children, style, ...props }: CardProps) {
  return (
    <div
      className={cn('rounded-2xl shadow-xl shadow-black/20', className)}
      style={{
        background: 'linear-gradient(145deg, #0e1d35 0%, #0a1628 100%)',
        border: '1px solid rgba(56,189,248,0.08)',
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ className, children, style, ...props }: CardProps) {
  return (
    <div
      className={cn('px-5 py-4', className)}
      style={{ borderBottom: '1px solid rgba(56,189,248,0.06)', ...style }}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardTitle({ className, children, ...props }: CardProps) {
  return (
    <h3 className={cn('text-sm font-semibold text-slate-100 tracking-wide', className)} {...props}>
      {children}
    </h3>
  );
}

export function CardDescription({ className, children, ...props }: CardProps) {
  return (
    <p className={cn('text-xs mt-0.5', className)} style={{ color: 'rgba(148,163,184,0.65)' }} {...props}>
      {children}
    </p>
  );
}

export function CardContent({ className, children, ...props }: CardProps) {
  return (
    <div className={cn('px-5 py-4', className)} {...props}>
      {children}
    </div>
  );
}
