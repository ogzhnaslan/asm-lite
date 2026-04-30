const { upsertFinding, resolveFinding } = require("../utils/finding");
const { HTTP_LATENCY_SPIKE_MS } = require("../config/constants");
const { forHttpHealth, forHttpChange } = require("../utils/recommendations");
const { log } = require("../utils/logger");
const { FindingTypes } = require("@asm/shared");

async function processHttpFindings(prisma, { asset, scanRunId, health, prevHttpSnap }) {
    await _processHealth(prisma, { asset, scanRunId, health });
    await _processChange(prisma, { asset, scanRunId, health, prevHttpSnap });
}

async function _processHealth(prisma, { asset, scanRunId, health }) {
    const key = `HTTP_HEALTH:${asset.value}`;
    const isUnhealthy = health.statusCode === null || health.statusCode >= 500;
    const isHealthy = typeof health.statusCode === "number" && health.statusCode < 500;

    if (isUnhealthy) {
        const severity = health.statusCode === null ? "CRITICAL" : "HIGH";
        const aiScore = health.statusCode === null ? 95 : 85;
        const rec = forHttpHealth(health.statusCode);

        await upsertFinding(prisma, {
            assetId: asset.id, scanRunId, key,
            type: FindingTypes.HTTP_HEALTH, severity, aiScore,
            dataJson: health,
            aiWhyJson: { ...rec, signals: health },
        });
        log("http health upserted", { key, severity, statusCode: health.statusCode });
    } else if (isHealthy) {
        await resolveFinding(prisma, { assetId: asset.id, key });
        log("http health resolved", { key });
    }
}

async function _processChange(prisma, { asset, scanRunId, health, prevHttpSnap }) {
    if (!prevHttpSnap?.dataJson) return;

    const prev = prevHttpSnap.dataJson;
    const prevStatus = prev.statusCode ?? null;
    const currStatus = health.statusCode ?? null;
    const prevLatency = prev.latencyMs ?? null;
    const currLatency = health.latencyMs ?? null;

    const statusChanged = prevStatus !== currStatus;
    const latencySpike =
        typeof prevLatency === "number" &&
        typeof currLatency === "number" &&
        currLatency - prevLatency >= HTTP_LATENCY_SPIKE_MS;

    if (!statusChanged && !latencySpike) return;

    const key = `HTTP_CHANGE:${asset.value}`;
    const severity =
        currStatus === null ? "CRITICAL" :
        currStatus >= 500 ? "HIGH" :
        latencySpike ? "MEDIUM" : "LOW";
    const aiScore = severity === "CRITICAL" ? 95 : severity === "HIGH" ? 85 : severity === "MEDIUM" ? 70 : 30;
    const rec = forHttpChange(prevStatus, currStatus, latencySpike, prevLatency, currLatency);

    await upsertFinding(prisma, {
        assetId: asset.id, scanRunId, key,
        type: FindingTypes.HTTP_CHANGE, severity, aiScore,
        dataJson: { prevStatus, currStatus, prevLatency, currLatency, statusChanged, latencySpike },
        aiWhyJson: { ...rec, signals: { prev, curr: health } },
    });
    log("http change upserted", { key, severity });
}

module.exports = { processHttpFindings };
