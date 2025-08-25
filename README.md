# better-playwright-mcp2

A Playwright MCP (Model Context Protocol) server based on Microsoft's playwright-mcp with HTTP server architecture for browser automation.

## Features

- 🎭 Full Playwright browser automation via MCP
- 🏗️ Client-server architecture with HTTP API
- 📍 Ref-based element identification system (`[ref=e1]`, `[ref=e2]`, etc.)
- 💾 Persistent browser profiles with Chrome
- 🚀 Optimized for AI assistant integration
- 📄 Semantic HTML snapshots using Playwright's internal APIs

## Installation

### Global Installation (for CLI usage)
```bash
npm install -g better-playwright-mcp2
```

### Local Installation (for SDK usage)
```bash
npm install better-playwright-mcp2
```

## Usage

### As a JavaScript/TypeScript SDK

**Prerequisites:**
1. First, start the HTTP server:
   ```bash
   npx better-playwright-mcp2@latest server
   ```

2. Then use the SDK in your code:

```javascript
import { PlaywrightClient } from 'better-playwright-mcp2';

async function automateWebPage() {
  // Connect to the HTTP server (must be running)
  const client = new PlaywrightClient('http://localhost:3102');

  // Create a page
  const { pageId, snapshot } = await client.createPage(
    'my-page',        // page name
    'Test page',      // description
    'https://example.com'  // URL
  );

  // Get a semantic snapshot with ref identifiers
  const snapshot = await client.getSnapshot(pageId);
  console.log(snapshot);
  // Returns snapshot with refs like:
  // - generic [ref=e2]:
  //   - heading "Example Domain" [level=1] [ref=e3]
  //   - paragraph [ref=e4]: This domain is for use...

  // Interact with the page using ref identifiers
  await client.browserClick(pageId, 'e3');  // Click the heading
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
- **Interaction:** `browserClick`, `browserType`, `browserHover`, `browserSelectOption`
- **Advanced Actions:** `browserPressKey`, `browserFileUpload`, `browserHandleDialog`
- **Snapshots:** `getSnapshot`, `screenshot`
- **Scrolling:** `scrollToBottom`, `scrollToTop`
- **Waiting:** `waitForTimeout`, `waitForSelector`

### MCP Server Mode

The MCP server requires an HTTP server to be running. You need to start both:

**Step 1: Start the HTTP server**
```bash
npx better-playwright-mcp2@latest server
```

**Step 2: In another terminal, start the MCP server**
```bash
npx better-playwright-mcp2@latest
```

The MCP server will:
1. Start listening on stdio for MCP protocol messages
2. Connect to the HTTP server on port 3102
3. Route browser automation commands through the HTTP server

### Standalone HTTP Server Mode

You can run the HTTP server independently:

```bash
npx better-playwright-mcp2@latest server
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

### Snapshot & Utilities
- `getSnapshot` - Get semantic HTML snapshot with ref identifiers
- `screenshot` - Take a screenshot (PNG/JPEG)

## Architecture

This project implements a two-tier architecture:

1. **MCP Server** - Communicates with AI assistants via Model Context Protocol
2. **HTTP Server** - Runs in the background to control the actual browser instances

```
AI Assistant <--[MCP Protocol]--> MCP Server <--[HTTP]--> HTTP Server <---> Browser
```

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
const { pageId, snapshot } = await client.createPage(
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
better-playwright-mcp2/
├── src/
│   ├── index.ts                 # Main export file
│   ├── mcp-server.ts            # MCP server implementation
│   ├── client/
│   │   └── playwright-client.ts # HTTP client for browser automation
│   └── server/
│       └── playwright-server.ts # HTTP server controlling browsers
├── bin/
│   └── cli.js                  # CLI entry point
├── package.json
├── tsconfig.json
└── README.md
```

## Troubleshooting

### Common Issues

1. **Port already in use**
   - Change the port using `-p` flag: `npx better-playwright-mcp2 server -p 3103`
   - Or set environment variable: `PORT=3103 npx better-playwright-mcp2 server`

2. **Browser not launching**
   - Ensure Chrome or Chromium is installed
   - Try using `--chromium` flag for Chromium
   - Check system resources

3. **Element not found**
   - Verify the ref identifier in the snapshot
   - Use `getSnapshot()` to see current page structure
   - Wait for elements using `waitForSelector()`

### Debug Mode

Enable detailed logging:

```bash
DEBUG=* npx better-playwright-mcp2
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT