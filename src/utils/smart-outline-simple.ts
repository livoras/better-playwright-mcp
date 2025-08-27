/**
 * 简单的智能大纲生成器 - 专注于列表检测
 */

import { ListDetector, type ListPattern } from './list-detector.js';
import { UselessWrapperRemover } from './remove-useless-wrappers.js';
import type { ElementNode } from '../types/outline.js';

export class SmartOutlineSimple {
  private listDetector = new ListDetector();
  private wrapperRemover = new UselessWrapperRemover();
  private readonly TEXT_TRUNCATE_LENGTH = 50;
  private readonly MAX_REFS_IN_SUMMARY = 5;
  
  /**
   * 生成大纲
   */
  generate(snapshot: string): string {
    const lines = snapshot.split('\n');
    let rootNodes = this.buildTree(lines);
    
    // 先删除无意义的generic嵌套
    rootNodes = this.wrapperRemover.removeWrappers(rootNodes);
    
    // 再进行列表检测和折叠
    const outlineLines = this.processWithListDetection(rootNodes);
    
    return `Page Outline (${outlineLines.length}/${lines.length} lines):\n` + outlineLines.join('\n');
  }
  
  /**
   * 解析单行
   */
  private parseLine(line: string, lineNumber: number): ElementNode | null {
    const indent = line.length - line.trimStart().length;
    const elementMatch = line.match(/^\s*-\s*([a-z]+)(.*)$/);
    
    if (!elementMatch) return null;
    
    const type = elementMatch[1];
    const rest = elementMatch[2];
    
    const refMatch = rest.match(/\[ref=([^\]]+)\]/);
    const ref = refMatch ? refMatch[1] : '';
    
    let content = rest;
    if (refMatch) {
      content = rest.substring(0, refMatch.index).trim();
    }
    
    const hasInteraction = line.includes('[cursor=pointer]');
    
    return {
      indent,
      type,
      ref,
      content,
      line,
      children: [],
      priority: 5,
      isRepetitive: false,
      lineNumber,
      hasInteraction
    };
  }
  
  /**
   * 构建树结构
   */
  private buildTree(lines: string[]): ElementNode[] {
    const rootNodes: ElementNode[] = [];
    const stack: ElementNode[] = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;
      
      const node = this.parseLine(line, i);
      if (!node) continue;
      
      while (stack.length > 0 && stack[stack.length - 1].indent >= node.indent) {
        stack.pop();
      }
      
      if (stack.length > 0) {
        const parent = stack[stack.length - 1];
        parent.children.push(node);
        node.parent = parent;
      } else {
        rootNodes.push(node);
      }
      
      stack.push(node);
    }
    
    return rootNodes;
  }
  
  /**
   * 递归处理节点，检测列表
   */
  private processWithListDetection(nodes: ElementNode[]): string[] {
    const output: string[] = [];
    
    // 首先检查这些同级节点是否构成列表
    if (nodes.length >= 3) {
      const lists = this.listDetector.detectLists(nodes);
      
      if (lists.length > 0) {
        // 处理检测到的列表
        for (const list of lists) {
          const listLines = this.formatList(list);
          output.push(...listLines);
          
          // 递归处理样本元素的子节点
          if (list.sample.children.length > 0) {
            const childLines = this.processWithListDetection(
              list.sample.children
            );
            output.push(...childLines);
          }
        }
        
        // 处理不在列表中的节点
        const listItems = new Set(lists.flatMap(l => l.items));
        const nonListNodes = nodes.filter(n => !listItems.has(n));
        
        for (const node of nonListNodes) {
          output.push(this.formatNode(node));
          
          if (node.children.length > 0) {
            const childLines = this.processWithListDetection(
              node.children
            );
            output.push(...childLines);
          }
        }
        
        return output;
      }
    }
    
    // 没有检测到列表，正常处理每个节点
    for (const node of nodes) {
      output.push(this.formatNode(node));
      
      // 递归处理子节点
      if (node.children.length > 0) {
        const childLines = this.processWithListDetection(
          node.children
        );
        output.push(...childLines);
      }
    }
    
    return output;
  }
  
  /**
   * 格式化列表
   */
  private formatList(list: ListPattern): string[] {
    const output: string[] = [];
    const indent = ' '.repeat(list.sample.indent);
    
    // 输出样本元素
    output.push(this.formatNode(list.sample));
    
    // 输出折叠行
    if (list.count > 1) {
      const remaining = list.count - 1;
      const refs = list.refs.slice(1, Math.min(this.MAX_REFS_IN_SUMMARY + 1, list.refs.length));
      
      let foldLine = `${indent}- ${list.sample.type}`;
      foldLine += ` (... and ${remaining} more similar)`;
      
      if (refs.length > 0) {
        foldLine += ` [refs: ${refs.join(', ')}`;
        if (list.refs.length > this.MAX_REFS_IN_SUMMARY + 1) {
          foldLine += ', ...';
        }
        foldLine += ']';
      }
      
      output.push(foldLine);
    }
    
    return output;
  }
  
  /**
   * 格式化节点
   */
  private formatNode(node: ElementNode): string {
    const indent = ' '.repeat(node.indent);
    let result = `${indent}- ${node.type}`;
    
    // 截断长内容
    if (node.content) {
      let content = node.content;
      if (content.length > this.TEXT_TRUNCATE_LENGTH) {
        content = content.substring(0, this.TEXT_TRUNCATE_LENGTH) + '...';
      }
      result += ` ${content}`;
    }
    
    // 添加ref
    if (node.ref) {
      result += ` [ref=${node.ref}]`;
    }
    
    // 添加交互标记
    if (node.hasInteraction) {
      result += ' [cursor=pointer]';
    }
    
    return result;
  }
}