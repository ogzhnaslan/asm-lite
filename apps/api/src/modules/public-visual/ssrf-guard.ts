// Public visual analysis — URL & hostname güvenlik kapısı.
//
// Bu modül SSRF/abuse vektörlerini engelliyor: localhost, private IP blokları,
// link-local, multicast, cloud metadata IP, http/https dışı şemalar.
//
// Tek hostname-bazlı kontrol DNS rebinding gibi gelişmiş SSRF'i tam kapatmaz;
// yine de Playwright ile gerçek navigasyon yapacağımız için makul ilk savunma.

import * as dns from 'node:dns/promises';
import * as net from 'node:net';

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'broadcasthost',
  'ip6-localhost',
  'ip6-loopback',
]);

// IPv4 CIDR'leri net.BlockList'le kontrol ediyoruz.
// Blok: loopback 127/8, this-network 0/8, private 10/8, 172.16/12, 192.168/16,
// link-local 169.254/16 (AWS/GCP/Azure metadata IP'sini de kapsar), CGNAT
// 100.64/10, broadcast 255.255.255.255, multicast 224/4.
function buildIpv4BlockList(): net.BlockList {
  const bl = new net.BlockList();
  bl.addSubnet('127.0.0.0', 8, 'ipv4');
  bl.addSubnet('0.0.0.0', 8, 'ipv4');
  bl.addSubnet('10.0.0.0', 8, 'ipv4');
  bl.addSubnet('172.16.0.0', 12, 'ipv4');
  bl.addSubnet('192.168.0.0', 16, 'ipv4');
  bl.addSubnet('169.254.0.0', 16, 'ipv4');
  bl.addSubnet('100.64.0.0', 10, 'ipv4');
  bl.addSubnet('224.0.0.0', 4, 'ipv4');
  bl.addAddress('255.255.255.255', 'ipv4');
  return bl;
}

function buildIpv6BlockList(): net.BlockList {
  const bl = new net.BlockList();
  bl.addAddress('::1', 'ipv6');                    // loopback
  bl.addAddress('::', 'ipv6');                     // unspecified
  bl.addSubnet('fc00::', 7, 'ipv6');               // unique local
  bl.addSubnet('fe80::', 10, 'ipv6');              // link-local
  bl.addSubnet('ff00::', 8, 'ipv6');               // multicast
  return bl;
}

const IPV4_BLOCKLIST = buildIpv4BlockList();
const IPV6_BLOCKLIST = buildIpv6BlockList();

export class SsrfRejection extends Error {
  // Kullanıcıya gösterilecek sade kod — controller buna göre 400 üretir.
  constructor(public readonly code: SsrfRejectionCode, message: string) {
    super(message);
    this.name = 'SsrfRejection';
  }
}

export type SsrfRejectionCode =
  | 'URL_REQUIRED'
  | 'URL_INVALID'
  | 'PROTOCOL_NOT_ALLOWED'
  | 'HOSTNAME_BLOCKED'
  | 'DNS_RESOLUTION_FAILED'
  | 'PRIVATE_IP_BLOCKED'
  | 'NO_PUBLIC_ADDRESS';

export interface NormalizedTarget {
  url: string;       // normalize edilmiş (trailing whitespace temizlenmiş, küçük host)
  hostname: string;
  port: number | null;
  resolvedIps: string[];
}

// IP literal kontrolü — kullanıcının doğrudan IP girdiği özel durumu da
// engelliyoruz. http://10.0.0.1 gibi girdiler PRIVATE_IP_BLOCKED ile reddedilir.
function checkIpAgainstBlocklists(ip: string): boolean {
  if (net.isIPv4(ip)) return IPV4_BLOCKLIST.check(ip, 'ipv4');
  if (net.isIPv6(ip)) return IPV6_BLOCKLIST.check(ip, 'ipv6');
  // Bilmediğimiz format — risk içermez; default false.
  return false;
}

export interface NormalizeUrlOptions {
  // Test override için DNS lookup callback. Default: dns.lookup.
  lookup?: (host: string) => Promise<Array<{ address: string; family: number }>>;
}

export async function normalizePublicUrl(
  rawUrl: unknown,
  options: NormalizeUrlOptions = {},
): Promise<NormalizedTarget> {
  if (typeof rawUrl !== 'string' || rawUrl.trim().length === 0) {
    throw new SsrfRejection('URL_REQUIRED', 'URL is required');
  }

  const trimmed = rawUrl.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new SsrfRejection('URL_INVALID', 'URL is not a valid absolute URL');
  }

  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    throw new SsrfRejection(
      'PROTOCOL_NOT_ALLOWED',
      `Only http and https are allowed (got ${parsed.protocol})`,
    );
  }

  const hostname = parsed.hostname.toLowerCase();
  if (!hostname) {
    throw new SsrfRejection('URL_INVALID', 'URL has no hostname');
  }

  if (BLOCKED_HOSTNAMES.has(hostname)) {
    throw new SsrfRejection('HOSTNAME_BLOCKED', `Hostname ${hostname} is not allowed`);
  }

  // IP literal ise doğrudan blocklist kontrolü; DNS lookup gereksiz.
  if (net.isIP(hostname)) {
    if (checkIpAgainstBlocklists(hostname)) {
      throw new SsrfRejection('PRIVATE_IP_BLOCKED', `IP ${hostname} is in a blocked range`);
    }
    return {
      url: parsed.toString(),
      hostname,
      port: parsed.port ? Number(parsed.port) : null,
      resolvedIps: [hostname],
    };
  }

  // DNS çözümle. all:true ile çoklu kayıt alıyoruz (AAAA + A); biri özelse
  // toplam başvuruyu reddediyoruz (DNS rebinding'e karşı en azından zayıf koruma).
  const lookup = options.lookup ?? ((h: string) => dns.lookup(h, { all: true }));
  let resolved: Array<{ address: string; family: number }>;
  try {
    resolved = await lookup(hostname);
  } catch (err) {
    throw new SsrfRejection(
      'DNS_RESOLUTION_FAILED',
      `Could not resolve ${hostname}: ${(err as Error).message ?? 'unknown'}`,
    );
  }

  if (resolved.length === 0) {
    throw new SsrfRejection('NO_PUBLIC_ADDRESS', `${hostname} returned no IP addresses`);
  }

  const addresses = resolved.map((r) => r.address);
  for (const ip of addresses) {
    if (checkIpAgainstBlocklists(ip)) {
      throw new SsrfRejection(
        'PRIVATE_IP_BLOCKED',
        `${hostname} resolves to a blocked IP (${ip})`,
      );
    }
  }

  return {
    url: parsed.toString(),
    hostname,
    port: parsed.port ? Number(parsed.port) : null,
    resolvedIps: addresses,
  };
}

// Test exports
export const __testables = {
  ALLOWED_PROTOCOLS,
  BLOCKED_HOSTNAMES,
  IPV4_BLOCKLIST,
  IPV6_BLOCKLIST,
};
