export function Spinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sz = size === 'sm' ? 'h-4 w-4' : size === 'lg' ? 'h-8 w-8' : 'h-6 w-6';
  return (
    <div className={`${sz} animate-spin rounded-full`}
      style={{ border: '2px solid rgba(56,189,248,0.15)', borderTopColor: '#38bdf8' }} />
  );
}
