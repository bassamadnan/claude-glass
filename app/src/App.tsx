import { useState, useCallback, useEffect } from 'react';
import { Copy, Check, X } from 'lucide-react';
import { FileUpload } from './components/FileUpload';
import { ConversationViewer } from './components/ConversationViewer';
import { ProjectBrowser } from './components/ProjectBrowser';
import { parseSession } from './lib/logParser';
import { uploadSession, buildShareUrl } from './lib/shareApi';
import type { ParsedSession, ConversationTurn } from './types';

const WORKER_URL = import.meta.env.VITE_WORKER_URL ?? '';
const SHARE_ID_RE = /^\/s\/([a-f0-9]{12})$/;

// Dev preload: files in public/logs/ that get auto-loaded
const DEV_PRELOAD_FILES = [
  '/logs/d8a79d4a-282f-4642-8b60-f0bc8fe645e4.jsonl',
  '/logs/d8a79d4a-282f-4642-8b60-f0bc8fe645e4/subagents/agent-a9f2ca8.jsonl',
  '/logs/d8a79d4a-282f-4642-8b60-f0bc8fe645e4/subagents/agent-ab73ab5.jsonl',
  '/logs/d8a79d4a-282f-4642-8b60-f0bc8fe645e4/subagents/agent-acompact-5e9929.jsonl',
  '/logs/d8a79d4a-282f-4642-8b60-f0bc8fe645e4/subagents/agent-acompact-c80039.jsonl',
  '/logs/d8a79d4a-282f-4642-8b60-f0bc8fe645e4/subagents/agent-af9b190.jsonl',
];

interface ShareState {
  url: string;
  copied: boolean;
}

function App() {
  const [session, setSession] = useState<ParsedSession | null>(null);
  const [rawContent, setRawContent] = useState<string>('');
  const [filename, setFilename] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [browserOpen, setBrowserOpen] = useState(false);
  const [shareState, setShareState] = useState<ShareState | null>(null);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  // UUID of the turn to scroll to on load (from ?from= param)
  const [isShared, setIsShared] = useState(false);

  // Load shared session from Worker if URL is /s/:id
  useEffect(() => {
    const match = window.location.pathname.match(SHARE_ID_RE);
    if (!match) return;
    setIsShared(true);
    const id = match[1];
    setLoading(true);
    fetch(`${WORKER_URL}/s/${id}`)
      .then(r => {
        if (!r.ok) throw new Error(`Session not found (${r.status})`);
        return r.text();
      })
      .then(content => {
        const parsed = parseSession(content);
        if (parsed.turns.length === 0) throw new Error('No turns found in session');
        setSession(parsed);
        setRawContent(content);
        setFilename(`Shared session · ${id}`);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

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
              setRawContent(merged);
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

  const handleFileLoad = useCallback((files: { content: string; filename: string }[], displayName?: string) => {
    try {
      setError(null);
      const mergedContent = files.map(f => f.content).join('\n');
      const fileNames = files.map(f => f.filename).join(', ');
      const parsed = parseSession(mergedContent);
      if (parsed.turns.length === 0) {
        setError('No conversation turns found in the log file(s)');
        return;
      }
      setSession(parsed);
      setRawContent(mergedContent);
      setFilename(displayName || (files.length > 1 ? `${files.length} files: ${fileNames}` : fileNames));
    } catch (e) {
      console.error('Failed to parse session:', e);
      setError('Failed to parse the log file(s). Make sure they\'re valid Claude CLI session logs.');
    }
  }, []);

  const handleBack = useCallback(() => {
    setSession(null);
    setRawContent('');
    setFilename('');
    setError(null);
    setShareState(null);
    setShareError(null);
    // Clear /s/:id from URL if we navigated back
    if (window.location.pathname.match(SHARE_ID_RE)) {
      window.history.pushState({}, '', '/');
    }
  }, []);

  const handleBrowserSelect = useCallback((files: { content: string; filename: string }[], displayName?: string) => {
    setBrowserOpen(false);
    handleFileLoad(files, displayName);
  }, [handleFileLoad]);

  const handleShareFromTurn = useCallback(async (turn: ConversationTurn) => {
    if (!rawContent) return;
    setShareLoading(true);
    setShareError(null);
    try {
      const lines = rawContent.split('\n').filter(Boolean);
      const startIdx = lines.findIndex(line => {
        try { return (JSON.parse(line) as { uuid?: string }).uuid === turn.id; }
        catch { return false; }
      });
      const trimmed = startIdx >= 0 ? lines.slice(startIdx).join('\n') : rawContent;
      const id = await uploadSession(trimmed);
      const url = buildShareUrl(id);
      setShareState({ url, copied: false });
    } catch (e) {
      setShareError((e as Error).message);
    } finally {
      setShareLoading(false);
    }
  }, [rawContent]);

  const handleCopyShareUrl = useCallback(() => {
    if (!shareState) return;
    navigator.clipboard.writeText(shareState.url).then(() => {
      setShareState(prev => prev ? { ...prev, copied: true } : null);
      setTimeout(() => setShareState(prev => prev ? { ...prev, copied: false } : null), 2000);
    });
  }, [shareState]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <p className="text-muted-foreground">Loading session...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <div className="max-w-md text-center">
          <div className="text-red-400 mb-4">
            <svg className="w-16 h-16 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold mb-2">Error</h2>
          <p className="text-muted-foreground mb-4">{error}</p>
          <button onClick={handleBack}
            className="px-4 py-2 bg-accent text-accent-foreground rounded-lg hover:bg-accent/90 transition-colors">
            Go back
          </button>
        </div>
      </div>
    );
  }

  if (session) {
    return (
      <>
        <ConversationViewer
          session={session}
          filename={filename}
          onBack={handleBack}
          onOpenBrowser={isShared ? undefined : () => setBrowserOpen(true)}
          onShareFromTurn={isShared ? undefined : handleShareFromTurn}
          shareLoading={shareLoading}
          isShared={isShared}
        />
        <ProjectBrowser
          isOpen={browserOpen}
          onClose={() => setBrowserOpen(false)}
          onSessionSelect={handleBrowserSelect}
        />

        {/* Share error toast */}
        {shareError && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 flex items-center gap-3 shadow-lg z-50">
            <span className="text-red-400 text-sm">{shareError}</span>
            <button onClick={() => setShareError(null)}>
              <X className="w-4 h-4 text-red-400" />
            </button>
          </div>
        )}

        {/* Share URL dialog */}
        {shareState && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-background border border-border rounded-xl shadow-2xl p-6 w-full max-w-lg">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold">Share link ready</h2>
                <button onClick={() => setShareState(null)} className="p-1 rounded hover:bg-muted transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-sm text-muted-foreground mb-3">
                Anyone with this link can view the session from this point onward.
              </p>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={shareState.url}
                  className="flex-1 bg-muted rounded-lg px-3 py-2 text-sm font-mono truncate outline-none"
                  onFocus={e => e.target.select()}
                />
                <button
                  onClick={handleCopyShareUrl}
                  className="flex items-center gap-1.5 px-3 py-2 bg-accent text-accent-foreground rounded-lg hover:bg-accent/90 transition-colors text-sm font-medium shrink-0"
                >
                  {shareState.copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {shareState.copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <FileUpload onFileLoad={handleFileLoad} onOpenBrowser={() => setBrowserOpen(true)} />
      <ProjectBrowser
        isOpen={browserOpen}
        onClose={() => setBrowserOpen(false)}
        onSessionSelect={handleBrowserSelect}
      />
    </>
  );
}

export default App;
