import Anthropic from '@anthropic-ai/sdk';
import { log } from '../utils/logger';

interface FindingInput {
  key: string;
  type: string;
  severity: string;
  dataJson: unknown;
}

export interface AiAnalysisResult {
  key: string;
  aiScore: number;
  aiWhyJson: {
    summary: string;
    reasons: string[];
    recommendations: string[];
    context?: string;
    impact?: string;
  };
}

interface AssetContext {
  value: string;
  type: string;
}

const SYSTEM = `Sen bir saldırı yüzeyi izleme platformunun savunma odaklı siber güvenlik analistiysen.
Sana verilen asset ve güvenlik bulguları (security findings) listesini analiz edersin.
Her bulgu için aiScore ve aiWhyJson üretirsin.
Cevapların Türkçe olmalıdır.
Sadece geçerli JSON array döndür — açıklama, markdown veya JSON dışında hiçbir metin ekleme.
Veride bulunmayan bir bulguyu uydurmayacaksın.
Exploit, saldırı kodu veya yetkisiz erişim adımları vermeyeceksin.
Savunma, risk önceliklendirme ve uygulanabilir düzeltme önerilerine odaklan.
Kullanıcı teknik seviyesi düşük olabilir; açık, sade ve uygulanabilir açıklamalar üret.`;

let _anthropicClient: Anthropic | null = null;

function getAnthropicClient(): Anthropic {
  if (!_anthropicClient) {
    _anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _anthropicClient;
}

function buildPrompt(asset: AssetContext, findings: FindingInput[]): string {
  const list = findings.map((f) => ({ key: f.key, type: f.type, severity: f.severity, data: f.dataJson }));
  return `Asset: ${asset.value} (tür: ${asset.type})

Analiz edilecek bulgular:
${JSON.stringify(list, null, 2)}

Her bulgu için aşağıdaki JSON formatında bir nesne içeren JSON array döndür.
JSON key isimleri değişmemeli — sadece değerler Türkçe olacak:
[
  {
    "key": "<bulgunun tam key değeri — değiştirme>",
    "aiScore": <0-100 arası tam sayı, yüksek = daha riskli>,
    "aiWhyJson": {
      "summary": "Türkçe tek cümlelik risk özeti",
      "reasons": ["Türkçe neden 1 — bu bulgu neden önemli", "Türkçe neden 2"],
      "recommendations": ["Türkçe öneri 1 — ne yapılmalı", "Türkçe öneri 2"],
      "context": "Türkçe bağlam — bu bulgunun güvenlik açısından anlamı"
    }
  }
]`;
}

function getItemValidationError(item: unknown): string | null {
  if (!item || typeof item !== 'object') return 'not an object';
  const o = item as Record<string, unknown>;

  if (typeof o.key !== 'string' || !o.key.trim()) return 'key missing or empty';

  if (typeof o.aiScore !== 'number' || !isFinite(o.aiScore)) return 'aiScore not a finite number';
  if (o.aiScore < 0 || o.aiScore > 100) return `aiScore out of range: ${o.aiScore}`;

  if (!o.aiWhyJson || typeof o.aiWhyJson !== 'object') return 'aiWhyJson missing or not an object';
  const why = o.aiWhyJson as Record<string, unknown>;

  if (typeof why.summary !== 'string' || !why.summary.trim()) return 'aiWhyJson.summary missing or empty';
  if (!Array.isArray(why.reasons)) return 'aiWhyJson.reasons not an array';
  if (!(why.reasons as unknown[]).every((r) => typeof r === 'string')) return 'aiWhyJson.reasons contains non-string';
  if (!Array.isArray(why.recommendations)) return 'aiWhyJson.recommendations not an array';
  if (!(why.recommendations as unknown[]).every((r) => typeof r === 'string')) return 'aiWhyJson.recommendations contains non-string';
  if (why.context !== undefined && typeof why.context !== 'string') return 'aiWhyJson.context not a string';

  return null;
}

function parseResponse(text: string): AiAnalysisResult[] {
  const clean = text.replace(/^```[a-z]*\n?/m, '').replace(/```$/m, '').trim();

  let raw: unknown;
  try {
    raw = JSON.parse(clean);
  } catch (err) {
    log('ai parse error', { error: (err as Error).message, preview: clean.slice(0, 200) });
    return [];
  }

  if (!Array.isArray(raw)) return [];

  const valid: AiAnalysisResult[] = [];
  for (const item of raw as unknown[]) {
    const reason = getItemValidationError(item);
    if (reason === null) {
      valid.push(item as AiAnalysisResult);
    } else {
      log('ai validation skipped item', { reason });
    }
  }
  return valid;
}

async function callAnthropic(asset: AssetContext, findings: FindingInput[]): Promise<AiAnalysisResult[]> {
  if (!process.env.ANTHROPIC_API_KEY) {
    log('ai skip: ANTHROPIC_API_KEY not set');
    return [];
  }

  const client = getAnthropicClient();
  const msg = await client.messages.create({
    model: process.env.ANTHROPIC_MODEL ?? 'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    system: SYSTEM,
    messages: [{ role: 'user', content: buildPrompt(asset, findings) }],
  });

  const firstBlock = msg.content[0];
  return parseResponse(firstBlock?.type === 'text' ? firstBlock.text : '');
}

async function callOllama(asset: AssetContext, findings: FindingInput[]): Promise<AiAnalysisResult[]> {
  const host = process.env.OLLAMA_HOST ?? 'http://localhost:11434';
  const model = process.env.OLLAMA_MODEL ?? 'llama3.2';

  const res = await fetch(`${host}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      stream: false,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: buildPrompt(asset, findings) },
      ],
    }),
  });

  if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
  const json = (await res.json()) as { message?: { content?: string } };
  return parseResponse(json.message?.content ?? '');
}

export async function analyzeFindings(asset: AssetContext, findings: FindingInput[]): Promise<AiAnalysisResult[]> {
  if (!findings.length) return [];

  const provider = (process.env.AI_PROVIDER ?? 'ollama').toLowerCase();
  log('ai provider', { provider });

  try {
    if (provider === 'anthropic') {
      return await callAnthropic(asset, findings);
    }
    return await callOllama(asset, findings);
  } catch (err) {
    log('ai error', { provider, error: (err as Error).message, stack: (err as Error).stack?.split('\n')[1]?.trim() });
    return [];
  }
}
