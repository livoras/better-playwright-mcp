// 实用工具函数

/**
 * 检查并解包元素
 */
export function checkAndUnwrap(_element: any): boolean {
  // 简单实现
  return false;
}

/**
 * 美化 HTML
 */
export function prettyHtml(html: string): string {
  return html;
}

/**
 * 预处理移除 HTML
 */
export function preRemoveHtml(_element: any): void {
  // 简单实现
}

/**
 * 移除无用属性
 */
export function removeUselessAttributes(element: any): void {
  if (!element || !element.attribs) return;
  
  const uselessAttrs = ['class', 'style', 'id', 'data-'];
  const attrs = element.attribs;
  
  for (const attr of Object.keys(attrs)) {
    if (uselessAttrs.some(u => attr.startsWith(u))) {
      delete attrs[attr];
    }
  }
}

/**
 * 检查是否为有意义的元素
 */
export function isMeaningfulElement(element: any): boolean {
  if (!element || !element.name) return false;
  
  const meaningfulTags = ['img', 'a', 'input', 'textarea', 'button', 'select'];
  return meaningfulTags.includes(element.name);
}

/**
 * 检查是否为语义化元素
 */
export function isSemanticElement(element: any): boolean {
  if (!element || !element.name) return false;
  
  const semanticTags = [
    'article', 'section', 'nav', 'header', 'footer', 'main', 'aside',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'form', 'label', 'fieldset', 'legend',
    'table', 'thead', 'tbody', 'tr', 'td', 'th',
    'ul', 'ol', 'li', 'dl', 'dt', 'dd',
    'figure', 'figcaption', 'blockquote', 'cite', 'code', 'pre',
    'em', 'strong', 'mark', 'time', 'address'
  ];
  
  return semanticTags.includes(element.name);
}

/**
 * 从 XPath 生成哈希
 */
export function generateHashFromXPath(xpath: string): string {
  let hash = 0;
  for (let i = 0; i < xpath.length; i++) {
    const char = xpath.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  const result = Math.abs(hash).toString(16);
  return result.substring(0, 8).padStart(8, '0');
}

/**
 * 生成 XPath
 */
export function generateXPath(element: any, $: any): string {
  const parts: string[] = [];
  let current = element;
  
  while (current && current.name && current.name !== 'html') {
    const tagName = current.name;
    let index = 1;
    
    if (current.parent) {
      const siblings = $(current.parent).children(tagName).get();
      if (siblings.length > 1) {
        index = siblings.indexOf(current) + 1;
      }
    }
    
    const siblingCount = current.parent ? $(current.parent).children(tagName).length : 1;
    parts.unshift(siblingCount > 1 ? `${tagName}[${index}]` : tagName);
    current = current.parent;
  }
  
  return '/' + parts.join('/');
}