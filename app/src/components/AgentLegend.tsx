import { memo, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Users,
  Wrench,
  Cpu,
  Clock,
  ArrowRight,
} from 'lucide-react';
import { formatTokens } from '../lib/utils';
import type { AgentInfo } from '../types';

interface AgentLegendProps {
  agentRegistry: Map<string, AgentInfo>;
  showCompactAgents: boolean;
  onToggleCompactAgents: () => void;
  onJumpToTurn: (turnIndex: number) => void;
}

export const AgentLegend = memo(function AgentLegend({
  agentRegistry,
  showCompactAgents,
  onToggleCompactAgents,
  onJumpToTurn,
}: AgentLegendProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const agents = Array.from(agentRegistry.values());
  const regularAgents = agents.filter(a => !a.isCompact);
  const compactAgents = agents.filter(a => a.isCompact);

  if (agents.length === 0) return null;

  return (
    <div className="max-w-4xl mx-auto px-4 py-2">
      <div className="border border-border rounded-lg bg-card overflow-hidden">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full px-4 py-2.5 flex items-center gap-2 hover:bg-muted/50 transition-colors"
        >
          <Users className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">
            Agents ({regularAgents.length})
          </span>
          {compactAgents.length > 0 && (
            <span className="text-xs text-muted-foreground">
              + {compactAgents.length} compact
            </span>
          )}
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground ml-auto" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground ml-auto" />
          )}
        </button>

        {isExpanded && (
          <div className="border-t border-border px-4 py-3 space-y-2">
            {regularAgents.map(agent => (
              <div
                key={agent.agentId}
                className="flex items-center gap-3 py-1.5 text-sm"
              >
                <span
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: agent.color }}
                />
                <span className="font-medium" style={{ color: agent.color }}>
                  #{agent.agentNumber}
                </span>
                <span className="text-foreground truncate flex-1 min-w-0">
                  {agent.description}
                </span>
                {agent.subagentType && (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground flex-shrink-0">
                    {agent.subagentType}
                  </span>
                )}
                {agent.stats && (
                  <span className="text-xs text-muted-foreground flex items-center gap-2 flex-shrink-0">
                    <span className="flex items-center gap-0.5">
                      <Wrench className="w-3 h-3" />
                      {agent.stats.totalToolUseCount}
                    </span>
                    <span className="flex items-center gap-0.5">
                      <Cpu className="w-3 h-3" />
                      {formatTokens(agent.stats.totalTokens)}
                    </span>
                    <span className="flex items-center gap-0.5">
                      <Clock className="w-3 h-3" />
                      {Math.round(agent.stats.totalDurationMs / 1000)}s
                    </span>
                  </span>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onJumpToTurn(agent.firstTurnIndex);
                  }}
                  className="text-xs text-accent hover:underline flex items-center gap-0.5 flex-shrink-0"
                >
                  Jump <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            ))}

            {compactAgents.length > 0 && (
              <div className="pt-2 border-t border-border/50">
                <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showCompactAgents}
                    onChange={onToggleCompactAgents}
                    className="rounded border-border"
                  />
                  Show compact agents ({compactAgents.length})
                  <span className="text-xs italic">
                    — conversation compression
                  </span>
                </label>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
});
