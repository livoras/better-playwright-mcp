/**
 * HTTP Server for Playwright with Page Management
 * Based on Microsoft's playwright-mcp core
 */
import express from 'express';
import * as playwright from 'playwright';
import { v4 as uuid } from 'uuid';
export class PlaywrightServer {
    port;
    app;
    httpServer = null;
    browser = null;
    browserContext = null;
    pages = new Map();
    constructor(port = 3102) {
        this.port = port;
        this.app = express();
        this.app.use(express.json());
        this.registerRoutes();
    }
    registerRoutes() {
        // Health check
        this.app.get('/health', (req, res) => {
            res.json({ status: 'ok', pages: this.pages.size });
        });
        // Page management
        this.app.post('/api/pages', async (req, res) => {
            try {
                const { name, description, url } = req.body;
                const result = await this.createPage(name, description, url);
                res.json(result);
            }
            catch (error) {
                res.status(500).json({ error: error.message });
            }
        });
        this.app.get('/api/pages', (req, res) => {
            const pages = Array.from(this.pages.values()).map(p => ({
                id: p.id,
                name: p.name,
                description: p.description,
                url: p.page.url(),
                title: p.page.title()
            }));
            res.json(pages);
        });
        this.app.delete('/api/pages/:pageId', async (req, res) => {
            try {
                const { pageId } = req.params;
                await this.closePage(pageId);
                res.json({ success: true });
            }
            catch (error) {
                res.status(500).json({ error: error.message });
            }
        });
        // Navigation
        this.app.post('/api/pages/:pageId/navigate', async (req, res) => {
            try {
                const { pageId } = req.params;
                const { url } = req.body;
                const result = await this.navigate(pageId, url);
                res.json(result);
            }
            catch (error) {
                res.status(500).json({ error: error.message });
            }
        });
        // Snapshot
        this.app.post('/api/pages/:pageId/snapshot', async (req, res) => {
            try {
                const { pageId } = req.params;
                const snapshot = await this.getSnapshot(pageId);
                res.json(snapshot);
            }
            catch (error) {
                res.status(500).json({ error: error.message });
            }
        });
        // Click action using ref
        this.app.post('/api/pages/:pageId/click', async (req, res) => {
            try {
                const { pageId } = req.params;
                const { ref, element } = req.body;
                await this.click(pageId, ref, element);
                const snapshot = await this.getSnapshot(pageId);
                res.json(snapshot);
            }
            catch (error) {
                res.status(500).json({ error: error.message });
            }
        });
        // Type action using ref
        this.app.post('/api/pages/:pageId/type', async (req, res) => {
            try {
                const { pageId } = req.params;
                const { ref, element, text } = req.body;
                await this.type(pageId, ref, element, text);
                const snapshot = await this.getSnapshot(pageId);
                res.json(snapshot);
            }
            catch (error) {
                res.status(500).json({ error: error.message });
            }
        });
        // Fill action using ref
        this.app.post('/api/pages/:pageId/fill', async (req, res) => {
            try {
                const { pageId } = req.params;
                const { ref, element, value } = req.body;
                await this.fill(pageId, ref, element, value);
                const snapshot = await this.getSnapshot(pageId);
                res.json(snapshot);
            }
            catch (error) {
                res.status(500).json({ error: error.message });
            }
        });
        // Select option using ref
        this.app.post('/api/pages/:pageId/select', async (req, res) => {
            try {
                const { pageId } = req.params;
                const { ref, element, value } = req.body;
                await this.select(pageId, ref, element, value);
                const snapshot = await this.getSnapshot(pageId);
                res.json(snapshot);
            }
            catch (error) {
                res.status(500).json({ error: error.message });
            }
        });
        // Screenshot
        this.app.post('/api/pages/:pageId/screenshot', async (req, res) => {
            try {
                const { pageId } = req.params;
                const { fullPage = true } = req.body;
                const screenshot = await this.screenshot(pageId, fullPage);
                res.json({ screenshot });
            }
            catch (error) {
                res.status(500).json({ error: error.message });
            }
        });
    }
    async ensureBrowser() {
        if (!this.browser || !this.browser.isConnected()) {
            this.browser = await playwright.chromium.launch({
                headless: false
            });
        }
        if (!this.browserContext) {
            this.browserContext = await this.browser.newContext();
        }
    }
    async createPage(name, description, url) {
        await this.ensureBrowser();
        const pageId = uuid();
        const page = await this.browserContext.newPage();
        const pageInfo = {
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
    async closePage(pageId) {
        const pageInfo = this.pages.get(pageId);
        if (!pageInfo) {
            throw new Error(`Page ${pageId} not found`);
        }
        await pageInfo.page.close();
        this.pages.delete(pageId);
    }
    async navigate(pageId, url) {
        const pageInfo = this.pages.get(pageId);
        if (!pageInfo) {
            throw new Error(`Page ${pageId} not found`);
        }
        await pageInfo.page.goto(url);
        return await this.getSnapshot(pageId);
    }
    async getSnapshot(pageId) {
        const pageInfo = this.pages.get(pageId);
        if (!pageInfo) {
            throw new Error(`Page ${pageId} not found`);
        }
        // Get snapshot using Playwright's internal API
        const snapshot = await pageInfo.page._snapshotForAI();
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
    parseRefMappings(pageId, snapshot) {
        const pageInfo = this.pages.get(pageId);
        if (!pageInfo)
            return;
        const mappings = new Map();
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
    async click(pageId, ref, element) {
        const pageInfo = this.pages.get(pageId);
        if (!pageInfo) {
            throw new Error(`Page ${pageId} not found`);
        }
        // Use aria-ref selector directly
        await pageInfo.page.locator(`aria-ref=${ref}`).click();
    }
    async type(pageId, ref, element, text) {
        const pageInfo = this.pages.get(pageId);
        if (!pageInfo) {
            throw new Error(`Page ${pageId} not found`);
        }
        // Use aria-ref selector directly
        await pageInfo.page.locator(`aria-ref=${ref}`).type(text);
    }
    async fill(pageId, ref, element, value) {
        const pageInfo = this.pages.get(pageId);
        if (!pageInfo) {
            throw new Error(`Page ${pageId} not found`);
        }
        // Use aria-ref selector directly
        await pageInfo.page.locator(`aria-ref=${ref}`).fill(value);
    }
    async select(pageId, ref, element, value) {
        const pageInfo = this.pages.get(pageId);
        if (!pageInfo) {
            throw new Error(`Page ${pageId} not found`);
        }
        // Use aria-ref selector directly
        await pageInfo.page.locator(`aria-ref=${ref}`).selectOption(value);
    }
    async screenshot(pageId, fullPage = true) {
        const pageInfo = this.pages.get(pageId);
        if (!pageInfo) {
            throw new Error(`Page ${pageId} not found`);
        }
        const buffer = await pageInfo.page.screenshot({ fullPage });
        return buffer.toString('base64');
    }
    async start() {
        return new Promise((resolve) => {
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
        // Close browser
        if (this.browserContext) {
            await this.browserContext.close();
        }
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
