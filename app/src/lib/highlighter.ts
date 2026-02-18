import { createHighlighter, type Highlighter } from 'shiki';

// Only load languages we actually use — avoids loading 200+ grammars into memory
const SUPPORTED_LANGUAGES = [
  'bash', 'javascript', 'typescript', 'tsx', 'jsx',
  'python', 'ruby', 'yaml', 'markdown', 'json', 'jsonc',
  'cpp', 'c', 'sql', 'rust', 'go', 'html', 'css', 'text',
];

let highlighterPromise: Promise<Highlighter> | null = null;

export function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: ['github-dark-default'],
      langs: SUPPORTED_LANGUAGES,
    });
  }
  return highlighterPromise;
}

export { SUPPORTED_LANGUAGES };
