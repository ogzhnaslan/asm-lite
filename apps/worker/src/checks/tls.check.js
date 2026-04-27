const tls = require("node:tls");

function checkTls(host, port = 443, timeoutMs = 5000) {
    return new Promise((resolve) => {
        const started = Date.now();
        const socket = tls.connect({ host, port, servername: host, rejectUnauthorized: false });
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
                    return finish({ ok: false, host, port, error: "NO_CERTIFICATE" });
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
                finish({ ok: false, host, port, error: err?.message || "TLS_CERT_READ_FAILED" });
            }
        });

        socket.once("timeout", () => finish({ ok: false, host, port, error: "TLS_TIMEOUT" }));
        socket.once("error", (err) => finish({ ok: false, host, port, error: err?.code || err?.message || "TLS_CONNECTION_FAILED" }));
    });
}

module.exports = { checkTls };
