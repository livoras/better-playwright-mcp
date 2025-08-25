#!/usr/bin/env node

import { program } from 'commander';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJson = JSON.parse(fs.readFileSync(join(__dirname, '..', 'package.json'), 'utf8'));

program
  .name('better-playwright-mcp2')
  .description('Better Playwright MCP v2 - Based on Microsoft\'s playwright-mcp with HTTP server')
  .version(packageJson.version);

// MCP 模式（默认）
program
  .command('mcp', { isDefault: true })
  .description('Start MCP server (stdio mode)')
  .option('--snapshot-dir <path>', 'directory to save snapshots')
  .action((options) => {
    const args = ['dist/mcp-server.js'];
    
    if (options.snapshotDir) {
      process.env.SNAPSHOT_DIR = options.snapshotDir;
    }
    
    const child = spawn('node', args, {
      stdio: 'inherit',
      cwd: join(__dirname, '..'),
      env: { ...process.env }
    });
    
    child.on('error', (err) => {
      console.error('Failed to start MCP server:', err);
      process.exit(1);
    });
    
    child.on('exit', (code) => {
      process.exit(code || 0);
    });
  });

// HTTP 服务器模式
program
  .command('server')
  .description('Start HTTP server')
  .option('-p, --port <number>', 'server port', '3102')
  .option('--host <string>', 'server host', 'localhost')
  .option('--headless', 'run browser in headless mode')
  .option('--chromium', 'use Chromium instead of Chrome')
  .option('--no-user-profile', 'do not use persistent user profile')
  .option('--user-data-dir <path>', 'user data directory')
  .option('--snapshot-dir <path>', 'directory to save snapshots')
  .action((options) => {
    const args = ['dist/server/playwright-server.js'];
    
    // 设置环境变量
    process.env.SERVER_MODE = 'true';
    process.env.PORT = options.port;
    process.env.HOST = options.host;
    
    if (options.headless) process.env.HEADLESS = 'true';
    if (options.chromium) process.env.CHROMIUM = 'true';
    if (!options.userProfile) process.env.NO_USER_PROFILE = 'true';
    if (options.userDataDir) process.env.USER_DATA_DIR = options.userDataDir;
    if (options.snapshotDir) process.env.SNAPSHOT_DIR = options.snapshotDir;
    
    const child = spawn('node', args, {
      stdio: 'inherit',
      cwd: join(__dirname, '..'),
      env: { ...process.env }
    });
    
    child.on('error', (err) => {
      console.error('Failed to start HTTP server:', err);
      process.exit(1);
    });
    
    child.on('exit', (code) => {
      process.exit(code || 0);
    });
  });

program.parse();