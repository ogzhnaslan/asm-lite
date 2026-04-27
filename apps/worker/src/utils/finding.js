async function upsertFinding(prisma, { assetId, scanRunId, key, type, severity, dataJson, aiScore, aiWhyJson }) {
    const existing = await prisma.finding.findFirst({
        where: { assetId, key },
        select: { id: true },
    });

    if (existing) {
        await prisma.finding.update({
            where: { id: existing.id },
            data: {
                scanRunId, type, severity, dataJson, aiScore, aiWhyJson,
                isNew: false, lastSeenAt: new Date(), resolvedAt: null,
            },
        });
    } else {
        await prisma.finding.create({
            data: {
                assetId, scanRunId, key, type, severity, dataJson, aiScore, aiWhyJson,
                isNew: true, lastSeenAt: new Date(),
            },
        });
    }
}

async function resolveFinding(prisma, { assetId, key }) {
    const existing = await prisma.finding.findFirst({
        where: { assetId, key },
        select: { id: true, resolvedAt: true },
    });

    if (existing && !existing.resolvedAt) {
        await prisma.finding.update({
            where: { id: existing.id },
            data: { resolvedAt: new Date(), lastSeenAt: new Date() },
        });
    }
}

module.exports = { upsertFinding, resolveFinding };
