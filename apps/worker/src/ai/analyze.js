const { log } = require("../utils/logger");

const SYSTEM = `You are a cybersecurity analyst specializing in attack surface monitoring.
You receive a list of security findings for an asset and return a risk assessment for each one.
Always respond with a valid JSON array only — no markdown, no explanation outside the array.`;

// Module-level singleton — avoids re-instantiating the client on every scan
let _anthropicClient = null;

function getAnthropicClient() {
    if (!_anthropicClient) {
        const Anthropic = require("@anthropic-ai/sdk");
        _anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    }
    return _anthropicClient;
}

function buildPrompt(asset, findings) {
    const list = findings.map((f) => ({
        key: f.key,
        type: f.type,
        severity: f.severity,
        data: f.dataJson,
    }));

    return `Asset: ${asset.value} (type: ${asset.type})

Findings to analyze:
${JSON.stringify(list, null, 2)}

Return a JSON array with one object per finding:
[
  {
    "key": "<exact finding key>",
    "aiScore": <integer 0-100, higher = more risk>,
    "aiWhyJson": {
      "summary": "<one sentence>",
      "reasons": ["<why this is risky>"],
      "recommendations": ["<what to do>"],
      "context": "<relevant security context>"
    }
  }
]`;
}

function parseResponse(text) {
    const clean = text.replace(/^```[a-z]*\n?/m, "").replace(/```$/m, "").trim();
    try {
        const results = JSON.parse(clean);
        return Array.isArray(results) ? results : [];
    } catch (err) {
        log("ai parse error", { error: err?.message, preview: clean.slice(0, 200) });
        return [];
    }
}

async function callAnthropic(asset, findings) {
    if (!process.env.ANTHROPIC_API_KEY) {
        log("ai skip: ANTHROPIC_API_KEY not set");
        return [];
    }

    const client = getAnthropicClient();

    const msg = await client.messages.create({
        model: process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001",
        max_tokens: 2048,
        system: SYSTEM,
        messages: [{ role: "user", content: buildPrompt(asset, findings) }],
    });

    return parseResponse(msg.content[0]?.text ?? "");
}

async function callOllama(asset, findings) {
    const host = process.env.OLLAMA_HOST || "http://localhost:11434";
    const model = process.env.OLLAMA_MODEL || "llama3.2";

    const res = await fetch(`${host}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            model,
            stream: false,
            messages: [
                { role: "system", content: SYSTEM },
                { role: "user", content: buildPrompt(asset, findings) },
            ],
        }),
    });

    if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
    const json = await res.json();
    return parseResponse(json.message?.content ?? "");
}

async function analyzeFindings(asset, findings) {
    if (!findings.length) return [];

    const provider = (process.env.AI_PROVIDER || "ollama").toLowerCase();
    log("ai provider", { provider });

    try {
        if (provider === "anthropic") {
            return await callAnthropic(asset, findings);
        }
        return await callOllama(asset, findings);
    } catch (err) {
        log("ai error", { provider, error: err?.message });
        return [];
    }
}

module.exports = { analyzeFindings };
