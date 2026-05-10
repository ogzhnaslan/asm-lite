import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'node:crypto';

export type PwnedPasswordCheckResult = {
  checked: boolean;
  pwned: boolean;
  count: number;
  error?: string;
};

const TIMEOUT_MS = 5000;

@Injectable()
export class PwnedPasswordsService {
  private readonly logger = new Logger(PwnedPasswordsService.name);

  async check(password: string): Promise<PwnedPasswordCheckResult> {
    const hash = crypto.createHash('sha1').update(password).digest('hex').toUpperCase();
    const prefix = hash.slice(0, 5);
    const suffix = hash.slice(5);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
        signal: controller.signal,
        // Add-Padding prevents traffic analysis by padding the response with fake entries
        headers: { 'Add-Padding': 'true', 'User-Agent': 'ASM-Security/1.0' },
      });

      if (!res.ok) {
        this.logger.warn(`Pwned Passwords API returned HTTP ${res.status}`);
        return { checked: false, pwned: false, count: 0, error: 'PWNED_PASSWORD_API_FAILED' };
      }

      const text = await res.text();
      for (const line of text.split('\r\n')) {
        const colon = line.indexOf(':');
        if (colon === -1) continue;
        const lineSuffix = line.slice(0, colon).toUpperCase();
        if (lineSuffix === suffix) {
          const count = parseInt(line.slice(colon + 1), 10) || 1;
          return { checked: true, pwned: true, count };
        }
      }

      return { checked: true, pwned: false, count: 0 };
    } catch (err) {
      const error = (err as Error).name === 'AbortError' ? 'PWNED_PASSWORD_TIMEOUT' : 'PWNED_PASSWORD_API_FAILED';
      this.logger.warn(`Pwned Passwords check failed: ${error}`);
      return { checked: false, pwned: false, count: 0, error };
    } finally {
      clearTimeout(timer);
    }
  }
}
