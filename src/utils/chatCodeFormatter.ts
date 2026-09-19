export interface ChatCodeFormatResult {
  displayText: string;
  detectedCode?: string;
  detectedLang: 'javascript' | 'html' | 'json';
  hasBuildRunResult?: boolean;
  showFullCodeInChat?: boolean;
}

/**
 * Parses response text to extract any code blocks and format conversational text.
 */
export function formatChatCodeResponse(
  rawText: string,
  userPrompt: string = ''
): ChatCodeFormatResult {
  if (!rawText) {
    return {
      displayText: '',
      detectedLang: 'javascript',
    };
  }

  // Check if user explicitly requested to view full code in chat
  const promptLower = userPrompt.toLowerCase();
  const showFullCodeInChat =
    promptLower.includes('show code in chat') ||
    promptLower.includes('print code here') ||
    promptLower.includes('in chat') ||
    promptLower.includes('display code');

  // Match markdown code blocks: ```(lang)?\n(code)\n```
  const codeBlockRegex = /```([a-zA-Z0-9_-]+)?\s*([\s\S]*?)```/g;
  let match: RegExpExecArray | null = null;
  let detectedCode: string | undefined = undefined;
  let detectedLang: 'javascript' | 'html' | 'json' = 'javascript';

  // Find the most substantial code block
  let longestCode = '';
  let chosenLang: 'javascript' | 'html' | 'json' = 'javascript';

  while ((match = codeBlockRegex.exec(rawText)) !== null) {
    const rawLang = (match[1] || '').toLowerCase().trim();
    const codeBody = match[2] || '';

    if (codeBody.trim().length > longestCode.length) {
      longestCode = codeBody.trim();

      if (rawLang === 'html' || rawLang === 'htm' || rawLang === 'xml' || codeBody.includes('<!DOCTYPE') || codeBody.includes('<html')) {
        chosenLang = 'html';
      } else if (rawLang === 'json') {
        chosenLang = 'json';
      } else {
        chosenLang = 'javascript';
      }
    }
  }

  if (longestCode) {
    detectedCode = longestCode;
    detectedLang = chosenLang;
  }

  return {
    displayText: rawText,
    detectedCode,
    detectedLang,
    hasBuildRunResult: !!detectedCode,
    showFullCodeInChat,
  };
}
