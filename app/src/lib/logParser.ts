import type {
  LogEntry,
  UserLogEntry,
  AssistantLogEntry,
  SystemLogEntry,
  SummaryLogEntry,
  ConversationTurn,
  TurnGroup,
  ParsedSession,
  AgentInfo,
  ContentBlock,
  ContentBlockText,
  ContentBlockThinking,
  ContentBlockToolUse,
  ContentBlockToolResult,
  ToolExecution,
} from '../types';
import { calculateTurnCost } from './pricing';

function isUserEntry(entry: LogEntry): entry is UserLogEntry {
  return entry.type === 'user';
}

function isAssistantEntry(entry: LogEntry): entry is AssistantLogEntry {
  return entry.type === 'assistant';
}

function isSystemEntry(entry: LogEntry): entry is SystemLogEntry {
  return entry.type === 'system';
}

function isSummaryEntry(entry: LogEntry): entry is SummaryLogEntry {
  return entry.type === 'summary';
}

function extractTextContent(content: string | ContentBlock[]): string {
  if (typeof content === 'string') {
    return content;
  }

  return content
    .filter((block): block is ContentBlockText => block.type === 'text')
    .map((block) => block.text)
    .join('\n');
}

function extractToolResultContent(block: ContentBlockToolResult): string {
  if (typeof block.content === 'string') {
    return block.content;
  }

  return block.content
    .filter((b): b is ContentBlockText => b.type === 'text')
    .map((b) => b.text)
    .join('\n');
}

export function parseJsonl(text: string): LogEntry[] {
  const lines = text.trim().split('\n');
  const entries: LogEntry[] = [];
  const seenUuids = new Set<string>();

  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line) as LogEntry;
      if (entry.uuid) {
        if (seenUuids.has(entry.uuid)) continue;
        seenUuids.add(entry.uuid);
      }
      entries.push(entry);
    } catch (e) {
      console.warn('Failed to parse line:', line.substring(0, 100), e);
    }
  }

  return entries;
}

export function groupIntoTurns(entries: LogEntry[]): ConversationTurn[] {
  const turns: ConversationTurn[] = [];
  // Deduplicate real user messages with same timestamp+content (conversation branches/retries)
  const seenUserMessages = new Set<string>();

  // Collect system compact_boundary entries paired with nearby summaries
  const systemEntries = entries.filter(isSystemEntry)
    .filter(e => e.subtype === 'compact_boundary');
  const summaryEntries = entries.filter(isSummaryEntry);

  // Build system turns for compact boundaries
  const systemTurns: ConversationTurn[] = [];
  for (const sysEntry of systemEntries) {
    const sysTime = new Date(sysEntry.timestamp).getTime();
    // Find the closest summary within 5 seconds after the system entry
    const matchingSummary = summaryEntries.find(s => {
      const sTime = new Date(s.timestamp).getTime();
      return sTime >= sysTime && sTime - sysTime < 5000;
    });

    systemTurns.push({
      id: sysEntry.uuid || `system-${sysTime}`,
      timestamp: sysEntry.timestamp,
      type: 'system',
      systemSubtype: sysEntry.subtype,
      systemContent: sysEntry.content,
      compactTrigger: sysEntry.compactMetadata?.trigger,
      preTokens: sysEntry.compactMetadata?.preTokens,
      summaryText: matchingSummary?.summary,
    });
  }

  // Filter to user/assistant message entries
  const messageEntries = entries.filter(
    (e) => e.type === 'user' || e.type === 'assistant'
  );

  // Sort by timestamp to ensure chronological order
  messageEntries.sort((a, b) => {
    const timeA = new Date(a.timestamp).getTime();
    const timeB = new Date(b.timestamp).getTime();
    return timeA - timeB;
  });

  // Group consecutive assistant messages together
  // A "turn" is either:
  // 1. A user message
  // 2. A sequence of assistant messages (which may include thinking, tool use, text)

  let i = 0;
  while (i < messageEntries.length) {
    const entry = messageEntries[i];

    if (isUserEntry(entry)) {
      // Check if this is a tool result message
      const content = entry.message.content;
      if (Array.isArray(content)) {
        const toolResults = content.filter(
          (b): b is ContentBlockToolResult => b.type === 'tool_result'
        );
        if (toolResults.length > 0) {
          // This is a tool result - attach it to the previous assistant turn
          const lastTurn = turns[turns.length - 1];
          if (lastTurn && lastTurn.type === 'assistant' && lastTurn.toolExecutions) {
            for (const result of toolResults) {
              const toolExec = lastTurn.toolExecutions.find(
                (t) => t.id === result.tool_use_id
              );
              if (toolExec) {
                toolExec.result = {
                  content: extractToolResultContent(result),
                  isError: result.is_error || false,
                  stdout: entry.toolUseResult?.stdout,
                  stderr: entry.toolUseResult?.stderr,
                };
                // Add agent stats if this is a Task tool result
                if (toolExec.name === 'Task' && entry.toolUseResult) {
                  toolExec.agentStats = {
                    totalToolUseCount: entry.toolUseResult.totalToolUseCount || 0,
                    totalTokens: entry.toolUseResult.totalTokens || 0,
                    totalDurationMs: entry.toolUseResult.totalDurationMs || 0,
                    agentId: entry.toolUseResult.agentId,
                  };
                }
              }
            }
          }
          i++;
          continue;
        }
      }

      // Regular user message
      const userContent = extractTextContent(entry.message.content);

      // Skip meta messages entirely - they're internal CLI noise
      if (entry.isMeta) {
        i++;
        continue;
      }

      // Skip subagent prompt messages - these are the Task tool's input,
      // already visible in the Task tool details of the parent turn
      if (entry.agentId) {
        i++;
        continue;
      }

      // Deduplicate branched user messages (same timestamp + content, different UUID)
      // Claude Code can write the same message twice when a conversation branches/retries
      if (userContent.trim()) {
        const dedupKey = `${entry.timestamp}|${userContent.slice(0, 200)}`;
        if (seenUserMessages.has(dedupKey)) {
          i++;
          continue;
        }
        seenUserMessages.add(dedupKey);
      }

      // Skip messages that look like internal CLI commands or outputs
      const lowerContent = userContent.toLowerCase();
      if (
        userContent.includes('<command-name>') ||
        userContent.includes('<local-command-stdout>') ||
        userContent.includes('<command-message>') ||
        userContent.startsWith('Caveat:') ||
        lowerContent.includes('do not respond to these messages')
      ) {
        i++;
        continue;
      }

      // Skip empty messages
      if (!userContent.trim()) {
        i++;
        continue;
      }

      turns.push({
        id: entry.uuid || `turn-${i}`,
        timestamp: entry.timestamp,
        type: 'user',
        userContent,
        isMeta: false,
        isSidechain: entry.isSidechain,
        agentId: entry.agentId,
      });
      i++;
    } else if (isAssistantEntry(entry)) {
      // Collect all consecutive assistant messages with the same requestId into one turn
      // These are streaming chunks of the same response
      const assistantEntries: AssistantLogEntry[] = [];
      const seenRequestIds = new Set<string>();

      while (i < messageEntries.length && isAssistantEntry(messageEntries[i])) {
        const assistantEntry = messageEntries[i] as AssistantLogEntry;
        const requestId = assistantEntry.requestId;

        // If we've seen a different requestId, this is a new response - stop here
        if (seenRequestIds.size > 0 && !seenRequestIds.has(requestId)) {
          break;
        }

        seenRequestIds.add(requestId);
        assistantEntries.push(assistantEntry);
        i++;
      }

      // Extract thinking, tool uses, and text from all entries
      const thinking: string[] = [];
      const toolExecutions: ToolExecution[] = [];
      const textContent: string[] = [];
      let totalUsage = {
        input: 0,
        output: 0,
        cacheCreation: 0,
        cacheRead: 0,
      };

      for (const assistantEntry of assistantEntries) {
        const content = assistantEntry.message.content;

        for (const block of content) {
          if (block.type === 'thinking') {
            const thinkingBlock = block as ContentBlockThinking;
            if (thinkingBlock.thinking && thinkingBlock.thinking.trim()) {
              thinking.push(thinkingBlock.thinking);
            }
          } else if (block.type === 'tool_use') {
            const toolBlock = block as ContentBlockToolUse;
            toolExecutions.push({
              id: toolBlock.id,
              name: toolBlock.name,
              input: toolBlock.input,
            });
          } else if (block.type === 'text') {
            const textBlock = block as ContentBlockText;
            if (textBlock.text && textBlock.text.trim()) {
              textContent.push(textBlock.text);
            }
          }
        }

        if (assistantEntry.message.usage) {
          const u = assistantEntry.message.usage;
          totalUsage.input += u.input_tokens || 0;
          totalUsage.output += u.output_tokens || 0;
          totalUsage.cacheCreation += u.cache_creation_input_tokens || 0;
          totalUsage.cacheRead += u.cache_read_input_tokens || 0;
        }
      }

      // Only add turn if there's actual content
      if (thinking.length > 0 || toolExecutions.length > 0 || textContent.length > 0) {
        const model = assistantEntries[0].message.model;
        const usage = {
          input_tokens: totalUsage.input,
          output_tokens: totalUsage.output,
          cache_creation_input_tokens: totalUsage.cacheCreation,
          cache_read_input_tokens: totalUsage.cacheRead,
        };
        turns.push({
          id: assistantEntries[0].uuid || `turn-${i}`,
          timestamp: assistantEntries[0].timestamp,
          type: 'assistant',
          thinking: thinking.length > 0 ? thinking : undefined,
          toolExecutions: toolExecutions.length > 0 ? toolExecutions : undefined,
          textContent: textContent.length > 0 ? textContent : undefined,
          model,
          usage,
          cost: model ? calculateTurnCost(model, usage) : 0,
          isSidechain: assistantEntries[0].isSidechain,
          agentId: assistantEntries[0].agentId,
        });
      }
    } else {
      i++;
    }
  }

  // Merge system turns into the timeline chronologically
  if (systemTurns.length > 0) {
    const merged = [...turns, ...systemTurns];
    merged.sort((a, b) => {
      const timeA = new Date(a.timestamp).getTime();
      const timeB = new Date(b.timestamp).getTime();
      return timeA - timeB;
    });

    // Populate sectionAgentIds: for each system turn, collect agents spawned
    // in the section between the previous system turn and this one
    let prevSystemIdx = -1;
    for (let idx = 0; idx < merged.length; idx++) {
      if (merged[idx].type === 'system') {
        const agentIds = new Set<string>();
        // Scan turns in this section (from previous boundary to this one)
        for (let j = prevSystemIdx + 1; j < idx; j++) {
          const t = merged[j];
          // Collect agents that appeared in this section
          if (t.agentId) {
            agentIds.add(t.agentId);
          }
          // Collect agents spawned via Task tool calls
          if (t.toolExecutions) {
            for (const tool of t.toolExecutions) {
              if (tool.name === 'Task' && tool.agentStats?.agentId) {
                agentIds.add(tool.agentStats.agentId);
              }
            }
          }
        }
        if (agentIds.size > 0) {
          merged[idx].sectionAgentIds = Array.from(agentIds);
        }
        prevSystemIdx = idx;
      }
    }

    return merged;
  }

  return turns;
}

const AGENT_COLORS = [
  '#3b82f6', // blue
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f97316', // orange
  '#14b8a6', // teal
  '#a855f7', // purple
];
const COMPACT_AGENT_COLOR = '#6b7280'; // grey

interface TaskToolData {
  description: string;
  subagentType?: string;
  stats?: AgentInfo['stats'];
}

function buildAgentRegistry(turns: ConversationTurn[]): Map<string, AgentInfo> {
  const registry = new Map<string, AgentInfo>();

  // Pass 1: scan Task tool executions for agent info
  // Keyed by agentId when we have agentStats, otherwise collected in order for fallback
  const matchedInfo = new Map<string, TaskToolData>();
  const unmatchedInfo: TaskToolData[] = [];

  for (const turn of turns) {
    if (turn.toolExecutions) {
      for (const tool of turn.toolExecutions) {
        if (tool.name === 'Task') {
          const input = tool.input as Record<string, unknown>;
          const data: TaskToolData = {
            description: input.description ? String(input.description) : input.prompt ? String(input.prompt).substring(0, 80) : '',
            subagentType: input.subagent_type ? String(input.subagent_type) : undefined,
            stats: tool.agentStats ? {
              totalToolUseCount: tool.agentStats.totalToolUseCount,
              totalTokens: tool.agentStats.totalTokens,
              totalDurationMs: tool.agentStats.totalDurationMs,
            } : undefined,
          };

          if (tool.agentStats?.agentId) {
            matchedInfo.set(tool.agentStats.agentId, data);
          } else {
            unmatchedInfo.push(data);
          }
        }
      }
    }
  }

  // Pass 2: scan all turns for unique agentId values, record first appearance + model
  const agentOrder: string[] = [];
  const agentModels = new Map<string, string>();
  for (const turn of turns) {
    const agentId = turn.agentId;
    if (agentId) {
      // Capture model from assistant turns
      if (turn.type === 'assistant' && turn.model && !agentModels.has(agentId)) {
        agentModels.set(agentId, turn.model);
      }
    }
  }

  // Pass 3: build registry entries
  let unmatchedIdx = 0;
  for (let i = 0; i < turns.length; i++) {
    const agentId = turns[i].agentId;
    if (agentId && !registry.has(agentId)) {
      agentOrder.push(agentId);
      const isCompact = agentId.startsWith('acompact-');

      // Try matched info first, then fall back to unmatched by order
      let info = matchedInfo.get(agentId);
      if (!info && !isCompact && unmatchedIdx < unmatchedInfo.length) {
        info = unmatchedInfo[unmatchedIdx++];
      }

      const colorIndex = isCompact ? -1 : agentOrder.filter(id => !id.startsWith('acompact-')).length - 1;
      const model = agentModels.get(agentId);

      registry.set(agentId, {
        agentId,
        agentNumber: agentOrder.length,
        description: info?.description || '',
        subagentType: info?.subagentType,
        model: model ? model.replace('claude-', '').replace(/-\d{8}$/, '') : undefined,
        color: isCompact ? COMPACT_AGENT_COLOR : AGENT_COLORS[colorIndex % AGENT_COLORS.length],
        isCompact,
        stats: info?.stats,
        firstTurnIndex: i,
      });
    }
  }

  return registry;
}

/** Extract file paths touched by Edit or Write tools in a turn */
function getEditedFiles(turn: ConversationTurn): string[] {
  if (!turn.toolExecutions) return [];
  const files = new Set<string>();
  for (const tool of turn.toolExecutions) {
    if ((tool.name === 'Edit' || tool.name === 'Write') && tool.input.file_path) {
      files.add(String(tool.input.file_path));
    }
  }
  return Array.from(files);
}

/** Group consecutive assistant turns that edit overlapping files */
export function groupTurns(turns: ConversationTurn[]): TurnGroup[] {
  const groups: TurnGroup[] = [];
  let currentGroup: ConversationTurn[] = [];
  let currentFiles = new Set<string>();

  function flushGroup() {
    if (currentGroup.length === 0) return;
    const allFiles = new Set<string>();
    let totalTools = 0;
    for (const t of currentGroup) {
      for (const f of getEditedFiles(t)) allFiles.add(f);
      totalTools += t.toolExecutions?.length || 0;
    }
    groups.push({
      id: currentGroup[0].id,
      turns: currentGroup,
      editedFiles: Array.from(allFiles),
      totalToolCalls: totalTools,
      totalCost: 0,
    });
    currentGroup = [];
    currentFiles = new Set();
  }

  for (const turn of turns) {
    if (turn.type !== 'assistant') {
      flushGroup();
      // Non-assistant turns become single-turn groups
      groups.push({
        id: turn.id,
        turns: [turn],
        editedFiles: [],
        totalToolCalls: 0,
        totalCost: 0,
      });
      continue;
    }

    const files = getEditedFiles(turn);

    if (currentGroup.length === 0) {
      // Start a new group
      currentGroup.push(turn);
      for (const f of files) currentFiles.add(f);
      continue;
    }

    // Check if this assistant turn shares any edited files with the current group
    const hasOverlap = files.length > 0 && files.some(f => currentFiles.has(f));

    if (hasOverlap) {
      currentGroup.push(turn);
      for (const f of files) currentFiles.add(f);
    } else {
      flushGroup();
      currentGroup.push(turn);
      for (const f of files) currentFiles.add(f);
    }
  }

  flushGroup();
  return groups;
}

export function parseSession(text: string): ParsedSession {
  const entries = parseJsonl(text);

  console.log(`Parsed ${entries.length} total entries`);
  console.log(`User entries: ${entries.filter(isUserEntry).length}`);
  console.log(`Assistant entries: ${entries.filter(isAssistantEntry).length}`);
  console.log(`Sidechain entries: ${entries.filter((e: any) => e.isSidechain).length}`);

  const turns = groupIntoTurns(entries);

  console.log(`Generated ${turns.length} conversation turns`);

  // Extract session metadata from first user entry
  const firstUser = entries.find(isUserEntry);

  // Calculate total tokens
  let totalInput = 0;
  let totalOutput = 0;
  for (const turn of turns) {
    if (turn.usage) {
      totalInput += turn.usage.input_tokens || 0;
      totalOutput += turn.usage.output_tokens || 0;
    }
  }

  const agentRegistry = buildAgentRegistry(turns);

  // Compute groups — totalCost is just the direct cost of turns in the group.
  // Per-message attribution (including subagents) is done in ConversationViewer
  // via timestamp-based slicing of session.turns.
  const groups = groupTurns(turns);
  for (const group of groups) {
    group.totalCost = group.turns.reduce((sum, t) => sum + (t.cost ?? 0), 0);
  }

  const totalCost = turns.reduce((sum, t) => sum + (t.cost ?? 0), 0);

  return {
    sessionId: firstUser?.sessionId || 'unknown',
    version: firstUser?.version || 'unknown',
    cwd: firstUser?.cwd || 'unknown',
    gitBranch: firstUser?.gitBranch,
    turns,
    groups,
    totalTokens: {
      input: totalInput,
      output: totalOutput,
    },
    totalCost,
    agentRegistry,
  };
}
