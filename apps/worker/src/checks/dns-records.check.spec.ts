import * as dnsPromises from 'node:dns/promises';
import { checkDnsRecords } from './dns-records.check';

const mockSetServers = jest.fn();
const mockResolve4 = jest.fn();
const mockResolve6 = jest.fn();
const mockResolveMx = jest.fn();
const mockResolveNs = jest.fn();
const mockResolveTxt = jest.fn();
const mockResolveCname = jest.fn();
const mockResolveSoa = jest.fn();
const mockResolveCaa = jest.fn();

jest.mock('node:dns/promises', () => ({
  Resolver: jest.fn().mockImplementation(() => ({
    setServers: mockSetServers,
    resolve4: mockResolve4,
    resolve6: mockResolve6,
    resolveMx: mockResolveMx,
    resolveNs: mockResolveNs,
    resolveTxt: mockResolveTxt,
    resolveCname: mockResolveCname,
    resolveSoa: mockResolveSoa,
    resolveCaa: mockResolveCaa,
  })),
}));

function makeErrno(code: string): NodeJS.ErrnoException {
  const err = new Error(code) as NodeJS.ErrnoException;
  err.code = code;
  return err;
}

beforeEach(() => {
  jest.clearAllMocks();
  // Default: all record types return empty (ENODATA-like)
  mockResolve4.mockResolvedValue([]);
  mockResolve6.mockResolvedValue([]);
  mockResolveMx.mockResolvedValue([]);
  mockResolveNs.mockResolvedValue([]);
  mockResolveTxt.mockResolvedValue([]);
  mockResolveCname.mockResolvedValue([]);
  mockResolveSoa.mockRejectedValue(makeErrno('ENODATA'));
  mockResolveCaa.mockResolvedValue([]);
});

describe('checkDnsRecords', () => {
  it('calls setServers with public resolvers', async () => {
    await checkDnsRecords('example.com');
    expect(mockSetServers).toHaveBeenCalledWith(['1.1.1.1', '8.8.8.8']);
  });

  it('populates records on successful A resolve', async () => {
    mockResolve4.mockResolvedValue(['1.2.3.4', '5.6.7.8']);
    const result = await checkDnsRecords('example.com');
    expect(result.records).toEqual(
      expect.arrayContaining([
        { type: 'A', value: '1.2.3.4' },
        { type: 'A', value: '5.6.7.8' },
      ]),
    );
    expect(result.errors).not.toHaveProperty('A');
  });

  it('writes ECONNREFUSED into errors map', async () => {
    mockResolve4.mockRejectedValue(makeErrno('ECONNREFUSED'));
    const result = await checkDnsRecords('example.com');
    expect(result.errors).toHaveProperty('A', 'ECONNREFUSED');
    expect(result.records.filter((r) => r.type === 'A')).toHaveLength(0);
  });

  it('silently ignores ENODATA', async () => {
    mockResolveNs.mockRejectedValue(makeErrno('ENODATA'));
    const result = await checkDnsRecords('example.com');
    expect(result.errors).not.toHaveProperty('NS');
  });

  it('silently ignores ENOTFOUND', async () => {
    mockResolveMx.mockRejectedValue(makeErrno('ENOTFOUND'));
    const result = await checkDnsRecords('example.com');
    expect(result.errors).not.toHaveProperty('MX');
  });

  it('detects DMARC record', async () => {
    mockResolveTxt
      .mockImplementation((domain: string) => {
        if (domain === '_dmarc.example.com') {
          return Promise.resolve([['v=DMARC1; p=reject; rua=mailto:dmarc@example.com']]);
        }
        return Promise.resolve([]);
      });
    const result = await checkDnsRecords('example.com');
    expect(result.dmarcRecord).toMatch(/^v=DMARC1/);
  });

  it('returns null dmarcRecord when no DMARC txt found', async () => {
    const result = await checkDnsRecords('example.com');
    expect(result.dmarcRecord).toBeNull();
  });

  it('preserves response shape', async () => {
    const result = await checkDnsRecords('example.com');
    expect(result).toMatchObject({
      domain: 'example.com',
      records: expect.any(Array),
      dmarcRecord: null,
      checkedAt: expect.any(String),
      errors: expect.any(Object),
    });
    expect(new Date(result.checkedAt).toISOString()).toBe(result.checkedAt);
  });

  it('uses Resolver constructor (not global dns functions)', async () => {
    await checkDnsRecords('example.com');
    expect(dnsPromises.Resolver).toHaveBeenCalled();
  });
});
