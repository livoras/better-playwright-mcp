/**
 * Grep search options for snapshot searching
 */
export interface GrepOptions {
  /**
   * The pattern to search for. Supports regular expressions including | for OR
   */
  pattern: string;
  
  /**
   * Whether to ignore case when matching
   * @default false
   */
  ignoreCase?: boolean;
  
  /**
   * Maximum number of lines to return (1-100, default 100)
   * @default 100
   */
  lineLimit?: number;
}

/**
 * Grep search response
 */
export interface GrepResponse {
  /**
   * The search results as a string
   */
  result: string;
  
  /**
   * Number of matches found
   */
  matchCount?: number;
  
  /**
   * Whether the results were truncated due to line limit
   */
  truncated?: boolean;
}