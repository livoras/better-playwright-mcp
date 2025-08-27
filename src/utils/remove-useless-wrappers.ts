/**
 * 删除无意义的 generic 嵌套
 * 两步处理：
 * 1. 删除空的 generic 节点
 * 2. 展开只有一个子节点的 generic
 */

import type { ElementNode } from '../types/outline.js';

export class UselessWrapperRemover {
  /**
   * 递归删除无意义的包装节点
   */
  removeWrappers(nodes: ElementNode[]): ElementNode[] {
    // 第一步：删除空节点
    nodes = this.removeEmptyGenerics(nodes);
    // 第二步：展开单子节点
    return nodes.map(node => this.processNode(node));
  }
  
  /**
   * 删除空的 generic 节点
   */
  private removeEmptyGenerics(nodes: ElementNode[]): ElementNode[] {
    const result: ElementNode[] = [];
    
    for (const node of nodes) {
      // 先递归处理子节点
      if (node.children.length > 0) {
        node.children = this.removeEmptyGenerics(node.children);
      }
      
      // 判断是否为空 generic
      if (this.isEmptyGeneric(node)) {
        // 跳过空节点，不添加到结果中
        continue;
      }
      
      result.push(node);
    }
    
    return result;
  }
  
  /**
   * 判断是否为空的 generic
   */
  private isEmptyGeneric(node: ElementNode): boolean {
    return (
      node.type === 'generic' &&
      node.children.length === 0 &&
      !node.content  // 只判断是否有实际内容
    );
  }
  
  /**
   * 处理单个节点
   */
  private processNode(node: ElementNode): ElementNode {
    // 先递归处理子节点
    if (node.children.length > 0) {
      node.children = this.removeWrappers(node.children);
    }
    
    // 判断并剥离无意义包装
    while (this.isUselessWrapper(node)) {
      const onlyChild = node.children[0];
      
      // 保留必要属性
      this.mergeAttributes(node, onlyChild);
      
      // 子节点替代父节点
      node = onlyChild;
      
      // 继续递归处理新节点
      if (node.children.length > 0) {
        node.children = this.removeWrappers(node.children);
      }
    }
    
    return node;
  }
  
  /**
   * 判断是否为无意义包装
   */
  private isUselessWrapper(node: ElementNode): boolean {
    return (
      node.type === 'generic' &&
      node.children.length === 1
    );
  }
  
  /**
   * 合并父节点的重要属性到子节点
   */
  private mergeAttributes(parent: ElementNode, child: ElementNode): void {
    // 保留缩进
    child.indent = parent.indent;
    
    // 保留parent引用
    if (parent.parent) {
      child.parent = parent.parent;
    }
    
    // 如果父节点有content而子节点没有，传递content
    if (parent.content && !child.content) {
      child.content = parent.content;
    }
  }
  
  /**
   * 统计删除了多少层
   */
  countRemovedLayers(originalNodes: ElementNode[], processedNodes: ElementNode[]): number {
    let removedCount = 0;
    
    const countDepth = (node: ElementNode): number => {
      let depth = 1;
      if (node.children.length > 0) {
        depth += Math.max(...node.children.map(countDepth));
      }
      return depth;
    };
    
    const originalDepth = Math.max(...originalNodes.map(countDepth));
    const processedDepth = Math.max(...processedNodes.map(countDepth));
    
    removedCount = originalDepth - processedDepth;
    
    return removedCount;
  }
}