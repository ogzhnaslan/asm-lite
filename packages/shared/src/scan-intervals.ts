export const SCAN_INTERVALS = ['1h', '6h', '24h', '7d'] as const;

export type ScanInterval = typeof SCAN_INTERVALS[number];
