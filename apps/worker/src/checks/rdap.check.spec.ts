import { checkRdap, __resetRdapBootstrapCache } from './rdap.check';

// ─── fetch mock altyapısı ──────────────────────────────────────────────────────
// fetchJson → fetch(url). URL'e göre yanıt yönlendiriyoruz.

type Responder = (url: string) => { ok: boolean; status: number; data?: unknown } | 'THROW';

let responder: Responder;

beforeEach(() => {
  __resetRdapBootstrapCache();
  responder = () => ({ ok: false, status: 404 });
  global.fetch = jest.fn(async (input: unknown) => {
    const url = String(input);
    const r = responder(url);
    if (r === 'THROW') throw new Error('network down');
    return {
      ok: r.ok,
      status: r.status,
      json: async () => r.data ?? {},
      text: async () => '',
    } as unknown as Response;
  }) as unknown as typeof fetch;
});

afterEach(() => jest.restoreAllMocks());

const BOOTSTRAP = {
  services: [
    [['com', 'net'], ['https://rdap.verisign.com/com/v1/']],
    [['org'], ['https://rdap.publicinterestregistry.org/rdap/']],
  ],
};

function standardRdap(registrar: string, expires: string) {
  return {
    entities: [
      {
        roles: ['registrar'],
        vcardArray: ['vcard', [['version', {}, 'text', '4.0'], ['fn', {}, 'text', registrar]]],
      },
    ],
    events: [{ eventAction: 'expiration', eventDate: expires }],
    nameservers: [{ ldhName: 'ns1.example.com' }],
    status: ['active'],
  };
}

describe('checkRdap — IANA bootstrap + fallback', () => {
  it('TLD bootstrap ile çözülür ve yetkili sunucudan DOĞRUDAN sorgulanır (rdap.org çağrılmaz)', async () => {
    const calls: string[] = [];
    responder = (url) => {
      calls.push(url);
      if (url.includes('data.iana.org')) return { ok: true, status: 200, data: BOOTSTRAP };
      if (url.includes('rdap.verisign.com/com/v1/domain/example.com')) {
        return { ok: true, status: 200, data: standardRdap('Verisign Registrar', '2030-01-01T00:00:00Z') };
      }
      return { ok: false, status: 404 };
    };

    const r = await checkRdap('example.com');

    expect(r.error).toBeUndefined();
    expect(r.registrar).toBe('Verisign Registrar');
    expect(r.expiresDate).toBe('2030-01-01T00:00:00Z');
    // rdap.org'a HİÇ gidilmedi
    expect(calls.some((u) => u.includes('rdap.org'))).toBe(false);
    expect(calls.some((u) => u.includes('rdap.verisign.com'))).toBe(true);
  });

  it('bootstrap cache: ikinci çağrıda data.iana.org tekrar indirilmez', async () => {
    let bootstrapHits = 0;
    responder = (url) => {
      if (url.includes('data.iana.org')) { bootstrapHits++; return { ok: true, status: 200, data: BOOTSTRAP }; }
      if (url.includes('rdap.publicinterestregistry.org')) {
        return { ok: true, status: 200, data: standardRdap('PIR', '2031-01-01T00:00:00Z') };
      }
      return { ok: false, status: 404 };
    };

    await checkRdap('a.org');
    await checkRdap('b.org');
    expect(bootstrapHits).toBe(1);
  });

  it('yetkili sunucu başarısızsa rdap.org fallback denenir', async () => {
    const calls: string[] = [];
    responder = (url) => {
      calls.push(url);
      if (url.includes('data.iana.org')) return { ok: true, status: 200, data: BOOTSTRAP };
      if (url.includes('rdap.verisign.com')) return { ok: false, status: 500 };
      if (url.includes('rdap.org/domain/example.com')) {
        return { ok: true, status: 200, data: standardRdap('Aggregator Registrar', '2029-01-01T00:00:00Z') };
      }
      return { ok: false, status: 404 };
    };

    const r = await checkRdap('example.com');
    expect(r.error).toBeUndefined();
    expect(r.registrar).toBe('Aggregator Registrar');
    expect(calls.some((u) => u.includes('rdap.org'))).toBe(true);
  });

  it('bootstrap erişilemezse (data.iana.org down) rdap.org fallback kullanılır', async () => {
    responder = (url) => {
      if (url.includes('data.iana.org')) return 'THROW';
      if (url.includes('rdap.org/domain/example.com')) {
        return { ok: true, status: 200, data: standardRdap('Fallback Registrar', '2028-01-01T00:00:00Z') };
      }
      return { ok: false, status: 404 };
    };

    const r = await checkRdap('example.com');
    expect(r.error).toBeUndefined();
    expect(r.registrar).toBe('Fallback Registrar');
  });

  it('hem yetkili sunucu hem rdap.org başarısızsa → error', async () => {
    responder = (url) => {
      if (url.includes('data.iana.org')) return { ok: true, status: 200, data: BOOTSTRAP };
      if (url.includes('rdap.verisign.com')) return 'THROW';
      if (url.includes('rdap.org')) return 'THROW';
      return { ok: false, status: 404 };
    };

    const r = await checkRdap('example.com');
    expect(r.registrar).toBeNull();
    expect(r.error).toBe('RDAP_REQUEST_FAILED');
  });

  it('.tr domain → doğrudan TR RDAP sunucusu (rdap.org\'a bağımlı değil)', async () => {
    const calls: string[] = [];
    responder = (url) => {
      calls.push(url);
      if (url.includes('rdap.com.tr')) {
        return {
          ok: true, status: 200,
          data: {
            raw_text: '** Registrar:\nOrganization Name : Test TR Registrar\n** Domain Servers:\nns1.example.com.tr\n',
            parsed: { nameservers: ['ns1.example.com.tr'], status: 'active' },
          },
        };
      }
      return { ok: false, status: 404 };
    };

    const r = await checkRdap('example.com.tr');
    expect(r.error).toBeUndefined();
    expect(r.registrar).toBe('Test TR Registrar');
    expect(calls.some((u) => u.includes('rdap.com.tr'))).toBe(true);
    // .tr için bootstrap'a gidilmedi
    expect(calls.some((u) => u.includes('data.iana.org'))).toBe(false);
  });
});
