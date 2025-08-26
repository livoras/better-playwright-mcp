# Intelligent Outline Generation Algorithm Design

## Overview
The outline generation algorithm creates a concise structural summary of web pages (limited to 200 lines) that accurately represents the page's content distribution while maintaining readability for AI assistants.

## Core Principles

### 1. Content-Aware Prioritization
Instead of relying solely on predefined element priorities, the algorithm analyzes actual content distribution to identify what matters most on each specific page.

### 2. Sample Preservation
For every collapsed group of similar elements, the first element is preserved in full as a structural sample, allowing AI to understand the pattern without seeing all repetitions.

### 3. List-Centric Analysis
Recognizes that modern web pages are often organized as lists (search results, product grids, news feeds) and prioritizes these structures appropriately.

## Algorithm Architecture

### Phase 1: Structure Analysis & Statistics

#### 1.1 List Group Detection
```typescript
interface ListGroup {
  parentPath: string;      // Parent node identifier (via indentation)
  elementType: string;     // Element type (listitem, article, generic, etc.)
  items: string[];         // All element lines in this group
  startLine: number;       // Starting line number in snapshot
  indent: number;          // Indentation level
  totalDescendants: number; // Total lines including children
}
```

#### 1.2 Detection Rules
- **Same-level siblings**: Elements at the same indentation level
- **Same type**: Consecutive elements of the same type (listitem, article, etc.)
- **Minimum threshold**: Groups with 3+ elements are considered lists

#### 1.3 Statistical Metrics
- Element count per group
- Percentage of total snapshot lines
- Depth of nested structures
- Content density (lines per element)

### Phase 2: Dynamic Priority Calculation

#### 2.1 Base Priority System
```typescript
const basePriority = {
  high: [
    'heading', 'button', 'link', 'searchbox', 
    'navigation', 'banner', 'main', 'form'
  ],
  medium: [
    'textbox', 'checkbox', 'radio', 'select', 
    'list', 'article', 'section', 'region'
  ],
  low: [
    'generic', 'text', 'paragraph', 'img', 'separator'
  ]
};
```

#### 2.2 Dynamic Priority Boost Rules

| Condition | Priority Adjustment | Rationale |
|-----------|-------------------|-----------|
| List has ≥10 elements | Boost to HIGH | Large lists are likely main content |
| List occupies ≥20% of snapshot | Boost to HIGHEST | Dominant content should be shown |
| Top 3 largest lists | Boost by 1 level | Ensure major structures are visible |
| Contains search results pattern | Boost to HIGHEST | Search results are primary user intent |

#### 2.3 Pattern Recognition
Special patterns that trigger priority boost:
- Multiple `listitem` with similar structure (product cards)
- Repeated `article` elements (news/blog posts)
- Grid of `generic` elements with images (photo galleries)

### Phase 3: Intelligent Output Generation

#### 3.1 Core List Processing
```typescript
function processImportantList(group: ListGroup): string[] {
  const output: string[] = [];
  
  // Always show the first element completely
  const firstElement = group.items[0];
  output.push(firstElement);
  
  // Include all children of first element
  const firstElementChildren = extractChildren(firstElement);
  output.push(...firstElementChildren);
  
  // Collapse remaining elements
  if (group.items.length > 1) {
    const remaining = group.items.length - 1;
    const refRange = extractRefRange(group.items);
    output.push(
      `${getIndent(group.indent)}- ${group.elementType} ` +
      `(... and ${remaining} more similar) [ref=${refRange}]`
    );
  }
  
  return output;
}
```

#### 3.2 Space Allocation Strategy
```
Total: 200 lines
├── Critical elements (navigation, headers): ~20% (40 lines)
├── Main content lists: ~60% (120 lines)
├── Secondary elements: ~15% (30 lines)
└── Buffer for completion: ~5% (10 lines)
```

#### 3.3 Line Counting Rules
- Pre-calculate space needed for each list group
- Reserve space for folded representations
- Stop processing new groups when approaching limit
- Always complete current group (may slightly exceed 200)

## Implementation Examples

### Example 1: E-commerce Search Results
```
Input: 1500 lines of Amazon search results
Main List Detected: 48 product items (800 lines)

Output Structure:
- Navigation (10 lines)
- Search header "1-48 of 10,000 results" (5 lines)
- First product (complete structure, 15 lines)
  - Image, title, rating, price, buttons
- "... and 47 more similar products" (1 line)
- Filters sidebar (first filter + collapse) (10 lines)
Total: ~50 lines for main content
```

### Example 2: News Website
```
Input: 2000 lines of news homepage
Main Lists Detected: 
- Featured articles: 5 items (300 lines)
- Recent news: 20 items (600 lines)

Output Structure:
- Header/navigation (15 lines)
- Featured section:
  - First article (full, 20 lines)
  - "... and 4 more featured" (1 line)
- Recent news:
  - First article (full, 15 lines)
  - "... and 19 more articles" (1 line)
```

## Edge Cases & Handling

### 1. Deeply Nested Structures
- Limit depth to 5 levels to prevent explosion
- Flatten deeper structures with notation: `[deeply nested content]`

### 2. No Clear Lists
- Fall back to traditional priority-based selection
- Focus on interactive elements (buttons, links, forms)

### 3. Extremely Long Single Elements
- Truncate element content at 500 characters
- Add `[content truncated]` marker

### 4. Mixed Content Types
- Process each content type separately
- Allocate space proportionally to their presence

## Configuration Options

```typescript
interface OutlineConfig {
  maxLines: number;           // Default: 200
  preserveFirstN: number;      // How many samples to keep (default: 1)
  minListSize: number;         // Minimum size to consider as list (default: 3)
  boostThreshold: number;      // Elements needed for auto-boost (default: 10)
  contentPercentThreshold: number; // Percentage for priority boost (default: 20)
}
```

## Performance Considerations

### Time Complexity
- Single pass for analysis: O(n)
- Priority calculation: O(m log m) where m = number of groups
- Output generation: O(n)
- Total: O(n + m log m), typically O(n) as m << n

### Memory Usage
- Store only group metadata, not full content
- Use line references instead of copying strings
- Estimated: ~10KB for typical page analysis

## Future Enhancements

1. **Machine Learning Integration**
   - Learn from user interactions to improve priority detection
   - Recognize page types (e-commerce, news, docs) for specialized handling

2. **Semantic Understanding**
   - Use content analysis to identify primary user intent
   - Adjust priorities based on search context

3. **Adaptive Line Limits**
   - Allow dynamic adjustment based on page complexity
   - Provide quality scores for different line limits

4. **Template Detection**
   - Identify and store common page templates
   - Apply optimized strategies for known patterns

## Appendix: Common Page Patterns

### Pattern: Search Results
- Identifier: Multiple `listitem` or `article` with similar structure
- Strategy: Show first result fully, collapse rest
- Priority: HIGHEST

### Pattern: Navigation Menu
- Identifier: `navigation` > `list` > multiple `listitem`
- Strategy: Show structure with first item, collapse if >5 items
- Priority: HIGH

### Pattern: Form
- Identifier: `form` with multiple input elements
- Strategy: Show all unique input types, collapse similar ones
- Priority: HIGH

### Pattern: Comments/Reviews
- Identifier: Repeated structures with text content
- Strategy: Show first comment structure, summarize count
- Priority: MEDIUM

## Testing & Validation

### Test Cases
1. Amazon product search (48+ results)
2. Reddit thread (100+ comments)
3. News homepage (mixed content)
4. Documentation page (navigation + content)
5. Empty search results
6. Single product page (no lists)

### Success Metrics
- Main content identified correctly: >95%
- Output within line limit: 100%
- First element preserved: 100%
- Processing time: <100ms for 5000-line snapshot