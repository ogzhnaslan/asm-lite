const { upsertFinding, resolveFinding } = require("../utils/finding");
const { REQUIRED_HEADERS } = require("../checks/security-headers.check");
const { log } = require("../utils/logger");
const { FindingTypes } = require("@asm/shared");

async function processSecurityHeaderFindings(prisma, { asset, scanRunId, headersResult }) {
    if (!headersResult.ok) {
        log("security headers skip: asset unreachable", { assetId: asset.id });
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
            log("security header missing upserted", { key, severity: header.severity });
        } else {
            await resolveFinding(prisma, { assetId: asset.id, key });
        }
    }
}

module.exports = { processSecurityHeaderFindings };
