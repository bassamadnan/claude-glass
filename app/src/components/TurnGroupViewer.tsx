import { memo, useState } from 'react';
import {
  Bot,
  ChevronDown,
  ChevronUp,
  Clock,
  Pencil,
  Layers,
} from 'lucide-react';
import { TurnViewer } from './TurnViewer';
import { EditDiffView } from './TurnViewer';
import { formatTimestamp, formatTokens } from '../lib/utils';
import type { TurnGroup, AgentInfo } from '../types';

interface TurnGroupViewerProps {
  group: TurnGroup;
  agentRegistry: Map<string, AgentInfo>;
}

/** Collect all Edit tool diffs from a group, grouped by file path */
function collectEditDiffs(group: TurnGroup): {
  filePath: string;
  diffs: { turnIndex: number; oldString: string; newString: string }[];
}[] {
  const fileMap = new Map<string, { turnIndex: number; oldString: string; newString: string }[]>();

  for (let i = 0; i < group.turns.length; i++) {
    const turn = group.turns[i];
    if (!turn.toolExecutions) continue;
    for (const tool of turn.toolExecutions) {
      if (tool.name === 'Edit' && tool.input.file_path && tool.input.old_string != null && tool.input.new_string != null) {
        const fp = String(tool.input.file_path);
        if (!fileMap.has(fp)) fileMap.set(fp, []);
        fileMap.get(fp)!.push({
          turnIndex: i,
          oldString: String(tool.input.old_string),
          newString: String(tool.input.new_string),
        });
      }
    }
  }

  return Array.from(fileMap.entries()).map(([filePath, diffs]) => ({ filePath, diffs }));
}

/** Count edits per file for badge display */
function countEditsPerFile(group: TurnGroup): Map<string, number> {
  const counts = new Map<string, number>();
  for (const turn of group.turns) {
    if (!turn.toolExecutions) continue;
    for (const tool of turn.toolExecutions) {
      if ((tool.name === 'Edit' || tool.name === 'Write') && tool.input.file_path) {
        const fp = String(tool.input.file_path);
        counts.set(fp, (counts.get(fp) || 0) + 1);
      }
    }
  }
  return counts;
}

export const TurnGroupViewer = memo(function TurnGroupViewer({
  group,
  agentRegistry,
}: TurnGroupViewerProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [expandedTurns, setExpandedTurns] = useState<Set<number>>(new Set());

  const firstTurn = group.turns[0];
  const lastTurn = group.turns[group.turns.length - 1];

  // Total tokens across all turns
  let totalTokens = 0;
  for (const turn of group.turns) {
    if (turn.usage) {
      totalTokens += turn.usage.input_tokens + turn.usage.output_tokens;
    }
  }

  const editCounts = countEditsPerFile(group);
  const editDiffsByFile = collectEditDiffs(group);

  // Get text preview from last turn
  const lastText = lastTurn.textContent?.join('\n\n');
  const textPreview = lastText
    ? (lastText.length > 120 ? lastText.substring(0, 120) + '...' : lastText)
    : null;

  const toggleSubTurn = (idx: number) => {
    setExpandedTurns(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const agentInfo = firstTurn.agentId ? agentRegistry.get(firstTurn.agentId) : undefined;

  return (
    <div
      className="flex gap-4"
      style={agentInfo ? { borderLeft: `3px solid ${agentInfo.color}`, paddingLeft: '12px' } : undefined}
    >
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-assistant/20 flex items-center justify-center relative">
        <Bot className="w-4 h-4 text-assistant" />
        <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-orange-500 flex items-center justify-center text-[9px] font-bold text-white">
          {group.turns.length}
        </div>
      </div>
      <div className="flex-1 min-w-0">
        {/* Header */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full text-left mb-3"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-assistant">Claude</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-400 font-medium flex items-center gap-1">
              <Layers className="w-3 h-3" />
              {group.turns.length} responses
            </span>
            {firstTurn.model && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                {firstTurn.model.replace('claude-', '').replace(/-\d{8}$/, '')}
              </span>
            )}
            {agentInfo && (
              <span
                className="text-xs px-2 py-0.5 rounded-full border font-medium"
                style={{
                  backgroundColor: `${agentInfo.color}20`,
                  color: agentInfo.color,
                  borderColor: `${agentInfo.color}40`,
                }}
              >
                Agent #{agentInfo.agentNumber}
              </span>
            )}
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatTimestamp(firstTurn.timestamp)} – {formatTimestamp(lastTurn.timestamp)}
            </span>
            {totalTokens > 0 && (
              <span className="text-xs text-muted-foreground">
                {formatTokens(totalTokens)} tokens
              </span>
            )}
            {isExpanded ? (
              <ChevronUp className="w-4 h-4 text-muted-foreground ml-auto" />
            ) : (
              <ChevronDown className="w-4 h-4 text-muted-foreground ml-auto" />
            )}
          </div>

          {/* File badges - always visible */}
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {Array.from(editCounts.entries()).map(([filePath, count]) => {
              const fileName = filePath.split('/').pop() || filePath;
              return (
                <span
                  key={filePath}
                  className="text-[11px] px-2 py-0.5 rounded bg-orange-500/10 text-orange-400 font-mono flex items-center gap-1"
                  title={filePath}
                >
                  <Pencil className="w-2.5 h-2.5" />
                  {fileName}
                  {count > 1 && (
                    <span className="text-orange-400/70">({count} edits)</span>
                  )}
                </span>
              );
            })}
          </div>

          {/* Text preview when collapsed */}
          {!isExpanded && textPreview && (
            <div className="mt-1 text-sm text-muted-foreground truncate">
              {textPreview}
            </div>
          )}
        </button>

        {/* Expanded content */}
        {isExpanded && (
          <div className="space-y-4">
            {/* Combined diffs section */}
            {editDiffsByFile.length > 0 && (
              <div className="space-y-3">
                <div className="text-xs text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                  <Pencil className="w-3 h-3" />
                  Combined Edits
                </div>
                {editDiffsByFile.map(({ filePath, diffs }) => (
                  <div key={filePath} className="space-y-2">
                    {diffs.map((diff, i) => (
                      <div key={`${filePath}-${i}`}>
                        {diffs.length > 1 && (
                          <div className="text-[11px] text-muted-foreground mb-1">
                            Response {diff.turnIndex + 1} of {group.turns.length}
                          </div>
                        )}
                        <EditDiffView
                          filePath={filePath}
                          oldString={diff.oldString}
                          newString={diff.newString}
                        />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}

            {/* Individual turns as collapsible sub-sections */}
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground uppercase tracking-wide">
                Individual Responses
              </div>
              {group.turns.map((turn, idx) => {
                const turnAgentInfo = turn.agentId ? agentRegistry.get(turn.agentId) : undefined;
                return (
                  <div key={turn.id} className="border border-border/50 rounded-lg overflow-hidden">
                    <button
                      onClick={() => toggleSubTurn(idx)}
                      className="w-full text-left px-3 py-2 bg-muted/30 hover:bg-muted/50 transition-colors flex items-center gap-2 text-xs"
                    >
                      {expandedTurns.has(idx) ? (
                        <ChevronUp className="w-3 h-3 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="w-3 h-3 text-muted-foreground" />
                      )}
                      <span className="text-muted-foreground">
                        Response {idx + 1}
                      </span>
                      <span className="text-muted-foreground/70">
                        {formatTimestamp(turn.timestamp)}
                      </span>
                      {turn.toolExecutions && (
                        <span className="text-muted-foreground/70">
                          {turn.toolExecutions.length} tool{turn.toolExecutions.length !== 1 ? 's' : ''}
                        </span>
                      )}
                    </button>
                    {expandedTurns.has(idx) && (
                      <div className="p-3">
                        <TurnViewer turn={turn} agentInfo={turnAgentInfo} agentRegistry={agentRegistry} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});
