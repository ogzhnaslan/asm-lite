const { upsertFinding, resolveFinding } = require("../utils/finding");
const { RISKY_PORTS, CRITICAL_PORTS } = require("../config/constants");
const { forPortExposed, forPortChange } = require("../utils/recommendations");
const { log } = require("../utils/logger");
const { FindingTypes } = require("@asm/shared");

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
        const rec = forPortExposed(riskyPorts);

        await upsertFinding(prisma, {
            assetId: asset.id, scanRunId, key,
            type: FindingTypes.PORT_EXPOSED, severity, aiScore,
            dataJson: { openPorts: portsResult.openPorts, riskyPorts, results: portsResult.results },
            aiWhyJson: { ...rec, signals: { openPorts: portsResult.openPorts, riskyPorts } },
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
    const rec = forPortChange(newlyOpened, newlyClosed);

    await upsertFinding(prisma, {
        assetId: asset.id, scanRunId, key,
        type: FindingTypes.PORT_CHANGE, severity, aiScore,
        dataJson: { prevOpenPorts, currOpenPorts, newlyOpened, newlyClosed },
        aiWhyJson: { ...rec, signals: { prevOpenPorts, currOpenPorts, newlyOpened, newlyClosed } },
    });
    log("port change upserted", { key, severity, newlyOpened, newlyClosed });
}

module.exports = { processPortFindings };
