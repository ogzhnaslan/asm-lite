import * as tls from 'node:tls';

export interface TlsCipherInfo {
  name: string;
  standardName?: string;
  version?: string;
  bits?: number;
}

export interface TlsCheckResult {
  ok: boolean;
  host: string;
  port: number;
  error?: string;
  latencyMs?: number;
  validTo?: string | null;
  daysLeft?: number | null;
  issuer?: Record<string, string> | null;
  subject?: Record<string, string> | null;
  serialNumber?: string | null;
  fingerprint256?: string | null;
  // Sprint 1B — opsiyonel; eski snapshot'larda undefined olabilir
  protocol?: string | null;
  cipher?: TlsCipherInfo | null;
  authorized?: boolean;
  authorizationError?: string | null;
}

function extractCipher(raw: unknown): TlsCipherInfo | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.name !== 'string') return null;
  const cipher: TlsCipherInfo = { name: r.name };
  if (typeof r.standardName === 'string') cipher.standardName = r.standardName;
  if (typeof r.version === 'string') cipher.version = r.version;
  if (typeof r.bits === 'number') cipher.bits = r.bits;
  return cipher;
}

function extractAuthorizationError(err: unknown): string | null {
  if (!err) return null;
  const e = err as NodeJS.ErrnoException & { message?: string };
  return e.code ?? e.message ?? String(err);
}

export function checkTls(host: string, port = 443, timeoutMs = 5000): Promise<TlsCheckResult> {
  return new Promise((resolve) => {
    const started = Date.now();
    const socket = tls.connect({ host, port, servername: host, rejectUnauthorized: false });
    let settled = false;

    const finish = (result: TlsCheckResult): void => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeoutMs);

    socket.once('secureConnect', () => {
      try {
        const cert = socket.getPeerCertificate(true);
        if (!cert || !Object.keys(cert).length) {
          return finish({ ok: false, host, port, error: 'NO_CERTIFICATE' });
        }

        const validTo = cert.valid_to ? new Date(cert.valid_to) : null;
        const daysLeft = validTo
          ? Math.floor((validTo.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
          : null;

        // Sprint 1B — protocol, cipher, chain validation
        // rejectUnauthorized=false olduğu için bağlantı her durumda kuruluyor;
        // authorized=false ve authorizationError dolu olabilir, scan patlatmaz.
        const protocol = socket.getProtocol();
        const cipher = extractCipher(socket.getCipher());
        const authorized = socket.authorized;
        const authorizationError = extractAuthorizationError(socket.authorizationError);

        finish({
          ok: true,
          host,
          port,
          latencyMs: Date.now() - started,
          validTo: validTo ? validTo.toISOString() : null,
          daysLeft,
          issuer: (cert.issuer as unknown as Record<string, string>) ?? null,
          subject: (cert.subject as unknown as Record<string, string>) ?? null,
          serialNumber: cert.serialNumber ?? null,
          fingerprint256: cert.fingerprint256 ?? null,
          protocol,
          cipher,
          authorized,
          authorizationError,
        });
      } catch (err) {
        finish({ ok: false, host, port, error: (err as Error).message ?? 'TLS_CERT_READ_FAILED' });
      }
    });

    socket.once('timeout', () => finish({ ok: false, host, port, error: 'TLS_TIMEOUT' }));
    socket.once('error', (err: NodeJS.ErrnoException) =>
      finish({ ok: false, host, port, error: err.code ?? err.message ?? 'TLS_CONNECTION_FAILED' }),
    );
  });
}
