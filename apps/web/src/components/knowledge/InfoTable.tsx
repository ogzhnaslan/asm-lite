import type { ReactNode } from 'react';

interface InfoTableProps {
  headers: string[];
  rows: (string | ReactNode)[][];
  compact?: boolean;
}

export function InfoTable({ headers, rows, compact = false }: InfoTableProps) {
  return (
    <div
      className="overflow-x-auto rounded-xl"
      style={{ border: '1px solid rgba(56,189,248,0.1)' }}
    >
      <table className="w-full text-xs">
        <thead>
          <tr style={{ borderBottom: '1px solid rgba(56,189,248,0.1)', background: 'rgba(2,6,23,0.5)' }}>
            {headers.map((h, i) => (
              <th
                key={i}
                className={`text-left font-semibold uppercase tracking-wider ${compact ? 'px-3 py-2' : 'px-4 py-3'}`}
                style={{ color: 'rgba(56,189,248,0.5)' }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr
              key={ri}
              className="transition-colors duration-150"
              style={{ borderBottom: ri < rows.length - 1 ? '1px solid rgba(56,189,248,0.05)' : 'none' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(56,189,248,0.03)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  className={`align-top leading-relaxed ${compact ? 'px-3 py-2' : 'px-4 py-3'}`}
                  style={{ color: '#cbd5e1' }}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
