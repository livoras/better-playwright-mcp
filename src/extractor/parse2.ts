import * as fs from 'fs';
import { checkAndUnwrap, prettyHtml, preRemoveHtml, removeUselessAttributes, isMeaningfulElement, isSemanticElement, generateHashFromXPath, generateXPath } from './utils';

/**
 * 递归处理元素及其所有子元素，删除无用属性
 * @param element 要处理的元素
 */
function processElementAndChildren(element: any): void {
  // 处理当前元素
  removeUselessAttributes(element);
  
  // 递归处理所有子元素
  if (element.children && element.children.length > 0) {
    for (const child of element.children) {
      if (child.type === 'tag') {
        processElementAndChildren(child);
      }
    }
  }
}

/**
 * 核心算法函数 - 纯函数，不生成文件
 * 处理步骤：
 * 1. preRemoveHtml - 删除无用标签和注释
 * 2. checkAndUnwrap - 展开无用包装元素并删除空元素
 * 3. 生成XPath映射并添加xp属性（可选）
 * 4. removeUselessAttributes - 删除无用属性
 * 5. prettyHtml - 格式化输出
 * @param htmlContent HTML内容字符串
 * @param options 选项对象
 * @returns 包含处理后的HTML和XPath映射的对象
 */
export async function parseHtml(htmlContent: string): Promise<{
  extractedHtml: string;
  mappings: Record<string, string>;
}> {
  // 使用 cheerio 解析 HTML，和 parse.ts 保持一致
  const cheerio = await import('cheerio');
  const $ = cheerio.load(htmlContent);
  
  // 1. 生成XPath映射并添加xp属性（在清理之前进行，基于原始DOM）
  const xpathMapping: Record<string, string> = {};
  
  // 遍历所有元素，为有价值的元素生成XPath映射（使用utils中的函数）
  $('*').each(function() {
    const element = $(this);
    const domElement = element[0]; // 转换为原生DOM元素用于utils函数
    
    // 使用utils中的函数判断是否需要XPath
    const isSemantic = isSemanticElement(domElement);
    const isMeaningful = isMeaningfulElement(domElement);
    const hasText = element.contents().filter(function() {
      return this.type === 'text' && $(this).text().trim() !== '';
    }).length > 0;
    
    if (isSemantic || isMeaningful || hasText) {
      const xpath = generateXPath($, element);
      const hashValue = generateHashFromXPath(xpath);
      
      // 保存映射关系
      xpathMapping[hashValue] = xpath;
      
      // 给元素添加XP属性
      element.attr('xp', hashValue);
    }
  });
  
  // 2. 转换为原生DOM进行后续处理
  const rootElement = $('body')[0] || $.root().children()[0];
  
  if (!rootElement) {
    throw new Error('无法找到有效的根元素进行处理');
  }
  
  // 3. 预处理：删除无用标签、注释和不可见元素（带iv属性）
  preRemoveHtml(rootElement);
  
  // 4. 展开无用包装元素并删除空元素
  checkAndUnwrap(rootElement);
  
  // 5. 删除无用属性
  processElementAndChildren(rootElement);
  
  // 6. 格式化输出
  const formattedHtml = prettyHtml($.html(rootElement));
  
  return {
    extractedHtml: formattedHtml,
    mappings: xpathMapping
  };
}

/**
 * 处理已经包含 xp 属性的 HTML（从 playwright-server 调用）
 * 只进行清理和格式化，不生成新的 XPath
 */
export async function cleanHtmlWithXp(htmlContent: string): Promise<string> {
  const cheerio = await import('cheerio');
  const $ = cheerio.load(htmlContent);
  
  const rootElement = $('body')[0] || $.root().children()[0];
  
  if (!rootElement) {
    throw new Error('无法找到有效的根元素进行处理');
  }
  
  // 1. 预处理：删除无用标签、注释和不可见元素（带iv属性）
  preRemoveHtml(rootElement);
  
  // 2. 展开无用包装元素并删除空元素
  checkAndUnwrap(rootElement);
  
  // 3. 删除无用属性
  processElementAndChildren(rootElement);
  
  // 4. 格式化输出
  return prettyHtml($.html(rootElement));
}

// CLI包装函数 - 处理文件I/O
export async function parseHtmlCli(inputFile?: string, outputFile?: string): Promise<void> {
  const input = inputFile || 'x.html';
  const output = outputFile || input.replace(/\.html$/, '-parsed2.html');
  
  console.log(`📖 读取 ${input} 文件...`);
  const htmlContent = fs.readFileSync(input, 'utf8');
  console.log(`原始文件大小: ${htmlContent.length} 字符`);

  console.log('🔍 生成XPath路径...');
  console.log('🔧 开始清理无意义嵌套（v2算法）...');
  
  const result = await parseHtml(htmlContent);
  
  const reduction = Math.round((1 - result.extractedHtml.length / htmlContent.length) * 100);
  
  console.log(`🎯 总共删除了冗余包装`);
  console.log('🎨 格式化 HTML...');
  console.log(`\n📊 结果统计:`);
  console.log(`原始文件: ${htmlContent.length} 字符`);
  console.log(`清理后: ${result.extractedHtml.length} 字符`);
  console.log(`减少: ${reduction}%`);

  fs.writeFileSync(output, result.extractedHtml, 'utf8');
  console.log(`💾 已保存到 ${output}`);
  
  // 保存XPath映射文件
  const mappingFile = output.replace(/\.html$/, '-mapping.json');
  const mappingJson = JSON.stringify(result.mappings, null, 2);
  fs.writeFileSync(mappingFile, mappingJson, 'utf8');
  console.log(`🗂️  已保存XPath映射到 ${mappingFile}`);
  console.log(`📍 共生成 ${Object.keys(result.mappings).length} 个元素映射`);
}

/**
 * 处理指定的 x.html 文件，输出到 x-parsed2.html
 * @param filename 文件名前缀 (如 'x' 将处理 x.html 输出到 x-parsed2.html)
 */
export async function processFile(filename: string): Promise<void> {
  const inputFile = `${filename}.html`;
  const outputFile = `${filename}-parsed2.html`;
  
  await parseHtmlCli(inputFile, outputFile);
}

// 命令行执行支持
if (process.argv[1]?.includes('parse2.ts') || process.argv[1]?.includes('parse2.js')) {
  (async () => {
    const inputFile = process.argv[2];
    const outputFile = process.argv[3];
    await parseHtmlCli(inputFile, outputFile);
  })();
}