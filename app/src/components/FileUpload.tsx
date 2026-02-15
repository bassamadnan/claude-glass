import { useCallback, useState } from 'react';
import { Upload, FileText, X, FolderOpen } from 'lucide-react';
import { cn } from '../lib/utils';

interface FileUploadProps {
  onFileLoad: (files: { content: string; filename: string }[]) => void;
}

export function FileUpload({ onFileLoad }: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');

  const handleFiles = useCallback(
    (files: FileList) => {
      setError(null);

      const fileArray = Array.from(files);

      // Validate all files
      for (const file of fileArray) {
        if (!file.name.endsWith('.jsonl') && !file.name.endsWith('.json')) {
          setError('Please upload only .jsonl or .json files');
          return;
        }
      }

      // Read all files
      const promises = fileArray.map((file) => {
        return new Promise<{ content: string; filename: string }>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            const content = e.target?.result as string;
            resolve({ content, filename: file.name });
          };
          reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
          reader.readAsText(file);
        });
      });

      Promise.all(promises)
        .then((results) => {
          onFileLoad(results);
        })
        .catch((err) => {
          setError(err.message || 'Failed to read files');
        });
    },
    [onFileLoad]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      if (e.dataTransfer.files.length > 0) {
        handleFiles(e.dataTransfer.files);
      }
    },
    [handleFiles]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        handleFiles(e.target.files);
      }
    },
    [handleFiles]
  );

  // Auto-load with directory picker
  const handleAutoLoad = useCallback(async () => {
    try {
      setError(null);
      setLoading(true);
      setLoadingMessage('Opening directory picker...');

      // Check if File System Access API is supported
      if (!('showDirectoryPicker' in window)) {
        setError('Directory picker not supported in this browser. Use Chrome/Edge or manually select multiple files.');
        setLoading(false);
        return;
      }

      // Let user select the logs directory
      const dirHandle = await (window as any).showDirectoryPicker({
        mode: 'read',
      });

      setLoadingMessage('Scanning directory...');

      // Read all .jsonl files in the directory
      const files: { content: string; filename: string }[] = [];
      for await (const entry of (dirHandle as any).values()) {
        if (entry.kind === 'file' && (entry.name.endsWith('.jsonl') || entry.name.endsWith('.json'))) {
          const file = await entry.getFile();
          const content = await file.text();
          files.push({ content, filename: entry.name });
        }
      }

      setLoadingMessage(`Found ${files.length} log files. Loading...`);

      if (files.length === 0) {
        setError('No .jsonl files found in the selected directory');
        setLoading(false);
        return;
      }

      // Load all files
      onFileLoad(files);
      setLoading(false);
    } catch (err: any) {
      if (err.name === 'AbortError') {
        // User cancelled
        setLoading(false);
        return;
      }
      console.error('Failed to auto-load:', err);
      setError(err.message || 'Failed to load directory');
      setLoading(false);
    }
  }, [onFileLoad]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-8">
      <div className="max-w-2xl w-full">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-accent to-blue-400 bg-clip-text text-transparent">
            Claude Glass
          </h1>
          <p className="text-muted-foreground">
            A viewer for Claude CLI session logs
          </p>
        </div>

        <label
          className={cn(
            'relative flex flex-col items-center justify-center w-full h-64 border-2 border-dashed rounded-xl cursor-pointer transition-all duration-200',
            isDragging
              ? 'border-accent bg-accent/10 scale-[1.02]'
              : 'border-border hover:border-muted-foreground hover:bg-muted/50',
            error && 'border-red-500'
          )}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          <input
            type="file"
            accept=".jsonl,.json"
            multiple
            onChange={handleInputChange}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />

          <div className="flex flex-col items-center justify-center p-6 text-center">
            {isDragging ? (
              <>
                <FileText className="w-12 h-12 mb-4 text-accent animate-pulse" />
                <p className="text-lg font-medium text-accent">
                  Drop your log file here
                </p>
              </>
            ) : (
              <>
                <Upload className="w-12 h-12 mb-4 text-muted-foreground" />
                <p className="text-lg font-medium mb-2">
                  Drag & drop your .jsonl log file(s)
                </p>
                <p className="text-sm text-muted-foreground">
                  or click to browse
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  Upload multiple files to merge parent + sub-agent logs
                </p>
              </>
            )}
          </div>
        </label>

        {/* Auto-load button */}
        <div className="mt-4">
          <button
            onClick={handleAutoLoad}
            disabled={loading}
            className="w-full px-4 py-3 bg-accent/10 hover:bg-accent/20 border border-accent/30 rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FolderOpen className="w-5 h-5 text-accent" />
            <span className="text-accent font-medium">
              {loading ? loadingMessage : 'Auto-load from directory (includes sub-agents)'}
            </span>
          </button>
          <p className="text-xs text-muted-foreground text-center mt-2">
            Select your logs directory to auto-load all related files
          </p>
        </div>

        {error && (
          <div className="mt-4 p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-3">
            <X className="w-5 h-5 text-red-500 flex-shrink-0" />
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        <div className="mt-8 p-6 bg-card rounded-xl border border-border">
          <h3 className="font-medium mb-3 flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Finding your log files
          </h3>
          <p className="text-sm text-muted-foreground mb-3">
            Claude CLI stores session logs in:
          </p>
          <code className="block text-sm bg-muted p-3 rounded-lg text-accent mb-3">
            ~/.claude/projects/-home-&lt;user&gt;-&lt;path&gt;/
          </code>
          <div className="text-xs text-muted-foreground space-y-1 mb-3">
            <div>• Main session: <code className="text-accent">&lt;session-id&gt;.jsonl</code></div>
            <div>• Sub-agents: <code className="text-accent">agent-&lt;agent-id&gt;.jsonl</code></div>
          </div>
          <p className="text-xs text-muted-foreground">
            💡 Tip: Use "Auto-load from directory" above to load the main session + all sub-agent logs automatically!
          </p>
        </div>
      </div>
    </div>
  );
}
