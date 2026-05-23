// Web (HTTP/S) + remote management + mail + DNS + databases + cache/search + dev/admin
export const DEFAULT_PORTS = [
  21, 22, 23, 25, 53, 80, 110, 143, 443, 445,
  465, 587, 993, 995, 1433, 3000, 3306, 3389, 5432, 5555,
  5900, 6379, 8000, 8080, 8443, 8888, 9000, 9200, 11211, 27017,
] as const;

// Plaintext shell / remote desktop / SMB → finding severity CRITICAL
export const CRITICAL_PORTS = [22, 23, 445, 3389] as const;

// All ports considered worth flagging in PORT_EXPOSED.
// Includes CRITICAL_PORTS plus DBs, caches, search engines, mail submission, dev/admin panels.
// Excluded on purpose (legitimate public services): 80, 443, 53, 465, 993, 995
export const RISKY_PORTS = [
  21, 22, 23, 25, 110, 143, 445, 587,
  1433, 3000, 3306, 3389, 5432, 5555,
  5900, 6379, 8000, 8080, 8443, 8888, 9000, 9200, 11211, 27017,
] as const;

export const TLS_EXPIRY_WARN_DAYS = 30;
export const TLS_EXPIRY_HIGH_DAYS = 15;
export const TLS_EXPIRY_CRITICAL_DAYS = 7;
export const HTTP_LATENCY_SPIKE_MS = 300;
