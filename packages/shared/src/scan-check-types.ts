export const SCAN_CHECK_TYPES = [
  'PORTS',
  'TLS_INFO',
  'HTTP_HEALTH',
  'SECURITY_HEADERS',
  'DNS_RECORDS',
  'RDAP_INFO',
  'GEOIP_INFO',
  'ROBOTS_TXT',
  'PHISHTANK_REPUTATION',
  'MALICIOUS_REPUTATION',
  'BREACH_EXPOSURE',
  'OTX_INTELLIGENCE',
  'SQLI_PROBE',
  'VISUAL_ANALYSIS',
] as const;

export type ScanCheckType = typeof SCAN_CHECK_TYPES[number];

export const SCAN_STATUS = ['RUNNING', 'DONE', 'FAILED'] as const;

export type ScanStatus = typeof SCAN_STATUS[number];
