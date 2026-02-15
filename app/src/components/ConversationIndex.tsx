import { memo, useRef, useEffect } from 'react';
import { User, Scissors } from 'lucide-react';
import { cn, formatTokens } from '../lib/utils';
import type { ConversationTurn } from '../types';

interface ConversationIndexProps {
  turns: ConversationTurn[];
  activeTurnIndex: number;
  onJumpToTurn: (index: number) => void;
}

interface IndexEntry {
  turnIndex: number;
  type: 'user' | 'compact';
  label: string;
  preTokens?: number;
}

function buildIndex(turns: ConversationTurn[]): IndexEntry[] {
  const entries: IndexEntry[] = [];
  for (let i = 0; i < turns.length; i++) {
    const turn = turns[i];
    if (turn.type === 'user' && turn.userContent && !turn.agentId) {
      entries.push({
        turnIndex: i,
        type: 'user',
        label: turn.userContent.length > 60
          ? turn.userContent.slice(0, 60) + '…'
          : turn.userContent,
      });
    } else if (turn.type === 'system' && turn.systemSubtype === 'compact_boundary') {
      entries.push({
        turnIndex: i,
        type: 'compact',
        label: 'Compacted',
        preTokens: turn.preTokens,
      });
    }
  }
  return entries;
}

export const ConversationIndex = memo(function ConversationIndex({
  turns,
  activeTurnIndex,
  onJumpToTurn,
}: ConversationIndexProps) {
  const entries = buildIndex(turns);
  const activeRef = useRef<HTMLButtonElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll sidebar to keep active entry visible
  useEffect(() => {
    if (activeRef.current && containerRef.current) {
      const container = containerRef.current;
      const el = activeRef.current;
      const elTop = el.offsetTop;
      const elBottom = elTop + el.offsetHeight;
      const viewTop = container.scrollTop;
      const viewBottom = viewTop + container.clientHeight;

      if (elTop < viewTop || elBottom > viewBottom) {
        el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [activeTurnIndex]);

  // Find which index entry is "active" — closest entry at or before activeTurnIndex
  let activeEntryIdx = -1;
  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i].turnIndex <= activeTurnIndex) {
      activeEntryIdx = i;
      break;
    }
  }

  return (
    <div
      ref={containerRef}
      className="h-full overflow-y-auto py-2 px-1 space-y-0.5 scrollbar-thin"
    >
      <div className="px-2 pb-2 mb-1 border-b border-border/50">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Index
        </span>
      </div>
      {entries.map((entry, idx) => {
        const isActive = idx === activeEntryIdx;

        if (entry.type === 'compact') {
          return (
            <button
              key={`compact-${entry.turnIndex}`}
              ref={isActive ? activeRef : undefined}
              onClick={() => onJumpToTurn(entry.turnIndex)}
              className={cn(
                'w-full flex items-center gap-2 px-2 py-1.5 my-1',
                'border-l-2 transition-colors',
                isActive
                  ? 'border-l-amber-400 bg-amber-500/10'
                  : 'border-l-amber-500/30 hover:bg-amber-500/5',
              )}
            >
              <Scissors className="w-3 h-3 text-amber-400 shrink-0" />
              <span className="text-[11px] text-amber-400/80 truncate">
                {entry.label}
                {entry.preTokens != null && (
                  <span className="text-amber-400/50 ml-1">
                    @ {formatTokens(entry.preTokens)}
                  </span>
                )}
              </span>
            </button>
          );
        }

        return (
          <button
            key={`user-${entry.turnIndex}`}
            ref={isActive ? activeRef : undefined}
            onClick={() => onJumpToTurn(entry.turnIndex)}
            className={cn(
              'w-full flex items-start gap-2 px-2 py-1.5 rounded-sm text-left',
              'border-l-2 transition-colors',
              isActive
                ? 'border-l-primary bg-primary/10 text-foreground'
                : 'border-l-transparent hover:bg-muted/50 text-muted-foreground',
            )}
          >
            <User className="w-3 h-3 mt-0.5 shrink-0" />
            <span className="text-xs leading-snug line-clamp-2">{entry.label}</span>
          </button>
        );
      })}
    </div>
  );
});
