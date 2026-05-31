// ASM Platform — Electron preload.
//
// Renderer'a güvenli bir köprü açar. Şu an minimal: sadece desktop bağlamında
// olduğumuzu bilmek isteyen UI parçaları için (ör. "Desktop" badge'i).
// Node API'leri renderer'a sızdırılmaz (contextIsolation: true, sandbox: true).

import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('asmDesktop', {
  version: '0.0.1',
  platform: process.platform,
  isElectron: true,
});

declare global {
  interface Window {
    asmDesktop?: {
      version: string;
      platform: string;
      isElectron: true;
    };
  }
}
