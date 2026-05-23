import { log } from './logger';

export async function safeCheck<T>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    log(`check:${label}:crashed`, { error: (err as Error).message });
    return fallback;
  }
}
