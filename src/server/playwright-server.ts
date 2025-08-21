import express from 'express';
import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { v4 as uuidv4 } from 'uuid';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import type { Request, Response } from 'express';
import type { Server } from 'http';
import { cleanHtmlWithXp, parseHtml } from '../extractor/parse2.js';
import { simplifyHtml } from '../extractor/simplify-html.js';
import * as cheerio from 'cheerio';
import { diffLines } from 'diff';
import fs from 'fs';
import crypto from 'crypto';

// 为 ES 模块创建 require 函数和路径变量
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const requireFunc = createRequire(import.meta.url);

interface PageInfo {
  pageId: string;
  name: string;
  description: string;
  page: Page;
  operationCounter: number;
}

interface BrowserOptions {
  headless?: boolean;
  chromium?: boolean;
  userProfile?: boolean;
  userDataDir?: string;
  userAgent?: string;
  args?: string[];
}

interface SnapshotMetadata {
  url: string;
  title: string;
  timestamp: string;
  format?: string;
  options?: any;
}

interface SnapshotResult {
  pageId: string;
  type: string;
  data: any;
  metadata: SnapshotMetadata;
}

interface SnapshotResponse {
  snapshotType: 'full' | 'diff';
  snapshot: string;
}

class PlaywrightServer {
  private browser: Browser | null = null;
  private browserContext: BrowserContext | null = null;
  private persistentContext: BrowserContext | null = null;
  private pages: Map<string, PageInfo> = new Map();
  private activePageId: string | null = null;
  private httpServer: Server | null = null;
  private app: express.Application;
  private browserOptions: Required<BrowserOptions>;
  private snapshotCache: Map<string, string> = new Map();

  private getFormattedTimestamp(): string {
    const now = new Date();
    return now.toLocaleString('zh-CN', {
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }) + ' ' + now.toTimeString().slice(9, 15);
  }

  constructor(options: BrowserOptions = {}) {
    this.app = express();
    this.app.use(express.json());
    
    this.browserOptions = {
      headless: false,
      chromium: false,
      userProfile: true,
      userDataDir: path.join(os.homedir(), '.browser-mcp-data'),
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      args: [
        '--disable-blink-features=AutomationControlled',
        '--exclude-switches=enable-automation',
        '--disable-dev-shm-usage',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-features=IsolateOrigins,site-per-process',
        '--flag-switches-begin',
        '--disable-site-isolation-trials',
        '--flag-switches-end',
        '--window-size=1920,1080',
        '--start-maximized',
        '--disable-notifications',
        '--disable-extensions',
        '--disable-default-apps',
        '--disable-infobars',
        '--mute-audio',
        '--no-first-run',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-features=TranslateUI',
        '--disable-ipc-flooding-protection',
        '--password-store=basic',
        '--use-mock-keychain',
        '--force-color-profile=srgb',
        // 额外的反 Cloudflare 参数
        '--enable-features=NetworkService,NetworkServiceInProcess',
        '--disable-features=VizDisplayCompositor',
        '--lang=zh-CN',
        '--disable-features=UserAgentClientHint',
        '--disable-web-security',
        '--allow-running-insecure-content',
        '--disable-features=CrossSiteDocumentBlockingAlways,CrossSiteDocumentBlockingIfIsolating',
        '--disable-site-isolation-for-policy',
        '--disable-features=AudioServiceOutOfProcess',
        '--disable-features=IsolateOrigins',
        '--disable-speech-api',
        '--disable-features=InstalledApp',
        '--disable-features=OptimizationHints',
        '--disable-features=Translate',
        '--disable-features=ImprovedCookieControls',
        '--disable-component-update',
        '--disable-domain-reliability',
        '--disable-features=AudioServiceOutOfProcess',
        '--disable-features=OutOfBlinkCors',
        '--disable-hang-monitor',
        '--disable-popup-blocking',
        '--disable-prompt-on-repost',
        '--metrics-recording-only',
        '--no-default-browser-check',
        '--enable-automation=false',
        '--disable-features=site-per-process'
      ],
      ...options
    };
    
    this.setupRoutes();
  }

  private setupRoutes(): void {
    // 创建页面
    this.app.post('/api/pages', async (req: Request, res: Response) => {
      try {
        const { name, description, url, waitForTimeout } = req.body;
        if (!name || !description) {
          res.status(400).json({ error: 'name and description are required' });
          return;
        }
        
        const result = await this.createPage(name, description, url, waitForTimeout);
        res.json(result);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // 激活页面
    this.app.post('/api/pages/:pageId/activate', (req: Request, res: Response) => {
      try {
        const { pageId } = req.params;
        this.activePage(pageId);
        res.json({ success: true });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // 使用页面执行脚本
    this.app.post('/api/pages/:pageId/execute', async (req: Request, res: Response) => {
      try {
        const { pageId } = req.params;
        const { script } = req.body;
        
        if (!script) {
          res.status(400).json({ error: 'script is required' });
          return;
        }
        
        const result = await this.usePage(pageId, script);
        res.json(result);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // 关闭页面
    this.app.delete('/api/pages/:pageId', async (req: Request, res: Response) => {
      try {
        const { pageId } = req.params;
        await this.closePage(pageId);
        res.json({ success: true });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // 列出所有页面
    this.app.get('/api/pages', async (req: Request, res: Response) => {
      try {
        const pages = await this.listPages();
        res.json({ pages });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // 关闭所有页面
    this.app.delete('/api/pages', async (req: Request, res: Response) => {
      try {
        await this.closeAllPages();
        res.json({ success: true });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // 列出所有无ID页面
    this.app.get('/api/pages-without-id', async (req: Request, res: Response) => {
      try {
        const pages = await this.listPagesWithoutId();
        res.json({ pages });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // 关闭所有无ID页面
    this.app.delete('/api/pages-without-id', async (req: Request, res: Response) => {
      try {
        await this.closePagesWithoutId();
        res.json({ success: true });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // 通过索引关闭页面
    this.app.delete('/api/pages/index/:index', async (req: Request, res: Response) => {
      try {
        const index = parseInt(req.params.index);
        await this.closePageByIndex(index);
        res.json({ success: true });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // 快照接口
    // 可访问性快照
    this.app.post('/api/pages/:pageId/accessibility', async (req: Request, res: Response) => {
      try {
        const { pageId } = req.params;
        const { interestingOnly = true, root } = req.body;
        const snapshot = await this.getAccessibilitySnapshot(pageId, { interestingOnly, root });
        res.json(snapshot);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // 截图快照
    this.app.post('/api/pages/:pageId/screenshot', async (req: Request, res: Response) => {
      try {
        const { pageId } = req.params;
        const options = req.body;
        const snapshot = await this.getScreenshot(pageId, options);
        res.json(snapshot);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // PDF 快照
    this.app.post('/api/pages/:pageId/pdf', async (req: Request, res: Response) => {
      try {
        const { pageId } = req.params;
        const options = req.body;
        const snapshot = await this.getPDFSnapshot(pageId, options);
        res.json(snapshot);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // 页面语义化简化快照
    this.app.post('/api/pages/:pageId/snapshot', async (req: Request, res: Response) => {
      try {
        const { pageId } = req.params;
        const snapshot = await this.getPageSnapshot(pageId);
        res.type('text/plain').send(snapshot);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // 浏览器操作接口
    this.app.post('/api/pages/:pageId/click', async (req: Request, res: Response) => {
      try {
        const { pageId } = req.params;
        const { ref, waitForTimeout = 2000 } = req.body;
        const snapshotResponse = await this.browserClick(pageId, ref, waitForTimeout);
        res.json(snapshotResponse);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/pages/:pageId/type', async (req: Request, res: Response) => {
      try {
        const { pageId } = req.params;
        const { ref, text, submit, slowly, waitForTimeout = 2000 } = req.body;
        const snapshotResponse = await this.browserType(pageId, ref, text, submit, slowly, waitForTimeout);
        res.json(snapshotResponse);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/pages/:pageId/hover', async (req: Request, res: Response) => {
      try {
        const { pageId } = req.params;
        const { ref, waitForTimeout = 2000 } = req.body;
        const snapshotResponse = await this.browserHover(pageId, ref, waitForTimeout);
        res.json(snapshotResponse);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/pages/:pageId/select-option', async (req: Request, res: Response) => {
      try {
        const { pageId } = req.params;
        const { ref, values, waitForTimeout = 2000 } = req.body;
        const snapshotResponse = await this.browserSelectOption(pageId, ref, values, waitForTimeout);
        res.json(snapshotResponse);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/pages/:pageId/press-key', async (req: Request, res: Response) => {
      try {
        const { pageId } = req.params;
        const { key, ref, waitForTimeout = 2000 } = req.body;
        const snapshotResponse = await this.browserPressKey(pageId, key, ref, waitForTimeout);
        res.json(snapshotResponse);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/pages/:pageId/file-upload', async (req: Request, res: Response) => {
      try {
        const { pageId } = req.params;
        const { ref, paths, waitForTimeout = 2000 } = req.body;
        const snapshotResponse = await this.browserFileUpload(pageId, ref, paths, waitForTimeout);
        res.json(snapshotResponse);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/pages/:pageId/handle-dialog', async (req: Request, res: Response) => {
      try {
        const { pageId } = req.params;
        const { accept, promptText, waitForTimeout = 2000 } = req.body;
        const snapshotResponse = await this.browserHandleDialog(pageId, accept, promptText, waitForTimeout);
        res.json(snapshotResponse);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/pages/:pageId/navigate', async (req: Request, res: Response) => {
      try {
        const { pageId } = req.params;
        const { url, waitForTimeout = 2000 } = req.body;
        const snapshotResponse = await this.browserNavigate(pageId, url, waitForTimeout);
        res.json(snapshotResponse);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/pages/:pageId/navigate-back', async (req: Request, res: Response) => {
      try {
        const { pageId } = req.params;
        const { waitForTimeout = 2000 } = req.body;
        const snapshotResponse = await this.browserNavigateBack(pageId, waitForTimeout);
        res.json(snapshotResponse);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/pages/:pageId/navigate-forward', async (req: Request, res: Response) => {
      try {
        const { pageId } = req.params;
        const { waitForTimeout = 2000 } = req.body;
        const snapshotResponse = await this.browserNavigateForward(pageId, waitForTimeout);
        res.json(snapshotResponse);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // 滚动到底部接口
    this.app.post('/api/pages/:pageId/scroll-to-bottom', async (req: Request, res: Response) => {
      try {
        const { pageId } = req.params;
        const { selector, waitForTimeout = 2000 } = req.body;
        const snapshotResponse = await this.scrollToBottom(pageId, selector, waitForTimeout);
        res.json(snapshotResponse);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // 滚动到顶部接口
    this.app.post('/api/pages/:pageId/scroll-to-top', async (req: Request, res: Response) => {
      try {
        const { pageId } = req.params;
        const { selector, waitForTimeout = 2000 } = req.body;
        const snapshotResponse = await this.scrollToTop(pageId, selector, waitForTimeout);
        res.json(snapshotResponse);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // 等待超时接口
    this.app.post('/api/pages/:pageId/wait-for-timeout', async (req: Request, res: Response) => {
      try {
        const { pageId } = req.params;
        const { ms } = req.body;
        
        if (typeof ms !== 'number' || ms < 0) {
          res.status(400).json({ error: 'ms must be a non-negative number' });
          return;
        }
        
        await this.waitForTimeout(pageId, ms);
        res.json({ success: true });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // 等待选择器接口
    this.app.post('/api/pages/:pageId/wait-for-selector', async (req: Request, res: Response) => {
      try {
        const { pageId } = req.params;
        const { selector, timeout, state } = req.body;
        
        if (!selector || typeof selector !== 'string') {
          res.status(400).json({ error: 'selector is required and must be a string' });
          return;
        }
        
        const options: any = {};
        if (timeout !== undefined) options.timeout = timeout;
        if (state !== undefined) options.state = state;
        
        await this.waitForSelector(pageId, selector, options);
        res.json({ success: true });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // 数据提取接口 - DISABLED
    this.app.post('/api/pages/:pageId/extractData', async (req: Request, res: Response) => {
      try {
        const { pageId } = req.params;
        const { extractorFunction } = req.body;
        
        if (!extractorFunction) {
          res.status(400).json({ error: 'extractorFunction is required' });
          return;
        }
        
        const result = await this.extractData(pageId, extractorFunction);
        res.json(result);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // 获取元素HTML结构接口
    this.app.post('/api/pages/:pageId/element-html', async (req: Request, res: Response) => {
      try {
        const { pageId } = req.params;
        const { ref } = req.body;
        
        if (!ref) {
          res.status(400).json({ error: 'ref is required' });
          return;
        }
        
        const result = await this.getElementHTML(pageId, ref);
        res.json(result);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // 保存页面处理后的 HTML 到文件
    this.app.post('/api/pages/:pageId/page-to-html-file', async (req: Request, res: Response) => {
      try {
        const { pageId } = req.params;
        const result = await this.pageToHtmlFile(pageId);
        res.json(result);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // 下载图片接口
    this.app.post('/api/download-image', async (req: Request, res: Response) => {
      try {
        const { url } = req.body;
        
        if (!url) {
          res.status(400).json({ error: 'url is required' });
          return;
        }
        
        const localPath = await this.downloadImage(url);
        res.json({ localPath });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    console.log('✅ API路由注册完成');
  }

  private async ensureBrowser(): Promise<void> {
    // 用户配置文件模式（持久化）
    if (this.browserOptions.userProfile && !this.browserOptions.headless && !this.browserOptions.chromium) {
      if (!this.persistentContext || !this.persistentContext.browser()?.isConnected()) {
        this.persistentContext = await chromium.launchPersistentContext(
          this.browserOptions.userDataDir,
          {
            headless: this.browserOptions.headless,
            channel: this.browserOptions.chromium ? undefined : 'chrome',
            viewport: null,
            userAgent: this.browserOptions.userAgent,
            args: this.browserOptions.args
          }
        );
        
        // 注入反检测脚本
        await this.injectStealthScript(this.persistentContext);
      }
    } else {
      // 标准模式
      if (!this.browser || !this.browserContext) {
        if (this.browser) {
          await this.browser.close();
        }
        
        const launchOptions = {
          headless: this.browserOptions.headless,
          channel: this.browserOptions.chromium ? undefined : 'chrome' as 'chrome',
          args: this.browserOptions.args
        };
        
        this.browser = await chromium.launch(launchOptions);
        this.browserContext = await this.browser.newContext({
          viewport: null,
          userAgent: this.browserOptions.userAgent
        });
        
        // 注入反检测脚本
        await this.injectStealthScript(this.browserContext);
      }
    }
  }

  private async injectStealthScript(context: BrowserContext): Promise<void> {
    await context.addInitScript(() => {
      // 隐藏 webdriver 属性
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined
      });
      
      // 删除 window.navigator.webdriver
      delete (navigator as any).__proto__.webdriver;
      
      // 修改 plugins 数量，模拟真实浏览器插件
      Object.defineProperty(navigator, 'plugins', {
        get: () => {
          return {
            0: {
              description: "Portable Document Format",
              filename: "internal-pdf-viewer",
              length: 1,
              name: "Chrome PDF Plugin"
            },
            1: {
              description: "Portable Document Format",
              filename: "internal-pdf-viewer",
              length: 1,
              name: "Chrome PDF Viewer"
            },
            2: {
              description: "Native Client",
              filename: "internal-nacl-plugin",
              length: 2,
              name: "Native Client"
            },
            length: 3,
            item: function(index: number) { return this[index]; },
            namedItem: function(name: string) { return null; },
            refresh: function() {}
          };
        }
      });
      
      // 修改语言设置
      Object.defineProperty(navigator, 'languages', {
        get: () => ['zh-CN', 'zh', 'en-US', 'en']
      });
      
      Object.defineProperty(navigator, 'language', {
        get: () => 'zh-CN'
      });
      
      // 添加完整的 chrome 对象
      if (!(window as any).chrome) {
        (window as any).chrome = {
          app: {
            isInstalled: false,
            InstallState: {
              DISABLED: 'disabled',
              INSTALLED: 'installed',
              NOT_INSTALLED: 'not_installed'
            },
            RunningState: {
              CANNOT_RUN: 'cannot_run',
              READY_TO_RUN: 'ready_to_run',
              RUNNING: 'running'
            }
          },
          runtime: {
            OnInstalledReason: {
              CHROME_UPDATE: 'chrome_update',
              INSTALL: 'install',
              SHARED_MODULE_UPDATE: 'shared_module_update',
              UPDATE: 'update'
            },
            OnRestartRequiredReason: {
              APP_UPDATE: 'app_update',
              OS_UPDATE: 'os_update',
              PERIODIC: 'periodic'
            },
            PlatformArch: {
              ARM: 'arm',
              ARM64: 'arm64',
              MIPS: 'mips',
              MIPS64: 'mips64',
              X86_32: 'x86-32',
              X86_64: 'x86-64'
            },
            PlatformNaclArch: {
              ARM: 'arm',
              MIPS: 'mips',
              MIPS64: 'mips64',
              X86_32: 'x86-32',
              X86_64: 'x86-64'
            },
            PlatformOs: {
              ANDROID: 'android',
              CROS: 'cros',
              LINUX: 'linux',
              MAC: 'mac',
              OPENBSD: 'openbsd',
              WIN: 'win'
            },
            RequestUpdateCheckStatus: {
              NO_UPDATE: 'no_update',
              THROTTLED: 'throttled',
              UPDATE_AVAILABLE: 'update_available'
            }
          },
          loadTimes: function() {
            return {
              commitLoadTime: 1678886400.123,
              connectionInfo: "http/1.1",
              finishDocumentLoadTime: 1678886400.456,
              finishLoadTime: 1678886400.789,
              firstPaintAfterLoadTime: 0,
              firstPaintTime: 1678886400.234,
              navigationType: "Other",
              npnNegotiatedProtocol: "unknown",
              requestTime: 1678886400.000,
              startLoadTime: 1678886400.100,
              wasAlternateProtocolAvailable: false,
              wasFetchedViaSpdy: false,
              wasNpnNegotiated: false
            };
          },
          csi: function() {
            return {
              onloadT: 1678886400789,
              pageT: 789,
              startE: 1678886400000,
              tran: 15
            };
          }
        };
      }
      
      // 修改权限查询
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters: any) => (
        parameters.name === 'notifications' ?
          Promise.resolve({ 
            state: 'denied' as PermissionState,
            name: 'notifications' as PermissionName,
            onchange: null,
            addEventListener: () => {},
            removeEventListener: () => {},
            dispatchEvent: () => true
          }) :
          originalQuery(parameters)
      );
      
      // 覆盖 CDP 检测
      const originalToString = Function.prototype.toString;
      Function.prototype.toString = function() {
        if (this === window.navigator.permissions.query) {
          return 'function query() { [native code] }';
        }
        return originalToString.call(this);
      };
      
      // 修改 platform
      Object.defineProperty(navigator, 'platform', {
        get: () => 'MacIntel'
      });
      
      // 修改硬件并发数
      Object.defineProperty(navigator, 'hardwareConcurrency', {
        get: () => 8
      });
      
      // 修改设备内存
      Object.defineProperty(navigator, 'deviceMemory', {
        get: () => 8
      });
      
      // 添加电池 API
      Object.defineProperty(navigator, 'getBattery', {
        get: () => () => Promise.resolve({
          charging: true,
          chargingTime: 0,
          dischargingTime: Infinity,
          level: 1,
          addEventListener: () => {},
          removeEventListener: () => {},
          dispatchEvent: () => true
        })
      });
      
      // 修改 connection
      Object.defineProperty(navigator, 'connection', {
        get: () => ({
          downlink: 10,
          effectiveType: '4g',
          rtt: 50,
          saveData: false,
          addEventListener: () => {},
          removeEventListener: () => {},
          dispatchEvent: () => true
        })
      });
      
      // WebGL 厂商和渲染器
      const getParameter = WebGLRenderingContext.prototype.getParameter;
      WebGLRenderingContext.prototype.getParameter = function(parameter) {
        if (parameter === 37445) {
          return 'Intel Inc.';
        }
        if (parameter === 37446) {
          return 'Intel Iris OpenGL Engine';
        }
        return getParameter.call(this, parameter);
      };
      
      const getParameter2 = WebGL2RenderingContext.prototype.getParameter;
      WebGL2RenderingContext.prototype.getParameter = function(parameter) {
        if (parameter === 37445) {
          return 'Intel Inc.';
        }
        if (parameter === 37446) {
          return 'Intel Iris OpenGL Engine';
        }
        return getParameter2.call(this, parameter);
      };
      
      // 隐藏 Playwright 特有的属性
      delete (window as any).__playwright;
      delete (window as any).__pw_manual;
      delete (window as any).__PW_inspect;
      
      // 修改 window.navigator 的 prototype
      const navProto = Object.getPrototypeOf(navigator);
      delete navProto.webdriver;
      
      // 防止通过 iframe 检测
      const originalAppendChild = HTMLElement.prototype.appendChild;
      HTMLElement.prototype.appendChild = function<T extends Node>(child: T): T {
        if (child instanceof HTMLIFrameElement) {
          setTimeout(() => {
            if (child.contentWindow) {
              delete (child.contentWindow as any).__playwright;
              delete (child.contentWindow as any).__pw_manual;
              delete (child.contentWindow as any).__PW_inspect;
            }
          }, 0);
        }
        return originalAppendChild.call(this, child) as T;
      };
      
      // 修复 toString 检测
      const nativeToStringFunctionString = Function.prototype.toString.toString();
      Function.prototype.toString = new Proxy(Function.prototype.toString, {
        apply: function (target, thisArg, argumentsList) {
          if (thisArg === Function.prototype.toString) {
            return nativeToStringFunctionString;
          }
          return target.apply(thisArg, argumentsList as []);
        }
      });
      
      // 添加 maxTouchPoints
      Object.defineProperty(navigator, 'maxTouchPoints', {
        get: () => 0
      });
      
      // 修改 vendor
      Object.defineProperty(navigator, 'vendor', {
        get: () => 'Google Inc.'
      });
      
      // 修改 appVersion
      Object.defineProperty(navigator, 'appVersion', {
        get: () => '5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
      });
      
      // 添加 mimeTypes
      Object.defineProperty(navigator, 'mimeTypes', {
        get: () => ({
          length: 4,
          0: {
            type: 'application/pdf',
            suffixes: 'pdf',
            description: 'Portable Document Format',
            enabledPlugin: navigator.plugins[0]
          },
          1: {
            type: 'application/x-google-chrome-pdf',
            suffixes: 'pdf',
            description: 'Portable Document Format',
            enabledPlugin: navigator.plugins[1]
          },
          2: {
            type: 'application/x-nacl',
            suffixes: '',
            description: 'Native Client Executable',
            enabledPlugin: navigator.plugins[2]
          },
          3: {
            type: 'application/x-pnacl',
            suffixes: '',
            description: 'Portable Native Client Executable',
            enabledPlugin: navigator.plugins[2]
          },
          item: function(index: number) { return this[index]; },
          namedItem: function(name: string) { return null; }
        })
      });
    });
  }

  async createPage(name: string, description: string, url?: string, waitForTimeout?: number): Promise<any> {
    await this.ensureBrowser();
    
    const pageId = uuidv4();
    let page: Page;
    
    if (this.persistentContext) {
      // 持久化模式：直接从持久化上下文创建页面
      page = await this.persistentContext.newPage();
    } else {
      // 标准模式：从浏览器上下文创建页面
      page = await this.browserContext!.newPage();
    }
    
    const pageInfo: PageInfo = {
      pageId,
      name,
      description,
      page,
      operationCounter: 0
    };
    
    this.pages.set(pageId, pageInfo);
    
    
    // 如果没有激活页面，自动激活这个页面
    if (!this.activePageId) {
      this.activePageId = pageId;
    }
    
    // 如果提供了 URL，调用现有的导航函数
    if (url) {
      const navigateResult = await this.browserNavigate(pageId, url, waitForTimeout);
      return { pageId, ...navigateResult };
    }
    
    return { pageId };
  }

  activePage(pageId: string): void {
    if (!this.pages.has(pageId)) {
      throw new Error(`Page with ID ${pageId} not found`);
    }
    this.activePageId = pageId;
  }

  async usePage(pageId: string, script: string): Promise<{ logs: string[]; result: any }> {
    const pageInfo = this.pages.get(pageId);
    if (!pageInfo) {
      throw new Error(`Page with ID ${pageId} not found`);
    }
    
    const logs: string[] = [];
    const logger = (message: string) => {
      logs.push(message);
    };
    
    try {
      // 创建函数并执行，提供 require 支持
      const scriptFunction = new Function(
        'page', 
        'logger', 
        'require',
        'console',
        'process',
        '__dirname',
        '__filename',
        `return (${script})(page, logger, require, console, process, __dirname, __filename)`
      );
      
      const result = await scriptFunction(
        pageInfo.page, 
        logger, 
        requireFunc,
        console,
        process,
        __dirname,
        __filename
      );
      
      return {
        logs,
        result
      };
    } catch (error: any) {
      logs.push(`Error: ${error.message}`);
      return {
        logs,
        result: null
      };
    }
  }

  async closePage(pageId: string): Promise<void> {
    const pageInfo = this.pages.get(pageId);
    if (!pageInfo) {
      throw new Error(`Page with ID ${pageId} not found`);
    }
    
    await pageInfo.page.close();
    this.pages.delete(pageId);
    
    // 清理快照缓存
    this.snapshotCache.delete(pageId);
    
    // 如果关闭的是激活页面，清除激活状态
    if (this.activePageId === pageId) {
      this.activePageId = null;
    }
  }

  async listPages(): Promise<any[]> {
    const pagesWithInfo = [];
    
    for (const pageInfo of this.pages.values()) {
      try {
        const title = await pageInfo.page.title();
        const url = pageInfo.page.url();
        
        pagesWithInfo.push({
          pageId: pageInfo.pageId,
          name: pageInfo.name,
          description: pageInfo.description,
          title,
          url
        });
      } catch (error) {
        // 如果页面已关闭，跳过
        console.warn(`Failed to get info for page ${pageInfo.pageId}:`, error);
      }
    }
    
    return pagesWithInfo;
  }

  async listPagesWithoutId(): Promise<any[]> {
    const allPages = this.persistentContext ?
      this.persistentContext.pages() :
      this.browserContext?.pages() || [];
      
    const managedPages = new Set(Array.from(this.pages.values()).map(p => p.page));
    const unmanagedPages = allPages.filter(page => !managedPages.has(page));
    
    const pagesWithInfo = [];
    for (let i = 0; i < unmanagedPages.length; i++) {
      const page = unmanagedPages[i];
      try {
        const title = await page.title();
        const url = page.url();
        
        pagesWithInfo.push({
          pageIndex: allPages.indexOf(page),
          title,
          url
        });
      } catch (error) {
        console.warn(`Failed to get info for unmanaged page at index ${i}:`, error);
      }
    }
    
    return pagesWithInfo;
  }

  async closePagesWithoutId(): Promise<void> {
    const allPages = this.persistentContext ?
      this.persistentContext.pages() :
      this.browserContext?.pages() || [];
      
    const managedPages = new Set(Array.from(this.pages.values()).map(p => p.page));
    const unmanagedPages = allPages.filter(page => !managedPages.has(page));
    
    for (const page of unmanagedPages) {
      try {
        await page.close();
      } catch (error) {
        console.warn('Failed to close unmanaged page:', error);
      }
    }
  }

  async closePageByIndex(index: number): Promise<void> {
    const allPages = this.persistentContext ?
      this.persistentContext.pages() :
      this.browserContext?.pages() || [];
      
    if (index < 0 || index >= allPages.length) {
      throw new Error(`Page index ${index} is out of range (0-${allPages.length - 1})`);
    }
    
    const page = allPages[index];
    
    // 如果是管理的页面，也要从管理列表中删除
    for (const [pageId, pageInfo] of this.pages.entries()) {
      if (pageInfo.page === page) {
        this.pages.delete(pageId);
        // 清理快照缓存
        this.snapshotCache.delete(pageId);
        if (this.activePageId === pageId) {
          this.activePageId = null;
        }
        break;
      }
    }
    
    await page.close();
  }

  async closeAllPages(): Promise<void> {
    for (const pageInfo of this.pages.values()) {
      await pageInfo.page.close();
    }
    this.pages.clear();
    this.activePageId = null;
    
    // 清空所有快照缓存
    this.snapshotCache.clear();
  }

  async start(port: number = 3102): Promise<void> {
    await this.ensureBrowser();
    
    const server = this.app.listen(port, () => {
      console.log(`Playwright HTTP Server running on port ${port}`);
      console.log(`API endpoints:`);
      console.log(`  POST /api/pages - Create page`);
      console.log(`  POST /api/pages/:pageId/activate - Activate page`);
      console.log(`  POST /api/pages/:pageId/execute - Execute script`);
      console.log(`  DELETE /api/pages/:pageId - Close page`);
      console.log(`  GET /api/pages - List pages (with title & url)`);
      console.log(`  DELETE /api/pages - Close all pages`);
      console.log(`  GET /api/pages-without-id - List pages without ID`);
      console.log(`  DELETE /api/pages-without-id - Close all pages without ID`);
      console.log(`  DELETE /api/pages/index/:index - Close page by index`);
      console.log(`  POST /api/pages/:pageId/accessibility - Get accessibility snapshot`);
      console.log(`  POST /api/pages/:pageId/screenshot - Get screenshot`);
      console.log(`  POST /api/pages/:pageId/pdf - Get PDF snapshot`);
      console.log(`  POST /api/pages/:pageId/snapshot - Get simplified semantic snapshot`);
      console.log(`  POST /api/pages/:pageId/click - Click element by xp reference`);
      console.log(`  POST /api/pages/:pageId/type - Type text into element by xp reference`);
      console.log(`  POST /api/pages/:pageId/hover - Hover over element by xp reference`);
      console.log(`  POST /api/pages/:pageId/select-option - Select option in dropdown by xp reference`);
      console.log(`  POST /api/pages/:pageId/press-key - Press a key on keyboard`);
      console.log(`  POST /api/pages/:pageId/file-upload - Upload files by xp reference`);
      console.log(`  POST /api/pages/:pageId/handle-dialog - Handle dialog prompts`);
      console.log(`  POST /api/pages/:pageId/navigate - Navigate to URL`);
      console.log(`  POST /api/pages/:pageId/navigate-back - Go back to previous page`);
      console.log(`  POST /api/pages/:pageId/navigate-forward - Go forward to next page`);
      console.log(`  POST /api/pages/:pageId/extractData - Extract structured data using cheerio function`);
      console.log(`  POST /api/pages/:pageId/element-html - Get element outerHTML by xp reference`);
      console.log(`  POST /api/download-image - Download image from URL to local temp directory`);
    });
    
    // 保存服务器实例以便后续关闭
    this.httpServer = server;
  }

  // 快照方法实现
  async getAccessibilitySnapshot(pageId: string, options: any): Promise<SnapshotResult> {
    const pageInfo = this.pages.get(pageId);
    if (!pageInfo) {
      throw new Error(`Page with ID ${pageId} not found`);
    }
    
    const { interestingOnly = true, root } = options;
    
    let rootElement = undefined;
    if (root) {
      const locator = await pageInfo.page.locator(root);
      const handle = await locator.elementHandle();
      rootElement = handle || undefined;
    }
    
    const snapshot = await pageInfo.page.accessibility.snapshot({
      interestingOnly,
      root: rootElement
    });
    
    return {
      pageId,
      type: 'accessibility',
      data: snapshot,
      metadata: {
        url: pageInfo.page.url(),
        title: await pageInfo.page.title(),
        timestamp: this.getFormattedTimestamp(),
        options: { interestingOnly, root }
      }
    };
  }

  async getScreenshot(pageId: string, options: any = {}): Promise<SnapshotResult> {
    const pageInfo = this.pages.get(pageId);
    if (!pageInfo) {
      throw new Error(`Page with ID ${pageId} not found`);
    }
    
    const { fullPage = true, type = 'png', quality = 80, clip, element } = options;
    
    let screenshotOptions: any = {
      fullPage,
      type,
      ...(type === 'jpeg' && { quality })
    };
    
    if (clip) {
      screenshotOptions.clip = clip;
    }
    
    let screenshot: Buffer;
    if (element) {
      const elementHandle = await pageInfo.page.locator(element);
      screenshot = await elementHandle.screenshot(screenshotOptions);
    } else {
      screenshot = await pageInfo.page.screenshot(screenshotOptions);
    }
    
    // 生成文件名
    const timestamp = Date.now();
    const hash = crypto.createHash('md5').update(`${pageId}-${timestamp}`).digest('hex').substring(0, 8);
    const filename = `screenshot-${hash}.${type}`;
    
    // 确保截图目录存在
    const screenshotDir = path.join(os.tmpdir(), 'screenshots');
    await fs.promises.mkdir(screenshotDir, { recursive: true });
    
    // 保存文件
    const filePath = path.join(screenshotDir, filename);
    await fs.promises.writeFile(filePath, screenshot);
    
    return {
      pageId,
      type: 'screenshot',
      data: filePath, // 返回文件路径而不是 base64
      metadata: {
        url: pageInfo.page.url(),
        title: await pageInfo.page.title(),
        timestamp: this.getFormattedTimestamp(),
        format: type,
        options: screenshotOptions
      }
    };
  }

  async getPDFSnapshot(pageId: string, options: any = {}): Promise<SnapshotResult> {
    const pageInfo = this.pages.get(pageId);
    if (!pageInfo) {
      throw new Error(`Page with ID ${pageId} not found`);
    }
    
    const { 
      format = 'A4', 
      printBackground = true, 
      margin = { top: '1cm', right: '1cm', bottom: '1cm', left: '1cm' }, 
      landscape = false 
    } = options;
    
    const pdf = await pageInfo.page.pdf({
      format,
      printBackground,
      margin,
      landscape
    });
    
    return {
      pageId,
      type: 'pdf',
      data: pdf.toString('base64'),
      metadata: {
        url: pageInfo.page.url(),
        title: await pageInfo.page.title(),
        timestamp: this.getFormattedTimestamp(),
        format: 'pdf',
        options: { format, printBackground, margin, landscape }
      }
    };
  }

  async getPageSnapshot(pageId: string): Promise<string> {
    const pageInfo = this.pages.get(pageId);
    if (!pageInfo) {
      throw new Error(`Page with ID ${pageId} not found`);
    }

    // 1. 在浏览器中遍历DOM，为有价值元素生成XPath并注入xp属性
    const mappings = await pageInfo.page.evaluate(`
      (function() {
        let xpathMappings = {};
        
        function generateHash(str) {
          let hash = 0;
          for (let i = 0; i < str.length; i++) {
            let char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
          }
          let result = Math.abs(hash).toString(16);
          return result.substring(0, 8).padStart(8, '0');
        }

        function generateXPath(element) {
          let parts = [];
          let current = element;
          
          while (current && current.nodeType === 1 && current.nodeName !== 'HTML') {
            var tagName = current.nodeName.toLowerCase();
            let index = 1;
            let sameTagSiblings = [];
            
            if (current.parentNode) {
              let siblings = Array.from(current.parentNode.children);
              sameTagSiblings = siblings.filter((sibling) => {
                return sibling.nodeName.toLowerCase() === tagName;
              });
              
              if (sameTagSiblings.length > 1) {
                index = sameTagSiblings.indexOf(current) + 1;
              }
            }
            
            parts.unshift(sameTagSiblings.length > 1 ? tagName + '[' + index + ']' : tagName);
            current = current.parentElement;
          }
          
          return '/' + parts.join('/');
        }

        function isMeaningful(element) {
          let tagName = element.tagName.toLowerCase();
          let meaningfulTags = ['img', 'a', 'input', 'textarea', 'button'];
          
          if (meaningfulTags.includes(tagName)) {
            return true;
          }
          
          let contentEditable = element.getAttribute('contenteditable');
          if (contentEditable === 'true' || contentEditable === '') {
            return true;
          }
          
          let title = element.getAttribute('title');
          if (title && title.trim().length > 0) {
            return true;
          }
          
          return false;
        }

        // 如果子元素被设置为float、absolute等属性，父元素宽高会为0
        // 需要递归检查子元素，获取子元素中最大的宽高
        function getVisualSize(element) {
          if (!element) return { width: 0, height: 0 };
        
          const rect = element.getBoundingClientRect();
          let width = rect.width;
          let height = rect.height;
        
          // 如果父元素宽高为0且有子元素，则递归检查子元素
          if ((width === 0 || height === 0) && element.children.length > 0) {
            Array.from(element.children).forEach(child => {
              const style = getComputedStyle(child);
              if (style.display === 'none') return; // 忽略隐藏元素
        
              const childSize = getVisualSize(child); // 递归
              if (childSize.width > width) width = childSize.width;
              if (childSize.height > height) height = childSize.height;
            });
          }
        
          return { width, height };
        }

        function isVisible(element) {
          // 检查元素本身的可视性
          let style = window.getComputedStyle(element);
          
          // display: none
          if (style.display === 'none') {
            return false;
          }
          
          // visibility: hidden
          if (style.visibility === 'hidden') {
            return false;
          }
          
          // opacity: 0
          if (style.opacity === '0') {
            return false;
          }
          
          // 检查元素尺寸（宽或高为0）
          let rect = getVisualSize(element);
          if (rect.width === 0 || rect.height === 0) {
            return false;
          }
          
          // 检查父元素是否隐藏
          let parent = element.parentElement;
          while (parent && parent !== document.body) {
            let parentStyle = window.getComputedStyle(parent);
            if (parentStyle.display === 'none' || parentStyle.visibility === 'hidden') {
              return false;
            }
            parent = parent.parentElement;
          }
          
          return true;
        }

        function isSemantic(element) {
          let tagName = element.tagName.toLowerCase();
          let semanticTags = [
            'article', 'section', 'nav', 'header', 'footer', 'main', 'aside',
            'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
            'form', 'input', 'textarea', 'select', 'label', 'fieldset', 'legend',
            'table', 'thead', 'tbody', 'tr', 'td', 'th',
            'ul', 'ol', 'li', 'dl', 'dt', 'dd',
            'figure', 'figcaption', 'blockquote', 'cite', 'code', 'pre',
            'em', 'strong', 'mark', 'time', 'address'
          ];
          
          return semanticTags.includes(tagName);
        }

        function hasText(element) {
          let walker = document.createTreeWalker(
            element,
            4, // NodeFilter.SHOW_TEXT
            null,
            false
          );
          
          let textNode;
          while (textNode = walker.nextNode()) {
            if (textNode.textContent && textNode.textContent.trim().length > 0) {
              return true;
            }
          }
          return false;
        }

        let allElements = document.querySelectorAll('*');
        
        for (let i = 0; i < allElements.length; i++) {
          let element = allElements[i];
          
          // 检查元素是否有意义（不管是否可见）
          if (isSemantic(element) || isMeaningful(element) || hasText(element)) {
            let xpath = generateXPath(element);
            let hashValue = generateHash(xpath);
            
            xpathMappings[hashValue] = xpath;
            element.setAttribute('xp', hashValue);
            
            // 如果元素不可见，添加 iv 属性标记
            if (!isVisible(element)) {
              element.setAttribute('iv', '1');
            }
          }
        }
        
        return xpathMappings;
      })()
    `);
    
    // 2. 不再需要存储映射，直接使用 xp 属性
    
    // 3. 获取body元素的outerHTML而不是整个页面的content()
    const bodyHTML = await pageInfo.page.evaluate(() => {
      return document.body ? document.body.outerHTML : '';
    });

    // 4. 使用修改后的算法进行清理（不生成新的XPath）
    const cleanedHtml = await cleanHtmlWithXp(bodyHTML);
    
    const simplifiedContent = simplifyHtml(cleanedHtml);
    
    return simplifiedContent;
  }

  private formatDiff(changes: any[]): string {
    let result = '';
    for (const change of changes) {
      if (change.removed) {
        const lines = change.value.split('\n');
        for (const line of lines) {
          if (line.trim()) {
            result += `- ${line}\n`;
          }
        }
      } else if (change.added) {
        const lines = change.value.split('\n');
        for (const line of lines) {
          if (line.trim()) {
            result += `+ ${line}\n`;
          }
        }
      }
    }
    return result.trim();
  }


  private async waitSnapshot(pageId: string, ms: number = 2000): Promise<SnapshotResponse> {
    await this.waitForTimeout(pageId, ms);
    
    // 获取新的快照
    const newSnapshot = await this.getPageSnapshot(pageId);
    
    // 检查是否有缓存的快照
    const cachedSnapshot = this.snapshotCache.get(pageId);
    
    if (!cachedSnapshot) {
      // 首次访问，返回完整快照
      this.snapshotCache.set(pageId, newSnapshot);
      return {
        snapshotType: 'full',
        snapshot: newSnapshot
      };
    }
    
    // 计算按行差异（保留原逻辑）
    const changes = diffLines(cachedSnapshot, newSnapshot);
    
    // 检查是否有实际变化
    const hasChanges = changes.some(change => change.added || change.removed);
    
    if (!hasChanges) {
      // 没有变化，但仍返回完整快照
      return {
        snapshotType: 'full',
        snapshot: newSnapshot
      };
    }
    
    // 格式化差异（保留逻辑但不使用）
    const formattedDiff = this.formatDiff(changes);
    
    // 判断是否返回 diff 还是完整快照（逻辑保留）
    if (formattedDiff.length < newSnapshot.length) {
      // diff 更短，但仍返回完整快照
      this.snapshotCache.set(pageId, newSnapshot);
      return {
        snapshotType: 'full',
        snapshot: newSnapshot
      };
    } else {
      // diff 更长，返回完整快照
      this.snapshotCache.set(pageId, newSnapshot);
      return {
        snapshotType: 'full',
        snapshot: newSnapshot
      };
    }
  }

  async browserClick(pageId: string, ref: string, waitForTimeout: number = 2000): Promise<SnapshotResponse> {
    const pageInfo = this.pages.get(pageId);
    if (!pageInfo) {
      throw new Error(`Page with ID ${pageId} not found`);
    }

    // 直接使用 xp 属性选择器
    await pageInfo.page.click(`[xp="${ref}"]`);
    const snapshotResponse = await this.waitSnapshot(pageId, waitForTimeout);
    
    
    return snapshotResponse;
  }

  async browserType(pageId: string, ref: string, text: string, submit?: boolean, slowly?: boolean, waitForTimeout: number = 2000): Promise<SnapshotResponse> {
    const pageInfo = this.pages.get(pageId);
    if (!pageInfo) {
      throw new Error(`Page with ID ${pageId} not found`);
    }

    // 直接使用 xp 属性选择器
    const selector = `[xp="${ref}"]`;
    
    if (slowly) {
      await pageInfo.page.type(selector, text, { delay: 100 });
    } else {
      await pageInfo.page.fill(selector, text);
    }
    
    if (submit) {
      await pageInfo.page.press(selector, 'Enter');
    }
    const snapshotResponse = await this.waitSnapshot(pageId, waitForTimeout);
    
    
    return snapshotResponse;
  }

  async browserHover(pageId: string, ref: string, waitForTimeout: number = 2000): Promise<SnapshotResponse> {
    const pageInfo = this.pages.get(pageId);
    if (!pageInfo) {
      throw new Error(`Page with ID ${pageId} not found`);
    }

    // 直接使用 xp 属性选择器
    const selector = `[xp="${ref}"]`;
    await pageInfo.page.hover(selector);
    const snapshotResponse = await this.waitSnapshot(pageId, waitForTimeout);
    
    
    return snapshotResponse;
  }

  async browserSelectOption(pageId: string, ref: string, values: string[], waitForTimeout: number = 2000): Promise<SnapshotResponse> {
    const pageInfo = this.pages.get(pageId);
    if (!pageInfo) {
      throw new Error(`Page with ID ${pageId} not found`);
    }

    // 直接使用 xp 属性选择器
    const selector = `[xp="${ref}"]`;
    await pageInfo.page.selectOption(selector, values);
    const snapshotResponse = await this.waitSnapshot(pageId, waitForTimeout);
    
    
    return snapshotResponse;
  }

  async browserPressKey(pageId: string, key: string, ref?: string, waitForTimeout: number = 2000): Promise<SnapshotResponse> {
    const pageInfo = this.pages.get(pageId);
    if (!pageInfo) {
      throw new Error(`Page with ID ${pageId} not found`);
    }

    if (ref) {
      // 直接使用 xp 属性选择器
      const selector = `[xp="${ref}"]`;
      await pageInfo.page.press(selector, key);
    } else {
      await pageInfo.page.keyboard.press(key);
    }
    const snapshotResponse = await this.waitSnapshot(pageId, waitForTimeout);
    
    
    return snapshotResponse;
  }

  async browserFileUpload(pageId: string, ref: string, paths: string[], waitForTimeout: number = 2000): Promise<SnapshotResponse> {
    const pageInfo = this.pages.get(pageId);
    if (!pageInfo) {
      throw new Error(`Page with ID ${pageId} not found`);
    }

    // 直接使用 xp 属性选择器
    const selector = `[xp="${ref}"]`;
    await pageInfo.page.setInputFiles(selector, paths);
    const snapshotResponse = await this.waitSnapshot(pageId, waitForTimeout);
    
    
    return snapshotResponse;
  }

  async browserHandleDialog(pageId: string, accept: boolean, promptText?: string, waitForTimeout: number = 2000): Promise<SnapshotResponse> {
    const pageInfo = this.pages.get(pageId);
    if (!pageInfo) {
      throw new Error(`Page with ID ${pageId} not found`);
    }

    // 设置对话框处理器
    pageInfo.page.once('dialog', async dialog => {
      if (accept) {
        await dialog.accept(promptText || '');
      } else {
        await dialog.dismiss();
      }
    });
    const snapshotResponse = await this.waitSnapshot(pageId, waitForTimeout);
    
    
    return snapshotResponse;
  }

  async browserNavigate(pageId: string, url: string, waitForTimeout: number = 2000): Promise<SnapshotResponse> {
    const pageInfo = this.pages.get(pageId);
    if (!pageInfo) {
      throw new Error(`Page with ID ${pageId} not found`);
    }

    await pageInfo.page.goto(url);
    const snapshotResponse = await this.waitSnapshot(pageId, waitForTimeout);
    
    
    return snapshotResponse;
  }

  async browserNavigateBack(pageId: string, waitForTimeout: number = 2000): Promise<SnapshotResponse> {
    const pageInfo = this.pages.get(pageId);
    if (!pageInfo) {
      throw new Error(`Page with ID ${pageId} not found`);
    }

    await pageInfo.page.goBack();
    const snapshotResponse = await this.waitSnapshot(pageId, waitForTimeout);
    
    
    return snapshotResponse;
  }

  async browserNavigateForward(pageId: string, waitForTimeout: number = 2000): Promise<SnapshotResponse> {
    const pageInfo = this.pages.get(pageId);
    if (!pageInfo) {
      throw new Error(`Page with ID ${pageId} not found`);
    }

    await pageInfo.page.goForward();
    const snapshotResponse = await this.waitSnapshot(pageId, waitForTimeout);
    
    
    return snapshotResponse;
  }

  async scrollToBottom(pageId: string, selector?: string, waitForTimeout: number = 2000): Promise<SnapshotResponse> {
    const pageInfo = this.pages.get(pageId);
    if (!pageInfo) {
      throw new Error(`Page with ID ${pageId} not found`);
    }

    if (selector) {
      // 直接使用 xp 属性选择器
      await pageInfo.page.evaluate((ref) => {
        const element = document.querySelector(`[xp="${ref}"]`);
        if (element) {
          element.scrollTop = element.scrollHeight;
        }
      }, selector);
    } else {
      // 滚动到页面底部
      await pageInfo.page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });
    }
    const snapshotResponse = await this.waitSnapshot(pageId, waitForTimeout);
    
    
    return snapshotResponse;
  }

  async scrollToTop(pageId: string, selector?: string, waitForTimeout: number = 2000): Promise<SnapshotResponse> {
    const pageInfo = this.pages.get(pageId);
    if (!pageInfo) {
      throw new Error(`Page with ID ${pageId} not found`);
    }

    if (selector) {
      // 直接使用 xp 属性选择器
      await pageInfo.page.evaluate((ref) => {
        const element = document.querySelector(`[xp="${ref}"]`);
        if (element) {
          element.scrollTop = 0;
        }
      }, selector);
    } else {
      // 滚动到页面顶部
      await pageInfo.page.evaluate(() => {
        window.scrollTo(0, 0);
      });
    }
    const snapshotResponse = await this.waitSnapshot(pageId, waitForTimeout);
    
    
    return snapshotResponse;
  }

  async waitForTimeout(pageId: string, ms: number): Promise<void> {
    const pageInfo = this.pages.get(pageId);
    if (!pageInfo) {
      throw new Error(`Page with ID ${pageId} not found`);
    }

    await pageInfo.page.waitForTimeout(ms);
  }

  async waitForSelector(pageId: string, selector: string, options?: { timeout?: number; state?: 'attached' | 'detached' | 'visible' | 'hidden' }): Promise<void> {
    const pageInfo = this.pages.get(pageId);
    if (!pageInfo) {
      throw new Error(`Page with ID ${pageId} not found`);
    }

    // 如果selector是xp引用值，转换为xp选择器
    const xpSelector = selector.length === 8 && /^[a-f0-9]{8}$/.test(selector) 
      ? `[xp="${selector}"]` 
      : selector;

    await pageInfo.page.waitForSelector(xpSelector, options || {});
  }

  async extractData(pageId: string, extractorFunction: string): Promise<any> {
    const pageInfo = this.pages.get(pageId);
    if (!pageInfo) {
      throw new Error(`Page with ID ${pageId} not found`);
    }

    // 获取页面的完整HTML内容
    const htmlContent = await pageInfo.page.content();

    // 使用我们的算法进行解析，但不简化
    const parseResult = await parseHtml(htmlContent);
    
    // 用cheerio加载带xp属性的HTML
    const $ = cheerio.load(parseResult.extractedHtml);
    
    try {
      // 创建函数并执行
      const extractorFunc = new Function('$', `return (${extractorFunction})($)`);
      const result = extractorFunc($);
      
      return result;
    } catch (error: any) {
      throw new Error(`Extractor function execution failed: ${error.message}`);
    }
  }

  async getElementHTML(pageId: string, ref: string): Promise<any> {
    const pageInfo = this.pages.get(pageId);
    if (!pageInfo) {
      throw new Error(`Page with ID ${pageId} not found`);
    }

    // 直接使用 xp 属性选择器
    const selector = `[xp="${ref}"]`;
    
    try {
      // 使用 Playwright 的等待机制
      const locator = pageInfo.page.locator(selector);
      
      // 等待元素存在（使用短超时，只要附加到DOM即可）
      await locator.waitFor({ state: 'attached', timeout: 5000 });
      
      // 获取元素的outerHTML和基本信息
      const elementInfo = await locator.evaluate((element) => {
        // 获取所有属性
        const attributes: Record<string, string> = {};
        for (let i = 0; i < element.attributes.length; i++) {
          const attr = element.attributes[i];
          attributes[attr.name] = attr.value;
        }
        
        return {
          outerHTML: element.outerHTML,
          tagName: element.tagName.toLowerCase(),
          classList: Array.from(element.classList),
          attributes
        };
      });
      
      if (!elementInfo) {
        throw new Error(`Element with xp reference "${ref}" evaluation failed`);
      }
      
      return elementInfo.outerHTML;
    } catch (error: any) {
      throw new Error(`Failed to get element HTML: ${error.message}`);
    }
  }

  async pageToHtmlFile(pageId: string): Promise<any> {
    const pageInfo = this.pages.get(pageId);
    if (!pageInfo) {
      throw new Error(`Page with ID ${pageId} not found`);
    }

    // 获取页面完整 HTML
    const htmlContent = await pageInfo.page.content();
    
    // 使用 parse2.ts 处理 HTML
    const result = await parseHtml(htmlContent);
    
    // 生成唯一文件名
    const timestamp = Date.now();
    const hash = crypto.createHash('md5').update(`${pageId}-${timestamp}`).digest('hex').substring(0, 8);
    const fileName = `page-${hash}.html`;
    
    // 保存到临时目录
    const tempDir = os.tmpdir();
    const filePath = path.join(tempDir, fileName);
    
    // 写入文件
    await fs.promises.writeFile(filePath, result.extractedHtml, 'utf8');
    
    // 获取文件大小
    const stats = await fs.promises.stat(filePath);
    
    return {
      success: true,
      filePath,
      metadata: {
        pageId,
        fileSize: stats.size,
        timestamp: this.getFormattedTimestamp(),
        mappingCount: Object.keys(result.mappings).length
      }
    };
  }

  async downloadImage(url: string): Promise<string> {
    await this.ensureBrowser();
    
    let tempPage: Page;
    
    try {
      // 创建临时页面
      if (this.persistentContext) {
        tempPage = await this.persistentContext.newPage();
      } else {
        tempPage = await this.browserContext!.newPage();
      }
      
      // 直接导航到图片URL，让浏览器真正打开图片
      const response = await tempPage.goto(url, { waitUntil: 'networkidle' });
      
      if (!response) {
        throw new Error('Failed to navigate to image URL');
      }
      
      // 等待一下确保图片加载完成
      await tempPage.waitForTimeout(1000);
      
      // 直接从导航响应中获取图片数据
      const buffer = await response.body();
      
      // 从 URL 中提取文件名和扩展名
      const urlBasename = path.basename(new URL(url).pathname) || 'image';
      const timestamp = Date.now().toString();
      const nameToHash = urlBasename + timestamp;
      
      // 生成文件名 hash
      const hash = crypto.createHash('md5').update(nameToHash).digest('hex');
      
      // 提取原始扩展名
      const ext = path.extname(urlBasename) || '.jpg';
      const filename = hash + ext;
      
      // 使用系统临时目录
      const downloadDir = path.join(os.tmpdir(), 'playwright-downloads');
      const localPath = path.join(downloadDir, filename);
      
      // 确保目录存在
      await fs.promises.mkdir(downloadDir, { recursive: true });
      
      // 保存文件
      await fs.promises.writeFile(localPath, buffer);
      
      return localPath;
      
    } finally {
      // 确保关闭临时页面
      if (tempPage!) {
        await tempPage.close();
      }
    }
  }


  async shutdown(): Promise<void> {
    console.log('🔄 开始关闭服务器和浏览器实例...');
    
    // 关闭 HTTP 服务器
    if (this.httpServer) {
      try {
        console.log('🔄 关闭 HTTP 服务器...');
        await new Promise<void>((resolve, reject) => {
          this.httpServer!.close((err) => {
            if (err) reject(err);
            else resolve();
          });
        });
        this.httpServer = null;
        console.log('✅ HTTP 服务器已关闭');
      } catch (error) {
        console.error('❌ 关闭 HTTP 服务器时出错:', error);
      }
    }
    
    // 关闭所有页面
    try {
      await this.closeAllPages();
      console.log('✅ 所有页面已关闭');
    } catch (error) {
      console.error('❌ 关闭页面时出错:', error);
    }
    
    // 关闭浏览器上下文和实例
    if (this.persistentContext) {
      try {
        console.log('🔄 关闭持久化上下文...');
        await this.persistentContext.close();
        this.persistentContext = null;
        console.log('✅ 持久化上下文已关闭');
      } catch (error) {
        console.error('❌ 关闭持久化上下文时出错:', error);
      }
    } else {
      if (this.browserContext) {
        try {
          console.log('🔄 关闭浏览器上下文...');
          await this.browserContext.close();
          this.browserContext = null;
          console.log('✅ 浏览器上下文已关闭');
        } catch (error) {
          console.error('❌ 关闭浏览器上下文时出错:', error);
        }
      }
      
      if (this.browser) {
        try {
          console.log('🔄 关闭浏览器实例...');
          await this.browser.close();
          this.browser = null;
          console.log('✅ 浏览器实例已关闭');
        } catch (error) {
          console.error('❌ 关闭浏览器实例时出错:', error);
        }
      }
    }
    
    console.log('🎉 服务器和浏览器资源清理完成');
  }
}

export default PlaywrightServer;

// 如果直接运行这个文件，启动服务器
if (import.meta.url === `file://${process.argv[1]}`) {
  // 解析命令行参数
  const args = process.argv.slice(2);
  const options: BrowserOptions = {};
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--headless') {
      options.headless = true;
    } else if (arg === '--chromium') {
      options.chromium = true;
    } else if (arg === '--no-user-profile') {
      options.userProfile = false;
    } else if (arg === '--user-data-dir') {
      options.userDataDir = args[i + 1];
      i++;
    } else if (arg === '--user-agent') {
      options.userAgent = args[i + 1];
      i++;
    }
  }
  
  console.log('🚀 启动 Playwright HTTP 服务器...');
  console.log('🔧 浏览器配置:');
  console.log(`  - 模式: ${options.userProfile !== false ? '持久化用户配置' : '标准模式'}`);
  console.log(`  - 浏览器: ${options.chromium ? 'Chromium' : 'Chrome'}`);
  console.log(`  - 显示模式: ${options.headless ? '无头模式' : '有头模式'}`);
  if (options.userProfile !== false) {
    console.log(`  - 用户数据目录: ${options.userDataDir || path.join(os.homedir(), '.browser-mcp-data')}`);
  }
  console.log('');
  
  const server = new PlaywrightServer(options);
  server.start().catch(console.error);
  
  // 优雅关闭处理
  const gracefulShutdown = async (signal: string) => {
    console.log(`\n📴 收到 ${signal} 信号，正在关闭服务器...`);
    try {
      await server.shutdown();
      console.log('✅ 服务器已安全关闭');
      process.exit(0);
    } catch (error) {
      console.error('❌ 关闭服务器时出错:', error);
      process.exit(1);
    }
  };
  
  // 监听各种退出信号
  process.on('SIGINT', () => gracefulShutdown('SIGINT')); // Ctrl+C
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM')); // 进程终止
  process.on('SIGQUIT', () => gracefulShutdown('SIGQUIT')); // 退出信号
  
  // 处理未捕获的异常
  process.on('uncaughtException', async (error) => {
    console.error('❌ 未捕获的异常:', error);
    await gracefulShutdown('uncaughtException');
  });
  
  // 处理未处理的 Promise 拒绝
  process.on('unhandledRejection', async (reason, promise) => {
    console.error('❌ 未处理的 Promise 拒绝:', reason);
    console.error('Promise:', promise);
    await gracefulShutdown('unhandledRejection');
  });
}