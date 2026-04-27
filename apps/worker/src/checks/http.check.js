async function checkHttp(assetValue) {
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

    const first = await attempt(`https://${assetValue}`);
    if (first.ok) {
        return { url: first.url, statusCode: first.statusCode, latencyMs: first.latencyMs };
    }

    const second = await attempt(`http://${assetValue}`);
    if (second.ok) {
        return { url: second.url, statusCode: second.statusCode, latencyMs: second.latencyMs };
    }

    return {
        url: second.url,
        statusCode: null,
        latencyMs: null,
        error: "HTTP request failed",
        attempts: [first, second],
    };
}

module.exports = { checkHttp };
