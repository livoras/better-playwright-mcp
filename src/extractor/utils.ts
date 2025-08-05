import * as cheerio from 'cheerio';
import * as crypto from 'crypto';
import type { Element, Node, Text } from 'domhandler';

// pretty 库的类型声明
interface PrettyOptions {
  indent_size?: number;
  wrap_line_length?: number;
  preserve_newlines?: boolean;
  unformatted?: string[];
}

// 导入 pretty 模块
import prettyImport from 'pretty';
const pretty = prettyImport as (html: string, options?: PrettyOptions) => string;

// 使用 cheerio/domhandler 的统一类型
type AnyNode = Node;

// 创建 cheerio 实例
export function to$(html: string): cheerio.CheerioAPI {
  return cheerio.load(html);
}

// 生成8位hash值
export function generateHashFromXPath(xpath: string): string {
  const hash = crypto.createHash('md5').update(xpath).digest('hex');
  return hash.substring(0, 8);
}

// 生成XPath路径 - 使用与parse.ts兼容的方式
export function generateXPath($: cheerio.CheerioAPI, element: cheerio.Cheerio<any>): string {
  const parts: string[] = [];
  let current = $(element);
  
  while (current.length > 0 && current.prop('tagName')) {
    const tagName = current.prop('tagName')?.toLowerCase();
    if (!tagName) break;
    
    let index = 1;
    const siblings = current.parent().children(tagName);
    if (siblings.length > 1) {
      index = siblings.index(current) + 1;
    }
    
    parts.unshift(siblings.length > 1 ? `${tagName}[${index}]` : tagName);
    current = current.parent();
  }
  
  return '/' + parts.join('/');
}

// 判断元素是否为有意义标签
export function isMeaningfulElement(element: AnyNode): boolean {
  if (element.type === 'text') {
    // 空文本或纯空白文本不算有意义
    const textData = (element as Text).data;
    return !!(textData && textData.trim().length > 0);
  }
  
  if (element.type === 'tag') {
    const tagElement = element as Element;
    const tagName = tagElement.name.toLowerCase();
    
    // 有意义标签：img、a、input、textarea、button
    if (['img', 'a', 'input', 'textarea', 'button'].includes(tagName)) {
      return true;
    }
    
    // contentEditable 元素
    if (tagElement.attribs && 'contenteditable' in tagElement.attribs) {
      const value = tagElement.attribs.contenteditable.trim().toLowerCase();
      if (value === 'true' || value === '') {
        return true;
      }
    }
    
    // 有 title 属性的元素
    if (tagElement.attribs && 'title' in tagElement.attribs) {
      const titleValue = tagElement.attribs.title.trim();
      if (titleValue.length > 0) {
        return true;
      }
    }
  }
  
  return false;
}

// 判断元素是否为语义化标签
export function isSemanticElement(element: AnyNode): boolean {
  if (element.type !== 'tag') {
    return false;
  }
  
  const tagElement = element as Element;
  const tagName = tagElement.name.toLowerCase();
  
  const semanticTags = [
    // 结构标签
    'article', 'section', 'nav', 'header', 'footer', 'main', 'aside',
    // 标题标签
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    // 表单标签
    'form', 'input', 'textarea', 'select', 'label', 'fieldset', 'legend',
    // 表格标签
    'table', 'thead', 'tbody', 'tr', 'td', 'th',
    // 列表标签
    'ul', 'ol', 'li', 'dl', 'dt', 'dd',
    // 内容标签
    'figure', 'figcaption', 'blockquote', 'cite', 'code', 'pre',
    // 文本语义
    'em', 'strong', 'mark', 'time', 'address'
  ];
  
  return semanticTags.includes(tagName);
}

// 判断元素是否包含有意义内容（递归检查）
export function isContainsMeaningfulElement(element: AnyNode): boolean {
  // 检查当前元素是否有意义
  if (isMeaningfulElement(element)) {
    return true;
  }
  
  // 递归检查子元素
  const elementNode = element as Element;
  if (elementNode.children && elementNode.children.length > 0) {
    for (const child of elementNode.children) {
      if (isContainsMeaningfulElement(child)) {
        return true;
      }
    }
  }
  
  return false;
}

// 判断元素是否有价值（有意义或语义化）
export function isValuableElement(element: AnyNode): boolean {
  return isMeaningfulElement(element) || isSemanticElement(element);
}

// 删除元素
export function deleteElement(element: AnyNode): void {
  const elementNode = element as Element;
  if (!elementNode.parent || !elementNode.parent.children) {
    return;
  }
  
  const parent = elementNode.parent;
  const elementIndex = parent.children.indexOf(elementNode as any);
  if (elementIndex !== -1) {
    parent.children.splice(elementIndex, 1);
  }
}

// 判断元素是否只有一个子标签元素（不包含文本内容）
export function isHasOnlyOneChild(element: AnyNode): boolean {
  const elementNode = element as Element;
  if (!elementNode.children) {
    return false;
  }
  
  // 只统计标签子元素，不统计文本内容
  // 这个函数的目的是检测"包装场景"：一个容器包装一个标签元素
  const tagChildren = elementNode.children.filter(child => {
    return child.type === 'tag'; // 只计算标签元素
  });
  
  return tagChildren.length === 1;
}

// 获取需要在预处理阶段删除的元素列表
export function getPreRemoveElements(element: AnyNode): AnyNode[] {
  const elementsToRemove: AnyNode[] = [];
  const elementNode = element as Element;
  
  if (!elementNode.children) {
    return elementsToRemove;
  }
  
  // 无用标签列表（基于 HTML 清理算法 v2 文档）
  const uselessTags = new Set(['script', 'style', 'noscript', 'svg']);
  
  // 遍历所有子节点
  for (const child of elementNode.children) {
    // 识别注释节点
    if (child.type === 'comment') {
      elementsToRemove.push(child);
      continue;
    }
    
    // 识别无用标签及其所有内容
    // 注意：cheerio中某些标签有特殊的type值，如script的type是'script'，style的type是'style'
    const childElement = child as Element;
    if ((child.type === 'tag' && uselessTags.has(childElement.name.toLowerCase())) ||
        uselessTags.has(child.type as string)) {
      elementsToRemove.push(child);
      continue;
    }
    
    // 删除带 iv（invisible）属性的元素
    if (child.type === 'tag') {
      const hasIv = childElement.attribs && 'iv' in childElement.attribs;
      if (hasIv) {
        elementsToRemove.push(child);
        continue;
      }
    }
    
    // 递归处理子元素
    if (child.type === 'tag') {
      const childElementsToRemove = getPreRemoveElements(child);
      elementsToRemove.push(...childElementsToRemove);
    }
  }
  
  return elementsToRemove;
}

// 预处理清理：删除无用标签和注释节点
export function preRemoveHtml(element: AnyNode): void {
  const elementNode = element as Element;
  if (!elementNode.children) {
    return;
  }
  
  // 获取需要删除的元素列表
  const elementsToRemove = getPreRemoveElements(element);
  
  // 删除这些元素
  elementsToRemove.forEach(elementToRemove => {
    const elementToRemoveNode = elementToRemove as Element;
    const parent = elementToRemoveNode.parent;
    if (parent && parent.children) {
      const index = parent.children.indexOf(elementToRemoveNode as any);
      if (index !== -1) {
        parent.children.splice(index, 1);
      }
    }
  });
}

// 智能展开元素：基于父子价值判断决定如何处理
export function unwrapElement(element: AnyNode): AnyNode[] {
  const unwrappedChildren: AnyNode[] = [];
  const elementNode = element as Element;
  
  // 边界情况检查
  if (!elementNode.parent || !elementNode.parent.children) {
    return unwrappedChildren; // 没有父元素，无法展开
  }
  
  if (!elementNode.children || elementNode.children.length === 0) {
    // 没有子元素，直接删除目标元素
    const parent = elementNode.parent;
    const elementIndex = parent.children.indexOf(elementNode as any);
    if (elementIndex !== -1) {
      parent.children.splice(elementIndex, 1);
    }
    return unwrappedChildren;
  }
  
  // 获取唯一的标签子元素
  const tagChildren = elementNode.children.filter(child => child.type === 'tag');
  if (tagChildren.length !== 1) {
    return unwrappedChildren; // 不是单子元素场景，不处理
  }
  
  const parent = elementNode.parent;
  const child = tagChildren[0];
  const elementIndex = parent.children.indexOf(elementNode as any);
  
  if (elementIndex === -1) {
    return unwrappedChildren; // 元素不在父元素的子元素列表中
  }
  
  // 判断父子价值
  const parentValuable = isValuableElement(element);
  const childValuable = isValuableElement(child);
  
  if (parentValuable && childValuable) {
    // 情况1: 父子都有价值，不处理，直接返回
    return unwrappedChildren;
  } else if (parentValuable && !childValuable) {
    // 情况2: 父有价值，子无价值，保留父，删除子（将子的内容提升到父中）
    const childElement = child as Element;
    if (childElement.children && childElement.children.length > 0) {
      // 将子元素的内容移动到父元素中
      const childContent = [...childElement.children];
      childContent.forEach(grandChild => {
        const grandChildElement = grandChild as Element;
        grandChildElement.parent = elementNode;
      });
      
      // 替换子元素为其内容
      const childIndex = elementNode.children.indexOf(child);
      if (childIndex !== -1) {
        elementNode.children.splice(childIndex, 1, ...childContent);
      }
    } else {
      // 子元素没有内容，直接删除
      const childIndex = elementNode.children.indexOf(child);
      if (childIndex !== -1) {
        elementNode.children.splice(childIndex, 1);
      }
    }
    
    return unwrappedChildren;
  } else {
    // 情况3和4: 父无价值（子有价值或子无价值），保留子，删除父
    // 将子元素提升到父元素的位置
    const childElement = child as Element;
    childElement.parent = parent;
    parent.children.splice(elementIndex, 1, child);
    unwrappedChildren.push(child);
    
    return unwrappedChildren;
  }
}

// 判断元素是否为空（没有实际内容）
export function isEmptyElement(element: AnyNode): boolean {
  // 有意义的元素不算空（如 img, input 等自闭合标签）
  if (isMeaningfulElement(element)) {
    return false;
  }
  
  // // 语义化元素不算空
  // if (isSemanticElement(element)) {
  //   return false;
  // }
  
  const elementNode = element as Element;
  if (!elementNode.children || elementNode.children.length === 0) {
    return true;
  }
  
  // 检查所有子元素是否都是空白文本或注释
  for (const child of elementNode.children) {
    if (child.type === 'tag') {
      return false; // 有标签子元素，不算空
    }
    if (child.type === 'text') {
      const textNode = child as Text;
      if (textNode.data && textNode.data.trim().length > 0) {
        return false; // 有非空文本内容，不算空
      }
    }
    // 注释节点不影响空判断
  }
  
  return true; // 只有空白文本和注释，算作空元素
}

// 智能检查并展开无用包装元素（递归处理）
export function checkAndUnwrap(element: AnyNode): void {
  const elementNode = element as Element;
  if (!elementNode.children) {
    return;
  }
  
  // 1. 先递归处理所有子元素（Bottom-Up策略）
  // 注意：由于unwrapElement会修改children数组，我们需要复制数组
  const childrenToProcess = [...elementNode.children];
  
  for (const child of childrenToProcess) {
    if (child.type === 'tag') {
      checkAndUnwrap(child);
    }
  }
  
  // 2. 子元素处理完后，检查当前元素的情况
  if (isEmptyElement(element)) {
    // 空元素直接删除
    deleteElement(element);
  } else if (isHasOnlyOneChild(element)) {
    // 单子元素才进入unwrap逻辑
    unwrapElement(element);
  }
}

// 格式化HTML输出，使用pretty库进行美化
export function prettyHtml(html: string): string {
  // 使用pretty库格式化，配置更好的缩进效果
  return pretty(html, { 
    indent_size: 2,
    wrap_line_length: 0,
    preserve_newlines: false,
    unformatted: []
  });
}

// 删除无用属性，只保留功能性重要属性
export function removeUselessAttributes(element: AnyNode): void {
  const elementNode = element as Element;
  if (elementNode.type !== 'tag' || !elementNode.attribs) {
    return;
  }
  
  // 保留的功能性重要属性列表（基于 HTML 清理算法 v2 文档）
  const keepAttributes = new Set([
    // 基础功能属性
    'href', 'src', 'alt', 'title', 'name',
    // 表单相关
    'contenteditable', 'checked', 'value', 'disabled', 'selected', 'readonly', 
    'placeholder', 'type', 'required', 'pattern', 'min', 'max', 'maxlength',
    'autofocus', 'multiple',
    // 无障碍访问
    'aria-label', 'aria-hidden', 'aria-expanded', 'aria-haspopup', 'role',
    // 显示控制
    'hidden',
    // XPath 定位属性（算法生成）
    'xp'
  ]);
  
  // 获取所有属性名
  const attributeNames = Object.keys(elementNode.attribs);
  
  // 删除不在保留列表中的属性
  attributeNames.forEach(attrName => {
    if (!keepAttributes.has(attrName)) {
      delete elementNode.attribs[attrName];
    }
  });

  // 删除冗余的role属性：当标签名和role内容相同时
  if (elementNode.attribs.role) {
    const tagName = elementNode.name?.toLowerCase();
    const role = elementNode.attribs.role.toLowerCase();
    
    // 如果标签名和role相同，删除role属性
    if (tagName === role) {
      delete elementNode.attribs.role;
    }
    
    // 特殊情况：button标签的role="button"
    if (tagName === 'button' && role === 'button') {
      delete elementNode.attribs.role;
    }
    
    // 特殊情况：a标签的role="link"
    if (tagName === 'a' && role === 'link') {
      delete elementNode.attribs.role;
    }
  }

  // 删除button的type="button"属性（这是默认值）
  if (elementNode.name?.toLowerCase() === 'button' && elementNode.attribs.type === 'button') {
    delete elementNode.attribs.type;
  }
}