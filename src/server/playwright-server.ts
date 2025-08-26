/**
 * HTTP Server for Playwright with Page Management
 * Based on Microsoft's playwright-mcp core
 */

import express from 'express';
import type { Request, Response } from 'express';
import * as playwright from 'playwright';
import { v4 as uuid } from 'uuid';
import type { Server } from 'http';
import { rgPath } from '@vscode/ripgrep';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { SmartOutlineGenerator } from '../utils/smart-outline.js';

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
  private smartOutlineGenerator: SmartOutlineGenerator;

  constructor(private port: number = parseInt(process.env.PORT || '3102')) {
    // Configuration from environment variables
    this.useChrome = process.env.USE_CHROMIUM !== 'true';  // Default to Chrome
    this.headless = process.env.HEADLESS === 'true';  // Default to headed
    
    // User data directory for persistence
    this.userDataDir = process.env.USER_DATA_DIR || 
      path.join(os.homedir(), '.better-playwright-mcp', 'user-data');
    this.app = express();
    
    // Initialize smart outline generator
    this.smartOutlineGenerator = new SmartOutlineGenerator();
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

    // Click action using ref
    this.app.post('/api/pages/:pageId/click', async (req: Request, res: Response) => {
      try {
        const { pageId } = req.params;
        const { ref, element } = req.body;
        await this.click(pageId, ref, element);
        res.json({ 
          success: true,
          action: 'click',
          pageId,
          ref: ref || element
        });
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
        res.json({ 
          success: true,
          action: 'type',
          pageId,
          ref: ref || element,
          text
        });
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
        res.json({ 
          success: true,
          action: 'fill',
          pageId,
          ref: ref || element,
          value
        });
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
        res.json({ 
          success: true,
          action: 'select',
          pageId,
          ref: ref || element,
          value
        });
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

    // Hover action using ref
    this.app.post('/api/pages/:pageId/hover', async (req: Request, res: Response) => {
      try {
        const { pageId } = req.params;
        const { ref, element } = req.body;
        await this.hover(pageId, ref, element);
        res.json({ 
          success: true,
          action: 'hover',
          pageId,
          ref: ref || element
        });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // Press key
    this.app.post('/api/pages/:pageId/press', async (req: Request, res: Response) => {
      try {
        const { pageId } = req.params;
        const { key } = req.body;
        await this.pressKey(pageId, key);
        res.json({ 
          success: true,
          action: 'press',
          pageId,
          key
        });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // File upload
    this.app.post('/api/pages/:pageId/upload', async (req: Request, res: Response) => {
      try {
        const { pageId } = req.params;
        const { ref, files } = req.body;
        await this.uploadFiles(pageId, ref, files);
        res.json({ 
          success: true,
          action: 'upload',
          pageId,
          ref,
          filesCount: files.length
        });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // Handle dialog
    this.app.post('/api/pages/:pageId/dialog', async (req: Request, res: Response) => {
      try {
        const { pageId } = req.params;
        const { accept, text } = req.body;
        await this.handleDialog(pageId, accept, text);
        res.json({ success: true });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // Navigate back
    this.app.post('/api/pages/:pageId/back', async (req: Request, res: Response) => {
      try {
        const { pageId } = req.params;
        await this.navigateBack(pageId);
        res.json({ 
          success: true,
          action: 'back',
          pageId
        });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // Navigate forward
    this.app.post('/api/pages/:pageId/forward', async (req: Request, res: Response) => {
      try {
        const { pageId } = req.params;
        await this.navigateForward(pageId);
        res.json({ 
          success: true,
          action: 'forward',
          pageId
        });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // Scroll to bottom
    this.app.post('/api/pages/:pageId/scroll-bottom', async (req: Request, res: Response) => {
      try {
        const { pageId } = req.params;
        const { ref } = req.body;
        await this.scrollToBottom(pageId, ref);
        res.json({ 
          success: true,
          action: 'scroll-bottom',
          pageId,
          ref
        });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // Scroll to top
    this.app.post('/api/pages/:pageId/scroll-top', async (req: Request, res: Response) => {
      try {
        const { pageId } = req.params;
        const { ref } = req.body;
        await this.scrollToTop(pageId, ref);
        res.json({ 
          success: true,
          action: 'scroll-top',
          pageId,
          ref
        });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // Wait for timeout
    this.app.post('/api/pages/:pageId/wait-timeout', async (req: Request, res: Response) => {
      try {
        const { pageId } = req.params;
        const { timeout } = req.body;
        await this.waitForTimeout(pageId, timeout);
        res.json({ success: true });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // Wait for selector
    this.app.post('/api/pages/:pageId/wait-selector', async (req: Request, res: Response) => {
      try {
        const { pageId } = req.params;
        const { selector, options } = req.body;
        await this.waitForSelector(pageId, selector, options);
        res.json({ success: true });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // Get page outline (structured summary - fixed 200 lines)
    this.app.post('/api/pages/:pageId/outline', async (req: Request, res: Response) => {
      try {
        const { pageId } = req.params;
        
        // Get current snapshot
        const snapshotData = await this.getSnapshot(pageId);
        
        // Generate outline with intelligent folding (fixed 200 lines)
        const outline = this.generateOutline(snapshotData.snapshot);
        
        res.json({ outline });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // Grep snapshot
    this.app.post('/api/pages/:pageId/grep', async (req: Request, res: Response) => {
      try {
        const { pageId } = req.params;
        const { pattern, flags = '' } = req.body;
        
        // Get current snapshot
        const snapshotData = await this.getSnapshot(pageId);
        
        // Execute grep on snapshot
        const result = this.grepSnapshot(snapshotData.snapshot, pattern, flags);
        
        res.json({ result });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });
    
    // Debug: Save raw snapshot to file
    this.app.post('/api/pages/:pageId/save-snapshot', async (req: Request, res: Response) => {
      try {
        const { pageId } = req.params;
        const snapshotData = await this.getSnapshot(pageId);
        
        // Save to file
        const fs = await import('fs/promises');
        const filename = `/tmp/snapshot-${pageId}-${Date.now()}.txt`;
        await fs.writeFile(filename, snapshotData.snapshot, 'utf-8');
        
        res.json({ success: true, file: filename, lines: snapshotData.snapshot.split('\n').length });
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

  async createPage(name: string, description: string, url?: string): Promise<{ success: boolean; pageId: string; name: string; description: string; url?: string }> {
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
    
    return { 
      success: true,
      pageId,
      name,
      description,
      ...(url && { url })
    };
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
    return { 
      success: true,
      action: 'navigate',
      pageId,
      url
    };
  }

  private async getSnapshot(pageId: string) {
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

  async hover(pageId: string, ref: string, element: string) {
    const pageInfo = this.pages.get(pageId);
    if (!pageInfo) {
      throw new Error(`Page ${pageId} not found`);
    }
    
    // Use aria-ref selector directly
    await pageInfo.page.locator(`aria-ref=${ref}`).hover();
  }

  async pressKey(pageId: string, key: string) {
    const pageInfo = this.pages.get(pageId);
    if (!pageInfo) {
      throw new Error(`Page ${pageId} not found`);
    }
    
    await pageInfo.page.keyboard.press(key);
  }

  async uploadFiles(pageId: string, ref: string, files: string[]) {
    const pageInfo = this.pages.get(pageId);
    if (!pageInfo) {
      throw new Error(`Page ${pageId} not found`);
    }
    
    // Use aria-ref selector directly
    await pageInfo.page.locator(`aria-ref=${ref}`).setInputFiles(files);
  }

  async handleDialog(pageId: string, accept: boolean, text?: string) {
    const pageInfo = this.pages.get(pageId);
    if (!pageInfo) {
      throw new Error(`Page ${pageId} not found`);
    }
    
    // Set up dialog handler
    pageInfo.page.once('dialog', async dialog => {
      if (accept) {
        await dialog.accept(text);
      } else {
        await dialog.dismiss();
      }
    });
  }

  async navigateBack(pageId: string) {
    const pageInfo = this.pages.get(pageId);
    if (!pageInfo) {
      throw new Error(`Page ${pageId} not found`);
    }
    
    await pageInfo.page.goBack();
  }

  async navigateForward(pageId: string) {
    const pageInfo = this.pages.get(pageId);
    if (!pageInfo) {
      throw new Error(`Page ${pageId} not found`);
    }
    
    await pageInfo.page.goForward();
  }

  async scrollToBottom(pageId: string, ref?: string) {
    const pageInfo = this.pages.get(pageId);
    if (!pageInfo) {
      throw new Error(`Page ${pageId} not found`);
    }
    
    if (ref) {
      // Scroll element to bottom
      await pageInfo.page.locator(`aria-ref=${ref}`).evaluate(el => {
        el.scrollTop = el.scrollHeight;
      });
    } else {
      // Scroll page to bottom
      await pageInfo.page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });
    }
  }

  async scrollToTop(pageId: string, ref?: string) {
    const pageInfo = this.pages.get(pageId);
    if (!pageInfo) {
      throw new Error(`Page ${pageId} not found`);
    }
    
    if (ref) {
      // Scroll element to top
      await pageInfo.page.locator(`aria-ref=${ref}`).evaluate(el => {
        el.scrollTop = 0;
      });
    } else {
      // Scroll page to top
      await pageInfo.page.evaluate(() => {
        window.scrollTo(0, 0);
      });
    }
  }

  async waitForTimeout(pageId: string, timeout: number) {
    const pageInfo = this.pages.get(pageId);
    if (!pageInfo) {
      throw new Error(`Page ${pageId} not found`);
    }
    
    await pageInfo.page.waitForTimeout(timeout);
  }

  async waitForSelector(pageId: string, selector: string, options?: any) {
    const pageInfo = this.pages.get(pageId);
    if (!pageInfo) {
      throw new Error(`Page ${pageId} not found`);
    }
    
    await pageInfo.page.waitForSelector(selector, options);
  }

  // Grep implementation using ripgrep for searching snapshot content
  grepSnapshot(snapshot: string, pattern: string, flags: string = ''): string {
    // Create temporary file for snapshot
    const tmpDir = os.tmpdir();
    const tmpFile = path.join(tmpDir, `snapshot-${Date.now()}-${Math.random().toString(36).substring(7)}.txt`);
    
    try {
      // Write snapshot to temporary file
      fs.writeFileSync(tmpFile, snapshot, 'utf8');
      
      // Parse flags to build ripgrep command
      const flagSet = new Set(flags.split(/\s+/).filter(f => f));
      let rgFlags: string[] = [];
      
      // Handle -E flag for extended regex (OR patterns with |)
      if (flagSet.has('-E')) {
        // For OR patterns like "pattern1|pattern2", split and use multiple -e flags
        if (pattern.includes('|')) {
          const patterns = pattern.split('|');
          patterns.forEach(p => {
            rgFlags.push('-e', p.trim());
          });
        } else {
          rgFlags.push('-e', pattern);
        }
      } else {
        // For literal search, use -F flag
        rgFlags.push('-F', pattern);
      }
      
      // Add other flags
      if (flagSet.has('-i')) rgFlags.push('-i');
      if (flagSet.has('-n')) rgFlags.push('-n');
      
      // Context flags
      for (const flag of flagSet) {
        if (flag.startsWith('-A')) {
          const lines = parseInt(flag.substring(2)) || 0;
          if (lines > 0) rgFlags.push('-A', lines.toString());
        } else if (flag.startsWith('-B')) {
          const lines = parseInt(flag.substring(2)) || 0;
          if (lines > 0) rgFlags.push('-B', lines.toString());
        } else if (flag.startsWith('-C')) {
          const lines = parseInt(flag.substring(2)) || 0;
          if (lines > 0) rgFlags.push('-C', lines.toString());
        } else if (flag.startsWith('-m')) {
          const max = parseInt(flag.substring(2)) || 0;
          if (max > 0) rgFlags.push('-m', max.toString());
        }
      }
      
      // Build command
      const args = [...rgFlags, tmpFile].map(arg => {
        // Properly escape arguments for shell
        if (arg.includes(' ') || arg.includes('"') || arg.includes("'")) {
          return `"${arg.replace(/"/g, '\\"')}"`;
        }
        return arg;
      }).join(' ');
      
      const command = `"${rgPath}" ${args}`;
      
      try {
        // Execute ripgrep
        const result = execSync(command, { 
          encoding: 'utf8',
          maxBuffer: 10 * 1024 * 1024 // 10MB buffer
        });
        
        // Check line count limit
        const lines = result.split('\n').filter(line => line.length > 0);
        if (lines.length > 100) {
          throw new Error(`Grep result exceeded 100 lines limit (got ${lines.length} lines). Please refine your search pattern or use more specific flags like -m to limit matches.`);
        }
        
        return result.trimEnd();
      } catch (error: any) {
        // ripgrep exits with code 1 when no matches found
        if (error.status === 1) {
          return '';
        }
        throw error;
      }
    } finally {
      // Clean up temporary file
      try {
        fs.unlinkSync(tmpFile);
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  }

  private generateOutline(snapshot: string): string {
    // Use smart outline generator
    return this.smartOutlineGenerator.generate(snapshot, {
      maxLines: 100,
      mode: 'smart',
      preserveStructure: true,
      foldThreshold: 3
    });
  }
  
  private generateOutlineOld(snapshot: string): string {
    const maxLines = 200;
    const lines = snapshot.split('\n');
    const result: string[] = [];
    
    // Phase 1: Analyze structure and detect list groups
    interface ListGroup {
      indent: number;
      elementType: string;
      firstLine: number;
      lines: string[];
      childrenOfFirst: string[];
    }
    
    const listGroups: ListGroup[] = [];
    let currentGroup: ListGroup | null = null;
    
    // First pass: identify all list groups
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const indent = line.length - line.trimStart().length;
      const elementMatch = line.match(/^\s*-\s*([a-z]+)/);
      const elementType = elementMatch ? elementMatch[1] : '';
      
      if (!elementType) continue;
      
      // Debug: Track all elements between ref=e300 and ref=e800
      const refMatch = line.match(/\[ref=(e\d+)\]/);
      if (refMatch) {
        const refNum = parseInt(refMatch[1].substring(1));
        if (refNum >= 300 && refNum <= 800) {
          console.log(`[DEBUG] Line ${i}: indent=${indent}, type=${elementType}, ref=${refMatch[1]}`);
        }
      }
      
      // IMPROVED LOGIC: Handle nested structures
      if (currentGroup) {
        if (indent > currentGroup.indent) {
          // This is a child element - skip it, don't break the group
          if (elementType === 'listitem') {
            console.log(`[DEBUG] Skipping child element at line ${i}: indent=${indent} > groupIndent=${currentGroup.indent}`);
          }
          continue;
        } else if (indent === currentGroup.indent && elementType === currentGroup.elementType) {
          // Same level and type - add to group
          currentGroup.lines.push(line);
          if (elementType === 'listitem') {
            console.log(`[DEBUG] Added to group: ${currentGroup.lines.length} items`);
          }
        } else {
          // Different element at same or shallower level - save and start new group
          if (currentGroup && elementType === 'listitem') {
            console.log(`[DEBUG] Breaking group at line ${i}: currentIndent=${currentGroup.indent}, newIndent=${indent}, currentType=${currentGroup.elementType}, newType=${elementType}`);
          }
          
          // Save previous group if it has multiple elements
          if (currentGroup && currentGroup.lines.length >= 3) {
          // Capture children of first element for structure sample
          const firstIndent = currentGroup.indent;
          currentGroup.childrenOfFirst = [];
          for (let j = currentGroup.firstLine + 1; j < lines.length; j++) {
            const childLine = lines[j];
            const childIndent = childLine.length - childLine.trimStart().length;
            if (childIndent <= firstIndent) break;
            if (childIndent === firstIndent + 2) {
              currentGroup.childrenOfFirst.push(childLine);
            }
          }
          if (currentGroup.elementType === 'listitem') {
            console.log(`[DEBUG] Saved group: ${currentGroup.elementType} with ${currentGroup.lines.length} items at indent ${currentGroup.indent}`);
          }
          listGroups.push(currentGroup);
        } else if (currentGroup && currentGroup.elementType === 'listitem') {
          console.log(`[DEBUG] Group too small: ${currentGroup.lines.length} items`);
        }
        
        // Start new group
        currentGroup = {
          indent,
          elementType,
          firstLine: i,
          lines: [line],
          childrenOfFirst: []
        };
        }
      } else {
        // No current group - start a new one
        currentGroup = {
          indent,
          elementType,
          firstLine: i,
          lines: [line],
          childrenOfFirst: []
        };
      }
    }
    
    // Don't forget the last group
    if (currentGroup && currentGroup.lines.length >= 3) {
      listGroups.push(currentGroup);
    }
    
    // Phase 2: Calculate dynamic priorities
    const staticHighPriority = ['heading', 'button', 'link', 'searchbox', 'navigation', 'banner', 'main', 'form'];
    const staticMediumPriority = ['textbox', 'checkbox', 'radio', 'select', 'list', 'article', 'section', 'region'];
    
    // Find the dominant list groups (by element count)
    const sortedGroups = [...listGroups].sort((a, b) => b.lines.length - a.lines.length);
    const dominantGroups = sortedGroups.slice(0, 3);
    
    // Determine which groups are high priority
    const isHighPriorityGroup = (group: ListGroup) => {
      return group.lines.length >= 10 || 
             dominantGroups.includes(group) ||
             staticHighPriority.includes(group.elementType);
    };
    
    // Phase 3: Build output intelligently
    const processedGroups = new Set<ListGroup>();
    let lineCount = 0;
    
    // Process lines with awareness of list groups
    for (let i = 0; i < lines.length && lineCount < maxLines; i++) {
      const line = lines[i];
      const indent = line.length - line.trimStart().length;
      const elementMatch = line.match(/^\s*-\s*([a-z]+)/);
      const elementType = elementMatch ? elementMatch[1] : '';
      
      // Check if this line starts a list group
      const group = listGroups.find(g => 
        g.firstLine === i && !processedGroups.has(g)
      );
      
      if (group && isHighPriorityGroup(group)) {
        // Process important list group with sample preservation
        processedGroups.add(group);
        
        // Add first element as complete sample
        result.push(group.lines[0]);
        lineCount++;
        
        // Add children of first element (up to 10 lines for structure)
        const childrenToShow = Math.min(group.childrenOfFirst.length, 10);
        for (let j = 0; j < childrenToShow && lineCount < maxLines; j++) {
          result.push(group.childrenOfFirst[j]);
          lineCount++;
        }
        
        // Collapse remaining elements
        if (group.lines.length > 1) {
          const remaining = group.lines.length - 1;
          const indentStr = ' '.repeat(group.indent);
          
          // Extract ref range if present
          const firstRef = group.lines[0].match(/\[ref=([^\]]+)\]/)?.[1];
          const lastRef = group.lines[group.lines.length - 1].match(/\[ref=([^\]]+)\]/)?.[1];
          const refRange = firstRef && lastRef ? ` [ref=${firstRef}-${lastRef}]` : '';
          
          result.push(`${indentStr}- ${group.elementType} (... and ${remaining} more similar)${refRange}`);
          lineCount++;
        }
        
        // Skip the lines we've already processed
        i = group.firstLine + group.lines.length - 1;
        
      } else if (!group || !isHighPriorityGroup(group)) {
        // Process regular elements
        if (staticHighPriority.includes(elementType) || 
            (lineCount < maxLines * 0.7 && staticMediumPriority.includes(elementType))) {
          result.push(line);
          lineCount++;
        } else if (lineCount < maxLines * 0.9) {
          // Add low priority elements only if we have space
          result.push(line);
          lineCount++;
        }
      }
    }
    
    // Add summary header with statistics
    const header = `Page Outline (${lineCount}/200 lines):\n`;
    return header + result.join('\n');
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