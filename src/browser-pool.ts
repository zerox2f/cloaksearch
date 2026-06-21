import { chromium, firefox, webkit } from 'playwright';
import { Browser } from 'playwright';

export class BrowserPool {
  private browsers: Map<string, Browser> = new Map();
  private maxBrowsers: number;
  private browserTypes: string[];
  private currentBrowserIndex = 0;
  private headless: boolean;
  private lastUsedBrowserType: string = '';

  constructor() {
    this.maxBrowsers = parseInt(process.env.MAX_BROWSERS || '3', 10);
    this.headless = process.env.BROWSER_HEADLESS !== 'false';

    const browserTypesEnv = process.env.BROWSER_TYPES || 'cloakbrowser';
    this.browserTypes = browserTypesEnv.split(',').map((type) => type.trim());

    console.log(
      `[BrowserPool] Configuration: maxBrowsers=${this.maxBrowsers}, headless=${this.headless}, types=${this.browserTypes.join(
        ','
      )}`
    );
  }

  async getBrowser(): Promise<Browser> {
    const browserType = this.browserTypes[this.currentBrowserIndex % this.browserTypes.length];
    this.currentBrowserIndex++;
    this.lastUsedBrowserType = browserType;

    if (this.browsers.has(browserType)) {
      const browser = this.browsers.get(browserType)!;

      try {
        if (browser.isConnected()) {
          const testContext = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
          });
          await testContext.close();
          return browser;
        }
      } catch (error) {
        console.log(`[BrowserPool] Browser ${browserType} health check failed:`, error);
        this.browsers.delete(browserType);
        try {
          await browser.close();
        } catch (closeError) {
          console.log(`[BrowserPool] Error closing unhealthy browser:`, closeError);
        }
      }
    }

    console.log(`[BrowserPool] Launching new ${browserType} browser`);

    const launchOptions = {
      headless: this.headless,
      args: [
        '--no-sandbox',
        '--disable-dev-shm-usage',
      ],
    };

    let browser: Browser;
    try {
      switch (browserType) {
        case 'firefox':
          browser = await firefox.launch(launchOptions);
          break;
        case 'chromium':
          browser = await chromium.launch(launchOptions);
          break;
        case 'webkit':
          browser = await webkit.launch(launchOptions);
          break;
        case 'cloakbrowser': {
          const { launch: cloakLaunch } = await import('cloakbrowser');
          browser = await cloakLaunch({
            headless: this.headless,
            humanize: true,
            args: ['--no-sandbox', '--disable-dev-shm-usage'],
          }) as unknown as Browser;
          break;
        }
        default:
          browser = await firefox.launch(launchOptions);
      }

      this.browsers.set(browserType, browser);

      if (this.browsers.size > this.maxBrowsers) {
        const oldestBrowser = this.browsers.entries().next().value;
        if (oldestBrowser) {
          try {
            await oldestBrowser[1].close();
          } catch (error) {
            console.error(`[BrowserPool] Error closing old browser:`, error);
          }
          this.browsers.delete(oldestBrowser[0]);
        }
      }

      return browser;
    } catch (error) {
      console.error(`[BrowserPool] Failed to launch ${browserType} browser:`, error);
      throw error;
    }
  }

  async closeAll(): Promise<void> {
    console.log(`[BrowserPool] Closing ${this.browsers.size} browsers`);

    const closePromises = Array.from(this.browsers.values()).map((browser) =>
      browser.close().catch((error) => console.error('Error closing browser:', error))
    );

    await Promise.all(closePromises);
    this.browsers.clear();
  }

  getLastUsedBrowserType(): string {
    return this.lastUsedBrowserType;
  }
}
