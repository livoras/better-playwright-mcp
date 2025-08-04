import * as cheerio from 'cheerio';
import * as fs from 'fs';

// 核心算法函数 - 纯函数，不生成文件
function simplifyHtml(htmlContent: string): string {

  const $ = cheerio.load(htmlContent);
  
  // 递归处理元素，生成缩进表示
  function processElement(element: cheerio.Cheerio<any>, depth: number = 0): string[] {
    const lines: string[] = [];
    const indent = '\t'.repeat(depth);
    
    element.each(function() {
      const $el = $(this);
      const tagName = this.name;
      
      if (!tagName) return; // 跳过文本节点等
      
      // 收集属性
      const attributes: string[] = [];
      const attribs = this.attribs || {};
      
      // 判断属性值是否需要引号
      function needsQuotes(value: string): boolean {
        // 如果包含空格、特殊字符或为空，则需要引号
        return /[\s"'<>=]|^$/.test(value);
      }
      
      Object.keys(attribs).forEach(attr => {
        const value = attribs[attr];
        if (attr === 'xp') {
          // xp属性放在前面，xp值通常是简单的hash，不需要引号
          const formatted = needsQuotes(value) ? `xp="${value}"` : `xp=${value}`;
          attributes.unshift(formatted);
        } else if (attr === 'type' && value === 'button' && tagName === 'button') {
          // button元素的type="button"是默认值，不显示
          return;
        } else if (attr === 'src' && tagName === 'img' && value.startsWith('data:image')) {
          // 处理 img 标签的 data:image，简化显示
          const mimeMatch = value.match(/^data:image\/([^;]+)/);
          const mimeType = mimeMatch ? mimeMatch[1] : 'xxx';
          attributes.push(`src="data:image/${mimeType} <too long to display>"`);
        } else if (value) {
          // 根据值的内容决定是否加引号
          const formatted = needsQuotes(value) ? `${attr}="${value}"` : `${attr}=${value}`;
          attributes.push(formatted);
        }
      });
      
      // 获取直接文本内容（不包含子元素的文本）
      const directText = $el.contents()
        .filter(function() { return this.type === 'text'; })
        .text()
        .trim()
        .replace(/\n/g, '\\n')  // 将换行符转换为 \n 字符串
        .replace(/\s+/g, ' ');  // 将多个空白字符合并为单个空格
      
      // 构建标签行
      let tagLine = `${indent}${tagName}`;
      if (attributes.length > 0) {
        tagLine += ` ${attributes.join(' ')}`;
      }
      if (directText) {
        tagLine += ` ${directText}`;
      }
      
      lines.push(tagLine);
      
      // 处理子元素
      const children = $el.children();
      if (children.length > 0) {
        const childLines = processElement(children, depth + 1);
        lines.push(...childLines);
      }
    });
    
    return lines;
  }
  
  // 从body开始处理（跳过html和head）
  const bodyContent = $('body').children();
  const simplifiedLines = processElement(bodyContent, 0);
  
  // 生成最终内容
  const simplifiedContent = simplifiedLines.join('\n');
  
  return simplifiedContent;
}

// CLI包装函数 - 处理文件I/O
function simplifyHtmlCli(inputFile?: string, outputFile?: string) {
  const input = inputFile || 'x-parsed.html';
  const output = outputFile || input.replace(/\.html$/, '.simple');
  
  console.log(`📖 读取 ${input} 文件...`);
  const htmlContent = fs.readFileSync(input, 'utf8');
  console.log(`原始文件大小: ${htmlContent.length} 字符`);

  console.log('🔧 转换为缩进表示...');
  const simplifiedContent = simplifyHtml(htmlContent);
  
  const reduction = Math.round((1 - simplifiedContent.length / htmlContent.length) * 100);
  
  console.log(`\n📊 结果统计:`);
  console.log(`原始文件: ${htmlContent.length} 字符`);
  console.log(`简化后: ${simplifiedContent.length} 字符`);
  console.log(`减少: ${reduction}%`);

  fs.writeFileSync(output, simplifiedContent, 'utf8');
  console.log(`💾 已保存到 ${output}`);
}

// 命令行执行支持
if (process.argv[1]?.includes('simplify-html.ts') || process.argv[1]?.includes('simplify-html.js')) {
  const inputFile = process.argv[2];
  const outputFile = process.argv[3];
  simplifyHtmlCli(inputFile, outputFile);
}

export { simplifyHtml, simplifyHtmlCli };