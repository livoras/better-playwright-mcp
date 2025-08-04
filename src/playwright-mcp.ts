import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { PlaywrightClient } from "./client/playwright-client.js";
import { truncateByTokens } from "./utils/token-limiter.js";
import { defaultConfig } from "./config.js";

// 创建 Playwright 客户端实例
const playwrightClient = new PlaywrightClient('http://localhost:3002', defaultConfig.snapshotDir);

// 全局未处理 Promise rejection 处理
process.on('unhandledRejection', () => {
  // Unhandled Promise Rejection
});

process.on('uncaughtException', () => {
  // Uncaught Exception
});

// 连接到 playwright-server (静默)
playwrightClient.connect();

// 辅助函数：处理可能的snapshot响应格式
function formatResponse(result: any) {
  // 如果返回的是新的snapshot格式，直接返回snapshot内容
  if (result && typeof result === 'object' && 'snapshotType' in result && 'snapshot' in result) {
    // 对 snapshot 内容进行 token 限制
    const truncatedSnapshot = truncateByTokens(result.snapshot, defaultConfig.maxTokens);
    return {
      content: [{
        type: "text" as const,
        text: truncatedSnapshot
      }]
    };
  }
  // 否则返回JSON格式
  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify(result, null, 2)
    }]
  };
}

// Create an MCP server
const server = new McpServer({
  name: "better-playwright-mcp",
  version: "0.1.0"
});

// ==================== 页面管理工具 ====================

// 创建页面
server.registerTool(
  "createPage",
  {
    description: "创建新的浏览器页面",
    inputSchema: {
      name: z.string().describe("页面名称"),
      description: z.string().describe("页面描述"),
      url: z.string().optional().describe("可选：创建后自动导航到的URL"),
      waitForTimeout: z.number().optional().describe("可选：操作后等待获取快照的延迟时间（毫秒，默认2000）")
    }
  },
  async ({ name, description, url, waitForTimeout }) => {
    const result = await playwrightClient.createPage(name, description, url, waitForTimeout);
    // 对于 createPage，需要返回 pageId 和格式化的 snapshot
    if (result && typeof result === 'object' && 'pageId' in result) {
      const truncatedSnapshot = result.snapshot ? truncateByTokens(result.snapshot, 20000) : '';
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({ 
            pageId: result.pageId, 
            snapshot: truncatedSnapshot 
          }, null, 2)
        }]
      };
    }
    return formatResponse(result);
  }
);

// 激活页面
server.registerTool(
  "activatePage",
  {
    description: "激活指定的页面",
    inputSchema: {
      pageId: z.string().describe("页面ID")
    }
  },
  async ({ pageId }) => {
    const result = await playwrightClient.activatePage(pageId);
    return {
      content: [{
        type: "text",
        text: JSON.stringify(result, null, 2)
      }]
    };
  }
);


// 关闭页面
server.registerTool(
  "closePage",
  {
    description: "关闭指定的页面",
    inputSchema: {
      pageId: z.string().describe("页面ID")
    }
  },
  async ({ pageId }) => {
    const result = await playwrightClient.closePage(pageId);
    return {
      content: [{
        type: "text",
        text: JSON.stringify(result, null, 2)
      }]
    };
  }
);

// 列出所有页面
server.registerTool(
  "listPages",
  {
    description: "列出所有管理的页面（包含标题和URL）",
    inputSchema: {}
  },
  async () => {
    const result = await playwrightClient.listPages();
    return {
      content: [{
        type: "text",
        text: JSON.stringify(result, null, 2)
      }]
    };
  }
);

// 关闭所有页面
server.registerTool(
  "closeAllPages",
  {
    description: "关闭所有管理的页面",
    inputSchema: {}
  },
  async () => {
    const result = await playwrightClient.closeAllPages();
    return {
      content: [{
        type: "text",
        text: JSON.stringify(result, null, 2)
      }]
    };
  }
);

// ==================== 无ID页面管理工具 ====================

// 列出无ID页面
server.registerTool(
  "listPagesWithoutId",
  {
    description: "列出所有未被管理的页面",
    inputSchema: {}
  },
  async () => {
    const result = await playwrightClient.listPagesWithoutId();
    return {
      content: [{
        type: "text",
        text: JSON.stringify(result, null, 2)
      }]
    };
  }
);

// 关闭无ID页面
server.registerTool(
  "closePagesWithoutId",
  {
    description: "关闭所有未被管理的页面",
    inputSchema: {}
  },
  async () => {
    const result = await playwrightClient.closePagesWithoutId();
    return {
      content: [{
        type: "text",
        text: JSON.stringify(result, null, 2)
      }]
    };
  }
);

// 通过索引关闭页面
server.registerTool(
  "closePageByIndex",
  {
    description: "通过索引关闭页面",
    inputSchema: {
      index: z.number().describe("页面索引")
    }
  },
  async ({ index }) => {
    const result = await playwrightClient.closePageByIndex(index);
    return {
      content: [{
        type: "text",
        text: JSON.stringify(result, null, 2)
      }]
    };
  }
);

// ==================== 浏览器操作工具 ====================

// 点击元素
server.registerTool(
  "browserClick",
  {
    description: "点击页面元素",
    inputSchema: {
      pageId: z.string().describe("页面ID"),
      ref: z.string().describe("元素的xp引用值"),
      waitForTimeout: z.number().optional().describe("操作后等待获取快照的延迟时间（毫秒，默认2000）")
    }
  },
  async ({ pageId, ref, waitForTimeout }) => {
    const result = await playwrightClient.browserClick(pageId, ref, waitForTimeout);
    return formatResponse(result);
  }
);

// 输入文本
server.registerTool(
  "browserType",
  {
    description: "在页面元素中输入文本",
    inputSchema: {
      pageId: z.string().describe("页面ID"),
      ref: z.string().describe("元素的xp引用值"),
      text: z.string().describe("要输入的文本"),
      submit: z.boolean().optional().describe("输入后是否按回车提交（默认false）"),
      slowly: z.boolean().optional().describe("是否慢速输入（默认false）"),
      waitForTimeout: z.number().optional().describe("操作后等待获取快照的延迟时间（毫秒，默认2000）")
    }
  },
  async ({ pageId, ref, text, submit, slowly, waitForTimeout }) => {
    const result = await playwrightClient.browserType(pageId, ref, text, submit, slowly, waitForTimeout);
    return formatResponse(result);
  }
);

// 悬停元素
server.registerTool(
  "browserHover",
  {
    description: "悬停在页面元素上",
    inputSchema: {
      pageId: z.string().describe("页面ID"),
      ref: z.string().describe("元素的xp引用值"),
      waitForTimeout: z.number().optional().describe("操作后等待获取快照的延迟时间（毫秒，默认2000）")
    }
  },
  async ({ pageId, ref, waitForTimeout }) => {
    const result = await playwrightClient.browserHover(pageId, ref, waitForTimeout);
    return formatResponse(result);
  }
);

// 选择下拉选项
server.registerTool(
  "browserSelectOption",
  {
    description: "在下拉框中选择选项",
    inputSchema: {
      pageId: z.string().describe("页面ID"),
      ref: z.string().describe("元素的xp引用值"),
      values: z.array(z.string()).describe("要选择的选项值数组"),
      waitForTimeout: z.number().optional().describe("操作后等待获取快照的延迟时间（毫秒，默认2000）")
    }
  },
  async ({ pageId, ref, values, waitForTimeout }) => {
    const result = await playwrightClient.browserSelectOption(pageId, ref, values, waitForTimeout);
    return formatResponse(result);
  }
);

// 按键操作
server.registerTool(
  "browserPressKey",
  {
    description: "按键盘按键",
    inputSchema: {
      pageId: z.string().describe("页面ID"),
      key: z.string().describe("按键名称，如 'Enter', 'Tab', 'ArrowDown' 等"),
      ref: z.string().optional().describe("可选：元素的xp引用值，如果指定则在该元素上按键"),
      waitForTimeout: z.number().optional().describe("操作后等待获取快照的延迟时间（毫秒，默认2000）")
    }
  },
  async ({ pageId, key, ref, waitForTimeout }) => {
    const result = await playwrightClient.browserPressKey(pageId, key, ref, waitForTimeout);
    return formatResponse(result);
  }
);

// 文件上传
server.registerTool(
  "browserFileUpload",
  {
    description: "上传文件到指定元素",
    inputSchema: {
      pageId: z.string().describe("页面ID"),
      ref: z.string().describe("文件输入元素的xp引用值"),
      paths: z.array(z.string()).describe("要上传的文件路径数组"),
      waitForTimeout: z.number().optional().describe("操作后等待获取快照的延迟时间（毫秒，默认2000）")
    }
  },
  async ({ pageId, ref, paths, waitForTimeout }) => {
    const result = await playwrightClient.browserFileUpload(pageId, ref, paths, waitForTimeout);
    return formatResponse(result);
  }
);

// 处理对话框
server.registerTool(
  "browserHandleDialog",
  {
    description: "处理浏览器对话框",
    inputSchema: {
      pageId: z.string().describe("页面ID"),
      accept: z.boolean().describe("是否接受对话框"),
      promptText: z.string().optional().describe("提示对话框的回答文本"),
      waitForTimeout: z.number().optional().describe("操作后等待获取快照的延迟时间（毫秒，默认2000）")
    }
  },
  async ({ pageId, accept, promptText, waitForTimeout }) => {
    const result = await playwrightClient.browserHandleDialog(pageId, accept, promptText, waitForTimeout);
    return formatResponse(result);
  }
);

// 导航到URL
server.registerTool(
  "browserNavigate",
  {
    description: "导航到指定URL",
    inputSchema: {
      pageId: z.string().describe("页面ID"),
      url: z.string().describe("要导航的URL"),
      waitForTimeout: z.number().optional().describe("操作后等待获取快照的延迟时间（毫秒，默认2000）")
    }
  },
  async ({ pageId, url, waitForTimeout }) => {
    const result = await playwrightClient.browserNavigate(pageId, url, waitForTimeout);
    return formatResponse(result);
  }
);

// 返回上一页
server.registerTool(
  "browserNavigateBack",
  {
    description: "返回到上一页",
    inputSchema: {
      pageId: z.string().describe("页面ID"),
      waitForTimeout: z.number().optional().describe("操作后等待获取快照的延迟时间（毫秒，默认2000）")
    }
  },
  async ({ pageId, waitForTimeout }) => {
    const result = await playwrightClient.browserNavigateBack(pageId, waitForTimeout);
    return formatResponse(result);
  }
);

// 前进到下一页
server.registerTool(
  "browserNavigateForward",
  {
    description: "前进到下一页",
    inputSchema: {
      pageId: z.string().describe("页面ID"),
      waitForTimeout: z.number().optional().describe("操作后等待获取快照的延迟时间（毫秒，默认2000）")
    }
  },
  async ({ pageId, waitForTimeout }) => {
    const result = await playwrightClient.browserNavigateForward(pageId, waitForTimeout);
    return formatResponse(result);
  }
);

// 滚动到底部
server.registerTool(
  "scrollToBottom",
  {
    description: "滚动到页面或元素底部",
    inputSchema: {
      pageId: z.string().describe("页面ID"),
      selector: z.string().optional().describe("元素的xp引用值，如果不提供则滚动页面到底部"),
      waitForTimeout: z.number().optional().describe("操作后等待获取快照的延迟时间（毫秒，默认2000）")
    }
  },
  async ({ pageId, selector, waitForTimeout }) => {
    const result = await playwrightClient.scrollToBottom(pageId, selector, waitForTimeout);
    return formatResponse(result);
  }
);

// 滚动到顶部
server.registerTool(
  "scrollToTop",
  {
    description: "滚动到页面或元素顶部",
    inputSchema: {
      pageId: z.string().describe("页面ID"),
      selector: z.string().optional().describe("元素的xp引用值，如果不提供则滚动页面到顶部"),
      waitForTimeout: z.number().optional().describe("操作后等待获取快照的延迟时间（毫秒，默认2000）")
    }
  },
  async ({ pageId, selector, waitForTimeout }) => {
    const result = await playwrightClient.scrollToTop(pageId, selector, waitForTimeout);
    return formatResponse(result);
  }
);

// 等待超时
server.registerTool(
  "waitForTimeout",
  {
    description: "等待指定毫秒数",
    inputSchema: {
      pageId: z.string().describe("页面ID"),
      ms: z.number().describe("等待的毫秒数")
    }
  },
  async ({ pageId, ms }) => {
    const result = await playwrightClient.waitForTimeout(pageId, ms);
    return formatResponse(result);
  }
);

// 等待选择器
server.registerTool(
  "waitForSelector",
  {
    description: "等待指定选择器的元素出现",
    inputSchema: {
      pageId: z.string().describe("页面ID"),
      selector: z.string().describe("CSS选择器或xp引用值"),
      timeout: z.number().optional().describe("超时时间（毫秒，默认30000）"),
      state: z.enum(['attached', 'detached', 'visible', 'hidden']).optional().describe("等待的状态（默认visible）")
    }
  },
  async ({ pageId, selector, timeout, state }) => {
    const options: any = {};
    if (timeout !== undefined) options.timeout = timeout;
    if (state !== undefined) options.state = state;
    
    const result = await playwrightClient.waitForSelector(pageId, selector, options);
    return formatResponse(result);
  }
);

// 提取数据
// server.registerTool(
//   "extractData",
//   {
//     description: "使用cheerio函数从页面提取结构化数据，传入 snapshot 的 cheerio 元素",
//     inputSchema: {
//       pageId: z.string().describe("页面ID"),
//       extractorFunction: z.string().describe("cheerio函数字符串，格式: ($) => { return {...}; }")
//     }
//   },
//   async ({ pageId, extractorFunction }) => {
//     const result = await playwrightClient.extractData(pageId, extractorFunction);
//     return {
//       content: [{
//         type: "text",
//         text: JSON.stringify(result, null, 2)
//       }]
//     };
//   }
// );

// 获取元素HTML结构
server.registerTool(
  "getElementHTML",
  {
    description: "通过xp引用获取元素的outerHTML结构，用于调试选择器",
    inputSchema: {
      pageId: z.string().describe("页面ID"),
      ref: z.string().describe("元素的xp引用值")
    }
  },
  async ({ pageId, ref }) => {
    const result = await playwrightClient.getElementHTML(pageId, ref);
    return {
      content: [{
        type: "text",
        text: JSON.stringify(result, null, 2)
      }]
    };
  }
);

// 执行页面脚本
// server.registerTool(
//   "executePage",
//   {
//     description: "在页面上执行JavaScript脚本",
//     inputSchema: {
//       pageId: z.string().describe("页面ID"),
//       script: z.string().describe("要执行的JavaScript函数字符串，格式: async (page) => { ... }")
//     }
//   },
//   async ({ pageId, script }) => {
//     const result = await playwrightClient.executePage(pageId, script);
//     return {
//       content: [{
//         type: "text",
//         text: JSON.stringify(result, null, 2)
//       }]
//     };
//   }
// );

// ==================== 快照工具 ====================


// 获取截图
server.registerTool(
  "getScreenshot",
  {
    description: "获取页面截图并保存到临时目录，返回文件路径",
    inputSchema: {
      pageId: z.string().describe("页面ID"),
      fullPage: z.boolean().optional().describe("全页面截图（默认true）"),
      type: z.enum(['png', 'jpeg']).optional().describe("图片格式（默认png）"),
      quality: z.number().optional().describe("JPEG质量（默认80）"),
      element: z.string().optional().describe("元素选择器（截取特定元素）"),
      clip: z.object({
        x: z.number(),
        y: z.number(),
        width: z.number(),
        height: z.number()
      }).optional().describe("截图区域")
    }
  },
  async ({ pageId, fullPage, type, quality, element, clip }) => {
    const options = { fullPage, type, quality, element, clip };
    const result = await playwrightClient.getScreenshot(pageId, options);
    return {
      content: [{
        type: "text",
        text: JSON.stringify(result, null, 2)
      }]
    };
  }
);

// 获取PDF快照
server.registerTool(
  "getPDFSnapshot",
  {
    description: "获取页面的PDF快照",
    inputSchema: {
      pageId: z.string().describe("页面ID"),
      format: z.string().optional().describe("PDF格式（默认A4）"),
      landscape: z.boolean().optional().describe("横向模式（默认false）"),
      printBackground: z.boolean().optional().describe("打印背景（默认true）")
    }
  },
  async ({ pageId, format, landscape, printBackground }) => {
    const options = { format, landscape, printBackground };
    const result = await playwrightClient.getPDFSnapshot(pageId, options);
    return {
      content: [{
        type: "text",
        text: JSON.stringify(result, null, 2)
      }]
    };
  }
);

// 获取页面语义化快照
server.registerTool(
  "getPageSnapshot",
  {
    description: "获取页面的语义化简化快照，返回清晰的缩进结构",
    inputSchema: {
      pageId: z.string().describe("页面ID")
    }
  },
  async ({ pageId }) => {
    const result = await playwrightClient.getPageSnapshot(pageId);
    return {
      content: [{
        type: "text",
        text: result
      }]
    };
  }
);

// ==================== 图片下载工具 ====================

// 下载图片
server.registerTool(
  "downloadImage",
  {
    description: "下载图片到本地临时目录，返回本地文件路径",
    inputSchema: {
      url: z.string().describe("图片URL")
    }
  },
  async ({ url }) => {
    const result = await playwrightClient.downloadImage(url);
    return {
      content: [{
        type: "text",
        text: JSON.stringify(result, null, 2)
      }]
    };
  }
);

// ==================== 快照捕获工具 ====================

// 捕获页面快照
server.registerTool(
  "captureSnapshot",
  {
    description: "捕获网页的完整快照，支持滚动、等待和自动修剪功能",
    inputSchema: {
      url: z.string().describe("要捕获的网页URL"),
      wait: z.number().optional().describe("初始等待时间（毫秒，默认5000）"),
      scrolls: z.number().optional().describe("滚动次数（默认1）"),
      scrollDelay: z.number().optional().describe("滚动间隔时间（毫秒，默认5000）"),
      trim: z.boolean().optional().describe("是否修剪重复内容（默认true）"),
      pageName: z.string().optional().describe("页面名称（默认'snapshot'）"),
      pageDescription: z.string().optional().describe("页面描述（默认'Auto snapshot page'）")
    }
  },
  async ({ url, wait, scrolls, scrollDelay, trim, pageName, pageDescription }) => {
    const result = await playwrightClient.captureSnapshot({
      url,
      wait,
      scrolls,
      scrollDelay,
      trim,
      pageName,
      pageDescription
    });
    
    // 捕获完成后关闭页面
    await playwrightClient.closePage(result.pageId);
    
    return {
      content: [{
        type: "text",
        text: JSON.stringify({ 
          pageId: result.pageId,
          snapshotFiles: result.snapshotFiles 
        }, null, 2)
      }]
    };
  }
);

// Start receiving messages on stdin and sending messages on stdout
const main = async () => {
  const transport = new StdioServerTransport();
  await server.connect(transport);
};

main();