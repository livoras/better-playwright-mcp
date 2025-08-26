/**
 * Smart Outline Generation System
 */

import type { ElementNode, ElementGroup, PageStructure, OutlineOptions } from '../types/outline.js';

export class SmartOutlineGenerator {
  private readonly highPriorityTypes = new Set(['heading', 'button', 'link', 'searchbox', 'navigation', 'main', 'form', 'article', 'section']);
  private readonly mediumPriorityTypes = new Set(['list', 'listitem', 'textbox', 'checkbox', 'radio', 'select', 'table']);
  private readonly lowPriorityTypes = new Set(['generic', 'separator', 'img', 'text']);
  
  /**
   * Phase 1: Build complete page structure
   */
  buildPageStructure(lines: string[]): PageStructure {
    const nodes = new Map<string, ElementNode>();
    const nodesByLine = new Map<number, ElementNode>();
    const rootNodes: ElementNode[] = [];
    const stack: ElementNode[] = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;
      
      const node = this.parseLine(line, i);
      if (!node) continue;
      
      // Calculate priority
      node.priority = this.calculatePriority(node);
      
      // Build tree structure
      while (stack.length > 0 && stack[stack.length - 1].indent >= node.indent) {
        stack.pop();
      }
      
      if (stack.length > 0) {
        stack[stack.length - 1].children.push(node);
      } else {
        rootNodes.push(node);
      }
      
      stack.push(node);
      
      // Store in maps
      if (node.ref) {
        nodes.set(node.ref, node);
      }
      nodesByLine.set(i, node);
    }
    
    return {
      nodes,
      nodesByLine,
      groups: [],
      priorityQueue: [],
      totalLines: lines.length,
      rootNodes
    };
  }
  
  /**
   * Parse a single line into an ElementNode
   */
  private parseLine(line: string, lineNumber: number): ElementNode | null {
    const indent = line.length - line.trimStart().length;
    const elementMatch = line.match(/^\s*-\s*([a-z]+)(.*)$/);
    
    if (!elementMatch) return null;
    
    const type = elementMatch[1];
    const rest = elementMatch[2];
    
    // Extract ref
    const refMatch = rest.match(/\[ref=([^\]]+)\]/);
    const ref = refMatch ? refMatch[1] : '';
    
    // Extract content (everything after type and before ref)
    let content = rest;
    if (refMatch) {
      content = rest.substring(0, refMatch.index).trim();
    }
    
    return {
      indent,
      type,
      ref,
      content,
      line,
      children: [],
      priority: 5, // Will be calculated
      isRepetitive: false,
      lineNumber
    };
  }
  
  /**
   * Calculate priority score for an element
   */
  private calculatePriority(node: ElementNode): number {
    let score = 5; // Base score
    
    // Type-based priority
    if (this.highPriorityTypes.has(node.type)) {
      score += 3;
    } else if (this.mediumPriorityTypes.has(node.type)) {
      score += 1;
    } else if (this.lowPriorityTypes.has(node.type)) {
      score -= 2;
    }
    
    // Depth penalty (shallower = more important)
    score -= Math.floor(node.indent / 8);
    
    // Content bonus
    if (node.content) {
      // Has meaningful content
      if (node.content.length > 10) score += 1;
      // Interactive element
      if (node.content.includes('[cursor=pointer]')) score += 1;
      // Has URL
      if (node.content.includes('/url:')) score += 1;
      // Is a heading
      if (node.content.includes('[level=')) score += 2;
    }
    
    // Special cases
    if (node.type === 'searchbox') score = 10; // Always highest
    if (node.type === 'navigation') score = 9;
    
    return Math.max(0, Math.min(10, score));
  }
  
  /**
   * Phase 2: Detect repetitive patterns
   */
  detectRepetitiveGroups(structure: PageStructure): void {
    const typeIndentMap = new Map<string, ElementNode[]>();
    
    // Group by type and indent
    for (const node of structure.nodesByLine.values()) {
      const key = `${node.indent}-${node.type}`;
      if (!typeIndentMap.has(key)) {
        typeIndentMap.set(key, []);
      }
      typeIndentMap.get(key)!.push(node);
    }
    
    // Find consecutive groups
    for (const [key, nodes] of typeIndentMap.entries()) {
      if (nodes.length < 3) continue;
      
      // Sort by line number
      nodes.sort((a: ElementNode, b: ElementNode) => a.lineNumber - b.lineNumber);
      
      // Find consecutive sequences
      const groups = this.findConsecutiveGroups(nodes);
      
      for (const group of groups) {
        if (group.length >= 3) {
          const elementGroup = this.createElementGroup(group);
          structure.groups.push(elementGroup);
          
          // Mark elements as repetitive
          group.forEach((node, index) => {
            node.isRepetitive = true;
            node.groupId = `${elementGroup.type}-${elementGroup.indent}-${structure.groups.length}`;
          });
        }
      }
    }
    
    // Sort groups by size (larger groups first)
    structure.groups.sort((a, b) => b.count - a.count);
  }
  
  /**
   * Find consecutive groups of nodes
   */
  private findConsecutiveGroups(nodes: ElementNode[]): ElementNode[][] {
    const groups: ElementNode[][] = [];
    let currentGroup: ElementNode[] = [];
    
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      
      if (currentGroup.length === 0) {
        currentGroup.push(node);
      } else {
        const lastNode = currentGroup[currentGroup.length - 1];
        
        // Check if nodes are siblings (not parent-child)
        // They should be close in line numbers but not nested
        const isConsecutive = Math.abs(node.lineNumber - lastNode.lineNumber) < 100;
        const isSibling = node.indent === lastNode.indent;
        
        if (isConsecutive && isSibling) {
          currentGroup.push(node);
        } else {
          if (currentGroup.length >= 3) {
            groups.push([...currentGroup]);
          }
          currentGroup = [node];
        }
      }
    }
    
    if (currentGroup.length >= 3) {
      groups.push(currentGroup);
    }
    
    return groups;
  }
  
  /**
   * Create an ElementGroup from nodes
   */
  private createElementGroup(nodes: ElementNode[]): ElementGroup {
    const first = nodes[0];
    const samples = nodes.slice(0, Math.min(3, nodes.length));
    
    return {
      type: first.type,
      indent: first.indent,
      count: nodes.length,
      firstElement: first,
      samples,
      refs: nodes.map(n => n.ref).filter(r => r),
      startLine: first.lineNumber,
      endLine: nodes[nodes.length - 1].lineNumber
    };
  }
  
  /**
   * Phase 3: Generate smart outline
   */
  generateSmartOutline(structure: PageStructure, options: OutlineOptions): string[] {
    const output: string[] = [];
    let remainingLines = options.maxLines;
    const usedLines = new Set<number>();
    
    // 1. Output page skeleton (top-level structure)
    const skeleton = this.extractSkeleton(structure, Math.floor(remainingLines * 0.3));
    output.push(...skeleton);
    remainingLines -= skeleton.length;
    
    // Mark skeleton lines as used
    skeleton.forEach(line => {
      const match = line.match(/lineNumber:(\d+)/);
      if (match) usedLines.add(parseInt(match[1]));
    });
    
    // 2. Output folded repetitive groups
    for (const group of structure.groups) {
      if (remainingLines <= 5) break;
      
      const groupOutput = this.renderGroup(group, remainingLines);
      if (groupOutput.length <= remainingLines) {
        output.push(...groupOutput);
        remainingLines -= groupOutput.length;
        
        // Mark group lines as used
        for (let i = group.startLine; i <= group.endLine; i++) {
          usedLines.add(i);
        }
      }
    }
    
    // 3. Fill with high-priority elements not yet included
    const priorityNodes = Array.from(structure.nodes.values())
      .filter((n: ElementNode) => !usedLines.has(n.lineNumber) && !n.isRepetitive)
      .sort((a: ElementNode, b: ElementNode) => b.priority - a.priority);
    
    for (const node of priorityNodes) {
      if (remainingLines <= 0) break;
      
      const nodeOutput = this.formatNode(node, 0);
      output.push(nodeOutput);
      remainingLines--;
    }
    
    // Add summary if truncated
    if (remainingLines <= 0 && structure.totalLines > options.maxLines) {
      output.push(`... (${structure.totalLines - options.maxLines} more lines)`);
    }
    
    return output;
  }
  
  /**
   * Extract page skeleton (main structure)
   */
  private extractSkeleton(structure: PageStructure, maxLines: number): string[] {
    const output: string[] = [];
    const queue = [...structure.rootNodes];
    let lines = 0;
    
    while (queue.length > 0 && lines < maxLines) {
      const node = queue.shift()!;
      
      // Only include high-priority structural elements
      if (node.priority >= 7 || this.isStructuralElement(node)) {
        output.push(this.formatNode(node, 0));
        lines++;
        
        // Add important children
        const importantChildren = node.children
          .filter((c: ElementNode) => c.priority >= 6)
          .slice(0, 3);
        
        for (const child of importantChildren) {
          if (lines >= maxLines) break;
          output.push(this.formatNode(child, 1));
          lines++;
        }
      }
      
      // Add children to queue for breadth-first traversal
      queue.push(...node.children.filter((c: ElementNode) => c.priority >= 5));
    }
    
    return output;
  }
  
  /**
   * Check if element is structural
   */
  private isStructuralElement(node: ElementNode): boolean {
    const structuralTypes = ['navigation', 'main', 'header', 'footer', 'article', 'section', 'aside'];
    return structuralTypes.includes(node.type) || node.indent <= 4;
  }
  
  /**
   * Render a repetitive group
   */
  private renderGroup(group: ElementGroup, maxLines: number): string[] {
    const output: string[] = [];
    const indent = ' '.repeat(group.indent);
    
    // Show first element with some detail
    output.push(this.formatNode(group.firstElement, 0));
    
    // Show a few children of the first element (for context)
    const childrenToShow = Math.min(3, group.firstElement.children.length);
    for (let i = 0; i < childrenToShow; i++) {
      output.push(this.formatNode(group.firstElement.children[i], 1));
    }
    
    // Add folding indicator
    if (group.count > 1) {
      const remainingCount = group.count - 1;
      const sampleRefs = group.refs.slice(1, Math.min(4, group.refs.length));
      const refsStr = sampleRefs.join(', ');
      
      if (remainingCount > 3) {
        output.push(`${indent}- ${group.type} (... and ${remainingCount} more similar) [refs: ${refsStr}, ...]`);
      } else {
        output.push(`${indent}- ${group.type} (... and ${remainingCount} more similar) [refs: ${refsStr}]`);
      }
    }
    
    return output.slice(0, maxLines);
  }
  
  /**
   * Format a single node
   */
  private formatNode(node: ElementNode, depthOffset: number = 0): string {
    const indent = ' '.repeat(node.indent + depthOffset * 2);
    let result = `${indent}- ${node.type}`;
    
    if (node.content) {
      result += ` ${node.content}`;
    }
    
    if (node.ref) {
      result += ` [ref=${node.ref}]`;
    }
    
    // Add interaction indicators
    if (node.line.includes('[cursor=pointer]')) {
      result += ' [cursor=pointer]';
    }
    
    return result;
  }
  
  /**
   * Main entry point for generating outline
   */
  generate(snapshot: string, options: Partial<OutlineOptions> = {}): string {
    const defaultOptions: OutlineOptions = {
      maxLines: 200,
      mode: 'smart',
      preserveStructure: true,
      foldThreshold: 3
    };
    
    const finalOptions = { ...defaultOptions, ...options };
    
    if (finalOptions.mode === 'simple') {
      // Fallback to simple truncation
      return snapshot.split('\n').slice(0, finalOptions.maxLines).join('\n');
    }
    
    // Smart generation
    const lines = snapshot.split('\n');
    const structure = this.buildPageStructure(lines);
    this.detectRepetitiveGroups(structure);
    const outputLines = this.generateSmartOutline(structure, finalOptions);
    
    return `Page Outline (${outputLines.length}/${structure.totalLines} lines):\n` + outputLines.join('\n');
  }
}