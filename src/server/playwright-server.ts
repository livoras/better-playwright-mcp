/**
 * HTTP Server for Playwright with Page Management
 * Based on Microsoft's playwright-mcp core
 */

import express from 'express';
import type { Request, Response } from 'express';
import * as playwright from 'playwright';
import { v4 as uuid } from 'uuid';
import type { Server } from 'http';
import os from 'os';
import path from 'path';

type PageEx = playwright.Page & {
  _snapshotForAI: () => Promise<string>;
};

interface PageInfo {
  id: string;
  name: string;
  description: string;
  page: playwright.Page;
  refMappings: Map<string, RefMapping>;
}

interface RefMapping {
  role: string;
  name?: string;
  selector?: string;
}

export class PlaywrightServer {
  private app: express.Application;
  private httpServer: Server | null = null;
  private browser: playwright.Browser | null = null;
  private browserContext: playwright.BrowserContext | null = null;
  private persistentContext: playwright.BrowserContext | null = null;
  private pages = new Map<string, PageInfo>();
  private userDataDir: string;
  private useChrome: boolean;
  private headless: boolean;

  constructor(private port: number = parseInt(process.env.PORT || '3102')) {
    // Configuration from environment variables
    this.useChrome = process.env.USE_CHROMIUM !== 'true';  // Default to Chrome
    this.headless = process.env.HEADLESS === 'true';  // Default to headed
    
    // User data directory for persistence
    this.userDataDir = process.env.USER_DATA_DIR || 
      path.join(os.homedir(), '.better-playwright-mcp', 'user-data');
    this.app = express();
    this.app.use(express.json());
    this.registerRoutes();
  }

  private registerRoutes() {
    // Health check
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({ status: 'ok', pages: this.pages.size });
    });

    // Page management
    this.app.post('/api/pages', async (req: Request, res: Response) => {
      try {
        const { name, description, url } = req.body;
        const result = await this.createPage(name, description, url);
        res.json(result);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/pages', (req: Request, res: Response) => {
      const pages = Array.from(this.pages.values()).map(p => ({
        id: p.id,
        name: p.name,
        description: p.description,
        url: p.page.url(),
        title: p.page.title()
      }));
      res.json(pages);
    });

    this.app.delete('/api/pages/:pageId', async (req: Request, res: Response) => {
      try {
        const { pageId } = req.params;
        await this.closePage(pageId);
        res.json({ success: true });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // Navigation
    this.app.post('/api/pages/:pageId/navigate', async (req: Request, res: Response) => {
      try {
        const { pageId } = req.params;
        const { url } = req.body;
        const result = await this.navigate(pageId, url);
        res.json(result);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // Snapshot
    this.app.post('/api/pages/:pageId/snapshot', async (req: Request, res: Response) => {
      try {
        const { pageId } = req.params;
        const snapshot = await this.getSnapshot(pageId);
        res.json(snapshot);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // Click action using ref
    this.app.post('/api/pages/:pageId/click', async (req: Request, res: Response) => {
      try {
        const { pageId } = req.params;
        const { ref, element } = req.body;
        await this.click(pageId, ref, element);
        const snapshot = await this.getSnapshot(pageId);
        res.json(snapshot);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // Type action using ref
    this.app.post('/api/pages/:pageId/type', async (req: Request, res: Response) => {
      try {
        const { pageId } = req.params;
        const { ref, element, text } = req.body;
        await this.type(pageId, ref, element, text);
        const snapshot = await this.getSnapshot(pageId);
        res.json(snapshot);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // Fill action using ref
    this.app.post('/api/pages/:pageId/fill', async (req: Request, res: Response) => {
      try {
        const { pageId } = req.params;
        const { ref, element, value } = req.body;
        await this.fill(pageId, ref, element, value);
        const snapshot = await this.getSnapshot(pageId);
        res.json(snapshot);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // Select option using ref
    this.app.post('/api/pages/:pageId/select', async (req: Request, res: Response) => {
      try {
        const { pageId } = req.params;
        const { ref, element, value } = req.body;
        await this.select(pageId, ref, element, value);
        const snapshot = await this.getSnapshot(pageId);
        res.json(snapshot);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // Screenshot
    this.app.post('/api/pages/:pageId/screenshot', async (req: Request, res: Response) => {
      try {
        const { pageId } = req.params;
        const { fullPage = true } = req.body;
        const screenshot = await this.screenshot(pageId, fullPage);
        res.json({ screenshot });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });
  }

  private async ensureBrowser() {
    // Use persistent context with Chrome for user data persistence
    if (!this.persistentContext) {
      console.log(`🔧 Launching ${this.useChrome ? 'Chrome' : 'Chromium'} with user data at: ${this.userDataDir}`);
      
      this.persistentContext = await playwright.chromium.launchPersistentContext(
        this.userDataDir,
        {
          headless: this.headless,
          channel: this.useChrome ? 'chrome' : undefined,
          args: [
            '--disable-blink-features=AutomationControlled',
            '--disable-dev-shm-usage'
          ],
          ignoreDefaultArgs: ['--enable-automation'],
        }
      );
      
      this.browserContext = this.persistentContext;
      console.log('✅ Browser launched with persistent context');
    }
  }

  async createPage(name: string, description: string, url?: string): Promise<{ pageId: string; snapshot: any }> {
    await this.ensureBrowser();
    
    const pageId = uuid();
    const page = await this.browserContext!.newPage();
    
    const pageInfo: PageInfo = {
      id: pageId,
      name,
      description,
      page,
      refMappings: new Map()
    };
    
    this.pages.set(pageId, pageInfo);
    
    if (url) {
      await page.goto(url);
    }
    
    const snapshot = await this.getSnapshot(pageId);
    return { pageId, snapshot };
  }

  async closePage(pageId: string) {
    const pageInfo = this.pages.get(pageId);
    if (!pageInfo) {
      throw new Error(`Page ${pageId} not found`);
    }
    
    await pageInfo.page.close();
    this.pages.delete(pageId);
  }

  async navigate(pageId: string, url: string) {
    const pageInfo = this.pages.get(pageId);
    if (!pageInfo) {
      throw new Error(`Page ${pageId} not found`);
    }
    
    await pageInfo.page.goto(url);
    return await this.getSnapshot(pageId);
  }

  async getSnapshot(pageId: string) {
    const pageInfo = this.pages.get(pageId);
    if (!pageInfo) {
      throw new Error(`Page ${pageId} not found`);
    }
    
    // Get snapshot using Playwright's internal API
    const snapshot = await (pageInfo.page as PageEx)._snapshotForAI();
    
    // Parse refs from snapshot and build mappings
    this.parseRefMappings(pageId, snapshot);
    
    return {
      pageId,
      url: pageInfo.page.url(),
      title: await pageInfo.page.title(),
      snapshot: snapshot,
      modalStates: [],
      consoleMessages: []
    };
  }

  private parseRefMappings(pageId: string, snapshot: string) {
    const pageInfo = this.pages.get(pageId);
    if (!pageInfo) return;
    
    const mappings = new Map<string, RefMapping>();
    const lines = snapshot.split('\n');
    
    for (const line of lines) {
      const refMatch = line.match(/\[ref=([^\]]+)\]/);
      if (refMatch) {
        const ref = refMatch[1];
        
        // Parse role and name from line
        const roleMatch = line.match(/- (\w+)/);
        const nameMatch = line.match(/"([^"]+)"/);
        
        if (roleMatch) {
          mappings.set(ref, {
            role: roleMatch[1],
            name: nameMatch ? nameMatch[1] : undefined
          });
        }
      }
    }
    
    pageInfo.refMappings = mappings;
  }

  async click(pageId: string, ref: string, element: string) {
    const pageInfo = this.pages.get(pageId);
    if (!pageInfo) {
      throw new Error(`Page ${pageId} not found`);
    }
    
    // Use aria-ref selector directly
    await pageInfo.page.locator(`aria-ref=${ref}`).click();
  }

  async type(pageId: string, ref: string, element: string, text: string) {
    const pageInfo = this.pages.get(pageId);
    if (!pageInfo) {
      throw new Error(`Page ${pageId} not found`);
    }
    
    // Use aria-ref selector directly
    await pageInfo.page.locator(`aria-ref=${ref}`).type(text);
  }

  async fill(pageId: string, ref: string, element: string, value: string) {
    const pageInfo = this.pages.get(pageId);
    if (!pageInfo) {
      throw new Error(`Page ${pageId} not found`);
    }
    
    // Use aria-ref selector directly
    await pageInfo.page.locator(`aria-ref=${ref}`).fill(value);
  }

  async select(pageId: string, ref: string, element: string, value: string | string[]) {
    const pageInfo = this.pages.get(pageId);
    if (!pageInfo) {
      throw new Error(`Page ${pageId} not found`);
    }
    
    // Use aria-ref selector directly
    await pageInfo.page.locator(`aria-ref=${ref}`).selectOption(value);
  }

  async screenshot(pageId: string, fullPage: boolean = true) {
    const pageInfo = this.pages.get(pageId);
    if (!pageInfo) {
      throw new Error(`Page ${pageId} not found`);
    }
    
    const buffer = await pageInfo.page.screenshot({ fullPage });
    return buffer.toString('base64');
  }

  async start() {
    return new Promise<void>((resolve) => {
      this.httpServer = this.app.listen(this.port, () => {
        console.log(`🚀 Playwright Server running on http://localhost:${this.port}`);
        resolve();
      });
    });
  }

  async stop() {
    // Close all pages
    for (const [pageId] of this.pages) {
      await this.closePage(pageId);
    }
    
    // Close persistent context
    if (this.persistentContext) {
      await this.persistentContext.close();
      console.log('✅ Persistent context closed, user data saved');
    }
    
    // Close browser
    if (this.browser) {
      await this.browser.close();
    }
    
    // Stop HTTP server
    if (this.httpServer) {
      this.httpServer.close();
    }
  }
}

// Start server if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new PlaywrightServer();
  server.start().catch(console.error);
  
  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n⏹️  Shutting down...');
    await server.stop();
    process.exit(0);
  });
}