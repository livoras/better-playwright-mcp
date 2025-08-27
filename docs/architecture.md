# Better Playwright MCP 架构文档

## 系统概览

Better Playwright MCP 是一个智能的网页自动化工具，通过压缩DOM结构为AI提供可理解的页面上下文。

## 核心工作流

```
网页 DOM (5000+ 行)
    ↓
[Outline 生成]
    ↓
压缩结构 (< 500 行)
    ↓
[Search 功能]
    ↓
精准定位
```

## Outline 生成算法

### 1. Unwrap - 删除无意义嵌套

**实现文件**: `src/utils/remove-useless-wrappers.ts`

**两步处理**：
1. 删除空 generic 节点
   - 判断条件：`type === 'generic' && children.length === 0 && !content`
   - 直接从父节点中移除

2. 展开单子节点 generic
   - 判断条件：`type === 'generic' && children.length === 1`
   - 子节点提升替代父节点

**效果**：
- 删除约 2300+ 个无意义 generic 节点
- 减少 50% 以上的嵌套层级

### 2. 文本截断

**实现位置**: `SmartOutlineSimple.formatNode()`

**规则**：
- 单个文本节点最多保留 50 字符
- 超出部分用 `...` 表示
- 保留完整的 ref 和交互标记

### 3. 列表检测与折叠

**实现文件**: `src/utils/list-detector.ts`

**检测类型**：

#### 语义列表
- 连续的 `listitem` 元素
- 自动识别为列表项

#### 结构列表  
- 使用 SimHash 算法检测
- 相似度阈值：汉明距离 ≤ 3
- 最少 3 个相似元素构成列表

**折叠格式**：
```
- listitem "第一个样本"
- listitem (... and 37 more similar) [refs: e123, e456, ...]
```

## SimHash 算法

**实现文件**: `src/utils/dom-simhash.ts`

### 核心原理
为 DOM 节点生成 64 位特征指纹，通过比较指纹相似度判断结构相似性。

### 特征提取
```typescript
特征包括：
- 节点类型 (type)
- 角色属性 (role)
- 子节点数量
- 文本内容（前10字符）
- 嵌套深度
- 是否有交互
```

### 相似度判断
```typescript
汉明距离(hash1, hash2) ≤ 3 → 相似
```

### 算法流程
1. 为每个节点计算 SimHash
2. 查找所有相似序列
3. 合并相邻的相似节点
4. 返回列表模式

## Search 功能

**实现文件**: `src/utils/search-snapshot.ts`

基于生成的 outline 进行搜索：
- 使用 ripgrep 进行高效文本匹配
- 支持正则表达式
- 返回匹配行及上下文

## 压缩效果

| 阶段 | 行数 | 压缩率 |
|-----|------|--------|
| 原始 DOM | 5546 | - |
| Unwrap 后 | 2554 | 54% |
| 列表折叠后 | 471 | 91.5% |

## 关键数据结构

### ElementNode
```typescript
interface ElementNode {
  type: string;          // 节点类型
  ref?: string;          // 引用ID
  content?: string;      // 文本内容
  children: ElementNode[];
  indent: number;        // 缩进层级
  hasInteraction?: boolean;
}
```

### ListPattern
```typescript
interface ListPattern {
  type: 'semantic' | 'structural';
  start: number;         // 起始索引
  end: number;          // 结束索引
  count: number;        // 元素数量
  sample: ElementNode;  // 样本元素
  items: ElementNode[]; // 所有元素
  refs: string[];       // 所有ref
}
```

## 文件结构

```
src/utils/
├── smart-outline-simple.ts   # 主入口，协调各组件
├── remove-useless-wrappers.ts # 删除无意义嵌套
├── list-detector.ts           # 列表模式检测
├── dom-simhash.ts            # SimHash 算法
└── search-snapshot.ts        # 搜索功能
```

## 设计优势

1. **高压缩率**：91.5% 的压缩率，5000+ 行压缩到 < 500 行
2. **保留语义**：通过折叠而非删除，保留所有元素的 ref
3. **可操作性**：每个元素都有 ref，可以精准定位和操作
4. **易理解**：输出结构清晰，AI 容易理解页面结构

## 使用示例

```typescript
// 服务器端使用
const generator = new SmartOutlineSimple();
const outline = generator.generate(snapshot);

// 输出格式
Page Outline (471/5546 lines):
- generic [ref=e2]
  - navigation "Shortcuts menu" [ref=e3]
    - listitem (... and 37 more similar) [refs: e4, e5, ...]
```