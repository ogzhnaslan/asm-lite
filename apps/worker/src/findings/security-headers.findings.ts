import { PrismaClient } from '@prisma/client';
import { FindingTypes } from '@asm/shared';
import { upsertFinding, resolveFinding } from '../utils/finding';
import { REQUIRED_HEADERS, type SecurityHeadersCheckResult } from '../checks/security-headers.check';
import { log } from '../utils/logger';

interface Asset {
  id: string;
  value: string;
}

interface ProcessSecurityHeaderFindingsParams {
  asset: Asset;
  scanRunId: string;
  headersResult: SecurityHeadersCheckResult;
}

export async function processSecurityHeaderFindings(
  prisma: PrismaClient,
  { asset, scanRunId, headersResult }: ProcessSecurityHeaderFindingsParams,
): Promise<void> {
  if (!headersResult.ok) {
    log('security headers skip: asset unreachable', { assetId: asset.id });
    return;
  }

  const missingShorts = new Set(headersResult.missing);

  for (const header of REQUIRED_HEADERS) {
    const key = `SECURITY_HEADER_MISSING:${asset.value}:${header.short}`;

    if (missingShorts.has(header.short)) {
      await upsertFinding(prisma, {
        assetId: asset.id,
        scanRunId,
        key,
        type: FindingTypes.SECURITY_HEADER_MISSING,
        severity: header.severity,
        dataJson: {
          missingHeader: header.name,
          short: header.short,
          checkedUrl: headersResult.checkedUrl,
          risk: header.risk,
          recommendation: header.recommendation,
        },
        aiScore: header.aiScore,
        aiWhyJson: {
          summary: `Security header ${header.name} is missing`,
          reasons: [header.risk],
          impact: header.impact,
          recommendations: [header.recommendation],
          context: `Checked via HEAD ${headersResult.checkedUrl}`,
        },
      });
      log('security header missing upserted', { key, severity: header.severity });
    } else {
      await resolveFinding(prisma, { assetId: asset.id, key });
    }
  }
}
