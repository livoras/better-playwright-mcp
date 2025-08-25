/**
 * PlaywrightClient - HTTP client for Playwright Server
 */
export class PlaywrightClient {
    baseUrl;
    constructor(baseUrl = 'http://localhost:3102') {
        this.baseUrl = baseUrl;
    }
    async request(method, path, body) {
        const response = await fetch(`${this.baseUrl}${path}`, {
            method,
            headers: {
                'Content-Type': 'application/json',
            },
            body: body ? JSON.stringify(body) : undefined,
        });
        if (!response.ok) {
            const error = await response.text();
            throw new Error(`HTTP ${response.status}: ${error}`);
        }
        return response.json();
    }
    // Page Management
    async createPage(name, description, url) {
        return this.request('POST', '/api/pages', { name, description, url });
    }
    async listPages() {
        return this.request('GET', '/api/pages');
    }
    async closePage(pageId) {
        await this.request('DELETE', `/api/pages/${pageId}`);
    }
    // Navigation
    async navigate(pageId, url) {
        return this.request('POST', `/api/pages/${pageId}/navigate`, { url });
    }
    // Snapshot
    async getSnapshot(pageId) {
        return this.request('POST', `/api/pages/${pageId}/snapshot`);
    }
    // Actions using ref
    async click(pageId, ref, element) {
        return this.request('POST', `/api/pages/${pageId}/click`, {
            ref,
            element: element || `Element with ref=${ref}`
        });
    }
    async type(pageId, ref, text, element) {
        return this.request('POST', `/api/pages/${pageId}/type`, {
            ref,
            text,
            element: element || `Element with ref=${ref}`
        });
    }
    async fill(pageId, ref, value, element) {
        return this.request('POST', `/api/pages/${pageId}/fill`, {
            ref,
            value,
            element: element || `Element with ref=${ref}`
        });
    }
    async select(pageId, ref, value, element) {
        return this.request('POST', `/api/pages/${pageId}/select`, {
            ref,
            value,
            element: element || `Element with ref=${ref}`
        });
    }
    // Screenshot
    async screenshot(pageId, fullPage = true) {
        const result = await this.request('POST', `/api/pages/${pageId}/screenshot`, { fullPage });
        return result.screenshot;
    }
    // Helper to print snapshot in readable format
    printSnapshot(snapshot) {
        console.log('URL:', snapshot.url);
        console.log('Title:', snapshot.title);
        console.log('Snapshot:');
        console.log(snapshot.snapshot);
        if (snapshot.modalStates?.length) {
            console.log('Modal States:', snapshot.modalStates);
        }
        if (snapshot.consoleMessages?.length) {
            console.log('Console Messages:', snapshot.consoleMessages);
        }
    }
}
// Export for CommonJS compatibility
export default PlaywrightClient;
