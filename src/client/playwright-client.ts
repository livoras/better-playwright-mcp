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
  async browserClick(pageId: string, ref: string, waitForTimeout?: number): Promise<any> {
    const result = await this.httpRequest('POST', `/api/pages/${pageId}/click`, { ref, waitForTimeout });
    
    // 保存操作记录
    if (result.snapshot) {
      await this.saveOperationRecord(
        pageId, 
        'browserClick', 
        { ref, waitForTimeout }, 
        result.snapshot,
        result.snapshotType
      );
    }
    
    return result;
  }

  async browserType(pageId: string, ref: string, text: string, submit?: boolean, slowly?: boolean, waitForTimeout?: number): Promise<any> {
    const result = await this.httpRequest('POST', `/api/pages/${pageId}/type`, { ref, text, submit, slowly, waitForTimeout });
    
    // 保存操作记录
    if (result.snapshot) {
      await this.saveOperationRecord(
        pageId, 
        'browserType', 
        { ref, text, submit, slowly, waitForTimeout }, 
        result.snapshot,
        result.snapshotType
      );
    }
    
    return result;
  }

  async browserHover(pageId: string, ref: string, waitForTimeout?: number): Promise<any> {
    const result = await this.httpRequest('POST', `/api/pages/${pageId}/hover`, { ref, waitForTimeout });
    
    // 保存操作记录
    if (result.snapshot) {
      await this.saveOperationRecord(
        pageId, 
        'browserHover', 
        { ref, waitForTimeout }, 
        result.snapshot,
        result.snapshotType
      );
    }
    
    return result;
  }

  async browserSelectOption(pageId: string, ref: string, values: string[], waitForTimeout?: number): Promise<any> {
    const result = await this.httpRequest('POST', `/api/pages/${pageId}/select-option`, { ref, values, waitForTimeout });
    
    // 保存操作记录
    if (result.snapshot) {
      await this.saveOperationRecord(
        pageId, 
        'browserSelectOption', 
        { ref, values, waitForTimeout }, 
        result.snapshot,
        result.snapshotType
      );
    }
    
    return result;
  }

  async browserPressKey(pageId: string, key: string, ref?: string, waitForTimeout?: number): Promise<any> {
    const result = await this.httpRequest('POST', `/api/pages/${pageId}/press-key`, { key, ref, waitForTimeout });
    
    // 保存操作记录
    if (result.snapshot) {
      await this.saveOperationRecord(
        pageId, 
        'browserPressKey', 
        { key, ref, waitForTimeout }, 
        result.snapshot,
        result.snapshotType
      );
    }
    
    return result;
  }

  async browserFileUpload(pageId: string, ref: string, paths: string[], waitForTimeout?: number): Promise<any> {
    const result = await this.httpRequest('POST', `/api/pages/${pageId}/file-upload`, { ref, paths, waitForTimeout });
    
    // 保存操作记录
    if (result.snapshot) {
      await this.saveOperationRecord(
        pageId, 
        'browserFileUpload', 
        { ref, paths, waitForTimeout }, 
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

  async extractData(pageId: string, extractorFunction: string): Promise<any> {
    return await this.httpRequest('POST', `/api/pages/${pageId}/extractData`, { extractorFunction });
  }

  async getElementHTML(pageId: string, ref: string): Promise<any> {
    return await this.httpRequest('POST', `/api/pages/${pageId}/element-html`, { ref });
  }

  async queryToFile(pageId: string, selector: string, filePath: string): Promise<any> {
    return await this.httpRequest('POST', `/api/pages/${pageId}/query-to-file`, { selector, filePath });
  }

  async pageToHtmlFile(pageId: string): Promise<any> {
    return await this.httpRequest('POST', `/api/pages/${pageId}/page-to-html-file`);
  }

  async executePage(pageId: string, script: string): Promise<any> {
    return await this.httpRequest('POST', `/api/pages/${pageId}/execute`, { script });
  }
  
  async getScreenshot(pageId: string, options?: any): Promise<any> {
    return await this.httpRequest('POST', `/api/pages/${pageId}/screenshot`, options || {});
  }
  
  async getPDFSnapshot(pageId: string, options?: any): Promise<any> {
    return await this.httpRequest('POST', `/api/pages/${pageId}/pdf`, options || {});
  }

  async getPageSnapshot(pageId: string): Promise<string> {
    const response = await fetch(`${this.baseUrl}/api/pages/${pageId}/snapshot`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`HTTP ${response.status}: ${error}`);
    }
    
    return await response.text();
  }

  async downloadImage(url: string): Promise<any> {
    return await this.httpRequest('POST', '/api/download-image', { url });
  }

  // 捕获快照方法
  async captureSnapshot(options: {
    url: string;
    wait?: number;
    scrolls?: number;
    scrollDelay?: number;
    trim?: boolean;
    pageName?: string;
    pageDescription?: string;
  }): Promise<{ pageId: string; snapshotFiles: string[] }> {
    const {
      url,
      wait = 5000,
      scrolls = 1,
      scrollDelay = 5000,
      trim = true,
      pageName = 'snapshot',
      pageDescription = 'Auto snapshot page'
    } = options;

    // 创建页面并导航到 URL
    const result = await this.createPage(pageName, pageDescription, url);
    const pageId = result.pageId;

    try {
      // 初次等待
      await this.waitForTimeout(pageId, wait);

      // 滚动循环
      for (let i = 0; i < scrolls; i++) {
        // 滚动到底部
        await this.scrollToBottom(pageId);

        // 除了最后一次，都要等待 scroll-delay
        if (i < scrolls - 1) {
          await this.waitForTimeout(pageId, scrollDelay);
        }
      }

      // 如果启用了 trim，执行修剪
      if (trim) {
        await this.trimSnapshots(pageId);
      }

      // 读取目录内容，返回快照文件列表
      const recordsDir = path.join(os.tmpdir(), 'playwright-records', pageId);
      const files = fs.readdirSync(recordsDir);
      const snapshotFiles = files.map(file => path.join(recordsDir, file));

      return { pageId, snapshotFiles };
    } catch (error) {
      // 如果出错，清理页面
      await this.closePage(pageId).catch(() => {});
      throw error;
    }
  }

  // 内部方法：修剪快照文件
  private async trimSnapshots(pageId: string): Promise<void> {
    const recordsDir = path.join(os.tmpdir(), 'playwright-records', pageId);
    
    if (!fs.existsSync(recordsDir)) {
      throw new Error(`页面目录不存在: ${recordsDir}`);
    }

    const files = fs.readdirSync(recordsDir).sort();
    const snapshotFiles: Array<{
      filePath: string;
      content: string;
      snapshotLines: string[];
      preSnapshotLines: string[];
    }> = [];

    // 读取所有快照文件
    for (const file of files) {
      const filePath = path.join(recordsDir, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      
      const lines = content.split('\n');
      const snapshotStartIndex = lines.findIndex(line => line.trim() === '--- snapshot ---');
      
      if (snapshotStartIndex === -1) {
        continue; // 跳过没有 snapshot 部分的文件
      }
      
      const preSnapshotLines = lines.slice(0, snapshotStartIndex + 1);
      const snapshotLines = lines.slice(snapshotStartIndex + 1);
      
      snapshotFiles.push({
        filePath,
        content,
        snapshotLines,
        preSnapshotLines
      });
    }

    if (snapshotFiles.length <= 1) {
      return; // 只有一个或没有快照文件，无需修剪
    }

    // 查找公共前缀和后缀
    const firstSnapshot = snapshotFiles[0].snapshotLines;
    let commonPrefix = 0;
    let commonSuffix = 0;

    // 查找公共前缀
    for (let i = 0; i < firstSnapshot.length; i++) {
      const line = firstSnapshot[i];
      let isCommon = true;
      
      for (let j = 1; j < snapshotFiles.length; j++) {
        const otherSnapshot = snapshotFiles[j].snapshotLines;
        if (i >= otherSnapshot.length || otherSnapshot[i] !== line) {
          isCommon = false;
          break;
        }
      }
      
      if (isCommon) {
        commonPrefix++;
      } else {
        break;
      }
    }

    // 查找公共后缀
    const minLength = Math.min(...snapshotFiles.map(f => f.snapshotLines.length));
    
    for (let i = 1; i <= minLength - commonPrefix; i++) {
      const line = firstSnapshot[firstSnapshot.length - i];
      let isCommon = true;
      
      for (let j = 1; j < snapshotFiles.length; j++) {
        const otherSnapshot = snapshotFiles[j].snapshotLines;
        if (otherSnapshot[otherSnapshot.length - i] !== line) {
          isCommon = false;
          break;
        }
      }
      
      if (isCommon) {
        commonSuffix++;
      } else {
        break;
      }
    }

    if (commonPrefix === 0 && commonSuffix === 0) {
      return; // 没有找到公共的头部和尾部，无需修剪
    }

    // 修剪除第一个之外的快照文件
    for (let i = 1; i < snapshotFiles.length; i++) {
      const file = snapshotFiles[i];
      const trimmedSnapshot = file.snapshotLines.slice(
        commonPrefix,
        commonSuffix > 0 ? -commonSuffix : undefined
      );
      
      const newContent = [
        ...file.preSnapshotLines,
        ...trimmedSnapshot
      ].join('\n');
      
      fs.writeFileSync(file.filePath, newContent, 'utf-8');
    }
  }
}