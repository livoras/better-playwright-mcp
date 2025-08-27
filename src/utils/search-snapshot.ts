/**
 * Search utility for searching snapshot content using ripgrep
 */

import { rgPath } from '@vscode/ripgrep';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { SearchOptions, SearchResponse } from '../types/search.js';

/**
 * Search snapshot content using ripgrep with regular expression support
 * @param snapshot - The snapshot content to search
 * @param options - Search options including pattern, ignoreCase, and lineLimit
 * @returns SearchResponse with results, match count, and truncation status
 */
export function searchSnapshot(snapshot: string, options: SearchOptions): SearchResponse {
  // Create temporary file for snapshot
  const tmpDir = os.tmpdir();
  const tmpFile = path.join(tmpDir, `snapshot-${Date.now()}-${Math.random().toString(36).substring(7)}.txt`);
  
  try {
    // Write snapshot to temporary file
    fs.writeFileSync(tmpFile, snapshot, 'utf8');
    
    // Build ripgrep command - extremely simple
    let rgFlags: string[] = [];
    
    // Handle case insensitive flag
    if (options.ignoreCase) {
      rgFlags.push('-i');
    }
    
    // Pattern as regex (ripgrep default)
    rgFlags.push('-e', options.pattern);
    
    // Add the file to search
    rgFlags.push(tmpFile);
    
    // Build command with proper escaping
    const args = rgFlags.map(arg => {
      // Escape shell special characters
      if (arg.includes(' ') || arg.includes('"') || arg.includes("'") || 
          arg.includes('|') || arg.includes('$') || arg.includes('`') ||
          arg.includes('\\') || arg.includes('*') || arg.includes('?')) {
        // Escape backslashes and quotes for shell
        const escaped = arg
          .replace(/\\/g, '\\\\')  // Escape backslashes first
          .replace(/"/g, '\\"')    // Then escape quotes
          .replace(/\$/g, '\\$');  // Escape dollar signs
        return `"${escaped}"`;
      }
      return arg;
    }).join(' ');
    
    const command = `"${rgPath}" ${args}`;
    
    // Debug: Log the command (remove in production)
    // console.log('Command:', command);
    
    try {
      // Execute ripgrep
      const result = execSync(command, { 
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024 // 10MB buffer
      });
      
      // Handle line limit (hard cap at 100)
      const lines = result.split('\n').filter(line => line.length > 0);
      const maxAllowed = 100;
      const effectiveLimit = Math.min(options.lineLimit || maxAllowed, maxAllowed);
      
      if (lines.length > effectiveLimit) {
        // Truncate and add indicator
        const truncatedLines = lines.slice(0, effectiveLimit);
        const remaining = lines.length - effectiveLimit;
        truncatedLines.push(`<...${remaining} more results...>`);
        
        return {
          result: truncatedLines.join('\n'),
          matchCount: lines.length, // Total actual matches
          truncated: true
        };
      }
      
      return {
        result: result.trimEnd(),
        matchCount: lines.length,
        truncated: false
      };
    } catch (error: any) {
      // ripgrep exits with code 1 when no matches found
      if (error.status === 1) {
        return {
          result: '',
          matchCount: 0,
          truncated: false
        };
      }
      throw error;
    }
  } finally {
    // Clean up temporary file
    try {
      fs.unlinkSync(tmpFile);
    } catch (e) {
      // Ignore cleanup errors
    }
  }
}