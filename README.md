# better-playwright-mcp

A better Playwright MCP (Model Context Protocol) server that uses a client-server architecture for browser automation.

## Why Better?

Traditional browser automation tools send entire page HTML to AI assistants, which quickly exhausts token limits and makes complex web interactions impractical. **better-playwright-mcp** solves this with an innovative semantic snapshot algorithm that reduces page content by up to 90% while preserving all meaningful elements.

### The Problem
- Full page HTML often exceeds 100K+ tokens
- Most HTML is noise: inline styles, tracking scripts, invisible elements
- AI assistants have limited context windows (even with 200K limits)
- Complex web automation becomes impossible after just a few page loads

### Our Solution: Semantic Snapshots
Our core innovation is a multi-stage pruning algorithm that:
1. **Identifies meaningful elements** - Interactive elements (buttons, inputs), semantic HTML5 tags, and text-containing elements
2. **Generates unique identifiers** - Each element gets a hash-based `xp` attribute derived from its XPath for precise targeting
3. **Removes invisible content** - Elements with `display:none`, zero dimensions, or hidden parents are marked and removed
4. **Unwraps useless wrappers** - Eliminates divs and spans that only wrap other elements
5. **Strips unnecessary attributes** - Keeps only essential attributes like `href`, `value`, `placeholder`

Result: A clean, semantic representation that typically uses **only 10% of the original tokens** while maintaining full functionality.

## Architecture

This project implements a unique two-tier architecture:

1. **MCP Server** - Communicates with AI assistants via Model Context Protocol
2. **HTTP Server** - Runs in the background to control the actual browser instances

```
AI Assistant <--[MCP Protocol]--> MCP Server <--[HTTP]--> HTTP Server <---> Browser
```

This design allows the MCP server to remain lightweight while delegating browser control to a dedicated HTTP service.

## Features

- 🎯 **90% token reduction** through semantic HTML snapshots
- 🎭 Full Playwright browser automation via MCP
- 🏗️ Client-server architecture for better separation of concerns
- 🛡️ Stealth mode to avoid detection
- 📍 Hash-based element identifiers for precise targeting
- 💾 Persistent browser profiles
- 🚀 Optimized for long-running automation tasks
- 📊 Token-aware output with automatic truncation
- 📄 Save processed HTML to files for external processing

## Installation

### Global Installation (for CLI usage)
```bash
npm install -g better-playwright-mcp
```

### Local Installation (for SDK usage)
```bash
npm install better-playwright-mcp
```

## Usage

### As a JavaScript/TypeScript SDK

You can use the PlaywrightClient SDK programmatically in your Node.js applications:

**Prerequisites:**
1. First, start the HTTP server:
   ```bash
   npx better-playwright-mcp@latest server
   ```

2. Then use the SDK in your code:

```javascript
import { PlaywrightClient } from 'better-playwright-mcp';

async function automateWebPage() {
  // Connect to the HTTP server (must be running)
  const client = new PlaywrightClient('http://localhost:3102');

  // Create a page
  const { pageId, snapshot } = await client.createPage(
    'my-page',        // page name
    'Test page',      // description
    'https://example.com'  // URL
  );

  // Save the processed HTML to a file
  const result = await client.pageToHtmlFile(pageId); // trim: true by default
  console.log('HTML saved to:', result.filePath);
  // Returns: { filePath: "/tmp/page-abc123.html", fileSize: 12345, trimmed: true, ... }
  
  // Save original HTML without trimming
  const resultNoTrim = await client.pageToHtmlFile(pageId, false);
  // Returns original HTML without redundant element removal

  // Get accessibility tree snapshot
  const accessibilitySnapshot = await client.getAccessibilitySnapshot(pageId);
  console.log('Accessibility tree:', accessibilitySnapshot.data);
  // Returns accessibility tree with roles, names, and hierarchy
  
  // Get only interesting nodes (default)
  const snapshot1 = await client.getAccessibilitySnapshot(pageId, { interestingOnly: true });
  
  // Get full accessibility tree
  const snapshot2 = await client.getAccessibilitySnapshot(pageId, { interestingOnly: false });

  // Get a semantic snapshot (with xp references)
  const snapshot = await client.getPageSnapshot(pageId);
  console.log(snapshot);
  // Returns simplified HTML like:
  // div xp=6204242d
  //   h1 xp=3fed137b Example Domain
  //   p xp=070e2633 This domain is for use...

  // Interact with the page using xp references from snapshot
  await client.browserClick(pageId, '3fed137b');  // Click the h1 element
  await client.browserType(pageId, '070e2633', 'Hello World', true);  // Type and submit

  // Take screenshots
  const screenshot = await client.getScreenshot(pageId, { fullPage: true });
  
  // Clean up
  await client.closePage(pageId);
}
```

**Available Methods:**
- Page Management: `createPage`, `closePage`, `listPages`, `activatePage`
- Navigation: `browserNavigate`, `browserNavigateBack`, `browserNavigateForward`
- Interaction: `browserClick`, `browserType`, `browserHover`, `browserSelectOption`
- Snapshots: `getPageSnapshot`, `getAccessibilitySnapshot`, `pageToHtmlFile`, `getScreenshot`, `getPDFSnapshot`
- Utilities: `waitForTimeout`, `waitForSelector`, `scrollToBottom`, `scrollToTop`

### Default Mode (MCP)

The MCP server requires an HTTP server to be running. You need to start both:

**Step 1: Start the HTTP server**
```bash
npx better-playwright-mcp@latest server
```

**Step 2: In another terminal, start the MCP server**
```bash
npx better-playwright-mcp@latest
```

The MCP server will:
1. Start listening on stdio for MCP protocol messages
2. Connect to the HTTP server on port 3102
3. Route browser automation commands through the HTTP server

Options:
- `--snapshot-dir <path>` - Directory to save snapshots

### Standalone HTTP Server Mode

You can also run the HTTP server independently (useful for debugging or custom integrations):

```bash
npx better-playwright-mcp@latest server
```

Options:
- `-p, --port <number>` - Server port (default: 3102)
- `--host <string>` - Server host (default: localhost)
- `--headless` - Run browser in headless mode
- `--chromium` - Use Chromium instead of Chrome
- `--no-user-profile` - Do not use persistent user profile
- `--user-data-dir <path>` - User data directory
- `--snapshot-dir <path>` - Directory to save snapshots

## MCP Tools

When used with AI assistants, the following tools are available:

### Page Management
- `createPage` - Create a new browser page with name and description
- `activatePage` - Activate a specific page by ID
- `closePage` - Close a specific page
- `listPages` - List all managed pages with titles and URLs
- `closeAllPages` - Close all managed pages
- `listPagesWithoutId` - List unmanaged browser pages
- `closePagesWithoutId` - Close all unmanaged pages
- `closePageByIndex` - Close page by index

### Browser Actions
- `browserClick` - Click an element using its `xp` identifier
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

### Snapshot & Utilities
- `getPageSnapshot` - Get semantic HTML snapshot with `xp` identifiers
- `getAccessibilitySnapshot` - Get accessibility tree snapshot of the page
- `getScreenshot` - Take a screenshot (PNG/JPEG)
- `getPDFSnapshot` - Generate PDF of the page
- `getElementHTML` - Get HTML of specific element
- `pageToHtmlFile` - Save processed page HTML to temporary file
- `downloadImage` - Download image from URL
- `captureSnapshot` - Capture full page with automatic scrolling

## How It Works

### Semantic Snapshots in Action

Before (original HTML):
```html
<div class="wrapper" style="padding: 20px; margin: 10px;">
  <div class="container">
    <div class="inner">
      <button class="btn btn-primary" onclick="handleClick()" 
              style="background: blue; color: white;">
        Click me
      </button>
    </div>
  </div>
</div>
```

After (semantic snapshot):
```
button xp=3fa2b8c1 Click me
```

The algorithm:
- Removes unnecessary wrapper divs
- Strips inline styles and event handlers  
- Adds unique identifier (`xp` attribute) - a hash of the element's XPath
- Preserves only meaningful content

### Diff-Based Optimization

To reduce data transfer and token usage:
- First snapshot is always complete
- Subsequent snapshots only include changes (diffs)
- Automatic caching for performance

### Stealth Features

Browser instances are configured with:
- Custom user agent strings
- Disabled automation indicators
- WebGL vendor spoofing
- Canvas fingerprint protection

## Examples

### Creating and Navigating Pages

```javascript
// MCP Tool Usage
{
  "tool": "createPage",
  "arguments": {
    "name": "shopping",
    "description": "Amazon shopping page",
    "url": "https://amazon.com"
  }
}

// Returns: { pageId: "uuid", snapshot: "..." }
```

### Interacting with Elements

```javascript
// Click on element using its xp identifier
{
  "tool": "browserClick",
  "arguments": {
    "pageId": "uuid",
    "ref": "3fa2b8c1"  // The xp attribute value from snapshot
  }
}

// Type text into input field
{
  "tool": "browserType",
  "arguments": {
    "pageId": "uuid",
    "ref": "xp456",
    "text": "search query",
    "submit": true  // Press Enter after typing
  }
}
```

### Capturing Page State

```javascript
// Get semantic snapshot
{
  "tool": "getPageSnapshot",
  "arguments": {
    "pageId": "uuid"
  }
}

// Take screenshot
{
  "tool": "getScreenshot",
  "arguments": {
    "pageId": "uuid",
    "fullPage": true,
    "type": "png"
  }
}

// Save processed HTML to file
{
  "tool": "pageToHtmlFile",
  "arguments": {
    "pageId": "uuid",
    "trim": true  // Optional, default: true (removes redundant elements)
  }
}
// Returns: { filePath: "/tmp/page-abc123.html", fileSize: 12345, trimmed: true, ... }
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
better-playwright-mcp/
├── src/
│   ├── index.ts                 # MCP mode entry point
│   ├── server.ts                # HTTP server mode entry point
│   ├── playwright-mcp.ts        # MCP server implementation
│   ├── client/
│   │   └── playwright-client.ts # HTTP client for MCP→HTTP communication
│   ├── server/
│   │   └── playwright-server.ts # HTTP server controlling browsers
│   ├── extractor/
│   │   ├── parse2.ts           # HTML parsing with xp identifier generation
│   │   ├── simplify-html.ts    # HTML simplification
│   │   └── utils.ts            # Extraction utilities
│   └── utils/
│       └── token-limiter.ts    # Token counting and limiting
├── bin/
│   └── cli.js                  # CLI entry point
├── package.json
├── tsconfig.json
├── CLAUDE.md                   # Instructions for AI assistants
└── README.md
```

## Troubleshooting

### Common Issues

1. **MCP server not connecting**
   - Ensure the HTTP server is accessible on port 3102
   - Check firewall settings
   - Try running with `DEBUG=* npx better-playwright-mcp`

2. **Browser not launching**
   - Ensure Chrome or Chromium is installed
   - Try using `--chromium` flag
   - Check system resources

3. **Token limit exceeded**
   - Snapshots are automatically truncated to 20,000 tokens
   - Use targeted selectors to reduce snapshot size
   - Consider using screenshot instead of snapshot for visual inspection

### Debug Mode

Enable detailed logging:

```bash
DEBUG=* npx better-playwright-mcp
```

### Logs and Records

Operation records are saved to:
- macOS/Linux: `/tmp/playwright-records/`
- Windows: `%TEMP%\playwright-records\`

Each page has its own directory with timestamped operation logs.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT