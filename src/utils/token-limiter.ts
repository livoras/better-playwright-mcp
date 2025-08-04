// Simple token counting approximation
// For more accurate counting, consider using a proper tokenizer library

/**
 * Approximate token count (roughly 4 characters per token)
 */
function approximateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}

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
  const tokenCount = approximateTokenCount(text);
  
  if (tokenCount <= maxTokens) {
    return text;
  }
  
  // Estimate character count for max tokens
  const targetChars = maxTokens * 4;
  
  // Truncate at word boundary if possible
  let truncated = text.substring(0, targetChars);
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > targetChars * 0.8) {
    truncated = truncated.substring(0, lastSpace);
  }
  
  const truncationMessage = `\n...[snapshot truncated, original ~${tokenCount} tokens exceeded ${maxTokens} limit]`;
  return truncated + truncationMessage;
}