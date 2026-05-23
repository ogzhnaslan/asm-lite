import type { HTMLAttributes } from 'react';

function cn(...classes: (string | undefined | false)[]) {
  return classes.filter(Boolean).join(' ');
}

interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  className?: string;
}

export function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      className={cn('animate-pulse rounded-md', className)}
      style={{ background: 'rgba(56,189,248,0.04)' }}
      {...props}
    />
  );
}

export function SkeletonLine({ className }: { className?: string }) {
  return <Skeleton className={cn('h-3 rounded-full', className)} />;
}

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div
      className={cn('rounded-2xl p-5 space-y-3', className)}
      style={{
        background: 'rgba(14,29,53,0.6)',
        border: '1px solid rgba(56,189,248,0.06)',
      }}
    >
      <div className="flex items-center gap-3">
        <Skeleton className="h-8 w-8 rounded-lg" />
        <div className="flex-1 space-y-2">
          <SkeletonLine className="w-1/3" />
          <SkeletonLine className="w-1/5 h-2.5" />
        </div>
      </div>
      <div className="space-y-2 pt-1">
        <SkeletonLine className="w-full" />
        <SkeletonLine className="w-4/5" />
        <SkeletonLine className="w-2/3" />
      </div>
    </div>
  );
}
