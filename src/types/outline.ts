/**
 * Smart Outline Generation System Types
 */

export interface ElementNode {
  indent: number;
  type: string;
  ref: string;
  content: string;
  line: string;  // 原始行内容
  children: ElementNode[];
  priority: number;  // 0-10 优先级分数
  isRepetitive: boolean;
  groupId?: string;   // 重复组标识
  lineNumber: number; // 原始行号
  parent?: ElementNode;
  hasInteraction?: boolean;
}

export interface ElementGroup {
  type: string;
  indent: number;
  count: number;
  firstElement: ElementNode;
  samples: ElementNode[];  // 保留1-3个样本
  refs: string[];          // 所有元素的ref
  startLine: number;
  endLine: number;
}

export interface PageStructure {
  nodes: Map<string, ElementNode>;
  nodesByLine: Map<number, ElementNode>;
  groups: ElementGroup[];
  priorityQueue: ElementNode[];
  totalLines: number;
  rootNodes: ElementNode[];
}

export interface OutlineOptions {
  maxLines: number;
  mode: 'smart' | 'simple';
  preserveStructure: boolean;
  foldThreshold: number;  // 折叠阈值
}