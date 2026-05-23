export interface HttpCheckResult {
  url: string;
  statusCode: number | null;
  latencyMs: number | null;
  error?: string;
  attempts?: Array<{ ok: boolean; url: string; error?: string }>;
}

interface AttemptResult {
  ok: boolean;
  url: string;
  statusCode?: number;
  latencyMs?: number;
  error?: string;
}

async function attempt(url: string): Promise<AttemptResult> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: { 'User-Agent': 'ASM-Scanner/1.0' },
    });
    return { ok: true, url, statusCode: res.status, latencyMs: Date.now() - started };
  } catch (e) {
    const err = e as { cause?: { message?: string }; message?: string };
    return { ok: false, url, error: err.cause?.message ?? err.message ?? String(e) };
  } finally {
    clearTimeout(timer);
  }
}

export async function checkHttp(assetValue: string): Promise<HttpCheckResult> {
  const first = await attempt(`https://${assetValue}`);
  if (first.ok) {
    return { url: first.url, statusCode: first.statusCode!, latencyMs: first.latencyMs! };
  }

  const second = await attempt(`http://${assetValue}`);
  if (second.ok) {
    return { url: second.url, statusCode: second.statusCode!, latencyMs: second.latencyMs! };
  }

  return {
    url: `https://${assetValue}`,
    statusCode: null,
    latencyMs: null,
    error: first.error ?? second.error ?? 'HTTP request failed',
    attempts: [first, second],
  };
}
