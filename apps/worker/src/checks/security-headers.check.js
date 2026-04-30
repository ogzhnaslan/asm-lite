const REQUIRED_HEADERS = [
    {
        name: "Content-Security-Policy",
        short: "CSP",
        severity: "HIGH",
        aiScore: 75,
        risk: "Without CSP the site is more vulnerable to XSS attacks",
        impact: "Attackers can inject and execute malicious scripts in users' browsers",
        recommendation: "Add a restrictive Content-Security-Policy header",
    },
    {
        name: "Strict-Transport-Security",
        short: "HSTS",
        severity: "HIGH",
        aiScore: 75,
        risk: "Without HSTS users can be silently downgraded from HTTPS to HTTP",
        impact: "Man-in-the-middle attackers can intercept or modify traffic",
        recommendation: "Add Strict-Transport-Security: max-age=31536000; includeSubDomains",
    },
    {
        name: "X-Frame-Options",
        short: "XFO",
        severity: "MEDIUM",
        aiScore: 50,
        risk: "Without X-Frame-Options the page can be embedded in a hidden iframe",
        impact: "Clickjacking attacks can trick users into unintended actions",
        recommendation: "Add X-Frame-Options: DENY or SAMEORIGIN",
    },
    {
        name: "X-Content-Type-Options",
        short: "XCTO",
        severity: "MEDIUM",
        aiScore: 50,
        risk: "Without X-Content-Type-Options browsers may MIME-sniff responses",
        impact: "Non-script files may be interpreted and executed as scripts",
        recommendation: "Add X-Content-Type-Options: nosniff",
    },
    {
        name: "Referrer-Policy",
        short: "RP",
        severity: "LOW",
        aiScore: 25,
        risk: "Without Referrer-Policy sensitive URL data may leak to third parties",
        impact: "URL paths containing tokens or IDs can be exposed via Referer headers",
        recommendation: "Add Referrer-Policy: strict-origin-when-cross-origin",
    },
    {
        name: "Permissions-Policy",
        short: "PP",
        severity: "LOW",
        aiScore: 25,
        risk: "Without Permissions-Policy browser features are not restricted",
        impact: "Malicious scripts may silently access camera, microphone, or geolocation APIs",
        recommendation: "Add Permissions-Policy to restrict browser feature access",
    },
];

async function checkSecurityHeaders(assetValue) {
    const urls = [`https://${assetValue}`, `http://${assetValue}`];
    let rawHeaders = null;
    let checkedUrl = null;

    for (const url of urls) {
        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 8000);
            const res = await fetch(url, {
                method: "HEAD",
                signal: controller.signal,
                redirect: "follow",
            });
            clearTimeout(timer);
            rawHeaders = Object.fromEntries(
                [...res.headers.entries()].map(([k, v]) => [k.toLowerCase(), v])
            );
            checkedUrl = url;
            break;
        } catch {
            continue;
        }
    }

    if (!rawHeaders) {
        return { ok: false, checkedUrl: null, error: "Could not reach asset", headers: {}, missing: [], missingDetails: [], present: [] };
    }

    const missing = REQUIRED_HEADERS.filter((h) => !rawHeaders[h.name.toLowerCase()]);
    const present = REQUIRED_HEADERS
        .filter((h) => !!rawHeaders[h.name.toLowerCase()])
        .map((h) => ({ name: h.name, short: h.short, value: rawHeaders[h.name.toLowerCase()] }));

    return {
        ok: true,
        checkedUrl,
        headers: rawHeaders,
        missing: missing.map((h) => h.short),
        missingDetails: missing,
        present,
    };
}

module.exports = { checkSecurityHeaders, REQUIRED_HEADERS };
