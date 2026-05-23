import { PrismaClient } from '@prisma/client';
import { FindingTypes } from '@asm/shared';
import { upsertFinding, resolveFinding } from '../utils/finding';
import { TLS_EXPIRY_WARN_DAYS, TLS_EXPIRY_HIGH_DAYS, TLS_EXPIRY_CRITICAL_DAYS } from '../config/constants';
import { forTlsCheck, forTlsExpiry, forTlsChange } from '../utils/recommendations';
import { log } from '../utils/logger';
import type { TlsCheckResult } from '../checks/tls.check';

interface Asset {
  id: string;
  value: string;
}

interface PrevSnap {
  dataJson: unknown;
}

interface ProcessTlsFindingsParams {
  asset: Asset;
  scanRunId: string;
  tlsResult: TlsCheckResult;
  prevTlsSnap: PrevSnap | null;
}

export async function processTlsFindings(prisma: PrismaClient, params: ProcessTlsFindingsParams): Promise<void> {
  if (params.tlsResult.error === 'CHECK_CRASHED') {
    log('tls findings: check crashed, skipping', { asset: params.asset.value });
    return;
  }
  await _processCheck(prisma, params);
  await _processExpiry(prisma, params);
  await _processChange(prisma, params);
}

async function _processCheck(
  prisma: PrismaClient,
  { asset, scanRunId, tlsResult }: ProcessTlsFindingsParams,
): Promise<void> {
  const key = `TLS_CHECK:${asset.value}`;

  if (!tlsResult.ok) {
    const rec = forTlsCheck(tlsResult.error ?? 'UNKNOWN');
    await upsertFinding(prisma, {
      assetId: asset.id, scanRunId, key,
      type: FindingTypes.TLS_CHECK, severity: 'HIGH', aiScore: 85,
      dataJson: tlsResult as unknown as Record<string, unknown>,
      aiWhyJson: { ...rec, signals: tlsResult },
    });
    log('tls check upserted', { key, error: tlsResult.error });
  } else {
    await resolveFinding(prisma, { assetId: asset.id, key });
    log('tls check resolved', { key });
  }
}

async function _processExpiry(
  prisma: PrismaClient,
  { asset, scanRunId, tlsResult }: ProcessTlsFindingsParams,
): Promise<void> {
  if (!tlsResult.ok || typeof tlsResult.daysLeft !== 'number') return;

  const key = `TLS_EXPIRING:${asset.value}`;

  if (tlsResult.daysLeft <= TLS_EXPIRY_WARN_DAYS) {
    const severity =
      tlsResult.daysLeft <= TLS_EXPIRY_CRITICAL_DAYS ? 'CRITICAL' :
      tlsResult.daysLeft <= TLS_EXPIRY_HIGH_DAYS ? 'HIGH' : 'MEDIUM';
    const aiScore =
      tlsResult.daysLeft <= TLS_EXPIRY_CRITICAL_DAYS ? 95 :
      tlsResult.daysLeft <= TLS_EXPIRY_HIGH_DAYS ? 85 : 65;
    const rec = forTlsExpiry(tlsResult.daysLeft, tlsResult.validTo ?? '');

    await upsertFinding(prisma, {
      assetId: asset.id, scanRunId, key,
      type: FindingTypes.TLS_EXPIRING, severity, aiScore,
      dataJson: {
        host: tlsResult.host, port: tlsResult.port,
        validTo: tlsResult.validTo, daysLeft: tlsResult.daysLeft,
        issuer: tlsResult.issuer, subject: tlsResult.subject,
        serialNumber: tlsResult.serialNumber, fingerprint256: tlsResult.fingerprint256,
        // Sprint 1B — opsiyonel raporlanabilirlik alanları (eski kayıtlarda yok olabilir)
        ...(tlsResult.protocol !== undefined ? { protocol: tlsResult.protocol } : {}),
        ...(tlsResult.cipher !== undefined ? { cipher: tlsResult.cipher } : {}),
        ...(tlsResult.authorized !== undefined ? { authorized: tlsResult.authorized } : {}),
        ...(tlsResult.authorizationError !== undefined ? { authorizationError: tlsResult.authorizationError } : {}),
      },
      aiWhyJson: { ...rec, signals: { daysLeft: tlsResult.daysLeft, validTo: tlsResult.validTo } },
    });
    log('tls expiry upserted', { key, severity, daysLeft: tlsResult.daysLeft });
  } else {
    await resolveFinding(prisma, { assetId: asset.id, key });
    log('tls expiry resolved', { key, daysLeft: tlsResult.daysLeft });
  }
}

async function _processChange(
  prisma: PrismaClient,
  { asset, scanRunId, tlsResult, prevTlsSnap }: ProcessTlsFindingsParams,
): Promise<void> {
  if (!prevTlsSnap?.dataJson || !tlsResult.ok) return;

  const prev = prevTlsSnap.dataJson as Partial<TlsCheckResult>;
  const key = `TLS_CHANGE:${asset.value}`;

  const fingerprintChanged = (prev.fingerprint256 ?? null) !== (tlsResult.fingerprint256 ?? null);
  const serialChanged = (prev.serialNumber ?? null) !== (tlsResult.serialNumber ?? null);
  const issuerChanged = JSON.stringify(prev.issuer ?? null) !== JSON.stringify(tlsResult.issuer ?? null);
  const subjectChanged = JSON.stringify(prev.subject ?? null) !== JSON.stringify(tlsResult.subject ?? null);

  if (fingerprintChanged || serialChanged || issuerChanged || subjectChanged) {
    const changes = { fingerprintChanged, serialChanged, issuerChanged, subjectChanged };
    const severity = fingerprintChanged || serialChanged ? 'HIGH' : 'MEDIUM';
    const aiScore = severity === 'HIGH' ? 85 : 70;
    const rec = forTlsChange(changes);

    const dataJson = {
      previous: { fingerprint256: prev.fingerprint256 ?? null, serialNumber: prev.serialNumber ?? null, issuer: prev.issuer ?? null, subject: prev.subject ?? null },
      current: { fingerprint256: tlsResult.fingerprint256 ?? null, serialNumber: tlsResult.serialNumber ?? null, issuer: tlsResult.issuer ?? null, subject: tlsResult.subject ?? null },
      ...changes,
    };

    await upsertFinding(prisma, {
      assetId: asset.id, scanRunId, key,
      type: FindingTypes.TLS_CHANGE, severity, aiScore,
      dataJson,
      aiWhyJson: { ...rec, signals: dataJson },
    });
    log('tls change upserted', { key, severity });
  } else {
    await resolveFinding(prisma, { assetId: asset.id, key });
    log('tls change resolved', { key });
  }
}
