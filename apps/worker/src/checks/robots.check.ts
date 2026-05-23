import * as crypto from 'node:crypto';

const TIMEOUT_MS = 5000;

// Paths that indicate exposed sensitive areas
const SENSITIVE_KEYWORDS = [
  '/admin', '/administrator', '/login', '/panel', '/dashboard',
  '/private', '/backup', '/backups', '/db', '/database',
  '/dev', '/test', '/staging', '/config', '/.env', '/api/internal',
  '/internal', '/secret',
];

// Subset that escalates severity to HIGH
const HIGH_SEVERITY_KEYWORDS = ['/.env', '/backup', '/db', '/database', '/config'];

export interface RobotsCheckResult {
  domain: string;
  url: string | null;
  exists: boolean;
  statusCode: number | null;
  contentLength: number;
  contentHash: string | null;
  disallowRules: string[];
  allowRules: string[];
  sitemapUrls: string[];
  sensitivePaths: string[];
  highSeverityPaths: string[];
  checkedAt: string;
  error?: string;
}

function sha256(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function parseRobots(content: string): Pick<RobotsCheckResult, 'disallowRules' | 'allowRules' | 'sitemapUrls' | 'sensitivePaths' | 'highSeverityPaths'> {
  const disallowRules: string[] = [];
  const allowRules: string[] = [];
  const sitemapUrls: string[] = [];

  for (const raw of content.split('\n')) {
    const line = raw.trim();
    const lower = line.toLowerCase();
    if (lower.startsWith('disallow:')) {
      const path = line.slice('disallow:'.length).split('#')[0]!.trim();
      if (path) disallowRules.push(path);
    } else if (lower.startsWith('allow:')) {
      const path = line.slice('allow:'.length).split('#')[0]!.trim();
      if (path) allowRules.push(path);
    } else if (lower.startsWith('sitemap:')) {
      const url = line.slice('sitemap:'.length).split('#')[0]!.trim();
      if (url) sitemapUrls.push(url);
    }
  }

  const sensitivePaths = disallowRules.filter((p) => {
    const lp = p.toLowerCase();
    return SENSITIVE_KEYWORDS.some((k) => lp === k || lp.startsWith(k + '/') || lp.startsWith(k + '?'));
  });

  const highSeverityPaths = sensitivePaths.filter((p) => {
    const lp = p.toLowerCase();
    return HIGH_SEVERITY_KEYWORDS.some((k) => lp === k || lp.startsWith(k + '/'));
  });

  return { disallowRules, allowRules, sitemapUrls, sensitivePaths, highSeverityPaths };
}

async function attempt(url: string): Promise<{ ok: boolean; statusCode: number | null; body?: string; error?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'ASM-Scanner/1.0' } });
    if (res.ok) {
      const body = await res.text();
      return { ok: true, statusCode: res.status, body };
    }
    return { ok: false, statusCode: res.status };
  } catch (err) {
    const msg = (err as Error).name === 'AbortError' ? 'TIMEOUT' : 'CONNECTION_ERROR';
    return { ok: false, statusCode: null, error: msg };
  } finally {
    clearTimeout(timer);
  }
}

function empty(domain: string, statusCode: number | null, error?: string): RobotsCheckResult {
  return {
    domain, url: null, exists: false, statusCode, contentLength: 0, contentHash: null,
    disallowRules: [], allowRules: [], sitemapUrls: [], sensitivePaths: [], highSeverityPaths: [],
    checkedAt: new Date().toISOString(), ...(error ? { error } : {}),
  };
}

export async function checkRobotsTxt(domain: string): Promise<RobotsCheckResult> {
  const https = await attempt(`https://${domain}/robots.txt`);

  if (https.ok && https.body !== undefined) {
    const parsed = parseRobots(https.body);
    return {
      domain, url: `https://${domain}/robots.txt`, exists: true,
      statusCode: https.statusCode, contentLength: https.body.length,
      contentHash: sha256(https.body), ...parsed, checkedAt: new Date().toISOString(),
    };
  }

  // 404 → robots.txt intentionally absent, not an error
  if (https.statusCode === 404) return empty(domain, 404);

  // Fallback to HTTP (redirect, TLS error, or connection refused on HTTPS)
  const http = await attempt(`http://${domain}/robots.txt`);

  if (http.ok && http.body !== undefined) {
    const parsed = parseRobots(http.body);
    return {
      domain, url: `http://${domain}/robots.txt`, exists: true,
      statusCode: http.statusCode, contentLength: http.body.length,
      contentHash: sha256(http.body), ...parsed, checkedAt: new Date().toISOString(),
    };
  }

  if (http.statusCode === 404) return empty(domain, 404);

  const error = https.error ?? http.error ?? `HTTP_${https.statusCode ?? http.statusCode ?? 'UNKNOWN'}`;
  return empty(domain, https.statusCode ?? http.statusCode, error);
}
