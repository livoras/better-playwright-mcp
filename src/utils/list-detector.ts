/**
 * List Detection using SimHash
 * 识别DOM中的列表模式
 */

import { DOMSimHash } from './dom-simhash.js';
import type { ElementNode } from '../types/outline.js';

export interface ListPattern {
  type: 'semantic' | 'structural';  // 语义列表(listitem) vs 结构列表(相似元素)
  start: number;                    // 列表起始位置
  end: number;                      // 列表结束位置
  count: number;                    // 列表项数量
  sample: ElementNode;              // 样本元素（用于展示）
  items: ElementNode[];             // 所有列表项
  refs: string[];                   // 所有ref
}

export class ListDetector {
  private simhash = new DOMSimHash();
  
  /**
   * 检测所有列表模式
   */
  detectLists(nodes: ElementNode[]): ListPattern[] {
    const lists: ListPattern[] = [];
    
    // 1. 优先检测语义列表（连续的listitem）
    const semanticLists = this.detectSemanticLists(nodes);
    lists.push(...semanticLists);
    
    // 2. 检测结构列表（相似的兄弟节点）
    const structuralLists = this.detectStructuralLists(nodes, semanticLists);
    lists.push(...structuralLists);
    
    // 3. 按位置排序
    lists.sort((a, b) => a.start - b.start);
    
    return lists;
  }
  
  /**
   * 检测语义列表 - 连续的listitem元素
   */
  private detectSemanticLists(nodes: ElementNode[]): ListPattern[] {
    const lists: ListPattern[] = [];
    let currentList: ElementNode[] = [];
    let startIdx = -1;
    
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      
      if (node.type === 'listitem') {
        if (currentList.length === 0) {
          startIdx = i;
        }
        currentList.push(node);
      } else {
        // 结束当前列表
        if (currentList.length >= 3) {
          // 检查这些listitem是否结构相似
          const similar = this.findStructurallySimilar(currentList);
          
          if (similar) {
            lists.push({
              type: 'semantic',
              start: startIdx + similar.start,
              end: startIdx + similar.end,
              count: similar.count,
              sample: similar.sample,
              items: similar.items,
              refs: similar.items.map(n => n.ref).filter(r => r)
            });
          } else {
            // 即使不相似，语义上仍是列表
            lists.push({
              type: 'semantic',
              start: startIdx,
              end: startIdx + currentList.length - 1,
              count: currentList.length,
              sample: currentList[0],
              items: currentList,
              refs: currentList.map(n => n.ref).filter(r => r)
            });
          }
        }
        currentList = [];
        startIdx = -1;
      }
    }
    
    // 处理最后的列表
    if (currentList.length >= 3) {
      const similar = this.findStructurallySimilar(currentList);
      if (similar) {
        lists.push({
          type: 'semantic',
          start: startIdx + similar.start,
          end: startIdx + similar.end,
          count: similar.count,
          sample: similar.sample,
          items: similar.items,
          refs: similar.items.map(n => n.ref).filter(r => r)
        });
      }
    }
    
    return lists;
  }
  
  /**
   * 检测结构列表 - 相似的兄弟节点
   */
  private detectStructuralLists(nodes: ElementNode[], semanticLists: ListPattern[]): ListPattern[] {
    const lists: ListPattern[] = [];
    const processed = new Set<number>();
    
    // 标记已处理的语义列表节点
    for (const list of semanticLists) {
      for (let i = list.start; i <= list.end; i++) {
        processed.add(i);
      }
    }
    
    // 按缩进分组
    const indentGroups = new Map<number, {node: ElementNode, index: number}[]>();
    
    for (let i = 0; i < nodes.length; i++) {
      if (processed.has(i)) continue;
      
      const node = nodes[i];
      const indent = node.indent;
      
      if (!indentGroups.has(indent)) {
        indentGroups.set(indent, []);
      }
      
      indentGroups.get(indent)!.push({node, index: i});
    }
    
    // 对每个缩进级别的节点查找相似序列
    for (const [indent, group] of indentGroups.entries()) {
      if (group.length < 3) continue;
      
      // 提取节点数组
      const groupNodes = group.map(g => g.node);
      const sequences = this.simhash.findAllSimilarSequences(groupNodes);
      
      for (const seq of sequences) {
        // 映射回原始索引
        const startIdx = group[seq.start].index;
        const endIdx = group[seq.end].index;
        const items = group.slice(seq.start, seq.end + 1).map(g => g.node);
        
        lists.push({
          type: 'structural',
          start: startIdx,
          end: endIdx,
          count: seq.count,
          sample: seq.sample,
          items: items,
          refs: items.map(n => n.ref).filter(r => r)
        });
      }
    }
    
    return lists;
  }
  
  /**
   * 查找结构相似的子序列
   */
  private findStructurallySimilar(nodes: ElementNode[]): {
    start: number;
    end: number;
    count: number;
    sample: ElementNode;
    items: ElementNode[];
  } | null {
    const seq = this.simhash.findSimilarSequence(nodes);
    
    if (!seq) return null;
    
    return {
      start: seq.start,
      end: seq.end,
      count: seq.end - seq.start + 1,
      sample: nodes[seq.start],
      items: seq.samples
    };
  }
  
  /**
   * 检测嵌套列表
   */
  detectNestedLists(node: ElementNode): ListPattern[] {
    const lists: ListPattern[] = [];
    
    // 检测直接子节点中的列表
    if (node.children.length >= 3) {
      const childLists = this.detectLists(node.children);
      lists.push(...childLists);
    }
    
    // 递归检测更深层的列表
    for (const child of node.children) {
      const nestedLists = this.detectNestedLists(child);
      lists.push(...nestedLists);
    }
    
    return lists;
  }
  
  /**
   * 判断节点是否属于某个列表
   */
  isPartOfList(node: ElementNode, lists: ListPattern[]): ListPattern | null {
    for (const list of lists) {
      if (list.items.includes(node)) {
        return list;
      }
    }
    return null;
  }
}