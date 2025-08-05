import { countTokens } from '@anthropic-ai/tokenizer';

/**
 * Truncate text to fit within a token limit
 * @param text - The text to truncate
 * @param maxTokens - Maximum number of tokens allowed
 * @returns The truncated text with truncation message if needed
 */
export function truncateByTokens(
  text: string,
  maxTokens: number = 23000
): string {
  const tokenCount = countTokens(text);
  
  if (tokenCount <= maxTokens) {
    return text;
  }
  
  // Binary search to find the right truncation point
  let left = 0;
  let right = text.length;
  let result = '';
  
  while (left < right) {
    const mid = Math.floor((left + right + 1) / 2);
    const candidate = text.substring(0, mid);
    const candidateTokens = countTokens(candidate);
    
    if (candidateTokens <= maxTokens) {
      result = candidate;
      left = mid;
    } else {
      right = mid - 1;
    }
  }
  
  const truncationMessage = `\n...[snapshot truncated, original ${tokenCount} tokens exceeded ${maxTokens} limit]`;
  return result + truncationMessage;
}