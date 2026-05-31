// SSRF guard unit testleri.
//
// DNS lookup'u mock'luyoruz; gerçek ağa çıkmıyoruz.

import { normalizePublicUrl, SsrfRejection } from './ssrf-guard';

function mockLookup(addresses: string[]) {
  return jest.fn(async (_host: string) =>
    addresses.map((a) => ({ address: a, family: a.includes(':') ? 6 : 4 })),
  );
}

describe('normalizePublicUrl', () => {
  it('boş string → URL_REQUIRED', async () => {
    await expect(normalizePublicUrl('')).rejects.toMatchObject({ code: 'URL_REQUIRED' });
    await expect(normalizePublicUrl('   ')).rejects.toMatchObject({ code: 'URL_REQUIRED' });
    await expect(normalizePublicUrl(undefined as unknown as string)).rejects.toMatchObject({ code: 'URL_REQUIRED' });
  });

  it('invalid URL → URL_INVALID', async () => {
    await expect(normalizePublicUrl('not-a-url')).rejects.toMatchObject({ code: 'URL_INVALID' });
    await expect(normalizePublicUrl('://broken')).rejects.toMatchObject({ code: 'URL_INVALID' });
  });

  it('http/https dışı şema → PROTOCOL_NOT_ALLOWED', async () => {
    await expect(normalizePublicUrl('ftp://example.com')).rejects.toMatchObject({ code: 'PROTOCOL_NOT_ALLOWED' });
    await expect(normalizePublicUrl('file:///etc/passwd')).rejects.toMatchObject({ code: 'PROTOCOL_NOT_ALLOWED' });
    await expect(normalizePublicUrl('javascript:alert(1)')).rejects.toMatchObject({ code: 'PROTOCOL_NOT_ALLOWED' });
  });

  it('localhost → HOSTNAME_BLOCKED', async () => {
    await expect(normalizePublicUrl('http://localhost')).rejects.toMatchObject({ code: 'HOSTNAME_BLOCKED' });
    await expect(normalizePublicUrl('http://LOCALHOST/')).rejects.toMatchObject({ code: 'HOSTNAME_BLOCKED' });
    await expect(normalizePublicUrl('http://ip6-localhost')).rejects.toMatchObject({ code: 'HOSTNAME_BLOCKED' });
  });

  it('IP literal: loopback 127.0.0.1 → PRIVATE_IP_BLOCKED (DNS lookup yok)', async () => {
    const lookup = mockLookup([]);
    await expect(normalizePublicUrl('http://127.0.0.1/', { lookup })).rejects.toMatchObject({ code: 'PRIVATE_IP_BLOCKED' });
    expect(lookup).not.toHaveBeenCalled();
  });

  it('IP literal: 0.0.0.0 → PRIVATE_IP_BLOCKED', async () => {
    await expect(normalizePublicUrl('http://0.0.0.0/')).rejects.toMatchObject({ code: 'PRIVATE_IP_BLOCKED' });
  });

  it('IP literal: AWS metadata 169.254.169.254 → PRIVATE_IP_BLOCKED', async () => {
    await expect(normalizePublicUrl('http://169.254.169.254/latest/')).rejects.toMatchObject({ code: 'PRIVATE_IP_BLOCKED' });
  });

  it('IP literal: private 10/8, 172.16/12, 192.168/16 → PRIVATE_IP_BLOCKED', async () => {
    await expect(normalizePublicUrl('http://10.0.0.1')).rejects.toMatchObject({ code: 'PRIVATE_IP_BLOCKED' });
    await expect(normalizePublicUrl('http://10.255.255.255')).rejects.toMatchObject({ code: 'PRIVATE_IP_BLOCKED' });
    await expect(normalizePublicUrl('http://172.16.0.1')).rejects.toMatchObject({ code: 'PRIVATE_IP_BLOCKED' });
    await expect(normalizePublicUrl('http://172.31.255.255')).rejects.toMatchObject({ code: 'PRIVATE_IP_BLOCKED' });
    await expect(normalizePublicUrl('http://192.168.1.1')).rejects.toMatchObject({ code: 'PRIVATE_IP_BLOCKED' });
  });

  it('IPv6 loopback ::1 → PRIVATE_IP_BLOCKED', async () => {
    await expect(normalizePublicUrl('http://[::1]/')).rejects.toMatchObject({ code: 'PRIVATE_IP_BLOCKED' });
  });

  it('IPv6 link-local fe80::1 → PRIVATE_IP_BLOCKED', async () => {
    await expect(normalizePublicUrl('http://[fe80::1]/')).rejects.toMatchObject({ code: 'PRIVATE_IP_BLOCKED' });
  });

  it('hostname → public IP çözülürse normalize edilmiş URL döner', async () => {
    const lookup = mockLookup(['93.184.216.34']);
    const r = await normalizePublicUrl('https://example.com/path', { lookup });
    expect(r.hostname).toBe('example.com');
    expect(r.resolvedIps).toEqual(['93.184.216.34']);
    expect(r.url).toBe('https://example.com/path');
  });

  it('hostname → DNS lookup hata verirse DNS_RESOLUTION_FAILED', async () => {
    const lookup = jest.fn(async () => { throw new Error('ENOTFOUND'); });
    await expect(normalizePublicUrl('https://nx.example', { lookup })).rejects.toMatchObject({ code: 'DNS_RESOLUTION_FAILED' });
  });

  it('hostname → 0 IP dönerse NO_PUBLIC_ADDRESS', async () => {
    const lookup = mockLookup([]);
    await expect(normalizePublicUrl('https://example.com', { lookup })).rejects.toMatchObject({ code: 'NO_PUBLIC_ADDRESS' });
  });

  it('hostname → public+private mix; private varsa PRIVATE_IP_BLOCKED', async () => {
    const lookup = mockLookup(['93.184.216.34', '10.0.0.1']);
    await expect(normalizePublicUrl('https://example.com', { lookup })).rejects.toMatchObject({ code: 'PRIVATE_IP_BLOCKED' });
  });

  it('hostname → tüm IPv4 public ise kabul', async () => {
    const lookup = mockLookup(['1.1.1.1', '8.8.8.8']);
    const r = await normalizePublicUrl('https://cloudflare.com', { lookup });
    expect(r.resolvedIps).toEqual(['1.1.1.1', '8.8.8.8']);
  });

  it('URL uppercase hostname küçük harfe normalize edilir', async () => {
    const lookup = mockLookup(['1.1.1.1']);
    const r = await normalizePublicUrl('https://EXAMPLE.COM/x', { lookup });
    expect(r.hostname).toBe('example.com');
  });

  it('port korunur', async () => {
    const lookup = mockLookup(['1.1.1.1']);
    const r = await normalizePublicUrl('https://example.com:8443/x', { lookup });
    expect(r.port).toBe(8443);
  });

  it('SsrfRejection sınıfı doğru tipte fırlatılır', async () => {
    try {
      await normalizePublicUrl('ftp://example.com');
      fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(SsrfRejection);
      expect((err as SsrfRejection).code).toBe('PROTOCOL_NOT_ALLOWED');
    }
  });
});
