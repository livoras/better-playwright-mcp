# better-playwright-mcp

A better Playwright MCP (Model Context Protocol) server that uses a client-server architecture for browser automation.

## Why Better?

**better-playwright-mcp** provides a clean, straightforward browser automation solution using standard CSS selectors and XPath expressions. It focuses on simplicity and reliability without unnecessary complexity.

### Key Features
- **Standard Selectors** - Use any CSS selector or XPath expression directly
- **No Special Markup** - Works with any website without requiring custom attributes
- **Clean Architecture** - Separation of MCP protocol handling and browser control
- **Full Playwright Power** - Access to all Playwright capabilities through a simple API

## Architecture

This project implements a unique two-tier architecture:

1. **MCP Server** - Communicates with AI assistants via Model Context Protocol
2. **HTTP Server** - Runs in the background to control the actual browser instances

```
AI Assistant <--[MCP Protocol]--> MCP Server <--[HTTP]--> HTTP Server <---> Browser
```

This design allows the MCP server to remain lightweight while delegating browser control to a dedicated HTTP service.

## Features

- 🎯 **Standard CSS/XPath selectors** - Use familiar web selectors
- 🎭 Full Playwright browser automation via MCP
- 🏗️ Client-server architecture for better separation of concerns
- 🛡️ Stealth mode to avoid detection
- 💾 Persistent browser profiles
- 🚀 Optimized for long-running automation tasks
- 📄 Save raw HTML to files for external processing
- 🌐 Works with any website out of the box

## Breaking Changes in v0.3.0

**This version includes significant breaking changes:**

1. **Selector System Changed**: 
   - Old: Used custom `xp` attributes (e.g., `ref: "3fa2b8c1"`)
   - New: Uses standard CSS/XPath selectors (e.g., `selector: "#button"`)

2. **API Parameter Changes**:
   - All methods now use `selector` instead of `ref` parameter
   - Example: `browserClick(pageId, selector)` instead of `browserClick(pageId, ref)`

3. **Removed Features**:
   - No more semantic snapshots with `xp` identifiers
   - Removed `getPageSnapshot()`, `getAccessibilitySnapshot()`, `getScreenshot()`, `getPDFSnapshot()`
   - Removed HTML parsing and simplification
   - `pageToHtmlFile()` now only saves raw HTML (no processing)

4. **Simplified Architecture**:
   - Removed `/src/extractor/` and `/src/utils/` directories
   - No token limiting or HTML optimization
   - Direct pass-through of selectors to Playwright

If you're upgrading from v0.2.x, you'll need to update all your selector references to use standard CSS or XPath selectors.

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

  // Save the HTML to a file
  const result = await client.pageToHtmlFile(pageId);
  console.log('HTML saved to:', result.filePath);
  // Returns: { filePath: "/tmp/page-abc123.html", fileSize: 12345, ... }

  // Interact with the page using standard selectors
  await client.browserClick(pageId, 'h1');  // Click the h1 element
  await client.browserClick(pageId, '#submit-button');  // Click by ID
  await client.browserClick(pageId, '.btn-primary');  // Click by class
  await client.browserType(pageId, 'input[name="search"]', 'Hello World', true);  // Type and submit
  await client.browserClick(pageId, '//button[text()="Submit"]');  // XPath selector

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
- Utilities: `getElementHTML`, `pageToHtmlFile`, `downloadImage`
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
- `browserClick` - Click an element using CSS selector or XPath
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

### Utilities
- `getElementHTML` - Get HTML of specific element
- `pageToHtmlFile` - Save page HTML to temporary file
- `downloadImage` - Download image from URL

## How It Works

### Direct Selector Usage

The server accepts standard CSS selectors and XPath expressions:

```javascript
// CSS Selectors
await client.browserClick(pageId, '#submit-button');  // ID
await client.browserClick(pageId, '.btn-primary');    // Class
await client.browserClick(pageId, 'button[type="submit"]');  // Attribute

// XPath
await client.browserClick(pageId, '//button[text()="Click me"]');
await client.browserClick(pageId, '//div[@class="container"]//button');
```

No special markup or preprocessing needed - works directly with any website's HTML.

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
// Click on element using CSS selector
{
  "tool": "browserClick",
  "arguments": {
    "pageId": "uuid",
    "selector": "#submit-button"  // CSS selector
  }
}

// Type text into input field
{
  "tool": "browserType",
  "arguments": {
    "pageId": "uuid",
    "selector": "input[name='search']",
    "text": "search query",
    "submit": true  // Press Enter after typing
  }
}
```

### Capturing Page State

```javascript
// Save HTML to file
{
  "tool": "pageToHtmlFile",
  "arguments": {
    "pageId": "uuid"
  }
}
// Returns: { filePath: "/tmp/page-abc123.html", fileSize: 12345, ... }

// Get element HTML
{
  "tool": "getElementHTML",
  "arguments": {
    "pageId": "uuid",
    "selector": ".content-area"
  }
}
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
│   └── server/
│       └── playwright-server.ts # HTTP server controlling browsers
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

3. **Elements not found**
   - Ensure your selectors are correct
   - Try using more specific selectors
   - Use browser DevTools to verify selector matches

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