import { memo } from 'react';
import type { ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CodeBlock } from './CodeBlock';
import { cn } from '../lib/utils';

const BOX_DRAWING_RE = /[┌┐└┘├┤┬┴┼─│╔╗╚╝╠╣╦╩╬═║▲▼◄►]/;

function nodeToText(node: ReactNode): string {
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(nodeToText).join('');
  if (node && typeof node === 'object' && 'props' in (node as object)) {
    const el = node as { props: { children?: ReactNode } };
    return el.props.children ? nodeToText(el.props.children) : '';
  }
  return '';
}

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export const MarkdownRenderer = memo(function MarkdownRenderer({
  content,
  className,
}: MarkdownRendererProps) {
  return (
    <div className={cn('prose prose-invert max-w-none', className)}>
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        code({ className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || '');
          const isInline = !match && !className;
          const code = String(children).replace(/\n$/, '');

          if (isInline) {
            return (
              <code
                className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono"
                {...props}
              >
                {children}
              </code>
            );
          }

          return (
            <CodeBlock
              code={code}
              language={match?.[1] || 'text'}
              className="my-4"
            />
          );
        },
        pre({ children }) {
          // The CodeBlock component handles the pre wrapper
          return <>{children}</>;
        },
        a({ href, children }) {
          return (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:underline"
            >
              {children}
            </a>
          );
        },
        table({ children }) {
          return (
            <div className="overflow-x-auto my-4">
              <table className="min-w-full divide-y divide-border">
                {children}
              </table>
            </div>
          );
        },
        th({ children }) {
          return (
            <th className="px-4 py-2 bg-muted text-left font-semibold">
              {children}
            </th>
          );
        },
        td({ children }) {
          return (
            <td className="px-4 py-2 border-t border-border">{children}</td>
          );
        },
        blockquote({ children }) {
          return (
            <blockquote className="border-l-4 border-accent/50 pl-4 italic text-muted-foreground my-4">
              {children}
            </blockquote>
          );
        },
        ul({ children }) {
          return <ul className="list-disc pl-6 my-2 space-y-1">{children}</ul>;
        },
        ol({ children }) {
          return <ol className="list-decimal pl-6 my-2 space-y-1">{children}</ol>;
        },
        h1({ children }) {
          return (
            <h1 className="text-2xl font-bold mt-6 mb-4 text-foreground">
              {children}
            </h1>
          );
        },
        h2({ children }) {
          return (
            <h2 className="text-xl font-bold mt-5 mb-3 text-foreground">
              {children}
            </h2>
          );
        },
        h3({ children }) {
          return (
            <h3 className="text-lg font-semibold mt-4 mb-2 text-foreground">
              {children}
            </h3>
          );
        },
        p({ children }) {
          if (BOX_DRAWING_RE.test(nodeToText(children))) {
            return (
              <pre className="font-mono text-sm whitespace-pre overflow-x-auto my-3 leading-relaxed">
                {children}
              </pre>
            );
          }
          return <p className="my-3 leading-relaxed">{children}</p>;
        },
        hr() {
          return <hr className="my-6 border-border" />;
        },
      }}
    >
      {content}
    </ReactMarkdown>
    </div>
  );
});
