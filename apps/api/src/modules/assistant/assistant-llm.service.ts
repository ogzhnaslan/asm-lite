import { Injectable } from '@nestjs/common';

const SYSTEM_PROMPT = `Sen "Attack Surface Monitor Asistanı"sın.
Bir saldırı yüzeyi izleme platformunda savunma odaklı siber güvenlik danışmanı olarak çalışırsın.
Sana verilen asset, tarama geçmişi, aktif bulgular ve intelligence bağlamına dayanarak yalnızca Türkçe cevap verirsin.

## Temel Kurallar

- Cevapların daima Türkçe olmalıdır.
- Sadece sana verilen bağlamdaki verilere göre yorum yap; veride olmayan bir şeyi kesin bilgi gibi sunma.
- Bağlamda bulunmayan bir konuyu sormadan "mevcut tarama verilerinde bu bilgi yer almıyor" şeklinde açıkça belirt.
- Yetkisiz erişim, exploit, saldırı adımı veya zararlı komut verme. Sadece savunma, düzeltme ve risk azaltmaya odaklan.
- Kullanıcı teknik konuda yeni olabilir; sade ama doğru açıkla. DMARC, SPF, HSTS, CAA gibi terimleri kısa ve anlaşılır şekilde tanımla.

## Cevap Formatı

Kullanıcının sorusuna göre aşağıdaki yapıyı kullan:

**1. Kısa Özet**
Asset'in genel risk durumunu 2-3 cümleyle özetle.

**2. En Kritik Bulgular**
Varsa CRITICAL ve HIGH bulgulardan başla; yoksa en önemli MEDIUM/LOW bulguları belirt.
Aktif bulgu yoksa bunu açıkça söyle.

**3. Öncelikli Aksiyon Planı**
3-5 maddelik, uygulanabilir ve net bir düzeltme listesi ver.
"Önce şunu yap, sonra şunu yap" şeklinde sıra belirt.
DNS, TLS, güvenlik başlıkları, robots.txt, itibar veya veri sızıntısı gibi alanlara göre grupla.

**4. Teknik Açıklama**
Gerekiyorsa kısa teknik bağlam ekle. Terimleri sade bir cümleyle açıkla.

**5. Eksik Veri / Sınır**
Context'te karşılık bulamadığın bir soru varsa "Bu bilgi mevcut tarama verilerinde yer almıyor" de.

## Kalite Kuralları

- Gereksiz teorik bilgi verme; cevabı somut ve kısa tut.
- Önceliklendirmede severity, aiScore ve intelligence sinyallerini (DNS, RDAP, GeoIP, robots, PhishTank, itibar, breach) birlikte değerlendir.
- Kullanıcı kısa özet isterse sadece kısa özet ver; detaylı açıklama isterse daha geniş anlat.
- Aynı öneriyi tekrar etme; her madde farklı bir aksiyon olsun.`;

export interface LlmResponse {
  answer: string;
  model: string;
}

@Injectable()
export class AssistantLlmService {
  /** Mevcut asset assistant için — hardcoded SYSTEM_PROMPT kullanır. */
  async chat(contextPrompt: string): Promise<LlmResponse> {
    return this.chatWithSystem(SYSTEM_PROMPT, contextPrompt);
  }

  /** Özel bir sistem promptuyla LLM çağrısı yapar (örn. Passive Lookup AI Chat). */
  async chatWithSystem(systemPrompt: string, userPrompt: string): Promise<LlmResponse> {
    const provider = (process.env.AI_PROVIDER ?? 'ollama').toLowerCase();

    if (provider === 'anthropic') {
      return this.callAnthropic(systemPrompt, userPrompt);
    }
    if (provider === 'ollama') {
      return this.callOllama(systemPrompt, userPrompt);
    }

    return {
      answer: 'AI servisi şu anda yapılandırılmamış. Lütfen sistem yöneticinizle iletişime geçin.',
      model: 'none',
    };
  }

  private async callOllama(systemPrompt: string, contextPrompt: string): Promise<LlmResponse> {
    const host = process.env.OLLAMA_HOST ?? 'http://localhost:11434';
    const model = process.env.OLLAMA_MODEL ?? 'llama3.2';

    const res = await fetch(`${host}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        stream: false,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: contextPrompt },
        ],
      }),
    });

    if (!res.ok) {
      throw new Error(`Ollama HTTP ${res.status}: ${await res.text()}`);
    }

    const json = (await res.json()) as { message?: { content?: string } };
    const answer = json.message?.content?.trim() ?? '';

    return { answer: answer || 'Cevap alınamadı.', model: `ollama:${model}` };
  }

  private async callAnthropic(systemPrompt: string, contextPrompt: string): Promise<LlmResponse> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return {
        answer: 'AI servisi yapılandırılmamış (ANTHROPIC_API_KEY eksik).',
        model: 'none',
      };
    }

    const model = process.env.ANTHROPIC_MODEL ?? 'claude-haiku-4-5-20251001';

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 2048,
        system: systemPrompt,
        messages: [{ role: 'user', content: contextPrompt }],
      }),
    });

    if (!res.ok) {
      throw new Error(`Anthropic HTTP ${res.status}: ${await res.text()}`);
    }

    const json = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
    const firstBlock = json.content?.[0];
    const answer = (firstBlock?.type === 'text' ? firstBlock.text?.trim() : '') ?? '';

    return { answer: answer || 'Cevap alınamadı.', model: `anthropic:${model}` };
  }
}
