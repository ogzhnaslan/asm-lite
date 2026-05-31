// DOM extraction — Playwright Page üzerinde page.evaluate ile tarayıcı
// tarafında çalışır. Sadece okuma; form submit veya tıklama yok.

import * as crypto from 'node:crypto';
import type { Page } from 'playwright';
import type { DomExtractionResult } from './visual-types';

export const VISIBLE_TEXT_MAX_CHARS = 5_000;

// Browser ortamında çalışacak; closure'a bağımlılığı olmamalı. Sonuç düz JSON.
// page.evaluate `Function` argümanı serialize ediliyor — bu yüzden inline ve
// saf bir fonksiyon olmalı, dışarıdan binding alamaz.
interface DomEvalResult {
  title: string;
  metaDescription: string;
  h1Texts: string[];
  visibleText: string;
  linkCount: number;
  formCount: number;
  inputCount: number;
  buttonCount: number;
  hasPasswordInput: boolean;
  hasLoginTextInForm: boolean;
}

const LOGIN_TOKENS_IN_FORM = ['login', 'sign in', 'signin', 'giriş', 'giris', 'oturum', 'admin', 'şifre', 'sifre', 'password'];

export async function extractDom(page: Page): Promise<DomExtractionResult> {
  try {
    const raw: DomEvalResult = await page.evaluate((loginTokens: string[]) => {
      const docTitle = (document.title ?? '').trim();
      const metaEl = document.querySelector('meta[name="description"]');
      const metaDescription = (metaEl?.getAttribute('content') ?? '').trim();

      const h1Texts = Array.from(document.querySelectorAll('h1'))
        .map((el) => (el.textContent ?? '').trim())
        .filter((t) => t.length > 0)
        .slice(0, 10);

      // Visible text — body.innerText TARAYICI tarafında render edilen metni döner
      // (display:none / hidden hariç). Whitespace normalize.
      const bodyText = (document.body?.innerText ?? '')
        .replace(/\s+/g, ' ')
        .trim();

      const links = document.querySelectorAll('a[href]');
      const forms = document.querySelectorAll('form');
      const inputs = document.querySelectorAll('input');
      const buttons = document.querySelectorAll('button, input[type="submit"], input[type="button"]');

      const hasPasswordInput = !!document.querySelector('input[type="password"]');

      // Form içinde login/admin sinyali ara — sadece form içi text
      let hasLoginTextInForm = false;
      for (const form of Array.from(forms)) {
        const formText = ((form as HTMLElement).innerText ?? '').toLowerCase();
        if (loginTokens.some((token) => formText.includes(token))) {
          hasLoginTextInForm = true;
          break;
        }
      }

      return {
        title: docTitle,
        metaDescription,
        h1Texts,
        visibleText: bodyText,
        linkCount: links.length,
        formCount: forms.length,
        inputCount: inputs.length,
        buttonCount: buttons.length,
        hasPasswordInput,
        hasLoginTextInForm,
      };
    }, LOGIN_TOKENS_IN_FORM);

    // Truncate visible text — büyük sayfalarda memory & DB friendly
    const visibleTextFull = raw.visibleText;
    const visibleTextTruncated = visibleTextFull.length > VISIBLE_TEXT_MAX_CHARS
      ? visibleTextFull.slice(0, VISIBLE_TEXT_MAX_CHARS)
      : visibleTextFull;
    // Hash, ORIGINAL (truncate öncesi) text üzerinden alınır → değişiklik tespiti
    // sonraki adımlar için daha hassas olur.
    const visibleTextHash = visibleTextFull.length > 0
      ? crypto.createHash('sha256').update(visibleTextFull).digest('hex')
      : null;

    return {
      title: raw.title || null,
      metaDescription: raw.metaDescription || null,
      h1Texts: raw.h1Texts,
      visibleText: visibleTextTruncated || null,
      visibleTextHash,
      linkCount: raw.linkCount,
      formCount: raw.formCount,
      inputCount: raw.inputCount,
      buttonCount: raw.buttonCount,
      hasPasswordInput: raw.hasPasswordInput,
      hasLoginTextInForm: raw.hasLoginTextInForm,
      error: null,
    };
  } catch (err) {
    const message = (err as Error).message ?? 'DOM_EXTRACTION_FAILED';
    return {
      title: null, metaDescription: null, h1Texts: [], visibleText: null, visibleTextHash: null,
      linkCount: 0, formCount: 0, inputCount: 0, buttonCount: 0,
      hasPasswordInput: false, hasLoginTextInForm: false,
      error: message,
    };
  }
}
