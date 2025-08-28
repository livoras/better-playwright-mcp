import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
// import { exec } from 'child_process';
// import { promisify } from 'util';

// const execAsync = promisify(exec);

// Playwright HTTP 客户端类
export class PlaywrightClient {
  private baseUrl: string;
  private recordsDir: string = path.join(os.tmpdir(), 'playwright-records');
  private operationCounters: Map<string, number> = new Map();
  
  constructor(baseUrl: string = 'http://localhost:3102') {
    this.baseUrl = baseUrl;
  }
  
  async connect(): Promise<void> {
    await fetch(`${this.baseUrl}/api/pages`);
  }
  
  private async httpRequest(method: string, endpoint: string, body?: object): Promise<any> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    
    const result = await response.json();
    
    if (!response.ok) {
      throw new Error(result.error || `HTTP ${response.status}: ${response.statusText}`);
    }
    
    return result;
  }
  
  // 页面管理 API
  async createPage(name: string, description: string, url?: string, waitForTimeout?: number): Promise<any> {
    const result = await this.httpRequest('POST', '/api/pages', { name, description, url, waitForTimeout });
    
    // 初始化操作计数器
    if (result.pageId) {
      this.operationCounters.set(result.pageId, 0);
      
      // 如果有初始 URL，保存导航记录
      if (url && result.snapshot) {
        await this.saveOperationRecord(
          result.pageId,
          'browserNavigate',
          { url, waitForTimeout },
          result.snapshot,
          result.snapshotType
        );
      }
    }
    
    return result;
  }
  
  async activatePage(pageId: string): Promise<any> {
    return await this.httpRequest('POST', `/api/pages/${pageId}/activate`);
  }
  
  async closePage(pageId: string): Promise<any> {
    // 清理操作计数器
    this.operationCounters.delete(pageId);
    return await this.httpRequest('DELETE', `/api/pages/${pageId}`);
  }
  
  async listPages(): Promise<any> {
    return await this.httpRequest('GET', '/api/pages');
  }
  
  async closeAllPages(): Promise<any> {
    return await this.httpRequest('DELETE', '/api/pages');
  }
  
  // 无ID页面管理 API
  async listPagesWithoutId(): Promise<any> {
    return await this.httpRequest('GET', '/api/pages-without-id');
  }
  
  async closePagesWithoutId(): Promise<any> {
    return await this.httpRequest('DELETE', '/api/pages-without-id');
  }
  
  async closePageByIndex(index: number): Promise<any> {
    return await this.httpRequest('DELETE', `/api/pages/index/${index}`);
  }
  
  // 内部方法：获取格式化的时间戳
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
  
  // 内部方法：保存操作记录
  private async saveOperationRecord(
    pageId: string, 
    action: string, 
    parameters: any, 
    snapshot: string,
    snapshotType: 'full' | 'diff' = 'full'
  ): Promise<void> {
    // 创建记录目录
    const pageRecordDir = path.join(this.recordsDir, pageId);
    await fs.promises.mkdir(pageRecordDir, { recursive: true });
    
    // 获取并增加操作计数器
    const counter = (this.operationCounters.get(pageId) || 0) + 1;
    this.operationCounters.set(pageId, counter);
    
    const now = new Date();
    const timestamp = this.getFormattedTimestamp();
    
    // 文件名使用UTC时间但格式化为本地时间
    const fileTimestamp = now.toLocaleString('sv-SE', {
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
    }).replace(/[:\s]/g, '-').replace('T', '-');
    
    const filename = `${counter}.${fileTimestamp}-${action}`;
    const recordPath = path.join(pageRecordDir, filename);
    
    // 获取页面信息
    const pages = await this.listPages();
    const pageInfo = pages.pages.find((p: any) => p.pageId === pageId);
    const title = pageInfo?.title || 'Unknown';
    
    const content = `action: ${action}
time: ${timestamp}
parameters: ${JSON.stringify(parameters)}
title: '${title}'
snapshotType: '${snapshotType}'

--- snapshot ---
${snapshot}`;
    
    await fs.promises.writeFile(recordPath, content, 'utf8');
  }
  
  // 浏览器操作 API
  async browserClick(pageId: string, selector: string, waitForTimeout?: number): Promise<any> {
    const result = await this.httpRequest('POST', `/api/pages/${pageId}/click`, { selector, waitForTimeout });
    
    // 保存操作记录
    if (result.snapshot) {
      await this.saveOperationRecord(
        pageId, 
        'browserClick', 
        { selector, waitForTimeout }, 
        result.snapshot,
        result.snapshotType
      );
    }
    
    return result;
  }

  async browserType(pageId: string, selector: string, text: string, submit?: boolean, slowly?: boolean, waitForTimeout?: number): Promise<any> {
    const result = await this.httpRequest('POST', `/api/pages/${pageId}/type`, { selector, text, submit, slowly, waitForTimeout });
    
    // 保存操作记録
    if (result.snapshot) {
      await this.saveOperationRecord(
        pageId, 
        'browserType', 
        { selector, text, submit, slowly, waitForTimeout }, 
        result.snapshot,
        result.snapshotType
      );
    }
    
    return result;
  }

  async browserHover(pageId: string, selector: string, waitForTimeout?: number): Promise<any> {
    const result = await this.httpRequest('POST', `/api/pages/${pageId}/hover`, { selector, waitForTimeout });
    
    // 保存操作记录
    if (result.snapshot) {
      await this.saveOperationRecord(
        pageId, 
        'browserHover', 
        { selector, waitForTimeout }, 
        result.snapshot,
        result.snapshotType
      );
    }
    
    return result;
  }

  async browserSelectOption(pageId: string, selector: string, values: string[], waitForTimeout?: number): Promise<any> {
    const result = await this.httpRequest('POST', `/api/pages/${pageId}/select-option`, { selector, values, waitForTimeout });
    
    // 保存操作记录
    if (result.snapshot) {
      await this.saveOperationRecord(
        pageId, 
        'browserSelectOption', 
        { selector, values, waitForTimeout }, 
        result.snapshot,
        result.snapshotType
      );
    }
    
    return result;
  }

  async browserPressKey(pageId: string, key: string, selector?: string, waitForTimeout?: number): Promise<any> {
    const result = await this.httpRequest('POST', `/api/pages/${pageId}/press-key`, { key, selector, waitForTimeout });
    
    // 保存操作记录
    if (result.snapshot) {
      await this.saveOperationRecord(
        pageId, 
        'browserPressKey', 
        { key, selector, waitForTimeout }, 
        result.snapshot,
        result.snapshotType
      );
    }
    
    return result;
  }

  async browserFileUpload(pageId: string, selector: string, paths: string[], waitForTimeout?: number): Promise<any> {
    const result = await this.httpRequest('POST', `/api/pages/${pageId}/file-upload`, { selector, paths, waitForTimeout });
    
    // 保存操作记录
    if (result.snapshot) {
      await this.saveOperationRecord(
        pageId, 
        'browserFileUpload', 
        { selector, paths, waitForTimeout }, 
        result.snapshot,
        result.snapshotType
      );
    }
    
    return result;
  }

  async browserHandleDialog(pageId: string, accept: boolean, promptText?: string, waitForTimeout?: number): Promise<any> {
    const result = await this.httpRequest('POST', `/api/pages/${pageId}/handle-dialog`, { accept, promptText, waitForTimeout });
    
    // 保存操作记录
    if (result.snapshot) {
      await this.saveOperationRecord(
        pageId, 
        'browserHandleDialog', 
        { accept, promptText, waitForTimeout }, 
        result.snapshot,
        result.snapshotType
      );
    }
    
    return result;
  }

  async browserNavigate(pageId: string, url: string, waitForTimeout?: number): Promise<any> {
    const result = await this.httpRequest('POST', `/api/pages/${pageId}/navigate`, { url, waitForTimeout });
    
    // 保存操作记录
    if (result.snapshot) {
      await this.saveOperationRecord(
        pageId, 
        'browserNavigate', 
        { url, waitForTimeout }, 
        result.snapshot,
        result.snapshotType
      );
    }
    
    return result;
  }

  async browserNavigateBack(pageId: string, waitForTimeout?: number): Promise<any> {
    const result = await this.httpRequest('POST', `/api/pages/${pageId}/navigate-back`, { waitForTimeout });
    
    // 保存操作记录
    if (result.snapshot) {
      await this.saveOperationRecord(
        pageId, 
        'browserNavigateBack', 
        { waitForTimeout }, 
        result.snapshot,
        result.snapshotType
      );
    }
    
    return result;
  }

  async browserNavigateForward(pageId: string, waitForTimeout?: number): Promise<any> {
    const result = await this.httpRequest('POST', `/api/pages/${pageId}/navigate-forward`, { waitForTimeout });
    
    // 保存操作记录
    if (result.snapshot) {
      await this.saveOperationRecord(
        pageId, 
        'browserNavigateForward', 
        { waitForTimeout }, 
        result.snapshot,
        result.snapshotType
      );
    }
    
    return result;
  }

  async scrollToBottom(pageId: string, selector?: string, waitForTimeout?: number): Promise<any> {
    const result = await this.httpRequest('POST', `/api/pages/${pageId}/scroll-to-bottom`, { selector, waitForTimeout });
    
    // 保存操作记录
    if (result.snapshot) {
      await this.saveOperationRecord(
        pageId, 
        'scrollToBottom', 
        { selector, waitForTimeout }, 
        result.snapshot,
        result.snapshotType
      );
    }
    
    return result;
  }

  async scrollToTop(pageId: string, selector?: string, waitForTimeout?: number): Promise<any> {
    const result = await this.httpRequest('POST', `/api/pages/${pageId}/scroll-to-top`, { selector, waitForTimeout });
    
    // 保存操作记录
    if (result.snapshot) {
      await this.saveOperationRecord(
        pageId, 
        'scrollToTop', 
        { selector, waitForTimeout }, 
        result.snapshot,
        result.snapshotType
      );
    }
    
    return result;
  }

  async waitForTimeout(pageId: string, ms: number): Promise<any> {
    return await this.httpRequest('POST', `/api/pages/${pageId}/wait-for-timeout`, { ms });
  }

  async waitForSelector(pageId: string, selector: string, options?: { timeout?: number; state?: 'attached' | 'detached' | 'visible' | 'hidden' }): Promise<any> {
    return await this.httpRequest('POST', `/api/pages/${pageId}/wait-for-selector`, { selector, ...options });
  }

  async getElementHTML(pageId: string, selector: string): Promise<any> {
    return await this.httpRequest('POST', `/api/pages/${pageId}/element-html`, { selector });
  }

  async pageToHtmlFile(pageId: string): Promise<any> {
    return await this.httpRequest('POST', `/api/pages/${pageId}/page-to-html-file`, {});
  }

  async executePage(pageId: string, script: string): Promise<any> {
    return await this.httpRequest('POST', `/api/pages/${pageId}/execute`, { script });
  }

  async downloadImage(url: string): Promise<any> {
    return await this.httpRequest('POST', '/api/download-image', { url });
  }

}