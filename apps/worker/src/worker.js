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
const { processPortFindings } = require("./findings/port.findings");
const { processTlsFindings } = require("./findings/tls.findings");
const { processHttpFindings } = require("./findings/http.findings");

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

    // --------------------
    // Run all checks in parallel
    // --------------------
    const [portsResult, tlsResult, health] = await Promise.all([
        checkPorts(host),
        checkTls(host),
        checkHttp(asset.value),
    ]);

    log("ports", { open: portsResult.openPorts });
    log("tls", { ok: tlsResult.ok, daysLeft: tlsResult.daysLeft, error: tlsResult.error });
    log("http", { statusCode: health.statusCode, latencyMs: health.latencyMs });

    // --------------------
    // Save snapshots
    // --------------------
    await Promise.all([
        prisma.scanCheckResult.create({ data: { scanRunId, type: "PORTS", dataJson: portsResult } }),
        prisma.scanCheckResult.create({ data: { scanRunId, type: "TLS_INFO", dataJson: tlsResult } }),
        prisma.scanCheckResult.create({ data: { scanRunId, type: "HTTP_HEALTH", dataJson: health } }),
    ]);

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
    const { scanRunId } = job.data;
    try {
        return await runScan(job);
    } catch (err) {
        try {
            await prisma.scanRun.update({ where: { id: scanRunId }, data: { status: "FAILED", finishedAt: new Date() } });
        } catch { }
        log("scanRun FAILED", { scanRunId, error: err?.message });
        throw err;
    }
}, { connection });

worker.on("completed", (job) => log("completed", { jobId: job.id }));
worker.on("failed", (job, err) => log("failed", { jobId: job?.id, error: err?.message }));

process.on("SIGINT", async () => {
    log("shutting down...");
    try { await prisma.$disconnect(); } finally { process.exit(0); }
});
