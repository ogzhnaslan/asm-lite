const net = require("node:net");
const { DEFAULT_PORTS } = require("../config/constants");

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
        socket.once("connect", () => finish({ port, open: true, latencyMs: Date.now() - started, error: null }));
        socket.once("timeout", () => finish({ port, open: false, latencyMs: null, error: "TIMEOUT" }));
        socket.once("error", (err) => finish({ port, open: false, latencyMs: null, error: err?.code || err?.message || "CONNECTION_ERROR" }));
        socket.connect(port, host);
    });
}

async function checkPorts(host, ports = DEFAULT_PORTS) {
    const results = await Promise.all(ports.map((port) => checkSinglePort(host, port)));
    return {
        checkedPorts: ports,
        results,
        openPorts: results.filter((r) => r.open).map((r) => r.port),
    };
}

module.exports = { checkPorts };
