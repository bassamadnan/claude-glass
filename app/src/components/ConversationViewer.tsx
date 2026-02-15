import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
import {
  ArrowLeft,
  GitBranch,
  FolderOpen,
  Hash,
  Cpu,
  Clock,
  Users,
} from 'lucide-react';
import { TurnViewer } from './TurnViewer';
import { AgentLegend } from './AgentLegend';
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
}: {
  session: ParsedSession;
  filename: string;
  onBack: () => void;
  agentCount: number;
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
  const [showCompactAgents, setShowCompactAgents] = useState(false);
  const virtuosoRef = useRef<VirtuosoHandle>(null);

  // Filter out compact agent turns when toggle is off
  const visibleTurns = useMemo(() => {
    if (showCompactAgents) return session.turns;
    return session.turns.filter(turn => {
      if (!turn.agentId) return true;
      const info = session.agentRegistry.get(turn.agentId);
      return !info?.isCompact;
    });
  }, [session.turns, session.agentRegistry, showCompactAgents]);

  // Build a mapping from original turn indices to filtered indices for jump
  const originalToFilteredIndex = useMemo(() => {
    const map = new Map<number, number>();
    let filteredIdx = 0;
    for (let i = 0; i < session.turns.length; i++) {
      const turn = session.turns[i];
      const isVisible = !turn.agentId || showCompactAgents || !session.agentRegistry.get(turn.agentId)?.isCompact;
      if (isVisible) {
        map.set(i, filteredIdx);
        filteredIdx++;
      }
    }
    return map;
  }, [session.turns, session.agentRegistry, showCompactAgents]);

  const regularAgentCount = useMemo(() => {
    return Array.from(session.agentRegistry.values()).filter(a => !a.isCompact).length;
  }, [session.agentRegistry]);

  const handleJumpToTurn = useCallback((originalTurnIndex: number) => {
    const filteredIndex = originalToFilteredIndex.get(originalTurnIndex);
    if (filteredIndex !== undefined && virtuosoRef.current) {
      virtuosoRef.current.scrollToIndex({
        index: filteredIndex,
        align: 'start',
        behavior: 'smooth',
      });
    }
  }, [originalToFilteredIndex]);

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

  return (
    <div className="h-screen flex flex-col">
      <SessionHeader session={session} filename={filename} onBack={onBack} agentCount={regularAgentCount} />

      {session.agentRegistry.size > 0 && (
        <AgentLegend
          agentRegistry={session.agentRegistry}
          showCompactAgents={showCompactAgents}
          onToggleCompactAgents={() => setShowCompactAgents(prev => !prev)}
          onJumpToTurn={handleJumpToTurn}
        />
      )}

      <div className="flex-1 overflow-hidden">
        <Virtuoso
          ref={virtuosoRef}
          style={{ height: '100%' }}
          totalCount={visibleTurns.length}
          itemContent={renderTurn}
          className="px-4"
          components={{
            List: ({ style, children, ...props }) => (
              <div
                {...props}
                style={style}
                className="max-w-4xl mx-auto divide-y divide-border/50"
              >
                {children}
              </div>
            ),
          }}
          overscan={5}
        />
      </div>
    </div>
  );
});
