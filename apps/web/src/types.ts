export type AssetType = 'DOMAIN' | 'IP';
export type AssetStatus = 'PENDING' | 'VERIFIED';
export type FindingSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type ScanStatus = 'RUNNING' | 'DONE' | 'FAILED';

export interface Asset {
  id: string;
  userId: string;
  type: AssetType;
  value: string;
  status: AssetStatus;
  critical: boolean;
  scanInterval: string;
  createdAt: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export interface ScanRun {
  id: string;
  assetId: string;
  startedAt: string;
  finishedAt: string | null;
  status: ScanStatus;
  _count: { findings: number };
}

export interface AiWhy {
  summary?: string;
  reasons?: string[];
  recommendations?: string[];
  context?: string;
}

export interface Finding {
  id: string;
  assetId: string;
  scanRunId: string;
  type: string;
  key: string;
  severity: FindingSeverity;
  dataJson: unknown;
  aiScore: number;
  aiWhyJson: AiWhy;
  isNew: boolean;
  createdAt: string;
  lastSeenAt: string;
  resolvedAt: string | null;
}
