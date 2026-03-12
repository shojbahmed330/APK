export function minifyCodeForAI(code: string, filePath: string): string {
  if (!code) return code;
  
  const ext = filePath.split('.').pop()?.toLowerCase();
  
  // JSON minification
  if (ext === 'json') {
    try {
      return JSON.stringify(JSON.parse(code));
    } catch (e) {
      return code; // Fallback if invalid JSON
    }
  }

  const minifiableExts = ['ts', 'tsx', 'js', 'jsx', 'css', 'html'];
  
  if (!ext || !minifiableExts.includes(ext)) {
    return code;
  }

  let minified = code;

  // Remove multi-line comments (/* ... */)
  minified = minified.replace(/\/\*[\s\S]*?\*\//g, '');

  const lines = minified.split('\n');
  const processedLines = [];
  
  for (let line of lines) {
    const trimmed = line.trim();
    
    // Skip empty lines
    if (!trimmed) continue;
    
    // Remove full-line single-line comments
    if (trimmed.startsWith('//')) continue;
    
    // Keep original indentation because LLMs perform better with properly indented code
    // but remove trailing spaces
    processedLines.push(line.trimEnd());
  }
  
  return processedLines.join('\n');
}
