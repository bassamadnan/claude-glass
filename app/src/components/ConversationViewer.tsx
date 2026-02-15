import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
import {
  ArrowLeft,
  GitBranch,
  FolderOpen,
  Hash,
  Cpu,
  Clock,
  Users,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { TurnViewer } from './TurnViewer';
import { ConversationIndex } from './ConversationIndex';
import { formatTokens, formatDate } from '../lib/utils';
import type { ParsedSession } from '../types';

interface ConversationViewerProps {
  session: ParsedSession;
  filename: string;
  onBack: () => void;
}

const SessionHeader = memo(function SessionHeader({
  session,
  filename,
  onBack,
  agentCount,
  isIndexOpen,
  onToggleIndex,
}: {
  session: ParsedSession;
  filename: string;
  onBack: () => void;
  agentCount: number;
  isIndexOpen: boolean;
  onToggleIndex: () => void;
}) {
  return (
    <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border">
      <div className="max-w-4xl mx-auto px-4 py-4">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-2 rounded-lg hover:bg-muted transition-colors"
            title="Load another file"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <div className="flex-1 min-w-0">
            <h1 className="font-semibold truncate">{filename}</h1>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground mt-1">
              <span className="flex items-center gap-1">
                <FolderOpen className="w-3.5 h-3.5" />
                <span className="truncate max-w-[200px]" title={session.cwd}>
                  {session.cwd.split('/').slice(-2).join('/')}
                </span>
              </span>

              {session.gitBranch && (
                <span className="flex items-center gap-1">
                  <GitBranch className="w-3.5 h-3.5" />
                  {session.gitBranch}
                </span>
              )}

              <span className="flex items-center gap-1">
                <Hash className="w-3.5 h-3.5" />
                {session.turns.length} turns
              </span>

              <span className="flex items-center gap-1">
                <Cpu className="w-3.5 h-3.5" />
                {formatTokens(session.totalTokens.input + session.totalTokens.output)} tokens
              </span>

              {agentCount > 0 && (
                <span className="flex items-center gap-1">
                  <Users className="w-3.5 h-3.5" />
                  {agentCount} agents
                </span>
              )}

              {session.turns.length > 0 && (
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  {formatDate(session.turns[0].timestamp)}
                </span>
              )}
            </div>
          </div>

          <button
            onClick={onToggleIndex}
            className="p-2 rounded-lg hover:bg-muted transition-colors"
            title={isIndexOpen ? 'Hide index' : 'Show index'}
          >
            {isIndexOpen ? (
              <PanelLeftClose className="w-5 h-5" />
            ) : (
              <PanelLeftOpen className="w-5 h-5" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
});

export const ConversationViewer = memo(function ConversationViewer({
  session,
  filename,
  onBack,
}: ConversationViewerProps) {
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const [isIndexOpen, setIsIndexOpen] = useState(true);
  const [activeTurnIndex, setActiveTurnIndex] = useState(0);
  const activeTurnRef = useRef(0);
  const rafRef = useRef(0);

  const visibleTurns = session.turns;

  const regularAgentCount = useMemo(() => {
    return Array.from(session.agentRegistry.values()).filter(a => !a.isCompact).length;
  }, [session.agentRegistry]);

  const handleJumpToTurn = useCallback((index: number) => {
    virtuosoRef.current?.scrollToIndex({ index, align: 'start' });
  }, []);

  // Throttle via rAF so we update at most once per frame
  const handleRangeChanged = useCallback((range: { startIndex: number; endIndex: number }) => {
    activeTurnRef.current = range.startIndex;
    if (!rafRef.current) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0;
        setActiveTurnIndex(activeTurnRef.current);
      });
    }
  }, []);

  useEffect(() => {
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, []);

  const toggleIndex = useCallback(() => {
    setIsIndexOpen(prev => !prev);
  }, []);

  const renderTurn = useCallback(
    (index: number) => {
      const turn = visibleTurns[index];
      const agentInfo = turn.agentId ? session.agentRegistry.get(turn.agentId) : undefined;
      return (
        <div className="py-4">
          <TurnViewer turn={turn} agentInfo={agentInfo} agentRegistry={session.agentRegistry} />
        </div>
      );
    },
    [visibleTurns, session.agentRegistry]
  );

  const virtuosoStyle = useMemo(() => ({ height: '100%' as const }), []);

  const virtuosoComponents = useMemo(() => ({
    List: ({ style, children, ...props }: React.ComponentPropsWithRef<'div'>) => (
      <div
        {...props}
        style={style}
        className="max-w-4xl mx-auto divide-y divide-border/50"
      >
        {children}
      </div>
    ),
  }), []);

  return (
    <div className="h-screen flex flex-col">
      <SessionHeader
        session={session}
        filename={filename}
        onBack={onBack}
        agentCount={regularAgentCount}
        isIndexOpen={isIndexOpen}
        onToggleIndex={toggleIndex}
      />

      <div className="flex-1 overflow-hidden flex">
        {isIndexOpen && (
          <div className="w-[260px] shrink-0 border-r border-border bg-muted/30 overflow-hidden">
            <ConversationIndex
              turns={visibleTurns}
              activeTurnIndex={activeTurnIndex}
              onJumpToTurn={handleJumpToTurn}
            />
          </div>
        )}

        <div className="flex-1 overflow-hidden">
          <Virtuoso
            ref={virtuosoRef}
            style={virtuosoStyle}
            totalCount={visibleTurns.length}
            itemContent={renderTurn}
            rangeChanged={handleRangeChanged}
            className="px-4"
            components={virtuosoComponents}
            overscan={5}
          />
        </div>
      </div>
    </div>
  );
});
