import { useEffect, useState, memo } from 'react';
import { Copy, Check } from 'lucide-react';
import { cn } from '../lib/utils';
import { getHighlighter, SUPPORTED_LANGUAGES } from '../lib/highlighter';

interface CodeBlockProps {
  code: string;
  language?: string;
  filename?: string;
  className?: string;
  showLineNumbers?: boolean;
}

export const CodeBlock = memo(function CodeBlock({
  code,
  language = 'text',
  filename,
  className,
  showLineNumbers = false,
}: CodeBlockProps) {
  const [html, setHtml] = useState<string>('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let mounted = true;

    const highlight = async () => {
      try {
        const langMap: Record<string, string> = {
          sh: 'bash', shell: 'bash', zsh: 'bash',
          js: 'javascript', ts: 'typescript',
          py: 'python', rb: 'ruby', yml: 'yaml',
          md: 'markdown', rs: 'rust',
        };

        const resolved = langMap[language.toLowerCase()] || language.toLowerCase() || 'text';
        const lang = SUPPORTED_LANGUAGES.includes(resolved) ? resolved : 'text';

        const hl = await getHighlighter();
        const highlighted = hl.codeToHtml(code, { lang, theme: 'github-dark-default' });
        if (mounted) setHtml(highlighted);
      } catch (e) {
        if (mounted) setHtml(`<pre><code>${escapeHtml(code)}</code></pre>`);
      }
    };

    highlight();

    return () => {
      mounted = false;
    };
  }, [code, language]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={cn('relative group rounded-lg overflow-hidden', className)}>
      {filename && (
        <div className="bg-muted/80 px-4 py-2 text-xs text-muted-foreground border-b border-border font-mono">
          {filename}
        </div>
      )}
      <div className="relative">
        <button
          onClick={handleCopy}
          className="absolute right-2 top-2 p-2 rounded-md bg-muted/80 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-muted"
          title="Copy code"
        >
          {copied ? (
            <Check className="w-4 h-4 text-green-500" />
          ) : (
            <Copy className="w-4 h-4 text-muted-foreground" />
          )}
        </button>
        {html ? (
          <div
            className={cn(
              'shiki-container text-sm overflow-x-auto',
              showLineNumbers && 'line-numbers'
            )}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : (
          <pre className="bg-muted p-4 text-sm overflow-x-auto">
            <code>{code}</code>
          </pre>
        )}
      </div>
    </div>
  );
});

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
