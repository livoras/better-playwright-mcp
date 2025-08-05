declare module 'pretty' {
  interface PrettyOptions {
    indent_size?: number;
    wrap_line_length?: number;
    preserve_newlines?: boolean;
    unformatted?: string[];
  }
  
  function pretty(html: string, options?: PrettyOptions): string;
  export = pretty;
}