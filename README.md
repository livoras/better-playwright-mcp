# better-playwright-mcp3

A high-performance Playwright MCP (Model Context Protocol) server with intelligent DOM compression and content search capabilities for browser automation.

## Features

- 🎭 Full Playwright browser automation via MCP
- 🏗️ Client-server architecture with HTTP API
- 📍 Ref-based element identification system (`[ref=e1]`, `[ref=e2]`, etc.)
- 🔍 Powerful regex-based content search using ripgrep
- 💾 Persistent browser profiles with Chrome
- 🚀 91%+ DOM compression with intelligent list folding
- 📄 Semantic HTML snapshots using Playwright's internal APIs
- ⚡ High-performance search with safety limits

## Installation

### Global Installation (for CLI usage)
```bash
npm install -g better-playwright-mcp3
```

### Local Installation (for SDK usage)
```bash
npm install better-playwright-mcp3
```

## Usage

### As a JavaScript/TypeScript SDK

**Prerequisites:**
1. First, start the HTTP server:
   ```bash
   npx better-playwright-mcp3@latest server
   ```

2. Then use the SDK in your code:

```javascript
import { PlaywrightClient } from 'better-playwright-mcp3';

async function automateWebPage() {
  // Connect to the HTTP server (must be running)
  const client = new PlaywrightClient('http://localhost:3102');

  // Create a page
  const { pageId, success } = await client.createPage(
    'my-page',        // page name
    'Test page',      // description
    'https://example.com'  // URL
  );

  // Get page structure with intelligent folding
  const outline = await client.getOutline(pageId);
  console.log(outline);
  // Returns compressed outline (~90% reduction) with list folding

  // Search for specific content (regex by default)
  const searchResult = await client.searchSnapshot(pageId, 'Example', { ignoreCase: true });
  console.log(searchResult);
  
  // Search with regular expressions (default behavior)
  const prices = await client.searchSnapshot(pageId, '\\$[0-9]+\\.\\d{2}', { lineLimit: 10 });
  
  // Search multiple patterns (OR)
  const links = await client.searchSnapshot(pageId, 'link|button|input', { ignoreCase: true });

  // Interact with the page using ref identifiers
  await client.browserClick(pageId, 'e3');  // Click element
  await client.browserType(pageId, 'e4', 'Hello World');  // Type text
  await client.browserHover(pageId, 'e2');  // Hover over element

  // Navigation
  await client.browserNavigate(pageId, 'https://google.com');
  await client.browserNavigateBack(pageId);
  await client.browserNavigateForward(pageId);

  // Scrolling
  await client.scrollToBottom(pageId);
  await client.scrollToTop(pageId);

  // Waiting
  await client.waitForTimeout(pageId, 2000);  // Wait 2 seconds
  await client.waitForSelector(pageId, 'body');

  // Take screenshots
  const screenshot = await client.screenshot(pageId, true);  // Full page
  
  // Clean up
  await client.closePage(pageId);
}
```

**Available Methods:**
- **Page Management:** `createPage`, `closePage`, `listPages`
- **Navigation:** `browserNavigate`, `browserNavigateBack`, `browserNavigateForward`
- **Interaction:** `browserClick`, `browserType`, `browserHover`, `browserSelectOption`, `fill`
- **Advanced Actions:** `browserPressKey`, `browserFileUpload`, `browserHandleDialog`
- **Page Structure:** `getOutline` - Get intelligently compressed page structure with list folding (NEW in v3.2.0)
- **Content Search:** `searchSnapshot` - Search page content with regex patterns (powered by ripgrep)
- **Screenshots:** `screenshot` - Capture page as image
- **Scrolling:** `scrollToBottom`, `scrollToTop`
- **Waiting:** `waitForTimeout`, `waitForSelector`

### MCP Server Mode

The MCP server requires an HTTP server to be running. You need to start both:

**Step 1: Start the HTTP server**
```bash
npx better-playwright-mcp3@latest server
```

**Step 2: In another terminal, start the MCP server**
```bash
npx better-playwright-mcp3@latest
```

The MCP server will:
1. Start listening on stdio for MCP protocol messages
2. Connect to the HTTP server on port 3102
3. Route browser automation commands through the HTTP server

### Standalone HTTP Server Mode

You can run the HTTP server independently:

```bash
npx better-playwright-mcp3@latest server
```

Options:
- `-p, --port <number>` - Server port (default: 3102)
- `--host <string>` - Server host (default: localhost)
- `--headless` - Run browser in headless mode
- `--chromium` - Use Chromium instead of Chrome
- `--no-user-profile` - Do not use persistent user profile
- `--user-data-dir <path>` - User data directory

## MCP Tools

When used with AI assistants, the following tools are available:

### Page Management
- `createPage` - Create a new browser page with name and description
- `closePage` - Close a specific page
- `listPages` - List all managed pages with titles and URLs

### Browser Actions
- `browserClick` - Click an element using its ref identifier
- `browserType` - Type text into an element
- `browserHover` - Hover over an element
- `browserSelectOption` - Select options in a dropdown
- `browserPressKey` - Press keyboard keys
- `browserFileUpload` - Upload files to file input
- `browserHandleDialog` - Handle browser dialogs (alert, confirm, prompt)
- `browserNavigate` - Navigate to a URL
- `browserNavigateBack` - Go back to previous page
- `browserNavigateForward` - Go forward to next page
- `scrollToBottom` - Scroll to bottom of page/element
- `scrollToTop` - Scroll to top of page/element
- `waitForTimeout` - Wait for specified milliseconds
- `waitForSelector` - Wait for element to appear

### Content Search & Screenshots
- `searchSnapshot` - Search page content using regex patterns (powered by ripgrep)
- `screenshot` - Take a screenshot (PNG/JPEG)

## Architecture

### Intelligent DOM Compression (NEW in v3.2.0)

The outline generation uses a three-step compression algorithm:

1. **Unwrap** - Remove meaningless generic wrapper nodes
2. **Text Truncation** - Limit text content to 50 characters
3. **List Folding** - Detect and compress repetitive patterns using SimHash

```
Original DOM (5000+ lines)
    ↓
[Remove empty wrappers]
    ↓
[Detect similar patterns]
    ↓
Compressed Outline (<500 lines, ~91% reduction)
```

Example compression:
```
// Before: 48 similar product cards
- listitem [ref=e234]: Product 1 details...
- listitem [ref=e235]: Product 2 details...
- listitem [ref=e236]: Product 3 details...
... (45 more items)

// After: Folded representation
- listitem [ref=e234]: Product 1 details...
- listitem (... and 47 more similar) [refs: e235, e236, ...]
```

### System Architecture

This project implements a two-tier architecture optimized for minimal token usage:

1. **MCP Server** - Communicates with AI assistants via Model Context Protocol
2. **HTTP Server** - Controls browser instances and provides grep-based search

```
AI Assistant <--[MCP Protocol]--> MCP Server <--[HTTP]--> HTTP Server <---> Browser
                                                             |
                                                             v
                                                         ripgrep engine
```

### Key Design Principles

- **Minimal Token Usage**: Intelligent compression reduces DOM by ~91%
- **On-Demand Search**: Content retrieved via regex patterns when needed
- **Performance**: Uses ripgrep for 10x+ faster searching
- **Safety**: Automatic result limiting to prevent context overflow

## Ref-Based Element System

Elements in snapshots are identified using ref attributes (e.g., `[ref=e1]`, `[ref=e2]`). This system:
- Provides stable identifiers for elements
- Works with Playwright's internal `aria-ref` selectors
- Enables precise element targeting across page changes

Example snapshot:
```
- generic [ref=e2]:
  - heading "Example Domain" [level=1] [ref=e3]
  - paragraph [ref=e4]: This domain is for use in illustrative examples
  - link "More information..." [ref=e5] [cursor=pointer]
```

## Examples

### Creating and Navigating Pages

```javascript
// Create a page
const { pageId, success } = await client.createPage(
  'shopping',
  'Amazon shopping page',
  'https://amazon.com'
);

// Navigate to another URL
await client.browserNavigate(pageId, 'https://google.com');

// Go back/forward
await client.browserNavigateBack(pageId);
await client.browserNavigateForward(pageId);
```

### Getting Page Structure (Enhanced in v3.2.0)

```javascript
// Get intelligently compressed page outline
const outline = await client.getOutline(pageId);
console.log(outline);

// Example output showing list folding:
// Page Outline (473/5257 lines):
// - banner [ref=e1]
//   - navigation [ref=e2]
//     - list "Products" [ref=e3]
//       - listitem "Product 1" [ref=e4]
//       - listitem (... and 47 more similar) [refs: e5, e6, ...]
//
// Compression: 91% reduction while preserving all refs
```

### Searching Content

```javascript
// Search for text (case insensitive)
const results = await client.searchSnapshot(pageId, 'product', { ignoreCase: true });

// Search with regular expression (default behavior)
const emails = await client.searchSnapshot(pageId, '[a-zA-Z0-9]+@[a-zA-Z0-9]+\\.[a-z]+');

// Search multiple patterns (OR)
const buttons = await client.searchSnapshot(pageId, 'button|submit|click', { ignoreCase: true });

// Search for prices with dollar sign
const prices = await client.searchSnapshot(pageId, '\\$\\d+\\.\\d{2}');

// Limit number of result lines
const firstTen = await client.searchSnapshot(pageId, 'item', { lineLimit: 10 });
```

**Search Options:**
- `pattern` (required) - Regex pattern to search for
- `ignoreCase` (optional) - Case insensitive search (default: false)
- `lineLimit` (optional) - Maximum lines to return (default: 100, max: 100)

**Response Format:**
- `result` - Matched text content
- `matchCount` - Total number of matches found
- `truncated` - Whether results were truncated due to line limit

### Interacting with Elements

```javascript
// Click on element using its ref identifier
await client.browserClick(pageId, 'e3');

// Type text into input field
await client.browserType(pageId, 'e4', 'search query');

// Hover over element
await client.browserHover(pageId, 'e2');

// Press keyboard key
await client.browserPressKey(pageId, 'Enter');
```

### Scrolling and Waiting

```javascript
// Scroll page
await client.scrollToBottom(pageId);
await client.scrollToTop(pageId);

// Wait operations
await client.waitForTimeout(pageId, 2000);  // Wait 2 seconds
await client.waitForSelector(pageId, '#my-element');
```

## Best Practices for AI Assistants

### Recommended Workflow: Outline First, Then Precise Actions

When using this library with AI assistants, follow this optimized workflow for maximum efficiency:

#### 1. Start with Page Outline (Always First Step)
```javascript
// Always begin by getting the compressed page structure
const outline = await client.getOutline(pageId);
// Returns intelligently compressed view with ~91% reduction
```

The outline provides:
- Complete page structure with intelligent list folding
- First element of each pattern preserved as sample
- All ref identifiers for precise element targeting
- Clear indication of repetitive patterns (e.g., "... and 47 more similar")

#### 2. Use Outline to Guide Precise Searches
```javascript
// Based on outline understanding, perform targeted searches
const searchResults = await client.searchSnapshot(pageId, 'specific term', { 
  ignoreCase: true, 
  lineLimit: 10 
});
// Now you know exactly what to search for and where it might be
```

#### 3. Take Actions with Verified Ref IDs
```javascript
// Use ref IDs discovered from outline or grep, not guesswork
await client.browserClick(pageId, 'e42');  // Ref ID confirmed from outline
```

### Why This Approach?

**Token Efficiency**: Compressed outline (typically <500 lines) + targeted searches use far fewer tokens than full snapshots (often 5000+ lines)

**Accuracy**: The outline shows actual page structure, preventing incorrect assumptions about element locations

**Smart Compression**: The algorithm preserves one sample from each pattern group, so AI understands the structure without seeing all repetitions

### Anti-Patterns to Avoid

❌ **Don't** blindly try random ref IDs without verification
❌ **Don't** request full snapshots that exceed token limits
❌ **Don't** make assumptions about page structure without checking the outline first
❌ **Don't** use generic search patterns when specific ones would be more efficient

### Example: Searching Amazon Products

```javascript
// GOOD: Outline-first approach
const outline = await client.getOutline(pageId);
// Shows: "- listitem [ref=e234]: [first product]"
//        "- listitem (... and 47 more similar) [refs: e235, e236, ...]"

// Now search for specific product attributes
const prices = await client.searchSnapshot(pageId, '\\$\\d+\\.\\d{2}', { lineLimit: 10 });

// BAD: Blind searching without context
const results = await client.searchSnapshot(pageId, 'product', { ignoreCase: true });  // Too generic
await client.browserClick(pageId, 'e1');  // Guessing ref IDs
```

## Development

### Prerequisites

- Node.js >= 18.0.0
- TypeScript
- Chrome or Chromium browser

### Building from Source

```bash
# Clone the repository
git clone https://github.com/yourusername/better-playwright-mcp.git
cd better-playwright-mcp

# Install dependencies
npm install

# Build the project
npm run build

# Run in development mode
npm run dev
```

### Project Structure

```
better-playwright-mcp3/
├── src/
│   ├── index.ts                    # Main export file
│   ├── mcp-server.ts               # MCP server implementation
│   ├── client/
│   │   └── playwright-client.ts    # HTTP client for browser automation
│   ├── server/
│   │   └── playwright-server.ts    # HTTP server controlling browsers
│   └── utils/
│       ├── smart-outline-simple.ts # Intelligent outline generation
│       ├── list-detector.ts        # Pattern detection using SimHash
│       ├── dom-simhash.ts          # SimHash implementation
│       └── remove-useless-wrappers.ts # DOM cleanup
├── bin/
│   └── cli.js                      # CLI entry point
├── docs/
│   └── architecture.md             # Detailed architecture documentation
├── package.json
├── tsconfig.json
└── README.md
```

## Troubleshooting

### Common Issues

1. **Port already in use**
   - Change the port using `-p` flag: `npx better-playwright-mcp3 server -p 3103`
   - Or set environment variable: `PORT=3103 npx better-playwright-mcp3 server`

2. **Browser not launching**
   - Ensure Chrome or Chromium is installed
   - Try using `--chromium` flag for Chromium
   - Check system resources

3. **Element not found**
   - Verify the ref identifier exists in outline
   - Use `searchSnapshot()` to search for elements
   - Wait for elements using `waitForSelector()`

4. **Search returns too many results**
   - Use more specific patterns
   - Use `lineLimit` option to limit results
   - Leverage regex features for precise matching

### Debug Mode

Enable detailed logging:

```bash
DEBUG=* npx better-playwright-mcp3
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT