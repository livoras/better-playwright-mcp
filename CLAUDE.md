# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build and Development Commands

```bash
# Build the TypeScript project
npm run build

# Watch mode for development
npm run dev

# Start the compiled application
npm run start
```

## Architecture Overview

### Core Components

1. **MCP Server Mode** (`src/playwright-mcp.ts`)
   - Implements Model Context Protocol for AI assistants
   - Registers tools for browser automation through MCP SDK
   - Uses StdioServerTransport for communication
   - Handles snapshot responses with token limiting (20,000 tokens)

2. **HTTP Server Mode** (`src/server/playwright-server.ts`)
   - Express-based REST API server
   - Manages browser instances and page lifecycle
   - Implements stealth mode to avoid detection
   - Supports persistent browser profiles
   - Handles page snapshots with diff-based optimization

3. **Client Library** (`src/client/playwright-client.ts`)
   - HTTP client for communicating with the server
   - Manages operation counters and snapshot caching
   - Provides typed API methods for all browser operations

4. **CLI Entry Point** (`bin/cli.js`)
   - Commander-based CLI with two modes: `mcp` (default) and `server`
   - Handles environment variable configuration
   - Spawns appropriate Node.js process based on mode

### Key Design Patterns

1. **Snapshot System**
   - Uses semantic HTML extraction with XPath references (`src/extractor/parse2.ts`)
   - Implements diff-based snapshots to reduce data transfer
   - Token limiting to stay within AI context limits
   - Caches snapshots for performance

2. **Page Management**
   - Each page has unique ID and metadata
   - Active page tracking for multi-page scenarios
   - Automatic cleanup of unmanaged pages

3. **Browser Configuration**
   - Stealth mode with custom user agent and disabled automation features
   - Optional persistent user profiles
   - Choice between Chrome and Chromium

## TypeScript Configuration

- Target: ES2022 with ESNext modules
- Strict mode enabled
- Source maps and declarations generated
- No `.js` extensions in import statements (per user instructions)

## Key Dependencies

- `playwright`: Browser automation
- `@modelcontextprotocol/sdk`: MCP protocol implementation
- `express`: HTTP server
- `cheerio`: HTML parsing and manipulation
- `@anthropic-ai/tokenizer`: Token counting for context limits

## Environment Variables

- `PORT`: HTTP server port (default: 3102)
- `HEADLESS`: Run browser in headless mode
- `CHROMIUM`: Use Chromium instead of Chrome
- `NO_USER_PROFILE`: Disable persistent user profile
- `USER_DATA_DIR`: Custom user data directory
- `SNAPSHOT_DIR`: Directory for saving snapshots