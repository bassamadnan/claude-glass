import { memo, useState } from 'react';
import {
  User,
  Bot,
  Brain,
  Wrench,
  Terminal,
  Search,
  FolderOpen,
  Clock,
  ChevronDown,
  ChevronUp,
  Pencil,
  Eye,
  ExternalLink,
  Folder,
  File,
  Scissors,
} from 'lucide-react';
import { Modal } from './Modal';
import { MarkdownRenderer } from './MarkdownRenderer';
import { CodeBlock } from './CodeBlock';
import { cn, formatTimestamp, formatTokens } from '../lib/utils';
import type { ConversationTurn, ToolExecution, AgentInfo } from '../types';

interface TurnViewerProps {
  turn: ConversationTurn;
  agentInfo?: AgentInfo;
  agentRegistry?: Map<string, AgentInfo>;
}

function formatCharCount(count: number): string {
  if (count >= 1000) {
    return `${Math.round(count / 1000)}k`;
  }
  return `${count}`;
}

// Extract detailed file/directory info from tool executions
function extractFileDetails(tools: ToolExecution[]) {
  const files: { path: string; action: 'read' | 'write' | 'edit' }[] = [];
  const directories: string[] = [];
  const commands: { cmd: string; description?: string }[] = [];
  const searches: { pattern: string; type: 'glob' | 'grep' }[] = [];
  const agents: { description?: string; stats?: ToolExecution['agentStats'] }[] = [];

  for (const tool of tools) {
    const input = tool.input as Record<string, unknown>;

    if (tool.name === 'Read' && input.file_path) {
      files.push({ path: String(input.file_path), action: 'read' });
    } else if (tool.name === 'Write' && input.file_path) {
      files.push({ path: String(input.file_path), action: 'write' });
    } else if (tool.name === 'Edit' && input.file_path) {
      files.push({ path: String(input.file_path), action: 'edit' });
    } else if (tool.name === 'Bash' && input.command) {
      commands.push({
        cmd: String(input.command),
        description: input.description ? String(input.description) : undefined,
      });
    } else if (tool.name === 'Glob' && input.pattern) {
      searches.push({ pattern: String(input.pattern), type: 'glob' });
      if (input.path) directories.push(String(input.path));
    } else if (tool.name === 'Grep' && input.pattern) {
      searches.push({ pattern: String(input.pattern), type: 'grep' });
      if (input.path) directories.push(String(input.path));
    } else if (tool.name === 'Task') {
      agents.push({
        description: input.description ? String(input.description) : undefined,
        stats: tool.agentStats,
      });
    }
  }

  // Dedupe directories
  const uniqueDirs = [...new Set(directories)];

  return { files, directories: uniqueDirs, commands, searches, agents };
}

// File activity summary component
const FileActivitySummary = memo(function FileActivitySummary({
  tools,
  onViewDetails,
  agentRegistry,
}: {
  tools: ToolExecution[];
  onViewDetails: () => void;
  agentRegistry?: Map<string, AgentInfo>;
}) {
  const details = extractFileDetails(tools);
  const hasActivity = details.files.length > 0 || details.commands.length > 0 ||
                      details.searches.length > 0 || details.agents.length > 0;

  if (!hasActivity) return null;

  const readFiles = details.files.filter(f => f.action === 'read');
  const writeFiles = details.files.filter(f => f.action === 'write' || f.action === 'edit');

  return (
    <div className="bg-muted/30 rounded-lg p-4 space-y-3">
      {/* Files accessed */}
      {details.files.length > 0 && (
        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-2">
            <File className="w-3 h-3" />
            Files Accessed
          </div>
          <div className="space-y-1">
            {readFiles.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {readFiles.slice(0, 5).map((f, i) => (
                  <span
                    key={i}
                    className="text-xs px-2 py-1 rounded bg-blue-500/10 text-blue-400 font-mono"
                    title={f.path}
                  >
                    <Eye className="w-3 h-3 inline mr-1" />
                    {f.path.split('/').slice(-2).join('/')}
                  </span>
                ))}
                {readFiles.length > 5 && (
                  <span className="text-xs text-muted-foreground">
                    +{readFiles.length - 5} more
                  </span>
                )}
              </div>
            )}
            {writeFiles.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-1">
                {writeFiles.map((f, i) => (
                  <span
                    key={i}
                    className="text-xs px-2 py-1 rounded bg-orange-500/10 text-orange-400 font-mono"
                    title={f.path}
                  >
                    <Pencil className="w-3 h-3 inline mr-1" />
                    {f.path.split('/').slice(-2).join('/')}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Directories explored */}
      {details.directories.length > 0 && (
        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-2">
            <Folder className="w-3 h-3" />
            Directories
          </div>
          <div className="flex flex-wrap gap-2">
            {details.directories.slice(0, 3).map((d, i) => (
              <span
                key={i}
                className="text-xs px-2 py-1 rounded bg-purple-500/10 text-purple-400 font-mono"
              >
                {d.split('/').slice(-2).join('/')}
              </span>
            ))}
            {details.directories.length > 3 && (
              <span className="text-xs text-muted-foreground">
                +{details.directories.length - 3} more
              </span>
            )}
          </div>
        </div>
      )}

      {/* Commands */}
      {details.commands.length > 0 && (
        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-2">
            <Terminal className="w-3 h-3" />
            Commands ({details.commands.length})
          </div>
          <div className="space-y-1">
            {details.commands.slice(0, 3).map((c, i) => (
              <div key={i} className="text-xs font-mono text-green-400 truncate" title={c.cmd}>
                $ {c.description || c.cmd.substring(0, 60)}
              </div>
            ))}
            {details.commands.length > 3 && (
              <span className="text-xs text-muted-foreground">
                +{details.commands.length - 3} more
              </span>
            )}
          </div>
        </div>
      )}

      {/* Searches */}
      {details.searches.length > 0 && (
        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-2">
            <Search className="w-3 h-3" />
            Searches ({details.searches.length})
          </div>
          <div className="flex flex-wrap gap-2">
            {details.searches.slice(0, 3).map((s, i) => (
              <span
                key={i}
                className="text-xs px-2 py-1 rounded bg-yellow-500/10 text-yellow-400 font-mono"
              >
                {s.type}: {s.pattern.substring(0, 30)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Sub-agents */}
      {details.agents.length > 0 && (
        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-2">
            <FolderOpen className="w-3 h-3" />
            Sub-Agents ({details.agents.length})
          </div>
          <div className="space-y-2">
            {details.agents.map((a, i) => {
              const agentInfoForTask = a.stats?.agentId && agentRegistry ? agentRegistry.get(a.stats.agentId) : undefined;
              const agentColor = agentInfoForTask?.color || '#22d3ee';
              return (
                <div
                  key={i}
                  className="text-xs px-3 py-2 rounded"
                  style={{
                    backgroundColor: `${agentColor}15`,
                    borderLeft: `3px solid ${agentColor}`,
                  }}
                >
                  <div className="font-medium" style={{ color: agentColor }}>
                    {agentInfoForTask ? `Agent #${agentInfoForTask.agentNumber}: ` : ''}
                    {a.description || 'Agent task'}
                  </div>
                  {a.stats && (
                    <div className="mt-1" style={{ color: `${agentColor}b3` }}>
                      {a.stats.totalToolUseCount} tool calls · {formatTokens(a.stats.totalTokens)} tokens · {Math.round(a.stats.totalDurationMs / 1000)}s
                    </div>
                  )}
                  <div className="text-muted-foreground/60 mt-1 italic">
                    (Individual tool calls are in the agent's separate log file)
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* View all details button */}
      <button
        onClick={onViewDetails}
        className="text-xs text-accent hover:underline flex items-center gap-1 mt-2"
      >
        <ExternalLink className="w-3 h-3" />
        View all tool details
      </button>
    </div>
  );
});

// Tool details modal content
const ToolDetailsModal = memo(function ToolDetailsModal({
  tools,
  agentRegistry,
}: {
  tools: ToolExecution[];
  agentRegistry?: Map<string, AgentInfo>;
}) {
  return (
    <div className="space-y-4">
      {tools.map((tool, idx) => {
        const input = tool.input as Record<string, unknown>;
        const isCodeInput = tool.name === 'Bash' || tool.name === 'Write' || tool.name === 'Edit';

        let inputDisplay = '';
        if (input.command) inputDisplay = String(input.command);
        else if (input.file_path) inputDisplay = String(input.file_path);
        else if (input.pattern) inputDisplay = String(input.pattern);
        else if (input.prompt) inputDisplay = String(input.prompt);
        else inputDisplay = JSON.stringify(input, null, 2);

        return (
          <div key={tool.id || idx} className="border border-border rounded-lg overflow-hidden">
            <div className="bg-muted/50 px-4 py-2 flex items-center gap-2">
              <Wrench className="w-4 h-4 text-tool" />
              <span className="font-medium text-tool">{tool.name}</span>
              {input.description ? (
                <span className="text-muted-foreground text-sm">
                  {String(input.description)}
                </span>
              ) : null}
              {tool.result && (
                <span className={cn(
                  "ml-auto text-xs px-2 py-0.5 rounded",
                  tool.result.isError ? "bg-red-500/20 text-red-400" : "bg-green-500/20 text-green-400"
                )}>
                  {tool.result.isError ? 'error' : 'done'}
                </span>
              )}
            </div>
            <div className="p-4 space-y-3">
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Input</div>
                {isCodeInput ? (
                  <CodeBlock code={inputDisplay} language={tool.name === 'Bash' ? 'bash' : 'typescript'} />
                ) : (
                  <pre className="text-sm bg-muted p-3 rounded overflow-x-auto whitespace-pre-wrap max-h-40 overflow-y-auto">
                    {inputDisplay}
                  </pre>
                )}
              </div>
              {tool.result && (
                <div>
                  <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Output</div>
                  <pre className={cn(
                    "text-sm p-3 rounded overflow-x-auto whitespace-pre-wrap max-h-60 overflow-y-auto",
                    tool.result.isError ? "bg-red-500/10 text-red-300" : "bg-muted"
                  )}>
                    {tool.result.stdout || tool.result.content || '(no output)'}
                    {tool.result.stderr && (
                      <span className="text-red-400 block mt-2">{tool.result.stderr}</span>
                    )}
                  </pre>
                </div>
              )}
              {tool.agentStats && (() => {
                const agentInfoForStats = tool.agentStats.agentId && agentRegistry ? agentRegistry.get(tool.agentStats.agentId) : undefined;
                const statsColor = agentInfoForStats?.color || '#22d3ee';
                return (
                  <div
                    className="text-xs px-3 py-2 rounded space-y-1"
                    style={{
                      backgroundColor: `${statsColor}15`,
                      borderLeft: `3px solid ${statsColor}`,
                    }}
                  >
                    <div className="font-medium" style={{ color: statsColor }}>
                      {agentInfoForStats ? `Agent #${agentInfoForStats.agentNumber} ` : 'Sub-agent '}
                      completed: {tool.agentStats.totalToolUseCount} tool calls, {formatTokens(tool.agentStats.totalTokens)} tokens, {Math.round(tool.agentStats.totalDurationMs / 1000)}s
                    </div>
                    {tool.agentStats.agentId && (
                      <div className="text-muted-foreground font-mono text-[10px]">
                        To see individual tool calls, load: agent-{tool.agentStats.agentId}.jsonl
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        );
      })}
    </div>
  );
});

// Thinking modal content
const ThinkingModal = memo(function ThinkingModal({
  thinking,
}: {
  thinking: string[];
}) {
  return (
    <div className="space-y-4">
      {thinking.map((block, idx) => (
        <div key={idx} className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
          {block}
          {idx < thinking.length - 1 && <hr className="my-4 border-border" />}
        </div>
      ))}
    </div>
  );
});

// Collapsible text response
const TextResponse = memo(function TextResponse({
  content,
}: {
  content: string;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const PREVIEW_LENGTH = 400;
  const isLong = content.length > PREVIEW_LENGTH;

  const displayContent = isExpanded || !isLong
    ? content
    : content.substring(0, PREVIEW_LENGTH) + '...';

  return (
    <div className="bg-card rounded-lg border border-border overflow-hidden">
      <div className="px-4 py-3">
        <MarkdownRenderer content={displayContent} />
      </div>
      {isLong && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors flex items-center justify-center gap-2 border-t border-border"
        >
          {isExpanded ? (
            <>
              <ChevronUp className="w-4 h-4" />
              Show less
            </>
          ) : (
            <>
              <ChevronDown className="w-4 h-4" />
              Show full response ({formatCharCount(content.length)} chars)
            </>
          )}
        </button>
      )}
    </div>
  );
});

export const TurnViewer = memo(function TurnViewer({ turn, agentInfo, agentRegistry }: TurnViewerProps) {
  const [showToolsModal, setShowToolsModal] = useState(false);
  const [showThinkingModal, setShowThinkingModal] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  if (turn.type === 'user') {
    const contentPreview = turn.userContent && turn.userContent.length > 100
      ? turn.userContent.substring(0, 100) + '...'
      : turn.userContent;

    return (
      <div
        className="flex gap-4"
        style={agentInfo ? { borderLeft: `3px solid ${agentInfo.color}`, paddingLeft: '12px' } : undefined}
      >
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-user/20 flex items-center justify-center">
          <User className="w-4 h-4 text-user" />
        </div>
        <div className="flex-1 min-w-0">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="w-full text-left"
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="font-semibold text-user">User</span>
              <span className="text-xs text-muted-foreground">
                {formatTimestamp(turn.timestamp)}
              </span>
              {agentInfo && (
                <span
                  className="text-xs px-2 py-0.5 rounded-full border font-medium"
                  style={{
                    backgroundColor: `${agentInfo.color}20`,
                    color: agentInfo.color,
                    borderColor: `${agentInfo.color}40`,
                  }}
                >
                  Agent #{agentInfo.agentNumber}: {agentInfo.description}
                </span>
              )}
              {isExpanded ? (
                <ChevronUp className="w-4 h-4 text-muted-foreground ml-auto" />
              ) : (
                <ChevronDown className="w-4 h-4 text-muted-foreground ml-auto" />
              )}
            </div>
          </button>
          {isExpanded ? (
            <div className="bg-user/10 rounded-lg px-4 py-3 border border-user/20">
              <p className="whitespace-pre-wrap">{turn.userContent}</p>
            </div>
          ) : (
            <div className="bg-user/5 rounded-lg px-4 py-2 border border-user/10">
              <p className="text-sm text-muted-foreground truncate">{contentPreview}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // System turn (compact boundary)
  if (turn.type === 'system') {
    return (
      <div className="flex items-center gap-3 py-2">
        <div className="flex-1 h-px bg-border" />
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs">
          <Scissors className="w-3 h-3" />
          <span className="font-medium">
            Conversation compacted
          </span>
          {turn.compactTrigger && (
            <span className="text-amber-400/70">
              ({turn.compactTrigger})
            </span>
          )}
          {turn.preTokens && (
            <span className="text-amber-400/70">
              at {formatTokens(turn.preTokens)} tokens
            </span>
          )}
        </div>
        <div className="flex-1 h-px bg-border" />
      </div>
    );
  }

  // Assistant turn
  const hasTools = turn.toolExecutions && turn.toolExecutions.length > 0;
  const hasThinking = turn.thinking && turn.thinking.length > 0;
  const hasText = turn.textContent && turn.textContent.length > 0;
  const thinkingCharCount = hasThinking ? turn.thinking!.join('').length : 0;

  // Extract file names from tool executions for preview
  const getFilePreview = () => {
    if (!hasTools) return null;
    const files: { name: string; action: 'read' | 'write' }[] = [];
    for (const tool of turn.toolExecutions!) {
      const input = tool.input as Record<string, unknown>;
      if (tool.name === 'Read' && input.file_path) {
        files.push({ name: String(input.file_path).split('/').pop() || '', action: 'read' });
      } else if ((tool.name === 'Write' || tool.name === 'Edit') && input.file_path) {
        files.push({ name: String(input.file_path).split('/').pop() || '', action: 'write' });
      }
    }
    // Dedupe by name
    const seen = new Set<string>();
    return files.filter(f => {
      if (seen.has(f.name)) return false;
      seen.add(f.name);
      return true;
    });
  };

  const filePreview = getFilePreview();
  const nonFileToolCount = hasTools
    ? turn.toolExecutions!.filter(t => !['Read', 'Write', 'Edit'].includes(t.name)).length
    : 0;

  // Generate preview for collapsed state
  const getPreview = () => {
    const parts: string[] = [];
    if (hasThinking) parts.push(`Thinking (${turn.thinking!.length} blocks)`);
    if (hasTools && !filePreview?.length) {
      parts.push(`${turn.toolExecutions!.length} tool calls`);
    } else if (nonFileToolCount > 0) {
      parts.push(`${nonFileToolCount} other tools`);
    }
    if (hasText) {
      const firstText = turn.textContent![0];
      parts.push(firstText.substring(0, 80) + (firstText.length > 80 ? '...' : ''));
    }
    return parts.join(' • ');
  };

  return (
    <>
      <div
        className="flex gap-4"
        style={agentInfo ? { borderLeft: `3px solid ${agentInfo.color}`, paddingLeft: '12px' } : undefined}
      >
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-assistant/20 flex items-center justify-center">
          <Bot className="w-4 h-4 text-assistant" />
        </div>
        <div className="flex-1 min-w-0">
          {/* Header - always visible, clickable to expand/collapse */}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="w-full text-left mb-3"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-assistant">Claude</span>
              <span className="text-xs text-muted-foreground">
                {formatTimestamp(turn.timestamp)}
              </span>
              {agentInfo && (
                <span
                  className="text-xs px-2 py-0.5 rounded-full border font-medium"
                  style={{
                    backgroundColor: `${agentInfo.color}20`,
                    color: agentInfo.color,
                    borderColor: `${agentInfo.color}40`,
                  }}
                >
                  Agent #{agentInfo.agentNumber}: {agentInfo.description}
                </span>
              )}
              {turn.model && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                  {turn.model.replace('claude-', '').replace('-20250929', '').replace('-20251001', '')}
                </span>
              )}
              {turn.usage && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {formatTokens(turn.usage.input_tokens + turn.usage.output_tokens)} tokens
                </span>
              )}
              {isExpanded ? (
                <ChevronUp className="w-4 h-4 text-muted-foreground ml-auto" />
              ) : (
                <ChevronDown className="w-4 h-4 text-muted-foreground ml-auto" />
              )}
            </div>
            {!isExpanded && (
              <div className="mt-1 space-y-1">
                {filePreview && filePreview.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {filePreview.slice(0, 6).map((f, i) => (
                      <span
                        key={i}
                        className={cn(
                          "text-[11px] px-1.5 py-0.5 rounded font-mono",
                          f.action === 'write'
                            ? "bg-orange-500/10 text-orange-400"
                            : "bg-blue-500/10 text-blue-400"
                        )}
                      >
                        {f.action === 'write' ? <Pencil className="w-2.5 h-2.5 inline mr-0.5" /> : <Eye className="w-2.5 h-2.5 inline mr-0.5" />}
                        {f.name}
                      </span>
                    ))}
                    {filePreview.length > 6 && (
                      <span className="text-[11px] text-muted-foreground">+{filePreview.length - 6} more</span>
                    )}
                  </div>
                )}
                <div className="text-sm text-muted-foreground truncate">
                  {getPreview()}
                </div>
              </div>
            )}
          </button>

          {/* Expanded content */}
          {isExpanded && (
            <div className="space-y-3">
              {/* Quick action buttons */}
              <div className="flex flex-wrap gap-2">
                {hasThinking && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowThinkingModal(true);
                    }}
                    className="text-xs px-3 py-1.5 rounded-lg bg-thinking/10 text-thinking hover:bg-thinking/20 transition-colors flex items-center gap-2"
                  >
                    <Brain className="w-3 h-3" />
                    Thinking ({turn.thinking!.length} blocks · {formatCharCount(thinkingCharCount)} chars)
                  </button>
                )}
                {hasTools && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowToolsModal(true);
                    }}
                    className="text-xs px-3 py-1.5 rounded-lg bg-tool/10 text-tool hover:bg-tool/20 transition-colors flex items-center gap-2"
                  >
                    <Wrench className="w-3 h-3" />
                    {turn.toolExecutions!.length} tool call{turn.toolExecutions!.length > 1 ? 's' : ''}
                  </button>
                )}
              </div>

              {/* File activity summary - always visible when expanded */}
              {hasTools && (
                <FileActivitySummary
                  tools={turn.toolExecutions!}
                  onViewDetails={() => setShowToolsModal(true)}
                  agentRegistry={agentRegistry}
                />
              )}

              {/* Text content - truncated by default */}
              {hasText && <TextResponse content={turn.textContent!.join('\n\n')} />}
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      <Modal
        isOpen={showThinkingModal}
        onClose={() => setShowThinkingModal(false)}
        title={
          <span className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-thinking" />
            Thinking ({turn.thinking?.length || 0} blocks)
          </span>
        }
      >
        {hasThinking && <ThinkingModal thinking={turn.thinking!} />}
      </Modal>

      <Modal
        isOpen={showToolsModal}
        onClose={() => setShowToolsModal(false)}
        title={
          <span className="flex items-center gap-2">
            <Wrench className="w-5 h-5 text-tool" />
            Tool Executions ({turn.toolExecutions?.length || 0} calls)
          </span>
        }
      >
        {hasTools && <ToolDetailsModal tools={turn.toolExecutions!} agentRegistry={agentRegistry} />}
      </Modal>
    </>
  );
});
