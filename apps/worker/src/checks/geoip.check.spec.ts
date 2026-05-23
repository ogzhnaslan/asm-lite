import * as dns from 'node:dns/promises';
import { checkGeoIp } from './geoip.check';

jest.mock('node:dns/promises');

const MockResolver = dns.Resolver as jest.MockedClass<typeof dns.Resolver>;

let mockResolve4: jest.Mock;
let mockResolve6: jest.Mock;

beforeEach(() => {
  mockResolve4 = jest.fn();
  mockResolve6 = jest.fn();
  MockResolver.mockImplementation(() => ({
    setServers: jest.fn(),
    resolve4: mockResolve4,
    resolve6: mockResolve6,
  }) as unknown as dns.Resolver);
});

afterEach(() => {
  jest.resetAllMocks();
});

const mockSuccessResponse = {
  status: 'success' as const,
  country: 'Turkey',
  countryCode: 'TR',
  regionName: 'Istanbul',
  city: 'Istanbul',
  lat: 41.01,
  lon: 28.96,
  as: 'AS9121 Turk Telekomunikasyon Anonim Sirketi',
  isp: 'Turk Telekom',
  org: 'Turk Telekom',
  query: '1.2.3.4',
};

function mockFetch(body: object, ok = true, status = 200) {
  global.fetch = jest.fn().mockResolvedValue({
    ok,
    status,
    json: () => Promise.resolve(body),
  }) as jest.Mock;
}

describe('checkGeoIp — DOMAIN asset', () => {
  it('resolves IPv4 → calls ip-api → returns full result', async () => {
    mockResolve4.mockResolvedValue(['1.2.3.4']);
    mockFetch(mockSuccessResponse);

    const result = await checkGeoIp('example.com', 'DOMAIN');

    expect(result.error).toBeUndefined();
    expect(result.resolvedIp).toBe('1.2.3.4');
    expect(result.country).toBe('Turkey');
    expect(result.city).toBe('Istanbul');
    expect(result.asn).toBe('AS9121');
    expect(result.isp).toBe('Turk Telekom');
    expect(result.latitude).toBe(41.01);
    expect(result.longitude).toBe(28.96);
  });

  it('falls back to IPv6 when IPv4 fails → calls ip-api with IPv6 → returns result', async () => {
    mockResolve4.mockRejectedValue(Object.assign(new Error('ENODATA'), { code: 'ENODATA' }));
    mockResolve6.mockResolvedValue(['2001:db8::1']);
    mockFetch(mockSuccessResponse);

    const result = await checkGeoIp('ipv6only.example.com', 'DOMAIN');

    expect(result.error).toBeUndefined();
    expect(result.resolvedIp).toBe('2001:db8::1');
    expect(result.country).toBe('Turkey');
  });

  it('returns IP_RESOLUTION_FAILED when both IPv4 and IPv6 resolve fail', async () => {
    mockResolve4.mockRejectedValue(Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' }));
    mockResolve6.mockRejectedValue(Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' }));

    const result = await checkGeoIp('nonexistent.example.com', 'DOMAIN');

    expect(result.error).toBe('IP_RESOLUTION_FAILED');
    expect(result.resolvedIp).toBeNull();
    expect(result.country).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('returns IP_RESOLUTION_FAILED when system resolver refuses connection (ECONNREFUSED)', async () => {
    mockResolve4.mockRejectedValue(Object.assign(new Error('ECONNREFUSED'), { code: 'ECONNREFUSED' }));
    mockResolve6.mockRejectedValue(Object.assign(new Error('ECONNREFUSED'), { code: 'ECONNREFUSED' }));

    const result = await checkGeoIp('oguzhanaslan.cloud', 'DOMAIN');

    expect(result.error).toBe('IP_RESOLUTION_FAILED');
    expect(result.resolvedIp).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('checkGeoIp — IP asset', () => {
  it('skips DNS resolve → calls ip-api directly → returns result', async () => {
    mockFetch(mockSuccessResponse);

    const result = await checkGeoIp('1.2.3.4', 'IP');

    expect(result.error).toBeUndefined();
    expect(result.resolvedIp).toBe('1.2.3.4');
    expect(result.country).toBe('Turkey');
    // DNS resolve should NOT be called for IP assets
    expect(MockResolver).not.toHaveBeenCalled();
  });
});

describe('checkGeoIp — ip-api errors', () => {
  it('returns HTTP error when ip-api responds with non-200 status', async () => {
    mockResolve4.mockResolvedValue(['1.2.3.4']);
    mockFetch({}, false, 429);

    const result = await checkGeoIp('example.com', 'DOMAIN');

    expect(result.error).toBe('HTTP_429');
    // !res.ok branch uses empty() which sets resolvedIp: null (unlike the catch branch)
    expect(result.resolvedIp).toBeNull();
    expect(result.country).toBeNull();
  });

  it('returns LOOKUP_FAILED when ip-api status is fail', async () => {
    mockResolve4.mockResolvedValue(['1.2.3.4']);
    mockFetch({ status: 'fail', message: 'private range' });

    const result = await checkGeoIp('example.com', 'DOMAIN');

    expect(result.error).toBe('private range');
    expect(result.resolvedIp).toBe('1.2.3.4');
  });

  it('returns GEOIP_TIMEOUT on fetch abort — scan does not throw', async () => {
    mockResolve4.mockResolvedValue(['1.2.3.4']);
    const abortErr = Object.assign(new Error('aborted'), { name: 'AbortError' });
    global.fetch = jest.fn().mockRejectedValue(abortErr) as jest.Mock;

    const result = await checkGeoIp('example.com', 'DOMAIN');

    expect(result.error).toBe('GEOIP_TIMEOUT');
    expect(result.resolvedIp).toBe('1.2.3.4');
  });

  it('returns GEOIP_REQUEST_FAILED on network error — scan does not throw', async () => {
    mockResolve4.mockResolvedValue(['1.2.3.4']);
    global.fetch = jest.fn().mockRejectedValue(new Error('network error')) as jest.Mock;

    const result = await checkGeoIp('example.com', 'DOMAIN');

    expect(result.error).toBe('GEOIP_REQUEST_FAILED');
  });
});

describe('checkGeoIp — lat/lon null safety', () => {
  it('returns null lat/lon when ip-api omits them', async () => {
    mockResolve4.mockResolvedValue(['1.2.3.4']);
    const noCoords = { ...mockSuccessResponse, lat: undefined, lon: undefined };
    mockFetch(noCoords);

    const result = await checkGeoIp('example.com', 'DOMAIN');

    expect(result.latitude).toBeNull();
    expect(result.longitude).toBeNull();
  });
});
