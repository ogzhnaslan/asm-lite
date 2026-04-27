const { upsertFinding, resolveFinding } = require("../utils/finding");
const { TLS_EXPIRY_WARN_DAYS, TLS_EXPIRY_CRITICAL_DAYS } = require("../config/constants");
const { log } = require("../utils/logger");

async function processTlsFindings(prisma, { asset, scanRunId, tlsResult, prevTlsSnap }) {
    await _processCheck(prisma, { asset, scanRunId, tlsResult });
    await _processExpiry(prisma, { asset, scanRunId, tlsResult });
    await _processChange(prisma, { asset, scanRunId, tlsResult, prevTlsSnap });
}

async function _processCheck(prisma, { asset, scanRunId, tlsResult }) {
    const key = `TLS_CHECK:${asset.value}`;

    if (!tlsResult.ok) {
        await upsertFinding(prisma, {
            assetId: asset.id, scanRunId, key,
            type: "TLS_CHECK", severity: "HIGH", dataJson: tlsResult, aiScore: 85,
            aiWhyJson: { reasons: [`TLS check failed: ${tlsResult.error}`], signals: tlsResult },
        });
        log("tls check upserted", { key, error: tlsResult.error });
    } else {
        await resolveFinding(prisma, { assetId: asset.id, key });
        log("tls check resolved", { key });
    }
}

async function _processExpiry(prisma, { asset, scanRunId, tlsResult }) {
    if (!tlsResult.ok || typeof tlsResult.daysLeft !== "number") return;

    const key = `TLS_EXPIRY:${asset.value}`;

    if (tlsResult.daysLeft <= TLS_EXPIRY_WARN_DAYS) {
        const severity = tlsResult.daysLeft <= TLS_EXPIRY_CRITICAL_DAYS ? "CRITICAL" : "HIGH";
        const aiScore = tlsResult.daysLeft <= TLS_EXPIRY_CRITICAL_DAYS ? 95 : 85;
        const dataJson = {
            host: tlsResult.host, port: tlsResult.port,
            validTo: tlsResult.validTo, daysLeft: tlsResult.daysLeft,
            issuer: tlsResult.issuer, subject: tlsResult.subject,
            serialNumber: tlsResult.serialNumber, fingerprint256: tlsResult.fingerprint256,
        };
        await upsertFinding(prisma, {
            assetId: asset.id, scanRunId, key,
            type: "TLS_EXPIRY", severity, dataJson, aiScore,
            aiWhyJson: { reasons: [`TLS certificate expires in ${tlsResult.daysLeft} day(s)`], signals: dataJson },
        });
        log("tls expiry upserted", { key, severity, daysLeft: tlsResult.daysLeft });
    } else {
        await resolveFinding(prisma, { assetId: asset.id, key });
        log("tls expiry resolved", { key, daysLeft: tlsResult.daysLeft });
    }
}

async function _processChange(prisma, { asset, scanRunId, tlsResult, prevTlsSnap }) {
    if (!prevTlsSnap?.dataJson || !tlsResult.ok) return;

    const prev = prevTlsSnap.dataJson;
    const curr = tlsResult;
    const key = `TLS_CHANGE:${asset.value}`;

    const fingerprintChanged = (prev.fingerprint256 || null) !== (curr.fingerprint256 || null);
    const serialChanged = (prev.serialNumber || null) !== (curr.serialNumber || null);
    const issuerChanged = JSON.stringify(prev.issuer || null) !== JSON.stringify(curr.issuer || null);
    const subjectChanged = JSON.stringify(prev.subject || null) !== JSON.stringify(curr.subject || null);

    if (fingerprintChanged || serialChanged || issuerChanged || subjectChanged) {
        const severity = fingerprintChanged || serialChanged ? "HIGH" : "MEDIUM";
        const aiScore = severity === "HIGH" ? 85 : 70;
        const reasons = [];
        if (fingerprintChanged) reasons.push("TLS fingerprint changed");
        if (serialChanged) reasons.push("TLS serial number changed");
        if (issuerChanged) reasons.push("TLS issuer changed");
        if (subjectChanged) reasons.push("TLS subject changed");

        const dataJson = {
            previous: { fingerprint256: prev.fingerprint256 || null, serialNumber: prev.serialNumber || null, issuer: prev.issuer || null, subject: prev.subject || null },
            current: { fingerprint256: curr.fingerprint256 || null, serialNumber: curr.serialNumber || null, issuer: curr.issuer || null, subject: curr.subject || null },
            fingerprintChanged, serialChanged, issuerChanged, subjectChanged,
        };

        await upsertFinding(prisma, {
            assetId: asset.id, scanRunId, key,
            type: "TLS_CHANGE", severity, dataJson, aiScore,
            aiWhyJson: { reasons, signals: dataJson },
        });
        log("tls change upserted", { key, severity });
    } else {
        await resolveFinding(prisma, { assetId: asset.id, key });
        log("tls change resolved", { key });
    }
}

module.exports = { processTlsFindings };
