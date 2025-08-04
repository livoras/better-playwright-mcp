# better-playwright-mcp

A better Playwright MCP (Model Context Protocol) server with built-in HTTP server support.

## Features

- 🎭 Full Playwright browser automation
- 🔌 MCP protocol support for AI assistants
- 🌐 Built-in HTTP server mode
- 🛡️ Stealth mode to avoid detection
- 📸 Intelligent page snapshots with semantic HTML
- 💾 Persistent browser profiles
- 🎯 Simple and focused API

## Installation

```bash
npm install -g better-playwright-mcp
```

## Usage

### MCP Mode (Default)

Start the MCP server for use with AI assistants:

```bash
npx better-playwright-mcp
```

Options:
- `--snapshot-dir <path>` - Directory to save snapshots

### HTTP Server Mode

Start as a standalone HTTP server:

```bash
npx better-playwright-mcp server
```

Options:
- `-p, --port <number>` - Server port (default: 3002)
- `--host <string>` - Server host (default: localhost)
- `--headless` - Run browser in headless mode
- `--chromium` - Use Chromium instead of Chrome
- `--no-user-profile` - Do not use persistent user profile
- `--user-data-dir <path>` - User data directory
- `--snapshot-dir <path>` - Directory to save snapshots

### Examples

```bash
# Start MCP server with custom snapshot directory
npx better-playwright-mcp --snapshot-dir ./snapshots

# Start HTTP server on port 8080
npx better-playwright-mcp server --port 8080

# Start HTTP server with headless Chromium
npx better-playwright-mcp server --headless --chromium

# Start with custom user data directory
npx better-playwright-mcp server --user-data-dir ~/.my-browser-data
```

## MCP Tools

When used in MCP mode, the following tools are available:

### Page Management
- `createPage` - Create a new browser page
- `closePage` - Close a specific page
- `listPages` - List all managed pages
- `closeAllPages` - Close all pages

### Browser Actions
- `browserClick` - Click an element
- `browserType` - Type text into an element
- `browserNavigate` - Navigate to a URL
- `browserNavigateBack` - Go back to previous page
- `browserNavigateForward` - Go forward to next page
- `scrollToBottom` - Scroll to bottom of page/element
- `scrollToTop` - Scroll to top of page/element

### Utilities
- `getPageSnapshot` - Get semantic HTML snapshot
- `getScreenshot` - Take a screenshot
- `downloadImage` - Download image from URL
- `captureSnapshot` - Capture full page with scrolling

## License

MIT