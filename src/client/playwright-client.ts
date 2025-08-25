/**
 * PlaywrightClient - HTTP client for Playwright Server
 */

export interface SnapshotResponse {
  pageId: string;
  url: string;
  title: string;
  snapshot: string;
  modalStates?: any[];
  consoleMessages?: any[];
}

export interface PageInfo {
  id: string;
  name: string;
  description: string;
  url: string;
  title: string;
}

export class PlaywrightClient {
  constructor(private baseUrl: string = 'http://localhost:3102') {}

  private async request(method: string, path: string, body?: any): Promise<any> {
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
  async createPage(name: string, description: string, url?: string): Promise<{ pageId: string; snapshot: SnapshotResponse }> {
    return this.request('POST', '/api/pages', { name, description, url });
  }

  async listPages(): Promise<PageInfo[]> {
    return this.request('GET', '/api/pages');
  }

  async closePage(pageId: string): Promise<void> {
    await this.request('DELETE', `/api/pages/${pageId}`);
  }

  // Navigation
  async navigate(pageId: string, url: string): Promise<SnapshotResponse> {
    return this.request('POST', `/api/pages/${pageId}/navigate`, { url });
  }

  // Snapshot
  async getSnapshot(pageId: string): Promise<SnapshotResponse> {
    return this.request('POST', `/api/pages/${pageId}/snapshot`);
  }

  // Actions using ref
  async click(pageId: string, ref: string, element?: string): Promise<SnapshotResponse> {
    return this.request('POST', `/api/pages/${pageId}/click`, { 
      ref, 
      element: element || `Element with ref=${ref}` 
    });
  }

  async type(pageId: string, ref: string, text: string, element?: string): Promise<SnapshotResponse> {
    return this.request('POST', `/api/pages/${pageId}/type`, { 
      ref, 
      text,
      element: element || `Element with ref=${ref}` 
    });
  }

  async fill(pageId: string, ref: string, value: string, element?: string): Promise<SnapshotResponse> {
    return this.request('POST', `/api/pages/${pageId}/fill`, { 
      ref, 
      value,
      element: element || `Element with ref=${ref}` 
    });
  }

  async select(pageId: string, ref: string, value: string | string[], element?: string): Promise<SnapshotResponse> {
    return this.request('POST', `/api/pages/${pageId}/select`, { 
      ref, 
      value,
      element: element || `Element with ref=${ref}` 
    });
  }

  // Screenshot
  async screenshot(pageId: string, fullPage: boolean = true): Promise<string> {
    const result = await this.request('POST', `/api/pages/${pageId}/screenshot`, { fullPage });
    return result.screenshot;
  }

  // Browser Actions - Additional
  async browserHover(pageId: string, ref: string, element?: string): Promise<SnapshotResponse> {
    return this.request('POST', `/api/pages/${pageId}/hover`, { 
      ref, 
      element: element || `Element with ref=${ref}` 
    });
  }

  async browserPressKey(pageId: string, key: string): Promise<SnapshotResponse> {
    return this.request('POST', `/api/pages/${pageId}/press`, { key });
  }

  async browserFileUpload(pageId: string, ref: string, files: string[]): Promise<SnapshotResponse> {
    return this.request('POST', `/api/pages/${pageId}/upload`, { ref, files });
  }

  async browserHandleDialog(pageId: string, accept: boolean, text?: string): Promise<{ success: boolean }> {
    return this.request('POST', `/api/pages/${pageId}/dialog`, { accept, text });
  }

  async browserNavigateBack(pageId: string): Promise<SnapshotResponse> {
    return this.request('POST', `/api/pages/${pageId}/back`);
  }

  async browserNavigateForward(pageId: string): Promise<SnapshotResponse> {
    return this.request('POST', `/api/pages/${pageId}/forward`);
  }

  async scrollToBottom(pageId: string, ref?: string): Promise<SnapshotResponse> {
    return this.request('POST', `/api/pages/${pageId}/scroll-bottom`, { ref });
  }

  async scrollToTop(pageId: string, ref?: string): Promise<SnapshotResponse> {
    return this.request('POST', `/api/pages/${pageId}/scroll-top`, { ref });
  }

  async waitForTimeout(pageId: string, timeout: number): Promise<{ success: boolean }> {
    return this.request('POST', `/api/pages/${pageId}/wait-timeout`, { timeout });
  }

  async waitForSelector(pageId: string, selector: string, options?: any): Promise<{ success: boolean }> {
    return this.request('POST', `/api/pages/${pageId}/wait-selector`, { selector, options });
  }

  // Aliases for compatibility
  async browserClick(pageId: string, ref: string, element?: string): Promise<SnapshotResponse> {
    return this.click(pageId, ref, element);
  }

  async browserType(pageId: string, ref: string, text: string, element?: string): Promise<SnapshotResponse> {
    return this.type(pageId, ref, text, element);
  }

  async browserSelectOption(pageId: string, ref: string, value: string | string[], element?: string): Promise<SnapshotResponse> {
    return this.select(pageId, ref, value, element);
  }

  async browserNavigate(pageId: string, url: string): Promise<SnapshotResponse> {
    return this.navigate(pageId, url);
  }

  // Helper to print snapshot in readable format
  printSnapshot(snapshot: SnapshotResponse) {
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