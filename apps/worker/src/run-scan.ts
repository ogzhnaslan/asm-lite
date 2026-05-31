import { PrismaClient, Prisma, ScanRunStatus } from '@prisma/client';
import { log } from './utils/logger';
import { safeCheck } from './utils/safe-check';
import { parseHost } from './utils/network';
import { checkPorts } from './checks/ports.check';
import { checkTls } from './checks/tls.check';
import { checkHttp } from './checks/http.check';
import { checkSecurityHeaders } from './checks/security-headers.check';
import { checkDnsRecords } from './checks/dns-records.check';
import { checkRdap } from './checks/rdap.check';
import { checkGeoIp } from './checks/geoip.check';
import { checkRobotsTxt } from './checks/robots.check';
import { checkPhishTank } from './checks/phishtank.check';
import { checkReputation } from './checks/reputation.check';
import { checkBreachExposure } from './checks/breach.check';
import { checkOtx } from './checks/otx.check';
import { checkSqli } from './checks/sqli.check';
import { checkVisualAnalysis } from './checks/visual.check';
import { persistVisualAnalysisRun } from './checks/visual/visual-persistence';
import type { VisualAnalysisResult } from './checks/visual/visual-types';
import { processPortFindings } from './findings/port.findings';
import { processTlsFindings } from './findings/tls.findings';
import { processHttpFindings } from './findings/http.findings';
import { processSecurityHeaderFindings } from './findings/security-headers.findings';
import { processDnsFindings } from './findings/dns.findings';
import { processWhoisFindings } from './findings/whois.findings';
import { processGeoIpFindings } from './findings/geoip.findings';
import { processRobotsFindings } from './findings/robots.findings';
import { processPhishTankFindings } from './findings/phishtank.findings';
import { processReputationFindings } from './findings/reputation.findings';
import { processBreachFindings } from './findings/breach.findings';
import { processOtxFindings } from './findings/otx.findings';
import { processSqliFindings } from './findings/sqli.findings';
import { processVisualFindings } from './findings/visual.findings';
import { analyzeFindings } from './ai/analyze';
import type { ScanJobPayload, ScanJobResult } from '@asm/shared';

// --------------------
// Webhook notification
// --------------------
interface FindingForWebhook {
  assetId: string;
  type: string;
  severity: string;
  aiScore: number | null;
  aiWhyJson: Prisma.JsonValue | null;
  lastSeenAt: Date;
}

async function notifyFinding(finding: FindingForWebhook): Promise<void> {
  const webhookUrl = process.env.N8N_WEBHOOK_URL;
  if (!webhookUrl) return;

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        assetId: finding.assetId,
        type: finding.type,
        severity: finding.severity,
        aiScore: finding.aiScore,
        summary: (finding.aiWhyJson as { summary?: string } | null)?.summary,
        impact: (finding.aiWhyJson as { impact?: string } | null)?.impact,
        recommendations: (finding.aiWhyJson as { recommendations?: string[] } | null)?.recommendations,
        lastSeenAt: finding.lastSeenAt,
      }),
    });
    log('webhook sent', { type: finding.type, severity: finding.severity });
  } catch (err) {
    log('webhook error', { error: (err as Error).message });
  }
}

// --------------------
// Main scan orchestration
// --------------------
export async function runScan(
  prisma: PrismaClient,
  job: { data: ScanJobPayload; name: string },
): Promise<ScanJobResult> {
  const { assetId } = job.data;
  let { scanRunId } = job.data;

  const scanType = scanRunId ? 'manual' : 'scheduled';
  log('job start', { scanType, name: job.name, scanRunId: scanRunId ?? '(new)', assetId });

  const asset = await prisma.asset.findUnique({
    where: { id: assetId },
    select: { id: true, status: true, type: true, value: true },
  });

  if (!asset) {
    if (scanRunId) {
      await prisma.scanRun.update({ where: { id: scanRunId }, data: { status: 'FAILED', finishedAt: new Date() } });
    }
    log('asset not found → FAILED', { assetId });
    return { ok: false, reason: 'ASSET_NOT_FOUND', scanRunId };
  }

  if (asset.status !== 'VERIFIED') {
    if (scanRunId) {
      await prisma.scanRun.update({ where: { id: scanRunId }, data: { status: 'FAILED', finishedAt: new Date() } });
    }
    log('asset not verified → FAILED', { assetId, status: asset.status });
    return { ok: false, reason: 'ASSET_NOT_VERIFIED', scanRunId };
  }

  if (!scanRunId) {
    const run = await prisma.scanRun.create({
      data: { assetId, status: 'RUNNING' },
      select: { id: true },
    });
    scanRunId = run.id;
  } else {
    await prisma.scanRun.update({ where: { id: scanRunId }, data: { status: 'RUNNING' } });
  }

  const runId = scanRunId;
  const host = parseHost(asset.value);
  const isDomain = asset.type === 'DOMAIN';
  const assetType = asset.type as 'DOMAIN' | 'IP';
  const now = () => new Date().toISOString();

  // --------------------
  // Run all checks in parallel — each wrapped in safeCheck so a single crash
  // returns a typed fallback result instead of rejecting the entire Promise.all
  // --------------------
  const [
    portsResult,
    tlsResult,
    health,
    headersResult,
    dnsRecordsResult,
    rdapResult,
    geoIpResult,
    robotsResult,
    phishTankResult,
    reputationResult,
    breachResult,
    otxResult,
    sqliResult,
    visualResult,
  ] = await Promise.all([
    safeCheck('ports', () => checkPorts(host),
      { checkedPorts: [], results: [], openPorts: [], error: 'CHECK_CRASHED' }),

    safeCheck('tls', () => checkTls(host),
      { ok: false, host, port: 443, error: 'CHECK_CRASHED' }),

    safeCheck('http', () => checkHttp(asset.value),
      { url: `https://${asset.value}`, statusCode: null, latencyMs: null, error: 'CHECK_CRASHED' }),

    isDomain
      ? safeCheck('headers', () => checkSecurityHeaders(asset.value),
          { ok: false as const, checkedUrl: null, error: 'CHECK_CRASHED', headers: {}, missing: [], missingDetails: [], present: [] })
      : Promise.resolve({ ok: false as const, checkedUrl: null, reason: 'IP_ASSET', headers: {}, missing: [], missingDetails: [], present: [], error: undefined as string | undefined }),

    isDomain
      ? safeCheck('dns', () => checkDnsRecords(asset.value),
          { domain: asset.value, records: [], dmarcRecord: null, checkedAt: now(), errors: {}, error: 'CHECK_CRASHED' })
      : Promise.resolve(null),

    isDomain
      ? safeCheck('rdap', () => checkRdap(asset.value),
          { domain: asset.value, registrar: null, createdDate: null, updatedDate: null, expiresDate: null, nameServers: [], status: [], rawSource: 'RDAP' as const, checkedAt: now(), error: 'CHECK_CRASHED' })
      : Promise.resolve(null),

    safeCheck('geoip', () => checkGeoIp(asset.value, assetType),
      { assetValue: asset.value, assetType, resolvedIp: null, country: null, countryCode: null, region: null, city: null, latitude: null, longitude: null, asn: null, isp: null, organization: null, provider: 'ip-api', checkedAt: now(), error: 'CHECK_CRASHED' }),

    isDomain
      ? safeCheck('robots', () => checkRobotsTxt(asset.value),
          { domain: asset.value, url: null, exists: false, statusCode: null, contentLength: 0, contentHash: null, disallowRules: [], allowRules: [], sitemapUrls: [], sensitivePaths: [], highSeverityPaths: [], checkedAt: now(), error: 'CHECK_CRASHED' })
      : Promise.resolve(null),

    isDomain
      ? safeCheck('phishtank', () => checkPhishTank(asset.value),
          { domain: asset.value, provider: 'phishtank' as const, enabled: true, skipped: false, isListed: false, verifiedMatches: 0, onlineMatches: 0, matchedUrls: [], checkedAt: now(), error: 'CHECK_CRASHED' })
      : Promise.resolve(null),

    safeCheck('reputation', () => checkReputation(asset.value, assetType),
      { assetValue: asset.value, assetType, enabled: true, skipped: false, providers: [], isMalicious: false, maxScore: null, categories: [], checkedAt: now(), error: 'CHECK_CRASHED' }),

    isDomain
      ? safeCheck('breach', () => checkBreachExposure(asset.value),
          { domain: asset.value, enabled: true, skipped: false, provider: 'mock' as const, status: 'error' as const, breachCount: 0, exposedEmailsCount: null, latestBreachDate: null, sources: [], sensitiveDataTypes: [], checkedAt: now(), error: 'CHECK_CRASHED' })
      : Promise.resolve(null),

    process.env.ENABLE_OTX_IN_VERIFIED_SCANS === 'true'
      ? safeCheck('otx', () => checkOtx(asset.value, assetType),
          { assetValue: asset.value, assetType, provider: 'alienvault-otx' as const, enabled: true, skipped: false, pulseCount: 0, pulses: [], tags: [], malwareCount: 0, urlListCount: 0, passiveDnsCount: 0, checkedAt: now(), error: 'CHECK_CRASHED' })
      : Promise.resolve({ assetValue: asset.value, assetType, provider: 'alienvault-otx' as const, enabled: false, skipped: true, skipReason: 'VERIFIED_SCAN_DISABLED', pulseCount: 0, pulses: [], tags: [], malwareCount: 0, urlListCount: 0, passiveDnsCount: 0, checkedAt: now(), error: undefined }),

    // SQLi probe — env-gated, asset DOMAIN/VERIFIED guards live inside checkSqli.
    // ENABLE_SQLI_CHECK !== 'true' → branch returns DISABLED skipped without
    // touching DB. crash → safeCheck fallback with error='CHECK_CRASHED'.
    process.env.ENABLE_SQLI_CHECK === 'true'
      ? safeCheck('sqli', () => checkSqli(prisma, asset),
          { enabled: true, skipped: false, targetCount: 0, testedParams: 0, suspectedCount: 0, results: [], checkedAt: now(), error: 'CHECK_CRASHED' })
      : Promise.resolve({ enabled: false, skipped: true, skipReason: 'DISABLED' as const, targetCount: 0, testedParams: 0, suspectedCount: 0, results: [], checkedAt: now(), error: undefined as string | undefined }),

    // Visual Website Analyzer — env-gated. checkVisualAnalysis kendi içinde
    // NOT_DOMAIN / NOT_VERIFIED / INVALID_URL / PAGE_LOAD_FAILED guard'larını
    // yapar, browser yaşam döngüsünü try/finally ile temizler. Bu yüzden burada
    // sadece env kontrolü yapıyoruz; IP asset için NOT_DOMAIN result motor
    // tarafından döner. Crash → safeCheck fallback ile error='CHECK_CRASHED'.
    process.env.ENABLE_VISUAL_ANALYSIS === 'true'
      ? safeCheck('visual', () => checkVisualAnalysis({
          asset: { id: asset.id, value: asset.value, type: asset.type, status: asset.status },
          screenshotDir: process.env.VISUAL_SCREENSHOT_DIR,
        }),
          { enabled: true as const, skipped: true as const, skipReason: 'PAGE_LOAD_FAILED' as const, assetValue: asset.value, url: null, finalUrl: null, statusCode: null, screenshotPath: null, screenshotHash: null, screenshotWidth: null, screenshotHeight: null, title: null, metaDescription: null, h1Texts: [], visibleText: null, visibleTextHash: null, siteCategory: null, purposeSummary: null, language: null, signals: [], riskLevel: null, analysis: { hasLoginForm: false, hasPasswordInput: false, hasAdminHints: false, hasDefaultServerPage: false, hasErrorPage: false, isEmptyPage: false, linkCount: 0, formCount: 0, inputCount: 0, buttonCount: 0, detectedKeywords: [] }, aiVisualAnalysis: null, checkedAt: now(), error: 'CHECK_CRASHED' })
      : Promise.resolve<VisualAnalysisResult>({ enabled: false, skipped: true, skipReason: 'DISABLED', assetValue: asset.value, url: null, finalUrl: null, statusCode: null, screenshotPath: null, screenshotHash: null, screenshotWidth: null, screenshotHeight: null, title: null, metaDescription: null, h1Texts: [], visibleText: null, visibleTextHash: null, siteCategory: null, purposeSummary: null, language: null, signals: [], riskLevel: null, analysis: { hasLoginForm: false, hasPasswordInput: false, hasAdminHints: false, hasDefaultServerPage: false, hasErrorPage: false, isEmptyPage: false, linkCount: 0, formCount: 0, inputCount: 0, buttonCount: 0, detectedKeywords: [] }, aiVisualAnalysis: null, checkedAt: now() }),
  ]);

  // --------------------
  // Log check results — status: ok | err | crash
  // --------------------
  log('check:ports', {
    status: portsResult.error === 'CHECK_CRASHED' ? 'crash' : portsResult.error ? 'err' : 'ok',
    openPorts: portsResult.openPorts,
    error: portsResult.error,
  });
  log('check:tls', {
    status: tlsResult.error === 'CHECK_CRASHED' ? 'crash' : tlsResult.ok ? 'ok' : 'err',
    daysLeft: tlsResult.daysLeft,
    error: tlsResult.error,
  });
  log('check:http', {
    status: health.error === 'CHECK_CRASHED' ? 'crash' : health.statusCode !== null ? 'ok' : 'err',
    statusCode: health.statusCode,
    latencyMs: health.latencyMs,
    error: health.error,
  });
  log('check:geoip', {
    status: geoIpResult.error === 'CHECK_CRASHED' ? 'crash' : geoIpResult.error ? 'err' : 'ok',
    ip: geoIpResult.resolvedIp,
    country: geoIpResult.countryCode,
    asn: geoIpResult.asn,
    error: geoIpResult.error,
  });
  log('check:reputation', {
    status: reputationResult.error === 'CHECK_CRASHED' ? 'crash' : reputationResult.error ? 'err' : reputationResult.skipped ? 'skip' : 'ok',
    skipped: reputationResult.skipped,
    malicious: reputationResult.isMalicious,
    score: reputationResult.maxScore,
    error: reputationResult.error,
  });
  if (isDomain) {
    log('check:headers', {
      status: headersResult.error === 'CHECK_CRASHED' ? 'crash' : headersResult.ok ? 'ok' : 'err',
      missing: headersResult.missing,
      error: headersResult.error,
    });
    log('check:dns', {
      status: dnsRecordsResult?.error === 'CHECK_CRASHED' ? 'crash' : dnsRecordsResult?.error ? 'err' : 'ok',
      records: dnsRecordsResult?.records.length ?? 0,
      typeErrors: Object.keys(dnsRecordsResult?.errors ?? {}),
      error: dnsRecordsResult?.error,
    });
    log('check:rdap', {
      status: rdapResult?.error === 'CHECK_CRASHED' ? 'crash' : rdapResult?.error ? 'err' : 'ok',
      registrar: rdapResult?.registrar,
      expiresDate: rdapResult?.expiresDate,
      error: rdapResult?.error,
    });
    log('check:robots', {
      status: robotsResult?.error === 'CHECK_CRASHED' ? 'crash' : robotsResult?.error ? 'err' : 'ok',
      exists: robotsResult?.exists,
      sensitivePaths: robotsResult?.sensitivePaths.length ?? 0,
      error: robotsResult?.error,
    });
    log('check:phishtank', {
      status: phishTankResult?.error === 'CHECK_CRASHED' ? 'crash' : phishTankResult?.error ? 'err' : phishTankResult?.skipped ? 'skip' : 'ok',
      skipped: phishTankResult?.skipped,
      isListed: phishTankResult?.isListed,
      verifiedMatches: phishTankResult?.verifiedMatches,
      error: phishTankResult?.error,
    });
    log('check:breach', {
      status: breachResult?.error === 'CHECK_CRASHED' ? 'crash' : breachResult?.status === 'error' ? 'err' : breachResult?.skipped ? 'skip' : 'ok',
      skipped: breachResult?.skipped,
      breachCount: breachResult?.breachCount,
      provider: breachResult?.provider,
      error: breachResult?.error,
    });
  }
  log('check:otx', {
    status: otxResult.error === 'CHECK_CRASHED' ? 'crash' : otxResult.error ? 'err' : otxResult.skipped ? 'skip' : 'ok',
    skipped: otxResult.skipped,
    skipReason: otxResult.skipReason,
    pulseCount: otxResult.pulseCount,
    malwareCount: otxResult.malwareCount,
    error: otxResult.error,
  });
  log('check:sqli', {
    status: sqliResult.error === 'CHECK_CRASHED' ? 'crash' : sqliResult.error ? 'err' : sqliResult.skipped ? 'skip' : 'ok',
    skipped: sqliResult.skipped,
    skipReason: sqliResult.skipReason,
    targetCount: sqliResult.targetCount,
    suspectedCount: sqliResult.suspectedCount,
    error: sqliResult.error,
  });
  log('check:visual', {
    status: visualResult.error === 'CHECK_CRASHED' ? 'crash' : visualResult.error ? 'err' : visualResult.skipped ? 'skip' : 'ok',
    skipped: visualResult.skipped,
    skipReason: visualResult.skipReason,
    statusCode: visualResult.statusCode,
    signals: visualResult.signals,
    riskLevel: visualResult.riskLevel,
    error: visualResult.error,
  });

  // --------------------
  // Save snapshots — allSettled so a single DB hiccup doesn't abort the scan
  // --------------------
  const snapshotOps = [
    prisma.scanCheckResult.create({ data: { scanRunId: runId, type: 'PORTS', dataJson: portsResult as unknown as Prisma.InputJsonValue } }),
    prisma.scanCheckResult.create({ data: { scanRunId: runId, type: 'TLS_INFO', dataJson: tlsResult as unknown as Prisma.InputJsonValue } }),
    prisma.scanCheckResult.create({ data: { scanRunId: runId, type: 'HTTP_HEALTH', dataJson: health as unknown as Prisma.InputJsonValue } }),
  ];
  if (isDomain) {
    snapshotOps.push(
      prisma.scanCheckResult.create({ data: { scanRunId: runId, type: 'SECURITY_HEADERS', dataJson: headersResult as unknown as Prisma.InputJsonValue } }),
    );
    snapshotOps.push(
      prisma.scanCheckResult.create({ data: { scanRunId: runId, type: 'DNS_RECORDS', dataJson: dnsRecordsResult as unknown as Prisma.InputJsonValue } }),
    );
    snapshotOps.push(
      prisma.scanCheckResult.create({ data: { scanRunId: runId, type: 'RDAP_INFO', dataJson: rdapResult as unknown as Prisma.InputJsonValue } }),
    );
    snapshotOps.push(
      prisma.scanCheckResult.create({ data: { scanRunId: runId, type: 'ROBOTS_TXT', dataJson: robotsResult as unknown as Prisma.InputJsonValue } }),
    );
    snapshotOps.push(
      prisma.scanCheckResult.create({ data: { scanRunId: runId, type: 'PHISHTANK_REPUTATION', dataJson: phishTankResult as unknown as Prisma.InputJsonValue } }),
    );
    snapshotOps.push(
      prisma.scanCheckResult.create({ data: { scanRunId: runId, type: 'BREACH_EXPOSURE', dataJson: breachResult as unknown as Prisma.InputJsonValue } }),
    );
  }
  snapshotOps.push(
    prisma.scanCheckResult.create({ data: { scanRunId: runId, type: 'GEOIP_INFO', dataJson: geoIpResult as unknown as Prisma.InputJsonValue } }),
  );
  snapshotOps.push(
    prisma.scanCheckResult.create({ data: { scanRunId: runId, type: 'MALICIOUS_REPUTATION', dataJson: reputationResult as unknown as Prisma.InputJsonValue } }),
  );
  snapshotOps.push(
    prisma.scanCheckResult.create({ data: { scanRunId: runId, type: 'OTX_INTELLIGENCE', dataJson: otxResult as unknown as Prisma.InputJsonValue } }),
  );
  snapshotOps.push(
    prisma.scanCheckResult.create({ data: { scanRunId: runId, type: 'SQLI_PROBE', dataJson: sqliResult as unknown as Prisma.InputJsonValue } }),
  );

  // VISUAL_ANALYSIS snapshot — visibleText 8000 char ile sınırlandırılır
  // (persistence helper'la aynı limit). AI rawText 4000 char ile kırpılır.
  // Diğer alanlar olduğu gibi.
  const visualSnapshotPayload = {
    ...visualResult,
    visibleText: visualResult.visibleText && visualResult.visibleText.length > 8_000
      ? visualResult.visibleText.slice(0, 8_000)
      : visualResult.visibleText,
    aiVisualAnalysis: visualResult.aiVisualAnalysis && visualResult.aiVisualAnalysis.rawText && visualResult.aiVisualAnalysis.rawText.length > 4_000
      ? { ...visualResult.aiVisualAnalysis, rawText: visualResult.aiVisualAnalysis.rawText.slice(0, 4_000) }
      : visualResult.aiVisualAnalysis,
  };
  snapshotOps.push(
    prisma.scanCheckResult.create({ data: { scanRunId: runId, type: 'VISUAL_ANALYSIS', dataJson: visualSnapshotPayload as unknown as Prisma.InputJsonValue } }),
  );

  const snapResults = await Promise.allSettled(snapshotOps);
  const failedSnaps = snapResults.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
  if (failedSnaps.length > 0) {
    log('snapshot save failures', {
      count: failedSnaps.length,
      errors: failedSnaps.map((r) => (r.reason as Error)?.message ?? String(r.reason)),
    });
  }

  // --------------------
  // Load previous snapshots for change detection
  // --------------------
  const prevFilter = (type: string) => ({
    type,
    scanRun: { assetId: asset.id, status: ScanRunStatus.DONE, id: { not: runId } },
  });

  const [prevPortsSnap, prevTlsSnap, prevHttpSnap, prevDnsSnap, prevRdapSnap, prevGeoIpSnap, prevRobotsSnap] = await Promise.all([
    prisma.scanCheckResult.findFirst({ where: prevFilter('PORTS'), orderBy: { createdAt: 'desc' }, select: { dataJson: true } }),
    prisma.scanCheckResult.findFirst({ where: prevFilter('TLS_INFO'), orderBy: { createdAt: 'desc' }, select: { dataJson: true } }),
    prisma.scanCheckResult.findFirst({ where: prevFilter('HTTP_HEALTH'), orderBy: { createdAt: 'desc' }, select: { dataJson: true } }),
    isDomain
      ? prisma.scanCheckResult.findFirst({ where: prevFilter('DNS_RECORDS'), orderBy: { createdAt: 'desc' }, select: { dataJson: true } })
      : Promise.resolve(null),
    isDomain
      ? prisma.scanCheckResult.findFirst({ where: prevFilter('RDAP_INFO'), orderBy: { createdAt: 'desc' }, select: { dataJson: true } })
      : Promise.resolve(null),
    prisma.scanCheckResult.findFirst({ where: prevFilter('GEOIP_INFO'), orderBy: { createdAt: 'desc' }, select: { dataJson: true } }),
    isDomain
      ? prisma.scanCheckResult.findFirst({ where: prevFilter('ROBOTS_TXT'), orderBy: { createdAt: 'desc' }, select: { dataJson: true } })
      : Promise.resolve(null),
  ]);

  // --------------------
  // Process findings — each processor isolated so one failure doesn't block others
  // --------------------
  const findingTasks: Array<[string, () => Promise<void>]> = [
    ['ports', () => processPortFindings(prisma, { asset, scanRunId: runId, portsResult, prevPortsSnap })],
    ['tls', () => processTlsFindings(prisma, { asset, scanRunId: runId, tlsResult, prevTlsSnap })],
    ['http', () => processHttpFindings(prisma, { asset, scanRunId: runId, health, prevHttpSnap })],
    ['geoip', () => processGeoIpFindings(prisma, { asset, scanRunId: runId, current: geoIpResult, previous: prevGeoIpSnap?.dataJson ?? null })],
    ['reputation', () => processReputationFindings(prisma, { asset, scanRunId: runId, current: reputationResult })],
    ['otx', () => processOtxFindings(prisma, { asset, scanRunId: runId, current: otxResult })],
    ['sqli', () => processSqliFindings(prisma, { asset, scanRunId: runId, sqliResult })],
  ];

  // VisualAnalysisRun DB kaydı — sadece visual check gerçekten çalıştıysa
  // (skipped/error değilse). visualRunId finding processor'a dataJson içine
  // geçer (screenshotUrlHint üretmek için). Hata izole — scan devam eder.
  let visualRunId: string | null = null;
  if (!visualResult.skipped && !visualResult.error) {
    try {
      const run = await persistVisualAnalysisRun(prisma, { assetId: asset.id, visualResult });
      visualRunId = (run as { id: string }).id;
      log('visual run persisted', { visualRunId });
    } catch (err) {
      log('visual run persist failed', { error: (err as Error).message ?? String(err) });
    }
  }
  findingTasks.push(
    ['visual', () => processVisualFindings(prisma, { asset, scanRunId: runId, visualResult, visualRunId })],
  );

  if (isDomain) {
    findingTasks.push(
      ['headers', () => processSecurityHeaderFindings(prisma, { asset, scanRunId: runId, headersResult })],
      ['dns', () => processDnsFindings(prisma, { asset, scanRunId: runId, dnsResult: dnsRecordsResult!, prevDnsSnap })],
      ['whois', () => processWhoisFindings(prisma, { asset, scanRunId: runId, current: rdapResult!, previous: prevRdapSnap?.dataJson ?? null })],
      ['robots', () => processRobotsFindings(prisma, { asset, scanRunId: runId, current: robotsResult!, previous: prevRobotsSnap?.dataJson ?? null })],
      ['phishtank', () => processPhishTankFindings(prisma, { asset, scanRunId: runId, current: phishTankResult! })],
      ['breach', () => processBreachFindings(prisma, { asset, scanRunId: runId, current: breachResult! })],
    );
  }

  for (const [label, task] of findingTasks) {
    try {
      await task();
    } catch (err) {
      log(`findings:${label}:error`, { error: (err as Error).message });
    }
  }

  // --------------------
  // AI analysis — enrich active findings (skip security headers, they already have static analysis)
  // --------------------
  const activeFindings = await prisma.finding.findMany({
    where: {
      scanRunId: runId,
      resolvedAt: null,
      NOT: { type: 'SECURITY_HEADER_MISSING' },
    },
    select: { id: true, key: true, type: true, severity: true, dataJson: true },
  });

  if (activeFindings.length > 0) {
    log('ai analyze', { count: activeFindings.length });
    const aiResults = await analyzeFindings(asset, activeFindings);

    if (aiResults.length > 0) {
      const resultMap = new Map(aiResults.map((r) => [r.key, r]));
      await Promise.all(
        activeFindings.map((f) => {
          const ai = resultMap.get(f.key);
          if (!ai) return Promise.resolve();
          return prisma.finding.update({
            where: { id: f.id },
            data: { aiScore: ai.aiScore, aiWhyJson: ai.aiWhyJson as unknown as Prisma.InputJsonValue },
          });
        }),
      );
      log('ai enriched', { updated: aiResults.length });
    } else {
      log('ai returned no results, keeping static scores', { count: activeFindings.length });
    }
  }

  // --------------------
  // Webhook notifications — only for new HIGH/CRITICAL findings
  // --------------------
  const newCriticalFindings = await prisma.finding.findMany({
    where: { scanRunId: runId, isNew: true, resolvedAt: null, severity: { in: ['HIGH', 'CRITICAL'] } },
    select: { id: true, assetId: true, type: true, severity: true, aiScore: true, aiWhyJson: true, lastSeenAt: true },
  });

  if (newCriticalFindings.length > 0) {
    log('sending webhooks', { count: newCriticalFindings.length });
    await Promise.all(newCriticalFindings.map((f) => notifyFinding(f)));
  }

  // --------------------
  // Finish
  // --------------------
  await prisma.scanRun.update({ where: { id: runId }, data: { status: 'DONE', finishedAt: new Date() } });
  log('done', { scanType, scanRunId: runId, assetId });
  return { ok: true, scanRunId: runId };
}
