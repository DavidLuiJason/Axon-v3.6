import { FormattedTraceback } from '../types';

/**
 * Formats errors into a clean, PyDroid-3 / Python style traceback
 * with highlighted line numbers and contextual snippet.
 */
export function formatPyDroidTraceback(
  error: any,
  code: string,
  language: 'javascript' | 'html' | 'json' = 'javascript'
): FormattedTraceback {
  const errorName = error?.name || (typeof error === 'string' ? 'ExecutionError' : 'RuntimeError');
  const errorMessage = error?.message || (typeof error === 'string' ? error : 'An unexpected execution error occurred.');
  const stack = error?.stack || '';

  let lineNumber: number | null = null;
  let columnNumber: number | null = null;

  // Attempt to parse line and column from error or stack
  if (typeof error?.lineNumber === 'number') {
    lineNumber = error.lineNumber;
  }
  if (typeof error?.columnNumber === 'number') {
    columnNumber = error.columnNumber;
  }

  // Parse stack trace if available
  if (!lineNumber && stack) {
    const stackMatch = stack.match(/(?:<anonymous>|eval|at\s+.*):(\d+):(\d+)/i) ||
      stack.match(/:(\d+):(\d+)\)?/);
    if (stackMatch) {
      lineNumber = parseInt(stackMatch[1], 10);
      columnNumber = parseInt(stackMatch[2], 10);
    }
  }

  // For JSON parse errors, extract line from syntax error message e.g. "at line 3 column 5"
  if (language === 'json' && !lineNumber && errorMessage) {
    const jsonMatch = errorMessage.match(/line\s+(\d+)\s+column\s+(\d+)/i) ||
      errorMessage.match(/position\s+(\d+)/i);
    if (jsonMatch && jsonMatch[1]) {
      if (errorMessage.includes('position')) {
        const pos = parseInt(jsonMatch[1], 10);
        const prefix = code.slice(0, pos);
        lineNumber = prefix.split('\n').length;
        columnNumber = pos - prefix.lastIndexOf('\n');
      } else {
        lineNumber = parseInt(jsonMatch[1], 10);
        columnNumber = jsonMatch[2] ? parseInt(jsonMatch[2], 10) : 1;
      }
    }
  }

  const fileName = language === 'javascript' ? 'main.js' : language === 'html' ? 'index.html' : 'data.json';

  // Build snippet with context lines
  const lines = code.split('\n');
  let snippet = '';

  if (lineNumber && lineNumber > 0 && lineNumber <= lines.length) {
    const targetIdx = lineNumber - 1;
    const startIdx = Math.max(0, targetIdx - 2);
    const endIdx = Math.min(lines.length - 1, targetIdx + 2);

    const snippetLines: string[] = [];
    for (let i = startIdx; i <= endIdx; i++) {
      const lineNumStr = String(i + 1).padStart(4, ' ');
      const isTarget = i === targetIdx;
      const marker = isTarget ? '>>' : '  ';
      snippetLines.push(`${marker} ${lineNumStr} | ${lines[i]}`);
      if (isTarget && columnNumber && columnNumber > 0) {
        const caretIndent = ' '.repeat(marker.length + 1 + lineNumStr.length + 3 + columnNumber - 1);
        snippetLines.push(`${caretIndent}^`);
      }
    }
    snippet = snippetLines.join('\n');
  } else if (lines.length > 0) {
    snippet = lines.slice(0, 5).map((l, i) => `   ${String(i + 1).padStart(4, ' ')} | ${l}`).join('\n');
  }

  // Build full PyDroid-3 formatted traceback string
  const fullTraceback = [
    `Traceback (most recent call last):`,
    `  File "${fileName}", line ${lineNumber ?? '?'}, in <module>`,
    snippet ? `\n${snippet}\n` : '',
    `${errorName}: ${errorMessage}`,
  ].filter(Boolean).join('\n');

  return {
    errorName,
    errorMessage,
    lineNumber,
    columnNumber,
    fileName,
    codeSnippet: snippet,
    fullTraceback,
  };
}
