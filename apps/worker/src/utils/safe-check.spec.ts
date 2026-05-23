import { safeCheck } from './safe-check';

jest.mock('./logger', () => ({
  log: jest.fn(),
}));

import { log } from './logger';

describe('safeCheck', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fn başarılı sonuç döndürürse o değeri iletir', async () => {
    const result = await safeCheck('ports', async () => 42, 0);

    expect(result).toBe(42);
  });

  it('fn throw ederse fallback döner, promise reject olmaz', async () => {
    const fallback = { error: 'CHECK_CRASHED', openPorts: [] };

    const result = await safeCheck('ports', async () => { throw new Error('boom'); }, fallback);

    expect(result).toBe(fallback);
  });

  it('fn throw ederse crash loglanır', async () => {
    await safeCheck('tls', async () => { throw new Error('timeout'); }, null);

    expect(log).toHaveBeenCalledWith(
      'check:tls:crashed',
      expect.objectContaining({ error: 'timeout' }),
    );
  });

  it('log mesajında label görünür', async () => {
    await safeCheck('dns-records', async () => { throw new Error('x'); }, null);

    const [message] = (log as jest.Mock).mock.calls[0] as [string];
    expect(message).toContain('dns-records');
  });

  it('fn async değer döndürürse bekler', async () => {
    const result = await safeCheck(
      'http',
      () => new Promise<string>((resolve) => setTimeout(() => resolve('ok'), 1)),
      'fallback',
    );

    expect(result).toBe('ok');
  });

  it('fallback herhangi bir tip olabilir — null', async () => {
    const result = await safeCheck('geoip', async () => { throw new Error('err'); }, null);

    expect(result).toBeNull();
  });

  it('fn başarılı ise log çağrılmaz', async () => {
    await safeCheck('robots', async () => 'success', 'fallback');

    expect(log).not.toHaveBeenCalled();
  });
});
