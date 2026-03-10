require("dotenv").config();

console.log("[worker] VERSION: http-fallback-attempts-v2");

const dns = require("node:dns");
dns.setDefaultResultOrder("ipv4first");

const { Worker } = require("bullmq");
const IORedis = require("ioredis");

const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

console.log("[worker] DATABASE_URL var mı?", !!process.env.DATABASE_URL);

const connection = new IORedis({
    host: process.env.REDIS_HOST || "localhost",
    port: Number(process.env.REDIS_PORT || 6380),
    maxRetriesPerRequest: null,
});

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

prisma
    .$queryRaw`SELECT 1`
    .then(() => console.log("[worker] DB ok: SELECT 1"))
    .catch((e) => console.log("[worker] DB hata:", e?.message || e));

console.log("[worker] listening queue: scan");

const worker = new Worker(
    "scan",
    async (job) => {
        console.log("[worker] job:", job.name, job.data);

        const { scanRunId, assetId } = job.data;

        try {
            // (opsiyonel) scan run'u "hala çalışıyor" diye güncelle (profesyonel log)
            await prisma.scanRun.update({
                where: { id: scanRunId },
                data: { status: "RUNNING" },
            });

            // --------------------
            // Asset load + verified check
            // --------------------
            const asset = await prisma.asset.findUnique({
                where: { id: assetId },
                select: { id: true, status: true, type: true, value: true },
            });

            if (!asset) {
                await prisma.scanRun.update({
                    where: { id: scanRunId },
                    data: { status: "FAILED", finishedAt: new Date() },
                });
                console.log("[worker] asset not found -> FAILED", assetId);
                return { ok: false, reason: "ASSET_NOT_FOUND", scanRunId };
            }

            if (asset.status !== "VERIFIED") {
                await prisma.scanRun.update({
                    where: { id: scanRunId },
                    data: { status: "FAILED", finishedAt: new Date() },
                });
                console.log("[worker] asset not verified -> FAILED", assetId, asset.status);
                return { ok: false, reason: "ASSET_NOT_VERIFIED", scanRunId };
            }

            console.log("[worker] asset loaded:", {
                assetId: asset.id,
                value: asset.value,
                type: asset.type,
            });

            // --------------------
            // HTTP HEALTH CHECK (https -> http fallback) + timeout + attempts debug
            // --------------------
            const attempt = async (url) => {
                const started = Date.now();
                const controller = new AbortController();
                const timer = setTimeout(() => controller.abort(), 5000);

                try {
                    const res = await fetch(url, { method: "GET", signal: controller.signal });
                    return { ok: true, url, statusCode: res.status, latencyMs: Date.now() - started };
                } catch (e) {
                    return { ok: false, url, error: e?.cause?.message || e?.message || String(e) };
                } finally {
                    clearTimeout(timer);
                }
            };

            const attempts = [];
            attempts.push(await attempt(`https://${asset.value}`));

            let health;
            if (attempts[0].ok) {
                health = {
                    url: attempts[0].url,
                    statusCode: attempts[0].statusCode,
                    latencyMs: attempts[0].latencyMs,
                };
            } else {
                attempts.push(await attempt(`http://${asset.value}`));

                if (attempts[1].ok) {
                    health = {
                        url: attempts[1].url,
                        statusCode: attempts[1].statusCode,
                        latencyMs: attempts[1].latencyMs,
                    };
                } else {
                    health = {
                        url: attempts[1].url, // son denenen http
                        statusCode: null,
                        latencyMs: null,
                        error: "HTTP request failed",
                        attempts,
                    };
                }
            }

            console.log("[worker] http health:", health);

            // --------------------
            // Snapshot: HTTP_HEALTH
            // --------------------
            await prisma.scanCheckResult.create({
                data: {
                    scanRunId,
                    type: "HTTP_HEALTH",
                    dataJson: health,
                },
            });

            // --------------------
            // HTTP CHANGE DETECTION (Diff) -> HTTP_CHANGE finding (TEK BLOK)
            // --------------------
            const prevHttpSnap = await prisma.scanCheckResult.findFirst({
                where: {
                    type: "HTTP_HEALTH",
                    scanRun: {
                        assetId: asset.id,
                        status: "DONE",
                        id: { not: scanRunId },
                    },
                },
                orderBy: { createdAt: "desc" },
                select: { dataJson: true },
            });

            if (prevHttpSnap) {
                const prev = prevHttpSnap.dataJson || {};
                const curr = health || {};

                const prevStatus = prev.statusCode ?? null;
                const currStatus = curr.statusCode ?? null;

                const prevLatency = prev.latencyMs ?? null;
                const currLatency = curr.latencyMs ?? null;

                const statusChanged = prevStatus !== currStatus;

                const latencySpike =
                    typeof prevLatency === "number" &&
                    typeof currLatency === "number" &&
                    currLatency - prevLatency >= 300;

                if (statusChanged || latencySpike) {
                    const key = `HTTP_CHANGE:${asset.value}`;

                    const severity =
                        currStatus === null
                            ? "CRITICAL"
                            : typeof currStatus === "number" && currStatus >= 500
                                ? "HIGH"
                                : latencySpike
                                    ? "MEDIUM"
                                    : "LOW";

                    const aiScore =
                        severity === "CRITICAL"
                            ? 95
                            : severity === "HIGH"
                                ? 85
                                : severity === "MEDIUM"
                                    ? 70
                                    : 30;

                    const aiWhyJson = {
                        reasons: [
                            statusChanged ? `HTTP status changed: ${prevStatus} -> ${currStatus}` : "HTTP status unchanged",
                            latencySpike ? `Latency spike: ${prevLatency}ms -> ${currLatency}ms` : "No latency spike",
                        ],
                        signals: { prev, curr },
                    };

                    const existing = await prisma.finding.findFirst({
                        where: { assetId: asset.id, key },
                        select: { id: true },
                    });

                    const dataJson = {
                        prevStatus,
                        currStatus,
                        prevLatency,
                        currLatency,
                        statusChanged,
                        latencySpike,
                    };

                    if (existing) {
                        await prisma.finding.update({
                            where: { id: existing.id },
                            data: {
                                scanRunId,
                                type: "HTTP_CHANGE",
                                severity,
                                dataJson,
                                aiScore,
                                aiWhyJson,
                                isNew: false,
                                lastSeenAt: new Date(),
                            },
                        });
                    } else {
                        await prisma.finding.create({
                            data: {
                                assetId: asset.id,
                                scanRunId,
                                type: "HTTP_CHANGE",
                                key,
                                severity,
                                dataJson,
                                aiScore,
                                aiWhyJson,
                                isNew: true,
                                lastSeenAt: new Date(),
                            },
                        });
                    }

                    console.log("[worker] http change finding upserted:", { key, severity, aiScore });
                }
            }

            // --------------------
            // HTTP_HEALTH FINDING (500/timeout)
            // --------------------
            const shouldCreateFinding =
                health.statusCode === null ||
                (typeof health.statusCode === "number" && health.statusCode >= 500);

            if (shouldCreateFinding) {
                const severity =
                    health.statusCode === null ? "CRITICAL" : health.statusCode >= 500 ? "HIGH" : "LOW";

                const key = `HTTP_HEALTH:${asset.value}`;
                const aiScore = health.statusCode === null ? 95 : health.statusCode >= 500 ? 85 : 20;

                const aiWhyJson = {
                    reasons:
                        health.statusCode === null
                            ? ["HTTP request failed (timeout/DNS/connection)"]
                            : [`HTTP status ${health.statusCode}`],
                    signals: health,
                };

                const existing = await prisma.finding.findFirst({
                    where: { assetId: asset.id, key },
                    select: { id: true },
                });

                if (existing) {
                    await prisma.finding.update({
                        where: { id: existing.id },
                        data: {
                            scanRunId,
                            type: "HTTP_HEALTH",
                            severity,
                            dataJson: health,
                            aiScore,
                            aiWhyJson,
                            isNew: false,
                            lastSeenAt: new Date(),
                        },
                    });
                } else {
                    await prisma.finding.create({
                        data: {
                            assetId: asset.id,
                            scanRunId,
                            type: "HTTP_HEALTH",
                            key,
                            severity,
                            dataJson: health,
                            aiScore,
                            aiWhyJson,
                            isNew: true,
                            lastSeenAt: new Date(),
                        },
                    });
                }

                console.log("[worker] finding upserted:", { type: "HTTP_HEALTH", key, severity, aiScore });
            }

            // --------------------
            // HTTP_HEALTH RESOLVE (düzeldiyse kapat)
            // --------------------
            const isHealthy = typeof health.statusCode === "number" && health.statusCode < 500;

            if (isHealthy) {
                const key = `HTTP_HEALTH:${asset.value}`;

                const existing = await prisma.finding.findFirst({
                    where: { assetId: asset.id, key },
                    select: { id: true, resolvedAt: true },
                });

                if (existing && !existing.resolvedAt) {
                    await prisma.finding.update({
                        where: { id: existing.id },
                        data: {
                            resolvedAt: new Date(),
                            lastSeenAt: new Date(),
                        },
                    });

                    console.log("[worker] finding resolved:", { key });
                }
            }

            // --------------------
            // Finish scan
            // --------------------
            await prisma.scanRun.update({
                where: { id: scanRunId },
                data: { status: "DONE", finishedAt: new Date() },
            });

            console.log("[worker] scanRun DONE:", scanRunId, "asset:", assetId);
            return { ok: true, scanRunId };
        } catch (err) {
            const msg = err?.message || String(err);

            try {
                await prisma.scanRun.update({
                    where: { id: scanRunId },
                    data: { status: "FAILED", finishedAt: new Date() },
                });
            } catch { }

            console.log("[worker] scanRun FAILED:", scanRunId, msg);
            throw err;
        }
    },
    { connection }
);

// Worker event logları (debug)
worker.on("completed", (job) => {
    console.log("[worker] completed job:", job.id);
});
worker.on("failed", (job, err) => {
    console.log("[worker] failed job:", job?.id, err?.message || err);
});

process.on("SIGINT", async () => {
    console.log("[worker] shutting down...");
    try {
        await prisma.$disconnect();
    } finally {
        process.exit(0);
    }
});