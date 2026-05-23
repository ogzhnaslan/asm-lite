export interface ScanJobPayload {
  assetId: string;
  scanRunId?: string;
}

export interface ScanJobResult {
  ok: boolean;
  scanRunId?: string;
  reason?: string;
}
