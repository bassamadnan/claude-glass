import { useState, useCallback, useMemo, useEffect } from 'react';
import {
  ArrowLeft, Search, MessageSquare, GitBranch,
  HardDrive, Bot, Loader2, Folder,
} from 'lucide-react';
import { Modal } from './Modal';
import { cn, formatRelativeTime, formatFileSize, truncateText } from '../lib/utils';
import {
  type ProjectInfo,
  type SessionInfo,
  fetchProjects,
  fetchSessions,
  loadSession,
} from '../lib/projectApi';

interface ProjectBrowserProps {
  isOpen: boolean;
  onClose: () => void;
  onSessionSelect: (files: { content: string; filename: string }[], displayName?: string) => void;
}

type View = { step: 'projects' } | { step: 'sessions'; project: ProjectInfo };

export function ProjectBrowser({
  isOpen,
  onClose,
  onSessionSelect,
}: ProjectBrowserProps) {
  const [view, setView] = useState<View>({ step: 'projects' });
  const [projects, setProjects] = useState<ProjectInfo[] | null>(null);
  const [sessions, setSessions] = useState<SessionInfo[] | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingSessionId, setLoadingSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch projects when modal opens
  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setError(null);
    fetchProjects()
      .then(setProjects)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [isOpen]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setView({ step: 'projects' });
      setSessions(null);
      setSearchQuery('');
      setError(null);
    }
  }, [isOpen]);

  const handleProjectClick = useCallback(async (project: ProjectInfo) => {
    setView({ step: 'sessions', project });
    setSessions(null);
    setSearchQuery('');
    setLoading(true);
    setError(null);
    try {
      setSessions(await fetchSessions(project.dirName));
    } catch (err: any) {
      setError(err.message || 'Failed to load sessions');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleBack = useCallback(() => {
    setView({ step: 'projects' });
    setSessions(null);
    setSearchQuery('');
    setError(null);
  }, []);

  const handleSessionClick = useCallback(
    async (session: SessionInfo, projectDir: string) => {
      setLoadingSessionId(session.sessionId);
      setError(null);
      try {
        const files = await loadSession(projectDir, session.sessionId);
        const displayName = session.firstUserMessage
          ? truncateText(session.firstUserMessage, 80)
          : undefined;
        onSessionSelect(files, displayName);
      } catch (err: any) {
        setError(err.message || 'Failed to load session');
      } finally {
        setLoadingSessionId(null);
      }
    },
    [onSessionSelect]
  );

  const filteredProjects = useMemo(() => {
    if (!projects) return [];
    if (!searchQuery) return projects;
    const q = searchQuery.toLowerCase();
    return projects.filter(
      (p) => p.displayPath.toLowerCase().includes(q) || p.shortName.toLowerCase().includes(q)
    );
  }, [projects, searchQuery]);

  const filteredSessions = useMemo(() => {
    if (!sessions) return [];
    if (!searchQuery) return sessions;
    const q = searchQuery.toLowerCase();
    return sessions.filter(
      (s) =>
        s.firstUserMessage?.toLowerCase().includes(q) ||
        s.gitBranch?.toLowerCase().includes(q) ||
        s.sessionId.toLowerCase().includes(q)
    );
  }, [sessions, searchQuery]);

  const title =
    view.step === 'projects' ? (
      <span className="flex items-center gap-2">
        <Folder className="w-5 h-5" />
        Claude Projects
      </span>
    ) : (
      <span className="flex items-center gap-2">
        <button
          onClick={handleBack}
          className="p-1 rounded hover:bg-muted transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <span className="text-muted-foreground truncate max-w-[300px]">
          {view.project.shortName}
        </span>
      </span>
    );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} className="max-w-3xl max-h-[80vh]">
      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          placeholder={view.step === 'projects' ? 'Filter projects...' : 'Filter sessions...'}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 bg-muted border border-border rounded-lg text-sm focus:outline-none focus:border-accent transition-colors"
        />
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-5 h-5 text-accent animate-spin" />
          <span className="ml-3 text-sm text-muted-foreground">
            {view.step === 'projects' ? 'Loading projects...' : 'Loading sessions...'}
          </span>
        </div>
      )}

      {/* Project list */}
      {!loading && view.step === 'projects' && (
        <div className="space-y-2">
          {filteredProjects.length === 0 && projects !== null && (
            <div className="text-center py-12 text-muted-foreground text-sm">
              {searchQuery ? 'No projects match your search' : 'No projects found'}
            </div>
          )}
          {filteredProjects.map((project) => (
            <button
              key={project.dirName}
              onClick={() => handleProjectClick(project)}
              className="w-full text-left px-4 py-3.5 rounded-lg border border-border hover:border-accent/40 hover:bg-accent/5 transition-all group"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-sm group-hover:text-accent transition-colors truncate">
                    {project.shortName}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 truncate">
                    {project.displayPath}
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground flex-shrink-0 pt-0.5">
                  <span>{project.sessionCount} session{project.sessionCount !== 1 ? 's' : ''}</span>
                  {project.lastActivity && (
                    <span>{formatRelativeTime(new Date(project.lastActivity))}</span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Session list */}
      {!loading && view.step === 'sessions' && (
        <div className="space-y-2">
          {filteredSessions.length === 0 && sessions !== null && (
            <div className="text-center py-12 text-muted-foreground text-sm">
              {searchQuery ? 'No sessions match your search' : 'No sessions found'}
            </div>
          )}
          {filteredSessions.map((session) => {
            const isSessionLoading = loadingSessionId === session.sessionId;
            return (
              <button
                key={session.sessionId}
                onClick={() => handleSessionClick(session, view.project.dirName)}
                disabled={!!loadingSessionId}
                className={cn(
                  'w-full text-left px-4 py-3.5 rounded-lg border border-border hover:border-accent/40 hover:bg-accent/5 transition-all group relative',
                  isSessionLoading && 'opacity-60'
                )}
              >
                {isSessionLoading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-card/60 rounded-lg z-10">
                    <Loader2 className="w-4 h-4 text-accent animate-spin" />
                    <span className="ml-2 text-xs text-accent">Loading...</span>
                  </div>
                )}
                <div className="flex items-start gap-3">
                  <MessageSquare className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm group-hover:text-accent transition-colors leading-snug">
                      {session.firstUserMessage
                        ? truncateText(session.firstUserMessage, 100)
                        : <span className="text-muted-foreground italic">(empty session)</span>}
                    </div>
                    <div className="flex items-center gap-2.5 mt-2 flex-wrap">
                      {session.timestamp && (
                        <span className="text-xs text-muted-foreground">
                          {formatRelativeTime(new Date(session.timestamp))}
                        </span>
                      )}
                      {session.gitBranch && (
                        <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 bg-accent/10 text-accent rounded">
                          <GitBranch className="w-3 h-3" />
                          {session.gitBranch}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <HardDrive className="w-3 h-3" />
                        {formatFileSize(session.sizeBytes)}
                      </span>
                      {session.subagentCount > 0 && (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <Bot className="w-3 h-3" />
                          {session.subagentCount} agent{session.subagentCount !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
