import { app, Notification, BrowserWindow } from 'electron';
import Store from 'electron-store';
import { IPC } from '../shared/ipc-channels';

const GITHUB_RELEASES_URL = 'https://api.github.com/repos/InbarR/tmax/releases/latest';
const CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const INITIAL_DELAY_MS = 5000;

interface VersionInfo {
  current: string;
  latest: string;
  url: string;
}

const versionStore = new Store({ name: 'tmax-version-check' });

function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/, '').split('.').map(Number);
  const pb = b.replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (na !== nb) return na - nb;
  }
  return 0;
}

export class VersionChecker {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private timeoutId: ReturnType<typeof setTimeout> | null = null;
  private latestInfo: VersionInfo | null = null;
  private mainWindow: BrowserWindow;

  constructor(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow;
  }

  start(): void {
    this.timeoutId = setTimeout(() => {
      this.check();
      this.intervalId = setInterval(() => this.check(), CHECK_INTERVAL_MS);
    }, INITIAL_DELAY_MS);
  }

  stop(): void {
    if (this.timeoutId) clearTimeout(this.timeoutId);
    if (this.intervalId) clearInterval(this.intervalId);
  }

  getUpdateInfo(): VersionInfo | null {
    return this.latestInfo;
  }

  async checkNow(): Promise<VersionInfo | null> {
    await this.check();
    return this.latestInfo;
  }

  private async check(): Promise<void> {
    try {
      const res = await fetch(GITHUB_RELEASES_URL, {
        headers: { 'User-Agent': 'tmax-update-checker' },
      });
      if (!res.ok) return;

      const data = await res.json();
      const tagName: string = data.tag_name;
      const htmlUrl: string = data.html_url;
      const currentVersion = app.getVersion();

      if (compareVersions(tagName, currentVersion) > 0) {
        const latestClean = tagName.replace(/^v/, '');
        this.latestInfo = {
          current: currentVersion,
          latest: latestClean,
          url: htmlUrl,
        };

        // Show native notification once per new version
        const lastNotified = versionStore.get('lastNotifiedVersion', '') as string;
        if (lastNotified !== latestClean && Notification.isSupported()) {
          const notification = new Notification({
            title: 'tmax Update Available',
            body: `Version ${latestClean} is available (you have ${currentVersion})`,
          });
          notification.show();
          versionStore.set('lastNotifiedVersion', latestClean);
        }

        // Push to renderer
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          this.mainWindow.webContents.send(IPC.VERSION_NEW_AVAILABLE, this.latestInfo);
        }
      } else {
        this.latestInfo = null;
      }
    } catch {
      // Silently ignore network errors
    }
  }
}
