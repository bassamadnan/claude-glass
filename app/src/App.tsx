import { useState, useCallback, useEffect } from 'react';
import { FileUpload } from './components/FileUpload';
import { ConversationViewer } from './components/ConversationViewer';
import { parseSession } from './lib/logParser';
import type { ParsedSession } from './types';

// Dev preload: files in public/logs/ that get auto-loaded
const DEV_PRELOAD_FILES = [
  '/logs/d8a79d4a-282f-4642-8b60-f0bc8fe645e4.jsonl',
  '/logs/d8a79d4a-282f-4642-8b60-f0bc8fe645e4/subagents/agent-a17ddfe.jsonl',
  '/logs/d8a79d4a-282f-4642-8b60-f0bc8fe645e4/subagents/agent-a43e389.jsonl',
  '/logs/d8a79d4a-282f-4642-8b60-f0bc8fe645e4/subagents/agent-a96844f.jsonl',
  '/logs/d8a79d4a-282f-4642-8b60-f0bc8fe645e4/subagents/agent-a9f2ca8.jsonl',
  '/logs/d8a79d4a-282f-4642-8b60-f0bc8fe645e4/subagents/agent-ab73ab5.jsonl',
  '/logs/d8a79d4a-282f-4642-8b60-f0bc8fe645e4/subagents/agent-ac09963.jsonl',
  '/logs/d8a79d4a-282f-4642-8b60-f0bc8fe645e4/subagents/agent-ac48237.jsonl',
  '/logs/d8a79d4a-282f-4642-8b60-f0bc8fe645e4/subagents/agent-acompact-5e9929.jsonl',
  '/logs/d8a79d4a-282f-4642-8b60-f0bc8fe645e4/subagents/agent-acompact-c80039.jsonl',
  '/logs/d8a79d4a-282f-4642-8b60-f0bc8fe645e4/subagents/agent-af9b190.jsonl',
];

function App() {
  const [session, setSession] = useState<ParsedSession | null>(null);
  const [filename, setFilename] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Auto-load dev logs on mount
  useEffect(() => {
    if (import.meta.env.DEV) {
      setLoading(true);
      Promise.all(
        DEV_PRELOAD_FILES.map(path =>
          fetch(path)
            .then(r => r.ok ? r.text() : '')
            .catch(() => '')
        )
      ).then(contents => {
        const merged = contents.filter(Boolean).join('\n');
        if (merged) {
          try {
            const parsed = parseSession(merged);
            if (parsed.turns.length > 0) {
              setSession(parsed);
              setFilename('dev preload (d8a79d4a + subagents)');
            }
          } catch (e) {
            console.warn('Dev preload failed to parse:', e);
          }
        }
        setLoading(false);
      });
    }
  }, []);

  const handleFileLoad = useCallback((files: { content: string; filename: string }[]) => {
    try {
      setError(null);

      // Merge all file contents (JSONL files can just be concatenated)
      const mergedContent = files.map(f => f.content).join('\n');
      const fileNames = files.map(f => f.filename).join(', ');

      const parsed = parseSession(mergedContent);

      if (parsed.turns.length === 0) {
        setError('No conversation turns found in the log file(s)');
        return;
      }

      setSession(parsed);
      setFilename(files.length > 1 ? `${files.length} files: ${fileNames}` : fileNames);
    } catch (e) {
      console.error('Failed to parse session:', e);
      setError('Failed to parse the log file(s). Make sure they\'re valid Claude CLI session logs.');
    }
  }, []);

  const handleBack = useCallback(() => {
    setSession(null);
    setFilename('');
    setError(null);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <p className="text-muted-foreground">Loading dev logs...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <div className="max-w-md text-center">
          <div className="text-red-400 mb-4">
            <svg
              className="w-16 h-16 mx-auto"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <h2 className="text-xl font-semibold mb-2">Parse Error</h2>
          <p className="text-muted-foreground mb-4">{error}</p>
          <button
            onClick={handleBack}
            className="px-4 py-2 bg-accent text-accent-foreground rounded-lg hover:bg-accent/90 transition-colors"
          >
            Try Another File
          </button>
        </div>
      </div>
    );
  }

  if (session) {
    return (
      <ConversationViewer
        session={session}
        filename={filename}
        onBack={handleBack}
      />
    );
  }

  return <FileUpload onFileLoad={handleFileLoad} />;
}

export default App;
