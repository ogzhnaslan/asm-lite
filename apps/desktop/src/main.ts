// ASM Platform — Electron main process.
//
// Demo-ready hibrit: backend (api/worker/postgres/redis/ollama) ayrı çalışmaya
// devam eder; bu süreç sadece UI shell sağlar.
//
// Dev mode:  VITE_DEV_SERVER_URL (default http://localhost:5173) yüklenir.
// Prod mode: extraResources içine paketlenen web/index.html file:// ile yüklenir.

import { app, BrowserWindow, Menu, shell, dialog } from 'electron';
import * as path from 'node:path';
import * as fs from 'node:fs';

const IS_DEV =
  process.env.NODE_ENV === 'development' ||
  Boolean(process.env.VITE_DEV_SERVER_URL) ||
  !app.isPackaged;

// 127.0.0.1 > localhost: localhost IPv6/IPv4 resolution Vite startup ile yarisir,
// bazi Windows kurulumlarinda ilk loadURL ERR_FAILED dondurur. 127.0.0.1 deterministik.
function normalizeDevUrl(raw: string): string {
  return raw.replace(/^http:\/\/localhost(:|\/|$)/i, 'http://127.0.0.1$1');
}
const DEV_SERVER_URL = normalizeDevUrl(process.env.VITE_DEV_SERVER_URL ?? 'http://127.0.0.1:5173');

// Multi-instance lock — kullanıcı çift tıklarsa ikinci pencere açılmasın,
// var olan focus alsın. Bitirme demo'su için sağlam UX.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

let mainWindow: BrowserWindow | null = null;

// ─── Window factory ──────────────────────────────────────────────────────────

function resolveProdIndexPath(): string | null {
  // electron-builder extraResources ile apps/web/dist → resources/web kopyalanır.
  // Dev runtime'ta (pnpm dev) dist yoksa fallback olarak monorepo path'i dene.
  const packagedPath = path.join(process.resourcesPath ?? '', 'web', 'index.html');
  if (fs.existsSync(packagedPath)) return packagedPath;

  // Local dev fallback — `pnpm --filter @asm/web build` çıktısı
  const localPath = path.resolve(__dirname, '..', '..', 'web', 'dist', 'index.html');
  if (fs.existsSync(localPath)) return localPath;

  return null;
}

function resolveIconPath(): string | undefined {
  // Var olmayan icon dosyası BrowserWindow'u patlatmasın — undefined döner.
  const candidates = [
    path.resolve(__dirname, '..', 'assets', 'icon.ico'),
    path.resolve(__dirname, '..', 'assets', 'icon.png'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return undefined;
}

function createMainWindow(): void {
  const iconPath = resolveIconPath();

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 720,
    title: 'ASM Platform',
    backgroundColor: '#020617',
    show: false, // ready-to-show'a kadar gizli — flash önler
    ...(iconPath ? { icon: iconPath } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // Prod'da file:// üzerinden çalışıyoruz; localhost API çağrıları için
      // webSecurity true kalır, CORS API tarafında zaten konfigüre edilmiş.
      webSecurity: true,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // ─── Yükleme ──────────────────────────────────────────────────────────────
  if (IS_DEV) {
    // Vite dev server bazen acilirken birkaç saniye bekletir; loadURL'i ilk fail'de
    // panic etmek yerine geri çekilerek tekrar dene. Tüm denemeler basarisiz olursa
    // kullaniciyi bilgilendir.
    void loadWithRetry(mainWindow, DEV_SERVER_URL, 5, 1500);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    const indexPath = resolveProdIndexPath();
    if (!indexPath) {
      showLoadError(
        'Web build çıktısı bulunamadı.\n\n' +
        '"pnpm --filter @asm/web build" komutunu çalıştırın, sonra desktop bundle\'ını yeniden oluşturun.',
      );
      return;
    }
    void mainWindow.loadFile(indexPath);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function showLoadError(message: string): void {
  // Pencere zaten oluştu — boş gri ekran yerine native dialog göster ve uygulamayı
  // çıkar. Demo'da bu yardım dökümantasyonu görevi de görür.
  dialog.showErrorBox('ASM Platform — Başlatılamadı', message);
  app.quit();
}

// Dev URL'i tolere et: Vite startup ile race olabilir, ilk fail panic etmemeli.
async function loadWithRetry(
  win: BrowserWindow,
  url: string,
  maxAttempts: number,
  delayMs: number,
): Promise<void> {
  let lastErr: Error | null = null;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      await win.loadURL(url);
      return; // basari
    } catch (err) {
      lastErr = err as Error;
      console.log(`[main] loadURL attempt ${i + 1}/${maxAttempts} failed: ${lastErr.message}`);
      if (i < maxAttempts - 1) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }
  showLoadError(
    `Vite dev sunucusuna bağlanılamadı: ${url}\n\n` +
      `${lastErr?.message ?? 'unknown'}\n\n` +
      `"pnpm dev:web" komutunun çalıştığından ve port 5173'ün açık olduğundan emin olun.`,
  );
}

// ─── Güvenlik kapıları ───────────────────────────────────────────────────────
//
// Renderer'da window.open / target=_blank / <a href>: sistem tarayıcısında aç.
// In-app navigasyon yalnızca dev server URL'i veya local file için izinli.

function isAllowedUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (IS_DEV && u.origin === new URL(DEV_SERVER_URL).origin) return true;
    if (u.protocol === 'file:') return true;
    return false;
  } catch {
    return false;
  }
}

app.on('web-contents-created', (_event, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    // window.open / target=_blank → her zaman default browser
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  contents.on('will-navigate', (event, url) => {
    if (!isAllowedUrl(url)) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });
});

// ─── Menu ────────────────────────────────────────────────────────────────────

function buildMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'Dosya',
      submenu: [{ role: 'quit', label: 'Çıkış' }],
    },
    {
      label: 'Görünüm',
      submenu: [
        { role: 'reload', label: 'Yenile' },
        { role: 'forceReload', label: 'Zorla Yenile' },
        { role: 'toggleDevTools', label: 'Geliştirici Araçları', accelerator: 'F12' },
        { type: 'separator' },
        { role: 'resetZoom', label: 'Yakınlaştırmayı Sıfırla' },
        { role: 'zoomIn', label: 'Yakınlaştır' },
        { role: 'zoomOut', label: 'Uzaklaştır' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Tam Ekran' },
      ],
    },
    {
      label: 'Pencere',
      submenu: [
        { role: 'minimize', label: 'Küçült' },
        { role: 'close', label: 'Kapat' },
      ],
    },
    {
      label: 'Yardım',
      submenu: [
        {
          label: 'Hakkında',
          click: () => {
            dialog.showMessageBox({
              type: 'info',
              title: 'ASM Platform',
              message: 'ASM Platform — Attack Surface Monitor',
              detail:
                'Hibrit masaüstü uygulama (Electron).\n' +
                'Backend, worker, PostgreSQL, Redis ve Ollama ayrı süreçlerde çalışır.\n\n' +
                `Mod: ${IS_DEV ? 'Development' : 'Production'}\n` +
                `Electron: ${process.versions.electron}\n` +
                `Chromium: ${process.versions.chrome}\n` +
                `Node: ${process.versions.node}`,
              buttons: ['Tamam'],
            });
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// ─── App lifecycle ───────────────────────────────────────────────────────────

app.whenReady().then(() => {
  buildMenu();
  createMainWindow();

  app.on('activate', () => {
    // macOS: dock'tan tekrar tıklama
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
