/**
 * DOM SimHash Implementation
 * 用于检测DOM树结构相似性
 */

import type { ElementNode } from '../types/outline.js';

export class DOMSimHash {
  private readonly HASH_BITS = 32;
  private hashCache = new Map<ElementNode, number>();

  /**
   * 提取DOM节点的结构特征
   */
  extractFeatures(node: ElementNode): string[] {
    const features: string[] = [];
    
    // 1. 骨架特征：类型树
    features.push(this.getSkeletonSignature(node));
    
    // 2. 形状特征：宽度分布
    features.push(this.getShapeSignature(node));
    
    // 3. 类型计数特征
    features.push(this.getTypeCountSignature(node));
    
    // 4. 交互特征
    if (this.hasInteractiveElements(node)) {
      features.push('interactive');
    }
    
    // 5. 深度特征
    features.push(`d${this.getMaxDepth(node)}`);
    
    return features;
  }

  /**
   * 获取骨架签名 - 类型树的简化表示
   */
  private getSkeletonSignature(node: ElementNode): string {
    // 根节点类型
    let signature = node.type;
    
    // 子节点类型序列（只取前5个）
    const childTypes = node.children
      .slice(0, 5)
      .map(c => c.type)
      .join('+');
    
    if (childTypes) {
      signature += `>${childTypes}`;
    }
    
    // 孙节点（只取第一个子节点的子节点）
    if (node.children.length > 0 && node.children[0].children.length > 0) {
      const grandchildTypes = node.children[0].children
        .slice(0, 3)
        .map(c => c.type)
        .join('+');
      signature += `>${grandchildTypes}`;
    }
    
    return signature;
  }

  /**
   * 获取形状签名 - 树的宽度分布
   */
  private getShapeSignature(node: ElementNode): string {
    const widths: number[] = [node.children.length];
    
    // 记录前3个子节点的宽度
    for (let i = 0; i < Math.min(3, node.children.length); i++) {
      widths.push(node.children[i].children.length);
    }
    
    return 'w' + widths.join('-');
  }

  /**
   * 获取类型计数签名
   */
  private getTypeCountSignature(node: ElementNode): string {
    const counts = new Map<string, number>();
    
    function count(n: ElementNode, depth: number) {
      if (depth > 2) return; // 只统计前3层
      
      const type = n.type;
      counts.set(type, (counts.get(type) || 0) + 1);
      n.children.forEach(c => count(c, depth + 1));
    }
    
    count(node, 0);
    
    // 只记录重要类型的首字母和数量
    const important = ['button', 'link', 'text', 'img', 'heading', 'checkbox', 'radio'];
    const sig = important
      .map(t => {
        const c = counts.get(t) || 0;
        return c > 0 ? `${t[0]}${c}` : '';
      })
      .filter(s => s)
      .join('');
    
    return sig || 'empty';
  }

  /**
   * 检查是否有交互元素
   */
  private hasInteractiveElements(node: ElementNode): boolean {
    if (node.line.includes('[cursor=pointer]')) {
      return true;
    }
    
    // 递归检查子节点（限制深度）
    function check(n: ElementNode, depth: number): boolean {
      if (depth > 2) return false;
      
      if (n.type === 'button' || n.type === 'link' || n.type === 'checkbox' || n.type === 'radio') {
        return true;
      }
      
      return n.children.some(c => check(c, depth + 1));
    }
    
    return check(node, 0);
  }

  /**
   * 获取最大深度
   */
  private getMaxDepth(node: ElementNode): number {
    if (node.children.length === 0) return 0;
    return 1 + Math.max(...node.children.map(c => this.getMaxDepth(c)));
  }

  /**
   * DJB2 hash算法 - 简单快速
   */
  private djb2Hash(str: string): number {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) + hash) + str.charCodeAt(i); // hash * 33 + c
    }
    return hash >>> 0; // 转为无符号整数
  }

  /**
   * 特征权重
   */
  private getWeight(feature: string): number {
    if (feature.includes('>')) return 5;  // 骨架特征最重要
    if (feature.startsWith('w')) return 3; // 形状特征
    if (feature.startsWith('d')) return 2; // 深度特征
    return 1;
  }

  /**
   * 计算SimHash值
   */
  computeHash(node: ElementNode): number {
    // 缓存检查
    if (this.hashCache.has(node)) {
      return this.hashCache.get(node)!;
    }
    
    const features = this.extractFeatures(node);
    const vector = new Array(this.HASH_BITS).fill(0);
    
    for (const feature of features) {
      const hash = this.djb2Hash(feature);
      const weight = this.getWeight(feature);
      
      for (let i = 0; i < this.HASH_BITS; i++) {
        const bit = (hash >> i) & 1;
        vector[i] += bit ? weight : -weight;
      }
    }
    
    // 降维：正数->1, 负数->0
    let simhash = 0;
    for (let i = 0; i < this.HASH_BITS; i++) {
      if (vector[i] > 0) {
        simhash |= (1 << i);
      }
    }
    
    this.hashCache.set(node, simhash);
    return simhash;
  }

  /**
   * 计算汉明距离
   */
  hammingDistance(hash1: number, hash2: number): number {
    let xor = hash1 ^ hash2;
    let count = 0;
    
    while (xor) {
      count += xor & 1;
      xor >>>= 1;
    }
    
    return count;
  }

  /**
   * 判断两个节点是否相似
   */
  areSimilar(node1: ElementNode, node2: ElementNode, threshold = 3): boolean {
    const hash1 = this.computeHash(node1);
    const hash2 = this.computeHash(node2);
    const distance = this.hammingDistance(hash1, hash2);
    return distance <= threshold;
  }

  /**
   * 查找最大相似子序列
   * 不要求从第一个元素开始
   */
  findSimilarSequence(nodes: ElementNode[]): {
    start: number;
    end: number;
    samples: ElementNode[];
    baseHash: number;
  } | null {
    if (nodes.length < 3) return null;
    
    let maxLen = 0;
    let bestStart = 0;
    let bestEnd = 0;
    let bestBaseHash = 0;
    
    // 滑动窗口找最长相似序列
    for (let i = 0; i <= nodes.length - 3; i++) {  // 修复：允许检查最后3个节点
      const baseHash = this.computeHash(nodes[i]);
      let j = i + 1;
      let similarCount = 1;
      
      // 向后扩展相似序列
      while (j < nodes.length) {
        const hash = this.computeHash(nodes[j]);
        const distance = this.hammingDistance(baseHash, hash);
        
        if (distance <= 3) {
          // 相似，继续扩展
          similarCount++;
          if (similarCount >= 3 && similarCount > maxLen) {  // 修复：只在>=3时更新
            maxLen = similarCount;
            bestStart = i;
            bestEnd = j;
            bestBaseHash = baseHash;
          }
        } else if (similarCount >= 3) {
          // 已找到足够长的序列，可以结束
          break;
        }
        j++;
      }
    }
    
    if (maxLen >= 3) {
      return {
        start: bestStart,
        end: bestEnd,
        samples: nodes.slice(bestStart, bestEnd + 1),
        baseHash: bestBaseHash
      };
    }
    
    return null;
  }

  /**
   * 批量查找所有相似序列
   */
  findAllSimilarSequences(nodes: ElementNode[]): Array<{
    start: number;
    end: number;
    count: number;
    sample: ElementNode;
  }> {
    const sequences: Array<{
      start: number;
      end: number;
      count: number;
      sample: ElementNode;
    }> = [];
    
    const processed = new Set<number>();
    
    // 收集所有未处理节点，不管位置
    while (processed.size < nodes.length) {
      const unprocessed = [];
      const indexMap = [];
      
      for (let i = 0; i < nodes.length; i++) {
        if (!processed.has(i)) {
          unprocessed.push(nodes[i]);
          indexMap.push(i);
        }
      }
      
      if (unprocessed.length < 3) {
        break;
      }
      
      const seq = this.findSimilarSequence(unprocessed);
      
      if (seq) {
        const actualStart = indexMap[seq.start];
        const actualEnd = indexMap[seq.end];
        
        sequences.push({
          start: actualStart,
          end: actualEnd,
          count: seq.end - seq.start + 1,
          sample: nodes[actualStart]
        });
        
        // 标记已处理的节点
        for (let k = seq.start; k <= seq.end; k++) {
          processed.add(indexMap[k]);
        }
      } else {
        // 没有找到序列，退出避免无限循环
        break;
      }
    }
    
    return sequences;
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.hashCache.clear();
  }
}