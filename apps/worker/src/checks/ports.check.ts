import * as net from 'node:net';
import { DEFAULT_PORTS } from '../config/constants';

export interface PortResult {
  port: number;
  open: boolean;
  latencyMs: number | null;
  error: string | null;
}

export interface PortsCheckResult {
  checkedPorts: number[];
  results: PortResult[];
  openPorts: number[];
  error?: string;
}

const DEFAULT_PORT_TIMEOUT_MS = 3000;

function resolvePortTimeoutMs(): number {
  const raw = process.env.PORT_SCAN_TIMEOUT_MS;
  if (raw === undefined || raw === null || raw === '') return DEFAULT_PORT_TIMEOUT_MS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_PORT_TIMEOUT_MS;
  return parsed;
}

function checkSinglePort(host: string, port: number, timeoutMs = DEFAULT_PORT_TIMEOUT_MS): Promise<PortResult> {
  return new Promise((resolve) => {
    const started = Date.now();
    const socket = new net.Socket();
    let settled = false;

    const finish = (result: PortResult): void => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish({ port, open: true, latencyMs: Date.now() - started, error: null }));
    socket.once('timeout', () => finish({ port, open: false, latencyMs: null, error: 'TIMEOUT' }));
    socket.once('error', (err: NodeJS.ErrnoException) =>
      finish({ port, open: false, latencyMs: null, error: err.code ?? err.message ?? 'CONNECTION_ERROR' }),
    );
    socket.connect(port, host);
  });
}

export async function checkPorts(host: string, ports: readonly number[] = DEFAULT_PORTS): Promise<PortsCheckResult> {
  const timeoutMs = resolvePortTimeoutMs();
  const results = await Promise.all([...ports].map((port) => checkSinglePort(host, port, timeoutMs)));
  return {
    checkedPorts: [...ports],
    results,
    openPorts: results.filter((r) => r.open).map((r) => r.port),
  };
}
