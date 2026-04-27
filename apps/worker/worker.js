require("dotenv").config();

console.log("[worker] VERSION: http-fallback-attempts-v2");

const dns = require("node:dns");
dns.setDefaultResultOrder("ipv4first");

const net = require("node:net");
const tls = require("node:tls");

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

// --------------------
// PORTS CHECK HELPERS
// --------------------
const DEFAULT_PORTS = [80, 443, 22, 3389, 8080, 8443, 3000, 5555];

function checkSinglePort(host, port, timeoutMs = 1500) {
    return new Promise((resolve) => {
        const started = Date.now();
        const socket = new net.Socket();

        let settled = false;

        const finish = (result) => {
            if (settled) return;
            settled = true;
            socket.destroy();
            resolve(result);
        };

        socket.setTimeout(timeoutMs);

        socket.once("connect", () => {
            finish({
                port,
                open: true,
                latencyMs: Date.now() - started,
                error: null,
            });
        });

        socket.once("timeout", () => {
            finish({
                port,
                open: false,
                latencyMs: null,
                error: "TIMEOUT",
            });
        });

        socket.once("error", (err) => {
            finish({
                port,
                open: false,
                latencyMs: null,
                error: err?.code || err?.message || "CONNECTION_ERROR",
            });
        });

        socket.connect(port, host);
    });
}

async function checkPorts(host, ports = DEFAULT_PORTS) {
    const results = [];

    for (const port of ports) {
        const result = await checkSinglePort(host, port);
        results.push(result);
    }

    return {
        checkedPorts: ports,
        results,
        openPorts: results.filter((x) => x.open).map((x) => x.port),
    };
}

function checkTls(host, port = 443, timeoutMs = 5000) {
    return new Promise((resolve) => {
        const started = Date.now();

        const socket = tls.connect({
            host,
            port,
            servername: host,
            rejectUnauthorized: false,
        });

        let settled = false;

        const finish = (result) => {
            if (settled) return;
            settled = true;
            socket.destroy();
            resolve(result);
        };

        socket.setTimeout(timeoutMs);

        socket.once("secureConnect", () => {
            try {
                const cert = socket.getPeerCertificate(true);

                if (!cert || !Object.keys(cert).length) {
                    finish({
                        ok: false,
                        host,
                        port,
                        error: "NO_CERTIFICATE",
                    });
                    return;
                }

                const validTo = cert.valid_to ? new Date(cert.valid_to) : null;
                const daysLeft = validTo
                    ? Math.floor((validTo.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                    : null;

                finish({
                    ok: true,
                    host,
                    port,
                    latencyMs: Date.now() - started,
                    validTo: validTo ? validTo.toISOString() : null,
                    daysLeft,
                    issuer: cert.issuer || null,
                    subject: cert.subject || null,
                    serialNumber: cert.serialNumber || null,
                    fingerprint256: cert.fingerprint256 || null,
                });
            } catch (err) {
                finish({
                    ok: false,
                    host,
                    port,
                    error: err?.message || "TLS_CERT_READ_FAILED",
                });
            }
        });

        socket.once("timeout", () => {
            finish({
                ok: false,
                host,
                port,
                error: "TLS_TIMEOUT",
            });
        });

        socket.once("error", (err) => {
            finish({
                ok: false,
                host,
                port,
                error: err?.code || err?.message || "TLS_CONNECTION_FAILED",
            });
        });
    });
}

const worker = new Worker(
    "scan",
    async (job) => {
        console.log("[worker] job:", job.name, job.data);

        const { scanRunId, assetId } = job.data;

        try {
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

            const hostForPorts = asset.value.split(":")[0];

            // --------------------
            // PORTS CHECK
            // --------------------
            const portsResult = await checkPorts(hostForPorts);
            console.log("[worker] ports:", portsResult);

            // --------------------
            // TLS CHECK + SNAPSHOT
            // --------------------
            const tlsResult = await checkTls(hostForPorts);
            console.log("[worker] tls:", tlsResult);

            await prisma.scanCheckResult.create({
                data: {
                    scanRunId,
                    type: "TLS_INFO",
                    dataJson: tlsResult,
                },
            });

            // --------------------
            // TLS_CHECK finding
            // --------------------
            if (!tlsResult.ok) {
                const key = `TLS_CHECK:${asset.value}`;
                const severity = "HIGH";
                const aiScore = 85;

                const aiWhyJson = {
                    reasons: [`TLS check failed: ${tlsResult.error}`],
                    signals: tlsResult,
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
                            type: "TLS_CHECK",
                            severity,
                            dataJson: tlsResult,
                            aiScore,
                            aiWhyJson,
                            isNew: false,
                            lastSeenAt: new Date(),
                            resolvedAt: null,
                        },
                    });
                } else {
                    await prisma.finding.create({
                        data: {
                            assetId: asset.id,
                            scanRunId,
                            type: "TLS_CHECK",
                            key,
                            severity,
                            dataJson: tlsResult,
                            aiScore,
                            aiWhyJson,
                            isNew: true,
                            lastSeenAt: new Date(),
                        },
                    });
                }

                console.log("[worker] tls finding upserted:", {
                    key,
                    severity,
                    aiScore,
                    error: tlsResult.error,
                });
            }

            // --------------------
            // TLS_CHECK resolve
            // --------------------
            if (tlsResult.ok) {
                const key = `TLS_CHECK:${asset.value}`;

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

                    console.log("[worker] tls finding resolved:", { key });
                }
            }

            // --------------------
            // TLS_EXPIRY finding
            // --------------------
            if (tlsResult.ok && typeof tlsResult.daysLeft === "number" && tlsResult.daysLeft <= 30) {
                const key = `TLS_EXPIRY:${asset.value}`;
                const severity = tlsResult.daysLeft <= 7 ? "CRITICAL" : "HIGH";
                const aiScore = tlsResult.daysLeft <= 7 ? 95 : 85;

                const dataJson = {
                    host: tlsResult.host,
                    port: tlsResult.port,
                    validTo: tlsResult.validTo,
                    daysLeft: tlsResult.daysLeft,
                    issuer: tlsResult.issuer,
                    subject: tlsResult.subject,
                    serialNumber: tlsResult.serialNumber,
                    fingerprint256: tlsResult.fingerprint256,
                };

                const aiWhyJson = {
                    reasons: [`TLS certificate expires in ${tlsResult.daysLeft} day(s)`],
                    signals: dataJson,
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
                            type: "TLS_EXPIRY",
                            severity,
                            dataJson,
                            aiScore,
                            aiWhyJson,
                            isNew: false,
                            lastSeenAt: new Date(),
                            resolvedAt: null,
                        },
                    });
                } else {
                    await prisma.finding.create({
                        data: {
                            assetId: asset.id,
                            scanRunId,
                            type: "TLS_EXPIRY",
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

                console.log("[worker] tls expiry finding upserted:", {
                    key,
                    severity,
                    aiScore,
                    daysLeft: tlsResult.daysLeft,
                });
            }

            // --------------------
            // TLS_EXPIRY resolve
            // --------------------
            if (tlsResult.ok && typeof tlsResult.daysLeft === "number" && tlsResult.daysLeft > 30) {
                const key = `TLS_EXPIRY:${asset.value}`;

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

                    console.log("[worker] tls expiry finding resolved:", {
                        key,
                        daysLeft: tlsResult.daysLeft,
                    });
                }
            }

            // --------------------
            // TLS_CHANGE detection + resolve
            // --------------------
            const prevTlsSnap = await prisma.scanCheckResult.findFirst({
                where: {
                    type: "TLS_INFO",
                    scanRun: {
                        assetId: asset.id,
                        status: "DONE",
                        id: { not: scanRunId },
                    },
                },
                orderBy: { createdAt: "desc" },
                select: { dataJson: true },
            });

            if (prevTlsSnap && prevTlsSnap.dataJson && tlsResult.ok) {
                const prev = prevTlsSnap.dataJson || {};
                const curr = tlsResult || {};

                const fingerprintChanged =
                    (prev.fingerprint256 || null) !== (curr.fingerprint256 || null);

                const serialChanged =
                    (prev.serialNumber || null) !== (curr.serialNumber || null);

                const issuerChanged =
                    JSON.stringify(prev.issuer || null) !== JSON.stringify(curr.issuer || null);

                const subjectChanged =
                    JSON.stringify(prev.subject || null) !== JSON.stringify(curr.subject || null);

                const hasTlsChange =
                    fingerprintChanged ||
                    serialChanged ||
                    issuerChanged ||
                    subjectChanged;

                if (hasTlsChange) {
                    const key = `TLS_CHANGE:${asset.value}`;
                    const severity =
                        fingerprintChanged || serialChanged ? "HIGH" : "MEDIUM";
                    const aiScore = severity === "HIGH" ? 85 : 70;

                    const dataJson = {
                        previous: {
                            fingerprint256: prev.fingerprint256 || null,
                            serialNumber: prev.serialNumber || null,
                            issuer: prev.issuer || null,
                            subject: prev.subject || null,
                        },
                        current: {
                            fingerprint256: curr.fingerprint256 || null,
                            serialNumber: curr.serialNumber || null,
                            issuer: curr.issuer || null,
                            subject: curr.subject || null,
                        },
                        fingerprintChanged,
                        serialChanged,
                        issuerChanged,
                        subjectChanged,
                    };

                    const reasons = [];
                    if (fingerprintChanged) reasons.push("TLS fingerprint changed");
                    if (serialChanged) reasons.push("TLS serial number changed");
                    if (issuerChanged) reasons.push("TLS issuer changed");
                    if (subjectChanged) reasons.push("TLS subject changed");

                    const aiWhyJson = {
                        reasons,
                        signals: dataJson,
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
                                type: "TLS_CHANGE",
                                severity,
                                dataJson,
                                aiScore,
                                aiWhyJson,
                                isNew: false,
                                lastSeenAt: new Date(),
                                resolvedAt: null,
                            },
                        });
                    } else {
                        await prisma.finding.create({
                            data: {
                                assetId: asset.id,
                                scanRunId,
                                type: "TLS_CHANGE",
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

                    console.log("[worker] tls change finding upserted:", {
                        key,
                        severity,
                        aiScore,
                        fingerprintChanged,
                        serialChanged,
                        issuerChanged,
                        subjectChanged,
                    });
                } else {
                    const key = `TLS_CHANGE:${asset.value}`;

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

                        console.log("[worker] tls change finding resolved:", { key });
                    }
                }
            }

            // --------------------
            // PORTS snapshot
            // --------------------
            await prisma.scanCheckResult.create({
                data: {
                    scanRunId,
                    type: "PORTS",
                    dataJson: portsResult,
                },
            });

            // --------------------
            // PORT CHANGE DETECTION -> PORT_CHANGE finding
            // --------------------
            const prevPortsSnap = await prisma.scanCheckResult.findFirst({
                where: {
                    type: "PORTS",
                    scanRun: {
                        assetId: asset.id,
                        status: "DONE",
                        id: { not: scanRunId },
                    },
                },
                orderBy: { createdAt: "desc" },
                select: { dataJson: true },
            });

            if (prevPortsSnap) {
                const prev = prevPortsSnap.dataJson || {};
                const prevOpenPorts = Array.isArray(prev.openPorts) ? prev.openPorts : [];
                const currOpenPorts = Array.isArray(portsResult.openPorts) ? portsResult.openPorts : [];

                const newlyOpened = currOpenPorts.filter((port) => !prevOpenPorts.includes(port));
                const newlyClosed = prevOpenPorts.filter((port) => !currOpenPorts.includes(port));

                if (newlyOpened.length > 0 || newlyClosed.length > 0) {
                    const key = `PORT_CHANGE:${asset.value}`;

                    const severity =
                        newlyOpened.includes(22) || newlyOpened.includes(3389)
                            ? "CRITICAL"
                            : newlyOpened.some((port) => [8080, 8443, 3000].includes(port))
                                ? "HIGH"
                                : "MEDIUM";

                    const aiScore =
                        severity === "CRITICAL"
                            ? 95
                            : severity === "HIGH"
                                ? 85
                                : 70;

                    const dataJson = {
                        prevOpenPorts,
                        currOpenPorts,
                        newlyOpened,
                        newlyClosed,
                    };

                    const aiWhyJson = {
                        reasons: [
                            newlyOpened.length > 0
                                ? `Yeni açılan portlar: ${newlyOpened.join(", ")}`
                                : "Yeni açılan port yok",
                            newlyClosed.length > 0
                                ? `Kapanan portlar: ${newlyClosed.join(", ")}`
                                : "Kapanan port yok",
                        ],
                        signals: dataJson,
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
                                type: "PORT_CHANGE",
                                severity,
                                dataJson,
                                aiScore,
                                aiWhyJson,
                                isNew: false,
                                lastSeenAt: new Date(),
                                resolvedAt: null,
                            },
                        });
                    } else {
                        await prisma.finding.create({
                            data: {
                                assetId: asset.id,
                                scanRunId,
                                type: "PORT_CHANGE",
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

                    console.log("[worker] port change finding upserted:", {
                        key,
                        severity,
                        aiScore,
                        newlyOpened,
                        newlyClosed,
                    });
                }
            }

            // --------------------
            // PORT_EXPOSED finding
            // --------------------
            const riskyPorts = portsResult.openPorts.filter((port) =>
                [22, 3389, 8080, 8443, 3000].includes(port)
            );

            if (riskyPorts.length > 0) {
                const key = `PORT_EXPOSED:${asset.value}`;

                const severity =
                    riskyPorts.includes(22) || riskyPorts.includes(3389)
                        ? "CRITICAL"
                        : "HIGH";

                const aiScore = severity === "CRITICAL" ? 95 : 85;

                const aiWhyJson = {
                    reasons: [`Riskli açık portlar tespit edildi: ${riskyPorts.join(", ")}`],
                    signals: {
                        openPorts: portsResult.openPorts,
                        riskyPorts,
                    },
                };

                const dataJson = {
                    openPorts: portsResult.openPorts,
                    riskyPorts,
                    results: portsResult.results,
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
                            type: "PORT_EXPOSED",
                            severity,
                            dataJson,
                            aiScore,
                            aiWhyJson,
                            isNew: false,
                            lastSeenAt: new Date(),
                            resolvedAt: null,
                        },
                    });
                } else {
                    await prisma.finding.create({
                        data: {
                            assetId: asset.id,
                            scanRunId,
                            type: "PORT_EXPOSED",
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

                console.log("[worker] port finding upserted:", {
                    key,
                    severity,
                    aiScore,
                    riskyPorts,
                });
            }

            // --------------------
            // PORT_EXPOSED resolve
            // --------------------
            if (riskyPorts.length === 0) {
                const key = `PORT_EXPOSED:${asset.value}`;

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

                    console.log("[worker] port finding resolved:", { key });
                }
            }

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
                        url: attempts[1].url,
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
            // HTTP CHANGE DETECTION (Diff) -> HTTP_CHANGE finding
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
                            resolvedAt: null,
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