import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
import {
  ArrowLeft,
  GitBranch,
  FolderOpen,
  LayoutGrid,
  Hash,
  Cpu,
  Clock,
  Users,
  PanelLeftClose,
  PanelLeftOpen,
  Github,
} from 'lucide-react';

const GITHUB_URL = 'https://github.com/bassamadnan/claude-glass';
import { TurnViewer } from './TurnViewer';
import { TurnGroupViewer } from './TurnGroupViewer';
import { ConversationIndex } from './ConversationIndex';
import { formatTokens, formatDate } from '../lib/utils';
import { formatCost } from '../lib/pricing';
import type { ParsedSession, ConversationTurn } from '../types';

interface ConversationViewerProps {
  session: ParsedSession;
  filename: string;
  onBack: () => void;
  onOpenBrowser?: () => void;
  onShareFromTurn?: (turn: ConversationTurn) => void;
  shareLoading?: boolean;
  isShared?: boolean;
}

const SessionHeader = memo(function SessionHeader({
  session,
  filename,
  onBack,
  onOpenBrowser,
  agentCount,
  isIndexOpen,
  onToggleIndex,
  isShared,
}: {
  session: ParsedSession;
  filename: string;
  onBack: () => void;
  onOpenBrowser?: () => void;
  agentCount: number;
  isIndexOpen: boolean;
  onToggleIndex: () => void;
  isShared?: boolean;
}) {
  return (
    <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border">
      <div className="max-w-4xl mx-auto px-4 py-4">
        <div className="flex items-center gap-4">
          {!isShared && (
            <button
              onClick={onBack}
              className="p-2 rounded-lg hover:bg-muted transition-colors"
              title="Back to landing"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          {!isShared && onOpenBrowser && (
            <button
              onClick={onOpenBrowser}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title="Browse projects"
            >
              <LayoutGrid className="w-4 h-4" />
              Browse
            </button>
          )}

          <div className="flex-1 min-w-0">
            <h1 className="font-semibold truncate">{filename}</h1>
            {/* Line 1: stats */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground mt-1">
              <span className="flex items-center gap-1">
                <Hash className="w-3.5 h-3.5" />
                {session.turns.length} turns
              </span>
              <span className="flex items-center gap-1">
                <Cpu className="w-3.5 h-3.5" />
                {formatTokens(session.totalTokens.input + session.totalTokens.output)} tokens
              </span>
              {session.totalCost > 0 && (
                <span className="flex items-center gap-1 text-emerald-400/80">
                  {formatCost(session.totalCost)}
                </span>
              )}
              {agentCount > 0 && (
                <span className="flex items-center gap-1">
                  <Users className="w-3.5 h-3.5" />
                  {agentCount} agents
                </span>
              )}
            </div>
            {/* Line 2: context */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground/70 mt-0.5">
              <span className="flex items-center gap-1">
                <FolderOpen className="w-3 h-3" />
                <span className="truncate max-w-[200px]" title={session.cwd}>
                  {session.cwd.split('/').slice(-2).join('/')}
                </span>
              </span>
              {session.gitBranch && (
                <span className="flex items-center gap-1">
                  <GitBranch className="w-3 h-3" />
                  {session.gitBranch}
                </span>
              )}
              {session.turns.length > 0 && (
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
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

          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            title="View on GitHub"
          >
            <Github className="w-5 h-5" />
          </a>
        </div>
      </div>
    </div>
  );
});

export const ConversationViewer = memo(function ConversationViewer({
  session,
  filename,
  onBack,
  onOpenBrowser,
  onShareFromTurn,
  shareLoading,
  isShared,
}: ConversationViewerProps) {
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const [isIndexOpen, setIsIndexOpen] = useState(true);
  const [activeTurnIndex, setActiveTurnIndex] = useState(0);
  const activeTurnRef = useRef(0);
  const rafRef = useRef(0);

  const turnGroups = session.groups;

  const regularAgentCount = useMemo(() => {
    return Array.from(session.agentRegistry.values()).filter(a => !a.isCompact).length;
  }, [session.agentRegistry]);

  // For each user message, sum ALL assistant turn costs (any agent) between
  // this message and the next user message — timestamp-based, no agentId needed.
  const messageCosts = useMemo(() => {
    const costs = new Map<string, number>();
    const userGroups = turnGroups
      .map((g, i) => ({ i, g }))
      .filter(({ g }) => g.turns[0].type === 'user' && !g.turns[0].agentId);

    for (let u = 0; u < userGroups.length; u++) {
      const { g } = userGroups[u];
      const startTs = g.turns[0].timestamp;
      const endTs = u + 1 < userGroups.length ? userGroups[u + 1].g.turns[0].timestamp : null;
      let cost = 0;
      for (const turn of session.turns) {
        if (turn.type !== 'assistant') continue;
        if (turn.timestamp < startTs) continue;
        if (endTs && turn.timestamp >= endTs) continue;
        cost += turn.cost ?? 0;
      }
      costs.set(g.id, cost);
    }
    return costs;
  }, [turnGroups, session.turns]);

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

  const renderItem = useCallback(
    (index: number) => {
      const group = turnGroups[index];
      if (group.turns.length === 1) {
        const turn = group.turns[0];
        const agentInfo = turn.agentId ? session.agentRegistry.get(turn.agentId) : undefined;
        const canShare = !isShared && onShareFromTurn && turn.type === 'user' && !turn.agentId;
        return (
          <div className="py-4">
            <TurnViewer
              turn={turn}
              agentInfo={agentInfo}
              agentRegistry={session.agentRegistry}
              onShare={canShare ? () => onShareFromTurn(turn) : undefined}
              shareLoading={shareLoading}
              messageCost={messageCosts.get(group.id)}
            />
          </div>
        );
      }
      return (
        <div className="py-4">
          <TurnGroupViewer group={group} agentRegistry={session.agentRegistry} />
        </div>
      );
    },
    [turnGroups, session.agentRegistry, onShareFromTurn, shareLoading, messageCosts]
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
        onOpenBrowser={onOpenBrowser}
        agentCount={regularAgentCount}
        isIndexOpen={isIndexOpen}
        onToggleIndex={toggleIndex}
        isShared={isShared}
      />

      <div className="flex-1 overflow-hidden flex">
        {isIndexOpen && (
          <div className="w-[260px] shrink-0 border-r border-border bg-muted/30 overflow-hidden">
            <ConversationIndex
              turnGroups={turnGroups}
              activeGroupIndex={activeTurnIndex}
              onJumpToGroup={handleJumpToTurn}
            />
          </div>
        )}

        <div className="flex-1 overflow-hidden">
          <Virtuoso
            ref={virtuosoRef}
            style={virtuosoStyle}
            totalCount={turnGroups.length}
            itemContent={renderItem}
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
