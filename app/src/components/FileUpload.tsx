import { useCallback, useState } from 'react';
import { Upload, FileText, X, FolderOpen } from 'lucide-react';
import { cn } from '../lib/utils';
import { ProjectBrowser } from './ProjectBrowser';

interface FileUploadProps {
  onFileLoad: (files: { content: string; filename: string }[], displayName?: string) => void;
}

export function FileUpload({ onFileLoad }: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [browserOpen, setBrowserOpen] = useState(false);

  const handleFiles = useCallback(
    (files: FileList) => {
      setError(null);
      const fileArray = Array.from(files);
      for (const file of fileArray) {
        if (!file.name.endsWith('.jsonl') && !file.name.endsWith('.json')) {
          setError('Please upload only .jsonl or .json files');
          return;
        }
      }
      const promises = fileArray.map((file) =>
        new Promise<{ content: string; filename: string }>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve({ content: e.target?.result as string, filename: file.name });
          reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
          reader.readAsText(file);
        })
      );
      Promise.all(promises).then(onFileLoad).catch((err) => setError(err.message || 'Failed to read files'));
    },
    [onFileLoad]
  );

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); }, []);
  const handleDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); }, []);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) handleFiles(e.target.files);
  }, [handleFiles]);

  const handleSessionSelect = useCallback((files: { content: string; filename: string }[], displayName?: string) => {
    setBrowserOpen(false);
    onFileLoad(files, displayName);
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

        {/* Browse projects button — primary action */}
        <div className="mb-6">
          <button
            onClick={() => setBrowserOpen(true)}
            className="w-full px-5 py-4 bg-accent/10 hover:bg-accent/20 border border-accent/30 hover:border-accent/50 rounded-xl transition-all flex items-center justify-center gap-3"
          >
            <FolderOpen className="w-5 h-5 text-accent" />
            <span className="text-accent font-medium">Open Claude Projects</span>
          </button>
        </div>

        {/* Drag & drop area */}
        <label
          className={cn(
            'relative flex flex-col items-center justify-center w-full h-40 border-2 border-dashed rounded-xl cursor-pointer transition-all duration-200',
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
          <div className="flex flex-col items-center justify-center p-4 text-center">
            {isDragging ? (
              <>
                <FileText className="w-8 h-8 mb-2 text-accent animate-pulse" />
                <p className="text-sm font-medium text-accent">Drop your log file here</p>
              </>
            ) : (
              <>
                <Upload className="w-8 h-8 mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  or drag & drop .jsonl files here
                </p>
              </>
            )}
          </div>
        </label>

        {error && (
          <div className="mt-4 p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-3">
            <X className="w-5 h-5 text-red-500 flex-shrink-0" />
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}
      </div>

      <ProjectBrowser
        isOpen={browserOpen}
        onClose={() => setBrowserOpen(false)}
        onSessionSelect={handleSessionSelect}
      />
    </div>
  );
}
