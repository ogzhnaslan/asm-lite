// Per-port risk advice used by port findings
const PORT_ADVICE = {
    22: {
        name: "SSH",
        impact: "SSH exposed to the internet enables brute-force credential attacks and unauthorized remote access",
        recommendations: [
            "Restrict SSH (22) to specific trusted IP ranges via firewall",
            "Disable password authentication and use SSH key pairs only",
            "Consider relocating SSH to a non-standard port to reduce automated scanning",
            "Enable fail2ban or similar brute-force protection",
        ],
    },
    3389: {
        name: "RDP",
        impact: "RDP exposed directly to the internet is the primary ransomware and lateral movement entry point",
        recommendations: [
            "Place RDP (3389) behind a VPN — never expose it directly to the internet",
            "Enable Network Level Authentication (NLA) on all RDP endpoints",
            "Enforce MFA for all RDP sessions",
            "Disable RDP entirely if remote desktop access is not required",
        ],
    },
    8080: {
        name: "HTTP-ALT",
        impact: "Alternative HTTP port may expose admin panels, internal APIs, or staging environments",
        recommendations: [
            "Verify what service is running on port 8080 and whether it is intentionally public",
            "Restrict access with firewall rules if this is an admin or internal service",
            "Use a reverse proxy and close direct access to application ports",
        ],
    },
    8443: {
        name: "HTTPS-ALT",
        impact: "Alternative HTTPS port may expose unintended or misconfigured services",
        recommendations: [
            "Verify what service is running on port 8443",
            "Restrict access via firewall if this port is not required to be public",
        ],
    },
    3000: {
        name: "DEV-SERVER",
        impact: "Port 3000 typically hosts development servers that are not hardened for production",
        recommendations: [
            "Close port 3000 — development servers should not be internet-facing",
            "Use a production-grade reverse proxy (nginx, Caddy) instead of exposing the dev server",
            "Restrict access to internal networks only via firewall",
        ],
    },
    5555: {
        name: "DEV-SERVER-ALT",
        impact: "Port 5555 may expose a development server or debugging interface",
        recommendations: [
            "Close port 5555 if it is a development or test server",
            "Restrict access to trusted IP ranges only",
        ],
    },
};

function forPortExposed(riskyPorts) {
    const portImpacts = riskyPorts.map((p) => PORT_ADVICE[p]?.impact || `Port ${p} is exposed`);
    const portRecs = riskyPorts.flatMap((p) => PORT_ADVICE[p]?.recommendations || [`Restrict access to port ${p} via firewall`]);

    return {
        summary: `${riskyPorts.length} risky port(s) exposed to the internet`,
        reasons: riskyPorts.map((p) => `Port ${p}${PORT_ADVICE[p] ? ` (${PORT_ADVICE[p].name})` : ""} is open and internet-accessible`),
        impact: portImpacts.join(". "),
        recommendations: [...new Set(portRecs)],
    };
}

function forPortChange(newlyOpened, newlyClosed) {
    const recs = newlyOpened.flatMap((p) => PORT_ADVICE[p]?.recommendations || [`Investigate why port ${p} was opened and restrict if not needed`]);
    return {
        summary: `Port state changed: ${newlyOpened.length} opened, ${newlyClosed.length} closed`,
        reasons: [
            ...(newlyOpened.length > 0 ? [`Newly opened ports: ${newlyOpened.join(", ")}`] : []),
            ...(newlyClosed.length > 0 ? [`Closed ports: ${newlyClosed.join(", ")}`] : []),
        ],
        impact: newlyOpened.length > 0
            ? "Newly opened ports may indicate unauthorized service exposure or misconfiguration"
            : "Port closure may indicate a service going offline",
        recommendations: recs.length > 0 ? [...new Set(recs)] : ["Review the firewall rules and confirm the port change was intentional"],
    };
}

function forHttpHealth(statusCode) {
    if (statusCode === null) {
        return {
            summary: "Asset is completely unreachable over HTTP/HTTPS",
            reasons: ["HTTP request timed out or the host refused the connection"],
            impact: "The service appears to be down; users cannot access it",
            recommendations: [
                "Verify the server is running and listening on the expected port",
                "Check firewall rules to ensure HTTP/HTTPS traffic is allowed",
                "Review application logs for crash or resource exhaustion",
            ],
        };
    }
    return {
        summary: `HTTP server returned error status ${statusCode}`,
        reasons: [`HTTP ${statusCode} response indicates a server-side failure`],
        impact: "Users may be receiving error pages instead of the expected service",
        recommendations: [
            "Check application logs for the root cause of the 5xx error",
            "Verify database connections and upstream dependencies are healthy",
            "Consider alerting and auto-restart policies for production services",
        ],
    };
}

function forHttpChange(prevStatus, currStatus, latencySpike, prevLatency, currLatency) {
    const reasons = [];
    const recommendations = [];

    if (prevStatus !== currStatus) {
        reasons.push(`HTTP status changed from ${prevStatus ?? "unreachable"} to ${currStatus ?? "unreachable"}`);
        if (currStatus === null) {
            recommendations.push("Investigate server availability — the service may have crashed");
        } else if (currStatus >= 500) {
            recommendations.push("Check server logs for the 5xx error root cause");
        } else {
            recommendations.push("Confirm the status change was intentional (e.g. maintenance page)");
        }
    }

    if (latencySpike) {
        reasons.push(`Response latency increased from ${prevLatency}ms to ${currLatency}ms`);
        recommendations.push("Investigate server resource utilization (CPU, memory, I/O)");
        recommendations.push("Check for database query performance issues or upstream API slowdowns");
    }

    return {
        summary: reasons[0] || "HTTP behavior changed",
        reasons,
        impact: currStatus === null
            ? "Service appears down — all users are affected"
            : currStatus >= 500
            ? "Server errors may be intermittently or fully degrading the service"
            : "Latency spike may indicate performance degradation",
        recommendations,
    };
}

function forTlsCheck(error) {
    return {
        summary: `TLS connection failed: ${error}`,
        reasons: [`TLS handshake error: ${error}`],
        impact: "Users will see browser security warnings and may be unable to connect securely",
        recommendations: [
            "Verify the TLS certificate is installed correctly and matches the domain",
            "Ensure the certificate chain is complete (intermediate certificates included)",
            "Check that port 443 is open and the web server is configured for HTTPS",
        ],
    };
}

function forTlsExpiry(daysLeft, validTo) {
    if (daysLeft <= 0) {
        return {
            summary: "TLS certificate has expired",
            reasons: ["Certificate validity period ended"],
            impact: "All users are receiving browser security warnings; HTTPS is effectively broken",
            recommendations: [
                "Renew the TLS certificate immediately",
                "If using Let's Encrypt, run: certbot renew",
                "Investigate why automatic renewal failed",
            ],
        };
    }
    return {
        summary: `TLS certificate expires in ${daysLeft} day(s) (${validTo})`,
        reasons: [`Certificate will expire on ${validTo} — ${daysLeft} day(s) remaining`],
        impact: daysLeft <= 7
            ? "Imminent expiry will cause browser security errors for all users within days"
            : "Certificate expiry is approaching; service disruption will occur if not renewed",
        recommendations: [
            "Renew the TLS certificate before it expires",
            "If using Let's Encrypt, verify certbot timer: systemctl status certbot.timer",
            "Set up expiry monitoring and alerts to prevent future incidents",
        ],
    };
}

function forTlsChange(changes) {
    const changedFields = Object.entries(changes)
        .filter(([k, v]) => k.endsWith("Changed") && v)
        .map(([k]) => k.replace("Changed", ""));

    return {
        summary: `TLS certificate changed: ${changedFields.join(", ")}`,
        reasons: changedFields.map((f) => `TLS ${f} has changed since the last scan`),
        impact: "Unexpected certificate changes may indicate certificate re-issuance, misconfiguration, or a MITM interception",
        recommendations: [
            "Verify this certificate change was intentional (planned renewal or migration)",
            "If not expected, investigate for potential certificate hijacking or misconfiguration",
            "Review certificate transparency logs for unauthorized certificates",
        ],
    };
}

module.exports = {
    forPortExposed,
    forPortChange,
    forHttpHealth,
    forHttpChange,
    forTlsCheck,
    forTlsExpiry,
    forTlsChange,
};
