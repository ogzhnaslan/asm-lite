import type { Severity, FindingType, ScanInterval, AssetType, AssetStatus, ScanStatus } from '@asm/shared';

export type { Severity, FindingType, ScanInterval, AssetType, AssetStatus, ScanStatus };

export type FindingSeverity = Severity;

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

// ─── Dashboard (global severity trend) ──────────────────────────────────────
export type DashboardWindow = '7d' | '30d';

export interface DashboardSeverityTotals {
  all: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
}

export interface DashboardDailyBucket {
  date: string;
  critical: number;
  high: number;
  medium: number;
  low: number;
  total: number;
}

export interface DashboardInsight {
  trend: 'up' | 'down' | 'flat';
  changePct: number;
  previousTotal: number;
  dominantSeverity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | null;
  busiestDate: string | null;
  busiestCount: number;
  activeCritical: number;
  activeHigh: number;
  text: string;
}

export interface DashboardTrends {
  window: DashboardWindow;
  from: string;
  to: string;
  totals: DashboardSeverityTotals;
  daily: DashboardDailyBucket[];
  insight: DashboardInsight;
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
  // Tarama bitişinde dondurulan aktif bulgu sayısı (kalıcı; scanRunId taşınmasından
  // etkilenmez). Yalnızca DONE taramalarda anlamlıdır.
  findingsCount: number;
}

// Bir taramanın tek bir check snapshot'ı (ham sonuç). "Akış" görünümü için.
export interface ScanCheckResult {
  id: string;
  type: string;
  dataJson: unknown;
  createdAt: string;
}

export interface ScanChecksResponse {
  scanRunId: string;
  status: ScanStatus;
  items: ScanCheckResult[];
}

export interface AiWhy {
  summary?: string;
  impact?: string;
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

// ─── Intelligence ─────────────────────────────────────────────────────────────

export interface DnsRecord {
  type: string;
  value: string;
}

export interface DnsIntelligence {
  domain: string;
  records: DnsRecord[];
  dmarcRecord: string | null;
  checkedAt: string;
  error?: string;
  errors?: Record<string, string>;
}

export interface RdapIntelligence {
  domain: string;
  registrar: string | null;
  createdDate: string | null;
  updatedDate: string | null;
  expiresDate: string | null;
  nameServers: string[];
  status: string[];
  rawSource: string;
  checkedAt: string;
  error?: string;
}

export interface GeoIpIntelligence {
  assetValue: string;
  assetType: string;
  resolvedIp: string | null;
  country: string | null;
  countryCode: string | null;
  region: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  asn: string | null;
  isp: string | null;
  organization: string | null;
  provider: string;
  checkedAt: string;
  error?: string;
}

export interface RobotsIntelligence {
  domain: string;
  url: string;
  exists: boolean;
  statusCode: number | null;
  contentLength: number | null;
  contentHash: string | null;
  disallowRules: string[];
  allowRules: string[];
  sitemapUrls: string[];
  sensitivePaths: string[];
  highSeverityPaths: string[];
  checkedAt: string;
  error?: string;
}

export interface PhishTankMatchedUrl {
  url: string;
  phishId?: string | number;
  detailUrl?: string;
  verified?: boolean;
  online?: boolean;
  submittedAt?: string | null;
  verifiedAt?: string | null;
  target?: string;
}

export interface PhishTankIntelligence {
  domain: string;
  provider: string;
  enabled: boolean;
  skipped: boolean;
  skipReason?: string;
  isListed: boolean;
  verifiedMatches: number;
  onlineMatches: number;
  matchedUrls: PhishTankMatchedUrl[];
  checkedAt: string;
  error?: string;
}

export interface ReputationProvider {
  name: string;
  score: number | null;
  isMalicious: boolean;
  categories?: string[];
  error?: string;
  status?: 'ok' | 'skipped' | 'error';
  reportCount?: number | null;
  lastReportedAt?: string | null;
  matchedIndicators?: string[];
}

export interface ReputationIntelligence {
  assetValue: string;
  assetType: string;
  enabled: boolean;
  skipped: boolean;
  skipReason?: string;
  providers: ReputationProvider[];
  isMalicious: boolean;
  maxScore: number | null;
  categories: string[];
  checkedAt: string;
  error?: string;
}

export interface BreachSource {
  name: string;
  breachDate: string | null;
  exposedCount: number;
  dataClasses: string[];
}

export interface BreachIntelligence {
  domain: string;
  enabled: boolean;
  skipped: boolean;
  skipReason?: string;
  provider: string;
  status: 'clean' | 'breached' | 'error' | 'skipped';
  breachCount: number;
  exposedEmailsCount: number;
  latestBreachDate: string | null;
  sources: BreachSource[];
  sensitiveDataTypes: string[];
  checkedAt: string;
  error?: string;
}

export interface OtxPulse {
  name: string;
  created: string;
  tags: string[];
}

export interface OtxIntelligence {
  assetValue: string;
  assetType: string;
  provider: string;
  enabled: boolean;
  skipped: boolean;
  skipReason?: string;
  pulseCount: number;
  pulses: OtxPulse[];
  tags: string[];
  malwareCount: number;
  urlListCount: number;
  passiveDnsCount: number;
  checkedAt: string;
  error?: string;
}

export interface IntelligenceReport {
  assetId: string;
  assetValue: string;
  assetType: string;
  dns: DnsIntelligence | null;
  rdap: RdapIntelligence | null;
  geoip: GeoIpIntelligence | null;
  robots: RobotsIntelligence | null;
  phishtank: PhishTankIntelligence | null;
  reputation: ReputationIntelligence | null;
  breach: BreachIntelligence | null;
  otx: OtxIntelligence | null;
  lastUpdatedAt: string | null;
}

// ─── Passive Lookup ───────────────────────────────────────────────────────────

export interface PassiveLookupResponse {
  target: string;
  targetType: 'DOMAIN' | 'IP';
  mode: 'PASSIVE_LOOKUP';
  sources: {
    otx: OtxIntelligence;
  };
  checkedAt: string;
}

// ─── Passive Lookup Ask ───────────────────────────────────────────────────────

export interface PassiveLookupAskRequest {
  question: string;
}

export interface PassiveLookupAskResponse {
  answer: string;
  usedContext: {
    target: string;
    source: string;
    checkedAt: string;
  };
}

// ─── Passive Lookup History ──────────────────────────────────────────────────

export interface PassiveLookupRun {
  id: string;
  userId: string;
  target: string;
  targetType: 'DOMAIN' | 'IP';
  source: string;
  status: 'DONE' | 'ERROR' | 'SKIPPED';
  otxJson: OtxIntelligence | null;
  aiSummary: string | null;
  aiRecommendations: string[] | null;
  error: string | null;
  checkedAt: string;
  createdAt: string;
}

export interface PassiveLookupHistoryResponse {
  items: PassiveLookupRun[];
  total: number;
  page: number;
  limit: number;
}

// ─── SQLi Targets & Findings ─────────────────────────────────────────────────

export interface SqliTarget {
  id: string;
  assetId: string;
  method: string;                                // MVP: always "GET"
  path: string;
  paramsJson: Record<string, string>;
  injectParam: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSqliTargetPayload {
  method: 'GET';
  path: string;
  paramsJson: Record<string, string>;
  injectParam: string;
  enabled?: boolean;
}

export interface UpdateSqliTargetPayload {
  method?: 'GET';
  path?: string;
  paramsJson?: Record<string, string>;
  injectParam?: string;
  enabled?: boolean;
}

export interface SqliEvidence {
  baselineStatus: number | null;
  baselineLength: number | null;
  payloadStatus: number | null;
  payloadLength: number | null;
  matchedErrorPattern: string | null;
  matchedErrorSnippet: string | null;
  networkError: string | null;
}

// dataJson shape stored on SQL_INJECTION_SUSPECTED findings — produced by the
// worker's processSqliFindings (apps/worker/src/findings/sqli.findings.ts).
// Frontend reads it defensively in case older snapshots are missing fields.
export interface SqliFindingDataJson {
  url: string;
  method: string;
  path: string;
  param: string;
  payloadId: string | null;
  payloadCategory: string | null;
  suspected: boolean;
  risk: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | null;
  confirmed: boolean;
  signals: string[];
  evidence: SqliEvidence;
  checkedAt: string;
}

// ─── Assistant ────────────────────────────────────────────────────────────────

export interface AssistantChatResponse {
  answer: string;
  usedContext: {
    asset: boolean;
    findings: number;
    intelligence: boolean;
    scanRuns: number;
  };
  model: string;
}
