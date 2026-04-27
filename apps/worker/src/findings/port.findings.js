const { upsertFinding, resolveFinding } = require("../utils/finding");
const { RISKY_PORTS, CRITICAL_PORTS } = require("../config/constants");
const { log } = require("../utils/logger");

async function processPortFindings(prisma, { asset, scanRunId, portsResult, prevPortsSnap }) {
    await _processExposed(prisma, { asset, scanRunId, portsResult });
    await _processChange(prisma, { asset, scanRunId, portsResult, prevPortsSnap });
}

async function _processExposed(prisma, { asset, scanRunId, portsResult }) {
    const riskyPorts = portsResult.openPorts.filter((p) => RISKY_PORTS.includes(p));
    const key = `PORT_EXPOSED:${asset.value}`;

    if (riskyPorts.length > 0) {
        const severity = riskyPorts.some((p) => CRITICAL_PORTS.includes(p)) ? "CRITICAL" : "HIGH";
        const aiScore = severity === "CRITICAL" ? 95 : 85;
        const dataJson = { openPorts: portsResult.openPorts, riskyPorts, results: portsResult.results };
        await upsertFinding(prisma, {
            assetId: asset.id, scanRunId, key,
            type: "PORT_EXPOSED", severity, dataJson, aiScore,
            aiWhyJson: {
                reasons: [`Riskli açık portlar tespit edildi: ${riskyPorts.join(", ")}`],
                signals: { openPorts: portsResult.openPorts, riskyPorts },
            },
        });
        log("port exposed upserted", { key, severity, riskyPorts });
    } else {
        await resolveFinding(prisma, { assetId: asset.id, key });
        log("port exposed resolved", { key });
    }
}

async function _processChange(prisma, { asset, scanRunId, portsResult, prevPortsSnap }) {
    if (!prevPortsSnap?.dataJson) return;

    const prevOpenPorts = Array.isArray(prevPortsSnap.dataJson.openPorts) ? prevPortsSnap.dataJson.openPorts : [];
    const currOpenPorts = portsResult.openPorts;

    const newlyOpened = currOpenPorts.filter((p) => !prevOpenPorts.includes(p));
    const newlyClosed = prevOpenPorts.filter((p) => !currOpenPorts.includes(p));

    if (newlyOpened.length === 0 && newlyClosed.length === 0) return;

    const key = `PORT_CHANGE:${asset.value}`;
    const severity =
        newlyOpened.some((p) => CRITICAL_PORTS.includes(p)) ? "CRITICAL" :
        newlyOpened.some((p) => RISKY_PORTS.includes(p)) ? "HIGH" : "MEDIUM";
    const aiScore = severity === "CRITICAL" ? 95 : severity === "HIGH" ? 85 : 70;
    const dataJson = { prevOpenPorts, currOpenPorts, newlyOpened, newlyClosed };

    await upsertFinding(prisma, {
        assetId: asset.id, scanRunId, key,
        type: "PORT_CHANGE", severity, dataJson, aiScore,
        aiWhyJson: {
            reasons: [
                newlyOpened.length > 0 ? `Yeni açılan portlar: ${newlyOpened.join(", ")}` : "Yeni açılan port yok",
                newlyClosed.length > 0 ? `Kapanan portlar: ${newlyClosed.join(", ")}` : "Kapanan port yok",
            ],
            signals: dataJson,
        },
    });
    log("port change upserted", { key, severity, newlyOpened, newlyClosed });
}

module.exports = { processPortFindings };
