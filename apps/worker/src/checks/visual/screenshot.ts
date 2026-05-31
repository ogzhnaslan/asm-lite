// Screenshot helper — Playwright Page objesini alıp PNG screenshot yazar,
// SHA-256 hash ve viewport boyutu döner. Browser yaşam döngüsü orchestrator'da.

import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { Page } from 'playwright';
import type { ScreenshotResult } from './visual-types';

export const SCREENSHOT_TIMEOUT_MS = 10_000;

// Asset value'dan dosya adı için güvenli token üret (slash, kolon, scheme,
// path traversal vb. yok).
function safeAssetSlug(assetValue: string): string {
  return assetValue
    .toLowerCase()
    .replace(/[^a-z0-9.-]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 100);
}

export function buildScreenshotFilename(assetValue: string, timestampMs?: number): string {
  const ts = timestampMs ?? Date.now();
  return `visual_${safeAssetSlug(assetValue)}_${ts}.png`;
}

export interface CaptureScreenshotOptions {
  page: Page;
  assetValue: string;
  screenshotDir: string;
  timeoutMs?: number;
}

export async function captureScreenshot(opts: CaptureScreenshotOptions): Promise<ScreenshotResult> {
  const { page, assetValue, screenshotDir } = opts;
  const timeoutMs = opts.timeoutMs ?? SCREENSHOT_TIMEOUT_MS;

  try {
    await fs.mkdir(screenshotDir, { recursive: true });
    const filename = buildScreenshotFilename(assetValue);
    const filepath = path.join(screenshotDir, filename);

    // Viewport screenshot — full-page'den daha stabil + memory friendly.
    // Buffer döner; hem dosyaya yazıyoruz hem SHA-256 alıyoruz.
    const buffer = await page.screenshot({
      type: 'png',
      fullPage: false,
      timeout: timeoutMs,
    });

    await fs.writeFile(filepath, buffer);

    const hash = crypto.createHash('sha256').update(buffer).digest('hex');

    // Viewport boyutlarını Playwright'tan al — sabit varsayım yapmamak için.
    const viewportSize = page.viewportSize();

    return {
      path: filepath,
      hash,
      width: viewportSize?.width ?? null,
      height: viewportSize?.height ?? null,
      error: null,
    };
  } catch (err) {
    const message = (err as Error).message ?? 'SCREENSHOT_FAILED';
    return { path: null, hash: null, width: null, height: null, error: message };
  }
}
