const Anthropic = require("@anthropic-ai/sdk");
const { log } = require("../utils/logger");

const SYSTEM = `You are a cybersecurity analyst specializing in attack surface monitoring.
You receive a list of security findings for an asset and return a risk assessment for each one.
Always respond with a valid JSON array only — no markdown, no explanation outside the array.`;

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
    "aiScore": <integer 0–100, higher = more risk>,
    "aiWhyJson": {
      "summary": "<one sentence>",
      "reasons": ["<why this is risky>", ...],
      "recommendations": ["<what to do>", ...],
      "context": "<any relevant security context>"
    }
  }
]`;
}

async function analyzeFindings(asset, findings) {
    if (!findings.length) return [];

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        log("ai skip: ANTHROPIC_API_KEY not set");
        return [];
    }

    const client = new Anthropic({ apiKey });

    let text;
    try {
        const msg = await client.messages.create({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 2048,
            system: SYSTEM,
            messages: [{ role: "user", content: buildPrompt(asset, findings) }],
        });
        text = msg.content[0]?.text ?? "";
    } catch (err) {
        log("ai api error", { error: err?.message });
        return [];
    }

    try {
        // Strip accidental markdown fences if present
        const clean = text.replace(/^```[a-z]*\n?/m, "").replace(/```$/m, "").trim();
        const results = JSON.parse(clean);
        if (!Array.isArray(results)) return [];
        return results;
    } catch (err) {
        log("ai parse error", { error: err?.message, text });
        return [];
    }
}

module.exports = { analyzeFindings };
