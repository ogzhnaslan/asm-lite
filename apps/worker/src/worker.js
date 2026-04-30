require("dotenv").config();

const dns = require("node:dns");
dns.setDefaultResultOrder("ipv4first");

const { Worker } = require("bullmq");
const IORedis = require("ioredis");
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

const { log } = require("./utils/logger");
const { parseHost } = require("./utils/network");
const { checkPorts } = require("./checks/ports.check");
const { checkTls } = require("./checks/tls.check");
const { checkHttp } = require("./checks/http.check");
const { checkSecurityHeaders } = require("./checks/security-headers.check");
const { processPortFindings } = require("./findings/port.findings");
const { processTlsFindings } = require("./findings/tls.findings");
const { processHttpFindings } = require("./findings/http.findings");
const { processSecurityHeaderFindings } = require("./findings/security-headers.findings");
const { analyzeFindings } = require("./ai/analyze");

// --------------------
// Bootstrap
// --------------------
const connection = new IORedis({
    host: process.env.REDIS_HOST || "localhost",
    port: Number(process.env.REDIS_PORT || 6380),
    maxRetriesPerRequest: null,
});

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

prisma.$queryRaw`SELECT 1`
    .then(() => log("db ok"))
    .catch((e) => log("db error", e?.message || e));

log("listening queue: scan");

// --------------------
// Job handler
// --------------------
async function runScan(job) {
    const { assetId } = job.data;
    let { scanRunId } = job.data;

    log("job start", { name: job.name, scanRunId: scanRunId ?? "(scheduled)", assetId });

    const asset = await prisma.asset.findUnique({
        where: { id: assetId },
        select: { id: true, status: true, type: true, value: true },
    });

    if (!asset) {
        if (scanRunId) {
            await prisma.scanRun.update({ where: { id: scanRunId }, data: { status: "FAILED", finishedAt: new Date() } });
        }
        log("asset not found → FAILED", { assetId });
        return { ok: false, reason: "ASSET_NOT_FOUND", scanRunId };
    }

    if (asset.status !== "VERIFIED") {
        if (scanRunId) {
            await prisma.scanRun.update({ where: { id: scanRunId }, data: { status: "FAILED", finishedAt: new Date() } });
        }
        log("asset not verified → FAILED", { assetId, status: asset.status });
        return { ok: false, reason: "ASSET_NOT_VERIFIED", scanRunId };
    }

    // Scheduled jobs have no pre-created ScanRun — create one now
    if (!scanRunId) {
        const run = await prisma.scanRun.create({
            data: { assetId, status: "RUNNING" },
            select: { id: true },
        });
        scanRunId = run.id;
    } else {
        await prisma.scanRun.update({ where: { id: scanRunId }, data: { status: "RUNNING" } });
    }

    const host = parseHost(asset.value);
    const isDomain = asset.type === "DOMAIN";

    // --------------------
    // Run all checks in parallel
    // --------------------
    const [portsResult, tlsResult, health, headersResult] = await Promise.all([
        checkPorts(host),
        checkTls(host),
        checkHttp(asset.value),
        isDomain ? checkSecurityHeaders(asset.value) : Promise.resolve({ ok: false, reason: "IP_ASSET" }),
    ]);

    log("ports", { open: portsResult.openPorts });
    log("tls", { ok: tlsResult.ok, daysLeft: tlsResult.daysLeft, error: tlsResult.error });
    log("http", { statusCode: health.statusCode, latencyMs: health.latencyMs });
    if (isDomain) log("headers", { missing: headersResult.missing ?? [], ok: headersResult.ok });

    // --------------------
    // Save snapshots
    // --------------------
    const snapshotOps = [
        prisma.scanCheckResult.create({ data: { scanRunId, type: "PORTS", dataJson: portsResult } }),
        prisma.scanCheckResult.create({ data: { scanRunId, type: "TLS_INFO", dataJson: tlsResult } }),
        prisma.scanCheckResult.create({ data: { scanRunId, type: "HTTP_HEALTH", dataJson: health } }),
    ];
    if (isDomain) {
        snapshotOps.push(
            prisma.scanCheckResult.create({ data: { scanRunId, type: "SECURITY_HEADERS", dataJson: headersResult } })
        );
    }
    await Promise.all(snapshotOps);

    // --------------------
    // Load previous snapshots for change detection
    // --------------------
    const prevFilter = (type) => ({
        type,
        scanRun: { assetId: asset.id, status: "DONE", id: { not: scanRunId } },
    });

    const [prevPortsSnap, prevTlsSnap, prevHttpSnap] = await Promise.all([
        prisma.scanCheckResult.findFirst({ where: prevFilter("PORTS"), orderBy: { createdAt: "desc" }, select: { dataJson: true } }),
        prisma.scanCheckResult.findFirst({ where: prevFilter("TLS_INFO"), orderBy: { createdAt: "desc" }, select: { dataJson: true } }),
        prisma.scanCheckResult.findFirst({ where: prevFilter("HTTP_HEALTH"), orderBy: { createdAt: "desc" }, select: { dataJson: true } }),
    ]);

    // --------------------
    // Process findings
    // --------------------
    await processPortFindings(prisma, { asset, scanRunId, portsResult, prevPortsSnap });
    await processTlsFindings(prisma, { asset, scanRunId, tlsResult, prevTlsSnap });
    await processHttpFindings(prisma, { asset, scanRunId, health, prevHttpSnap });
    if (isDomain) {
        await processSecurityHeaderFindings(prisma, { asset, scanRunId, headersResult });
    }

    // --------------------
    // AI analysis — enrich active findings with risk scores and recommendations
    // --------------------
    const activeFindings = await prisma.finding.findMany({
        where: { scanRunId, resolvedAt: null },
        select: { id: true, key: true, type: true, severity: true, dataJson: true },
    });

    if (activeFindings.length > 0) {
        log("ai analyze", { count: activeFindings.length });
        const aiResults = await analyzeFindings(asset, activeFindings);

        if (aiResults.length > 0) {
            const resultMap = new Map(aiResults.map((r) => [r.key, r]));
            await Promise.all(
                activeFindings.map((f) => {
                    const ai = resultMap.get(f.key);
                    if (!ai) return Promise.resolve();
                    return prisma.finding.update({
                        where: { id: f.id },
                        data: { aiScore: ai.aiScore, aiWhyJson: ai.aiWhyJson },
                    });
                }),
            );
            log("ai enriched", { updated: aiResults.length });
        }
    }

    // --------------------
    // Finish
    // --------------------
    await prisma.scanRun.update({ where: { id: scanRunId }, data: { status: "DONE", finishedAt: new Date() } });
    log("done", { scanRunId, assetId });
    return { ok: true, scanRunId };
}

// --------------------
// Worker
// --------------------
const worker = new Worker("scan", async (job) => {
    if (job.name !== "scan.run") {
        log("unknown job name, skipping", { name: job.name, jobId: job.id });
        return { ok: false, reason: "UNKNOWN_JOB_NAME" };
    }

    const { scanRunId } = job.data;
    try {
        return await runScan(job);
    } catch (err) {
        try {
            await prisma.scanRun.update({ where: { id: scanRunId }, data: { status: "FAILED", finishedAt: new Date() } });
        } catch (updateErr) {
            log("scanRun status update failed", { scanRunId, error: updateErr?.message });
        }
        log("scanRun FAILED", { scanRunId, error: err?.message });
        throw err;
    }
}, { connection });

worker.on("completed", (job) => log("completed", { jobId: job.id }));
worker.on("failed", (job, err) => log("failed", { jobId: job?.id, error: err?.message }));

async function gracefulShutdown(signal) {
    log(`${signal} received, shutting down...`);
    try { await worker.close(); } catch { }
    try { await prisma.$disconnect(); } finally { process.exit(0); }
}

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
