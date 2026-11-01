import type { CircuitDocument } from '@circuitlab/circuit-core';

export interface StoredCircuit {
  id: string;
  name: string;
  updatedAt: string;
  doc: CircuitDocument;
}

export interface StorageAdapter {
  readonly kind: 'web' | 'wechat';
  isAvailable(): boolean;
  list(): Promise<StoredCircuit[]>;
  save(doc: CircuitDocument): Promise<void>;
  load(id: string): Promise<CircuitDocument | null>;
  remove(id: string): Promise<void>;
}

export interface ShareAdapter {
  share(payload: { title: string; text: string; url?: string }): Promise<'shared' | 'copied' | 'unsupported'>;
}

export interface ExportAdapter {
  saveFile(filename: string, content: string, mime: string): Promise<boolean>;
}

export interface NavigationAdapter {
  openExternal(url: string): Promise<void>;
  readFileAsText?(): Promise<string | null>;
}

export interface SafeArea {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface PlatformInfoAdapter {
  platform: 'web' | 'wechat';
  isTouch: boolean;
  safeArea: SafeArea;
  appName: string;
  version: string;
}

export interface PlatformAdapters {
  storage: StorageAdapter;
  share: ShareAdapter;
  exporter: ExportAdapter;
  navigation: NavigationAdapter;
  info: PlatformInfoAdapter;
}

const DB_NAME = 'circuitlab';
const DB_VERSION = 1;
const STORE = 'circuits';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB error'));
  });
}

class BrowserStorage implements StorageAdapter {
  readonly kind = 'web' as const;

  isAvailable(): boolean {
    return typeof indexedDB !== 'undefined';
  }

  async list(): Promise<StoredCircuit[]> {
    try {
      const db = await openDatabase();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly');
        const request = tx.objectStore(STORE).getAll();
        request.onsuccess = () => {
          const rows = (request.result as StoredCircuit[]) ?? [];
          resolve(rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
          db.close();
        };
        request.onerror = () => reject(request.error);
      });
    } catch {
      return this.localList();
    }
  }

  async save(doc: CircuitDocument): Promise<void> {
    const record: StoredCircuit = {
      id: doc.id,
      name: doc.name,
      updatedAt: new Date().toISOString(),
      doc,
    };
    try {
      const db = await openDatabase();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(record);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      this.localSave(record);
    }
  }

  async load(id: string): Promise<CircuitDocument | null> {
    try {
      const db = await openDatabase();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly');
        const request = tx.objectStore(STORE).get(id);
        request.onsuccess = () => {
          const row = request.result as StoredCircuit | undefined;
          db.close();
          resolve(row?.doc ?? null);
        };
        request.onerror = () => reject(request.error);
      });
    } catch {
      return this.localList().find((r) => r.id === id)?.doc ?? null;
    }
  }

  async remove(id: string): Promise<void> {
    try {
      const db = await openDatabase();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(id);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      const rows = this.localList().filter((r) => r.id !== id);
      localStorage.setItem('circuitlab.circuits', JSON.stringify(rows));
    }
  }

  private localList(): StoredCircuit[] {
    try {
      const raw = localStorage.getItem('circuitlab.circuits');
      return raw ? (JSON.parse(raw) as StoredCircuit[]) : [];
    } catch {
      return [];
    }
  }

  private localSave(record: StoredCircuit): void {
    const rows = this.localList().filter((r) => r.id !== record.id);
    rows.push(record);
    localStorage.setItem('circuitlab.circuits', JSON.stringify(rows));
  }
}

const webStorage = new BrowserStorage();

const webShare: ShareAdapter = {
  async share(payload) {
    const url = payload.url ?? (typeof location !== 'undefined' ? location.href : '');
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try {
        await navigator.share({ title: payload.title, text: payload.text, url });
        return 'shared';
      } catch {
        // fall through to clipboard
      }
    }
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(`${payload.title}\n${payload.text}\n${url}`);
        return 'copied';
      } catch {
        return 'unsupported';
      }
    }
    return 'unsupported';
  },
};

const webExporter: ExportAdapter = {
  async saveFile(filename, content, mime) {
    if (typeof document === 'undefined') return false;
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  },
};

const webNavigation: NavigationAdapter = {
  async openExternal(url) {
    if (typeof window !== 'undefined') window.open(url, '_blank', 'noopener,noreferrer');
  },
  async readFileAsText() {
    if (typeof document === 'undefined') return null;
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'application/json,.json';
      input.onchange = () => {
        const file = input.files?.[0];
        if (!file) {
          resolve(null);
          return;
        }
        const reader = new FileReader();
        reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
        reader.onerror = () => resolve(null);
        reader.readAsText(file);
      };
      input.click();
    });
  },
};

const webInfo: PlatformInfoAdapter = {
  platform: 'web',
  isTouch: typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0,
  safeArea: { top: 0, right: 0, bottom: 0, left: 0 },
  appName: 'CircuitLab Physics',
  version: '0.1.0',
};

export function createWebAdapters(): PlatformAdapters {
  return {
    storage: webStorage,
    share: webShare,
    exporter: webExporter,
    navigation: webNavigation,
    info: webInfo,
  };
}

// ---------------------------------------------------------------------------
// WeChat mini-program adapters (Phase 2). They are real implementations of the
// same interfaces, using the wx API when it exists, and never import DOM code.
// ---------------------------------------------------------------------------

interface WeChatApi {
  getStorageSync(key: string): unknown;
  setStorageSync(key: string, value: unknown): void;
  removeStorageSync(key: string): void;
  shareAppMessage?(payload: { title: string; path: string }): void;
  showShareMenu?(payload: { withShareTicket: boolean }): void;
  getFileSystemManager?(): {
    writeFileSync(path: string, data: string, encoding: string): void;
  };
  env?: { USER_DATA_PATH?: string };
  navigateTo?(payload: { url: string }): void;
  getWindowInfo?(): { safeArea?: { top: number; bottom: number; left: number; right: number }; screenHeight?: number };
  getDeviceInfo?(): { model?: string; system?: string };
}

function wxApi(): WeChatApi | undefined {
  return (globalThis as unknown as { wx?: WeChatApi }).wx;
}

export class WeChatStorage implements StorageAdapter {
  readonly kind = 'wechat' as const;
  private readonly key = 'circuitlab.circuits';

  isAvailable(): boolean {
    return Boolean(wxApi());
  }

  async list(): Promise<StoredCircuit[]> {
    const api = wxApi();
    if (!api) return [];
    const rows = api.getStorageSync(this.key);
    return Array.isArray(rows) ? (rows as StoredCircuit[]) : [];
  }

  async save(doc: CircuitDocument): Promise<void> {
    const api = wxApi();
    if (!api) throw new Error('wx storage unavailable');
    const rows = (await this.list()).filter((r) => r.id !== doc.id);
    rows.push({ id: doc.id, name: doc.name, updatedAt: new Date().toISOString(), doc });
    api.setStorageSync(this.key, rows);
  }

  async load(id: string): Promise<CircuitDocument | null> {
    const rows = await this.list();
    return rows.find((r) => r.id === id)?.doc ?? null;
  }

  async remove(id: string): Promise<void> {
    const api = wxApi();
    if (!api) return;
    const rows = (await this.list()).filter((r) => r.id !== id);
    api.setStorageSync(this.key, rows);
  }
}

export function createWeChatAdapters(): PlatformAdapters {
  const storage = new WeChatStorage();
  return {
    storage,
    share: {
      async share(payload) {
        const api = wxApi();
        if (!api?.shareAppMessage) return 'unsupported';
        api.shareAppMessage({ title: payload.title, path: '/pages/index/index' });
        return 'shared';
      },
    },
    exporter: {
      async saveFile(filename, content) {
        const api = wxApi();
        const fs = api?.getFileSystemManager?.();
        const dir = api?.env?.USER_DATA_PATH;
        if (!fs || !dir) return false;
        fs.writeFileSync(`${dir}/${filename}`, content, 'utf8');
        return true;
      },
    },
    navigation: {
      async openExternal(url) {
        const api = wxApi();
        // GitHub Pages / custom domains must be registered as business domains
        // before a mini-program web-view can open them.
        if (api?.navigateTo) api.navigateTo({ url });
      },
      async readFileAsText() {
        return null;
      },
    },
    info: {
      platform: 'wechat',
      isTouch: true,
      safeArea: (() => {
        const info = wxApi()?.getWindowInfo?.();
        const safe = info?.safeArea;
        if (!safe) return { top: 0, right: 0, bottom: 0, left: 0 };
        return { top: safe.top, right: safe.right, bottom: safe.bottom, left: safe.left };
      })(),
      appName: 'CircuitLab Physics',
      version: '0.1.0',
    },
  };
}

export function detectPlatform(): 'web' | 'wechat' {
  return wxApi() ? 'wechat' : 'web';
}

let cached: PlatformAdapters | null = null;

export function getAdapters(): PlatformAdapters {
  if (!cached) {
    cached = detectPlatform() === 'wechat' ? createWeChatAdapters() : createWebAdapters();
  }
  return cached;
}
