export const FindingTypes = {
  PORT_EXPOSED:           'PORT_EXPOSED',
  PORT_CHANGE:            'PORT_CHANGE',
  TLS_CHECK:              'TLS_CHECK',
  TLS_EXPIRING:           'TLS_EXPIRING',
  TLS_CHANGE:             'TLS_CHANGE',
  HTTP_HEALTH:            'HTTP_HEALTH',
  HTTP_CHANGE:            'HTTP_CHANGE',
  SECURITY_HEADER_MISSING:'SECURITY_HEADER_MISSING',
} as const;

export type FindingType = typeof FindingTypes[keyof typeof FindingTypes];

export const FINDING_TYPES: FindingType[] = Object.values(FindingTypes);
