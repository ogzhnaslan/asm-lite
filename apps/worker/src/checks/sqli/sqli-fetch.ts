// HTTP helper for SQLi probes. Sadece GET, manual redirect, timeout-bounded.
// Body length doğru raporlanır (truncate sadece bellekte tutulan slice için).

export const SQLI_FETCH_TIMEOUT_MS = 5000;
export const SQLI_MAX_BODY_BYTES = 200 * 1024;
export const SQLI_USER_AGENT = 'ASM-Scanner/1.0 sqli-probe';

export interface SqliFetchResult {
  status: number | null;
  body: string | null;       // Truncated to SQLI_MAX_BODY_BYTES for memory safety
  length: number | null;     // Original body length in characters (for delta math)
  networkError: string | null;
}

export interface SqliFetchOptions {
  timeoutMs?: number;
}

function extractNetworkError(err: unknown): string {
  if (err && typeof err === 'object') {
    const e = err as { name?: string; code?: string; message?: string };
    if (e.name === 'AbortError') return 'TIMEOUT';
    if (e.code) return e.code;
    // fetch wraps the cause for native errors; surface that when present
    const cause = (err as { cause?: { code?: string; message?: string } }).cause;
    if (cause?.code) return cause.code;
    if (cause?.message) return cause.message;
    if (e.message) return e.message;
  }
  return 'NETWORK_ERROR';
}

export async function sqliFetch(
  url: string,
  options: SqliFetchOptions = {},
): Promise<SqliFetchResult> {
  const timeoutMs = options.timeoutMs ?? SQLI_FETCH_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      redirect: 'manual',                             // Don't chase redirects — baseline-vs-probe must compare same hop
      headers: { 'User-Agent': SQLI_USER_AGENT },
    });

    const text = await res.text();
    const fullLength = text.length;
    const truncated = fullLength > SQLI_MAX_BODY_BYTES ? text.slice(0, SQLI_MAX_BODY_BYTES) : text;

    return {
      status: res.status,
      body: truncated,
      length: fullLength,
      networkError: null,
    };
  } catch (err) {
    return {
      status: null,
      body: null,
      length: null,
      networkError: extractNetworkError(err),
    };
  } finally {
    clearTimeout(timer);
  }
}

// Defensive URL builder. API katmanı zaten "path" üzerinde regex doğrulama yapar
// (`/` ile başlamalı, "://" içermemeli). Burada ek doğrulama: scheme injection
// veya yanlışlıkla absolute URL girişi olursa hata fırlat.
export function buildSqliUrl(
  domain: string,
  path: string,
  params: Record<string, string>,
): string {
  if (!path.startsWith('/')) {
    throw new Error(`sqli path must start with /: ${path}`);
  }
  if (path.includes('://')) {
    throw new Error(`sqli path must not contain URL scheme: ${path}`);
  }

  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    search.append(k, v);
  }
  const qs = search.toString();
  return `https://${domain}${path}${qs ? `?${qs}` : ''}`;
}
