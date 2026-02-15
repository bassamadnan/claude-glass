// Raw log entry types based on Claude CLI JSONL format

export interface TokenUsage {
  input_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  output_tokens: number;
  service_tier?: string;
  cache_creation?: {
    ephemeral_5m_input_tokens: number;
    ephemeral_1h_input_tokens: number;
  };
}

// Content block types
export interface ContentBlockText {
  type: 'text';
  text: string;
}

export interface ContentBlockThinking {
  type: 'thinking';
  thinking: string;
  signature?: string;
}

export interface ContentBlockToolUse {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ContentBlockToolResult {
  type: 'tool_result';
  tool_use_id: string;
  content: string | ContentBlock[];
  is_error?: boolean;
}

export type ContentBlock =
  | ContentBlockText
  | ContentBlockThinking
  | ContentBlockToolUse
  | ContentBlockToolResult;

// Tool use result (detailed)
export interface ToolUseResult {
  status?: string;
  prompt?: string;
  agentId?: string;
  content?: ContentBlock[];
  totalDurationMs?: number;
  totalTokens?: number;
  totalToolUseCount?: number;
  usage?: TokenUsage;
  stdout?: string;
  stderr?: string;
  interrupted?: boolean;
  isImage?: boolean;
}

// Message structures
export interface UserMessageContent {
  role: 'user';
  content: string | ContentBlock[];
}

export interface AssistantMessageContent {
  model: string;
  id: string;
  type: 'message';
  role: 'assistant';
  content: ContentBlock[];
  stop_reason: string | null;
  stop_sequence: string | null;
  usage: TokenUsage;
}

// Log entry types
export interface BaseLogEntry {
  uuid?: string;
  timestamp: string;
}

export interface FileHistorySnapshot extends BaseLogEntry {
  type: 'file-history-snapshot';
  messageId: string;
  snapshot: {
    messageId: string;
    trackedFileBackups: Record<string, unknown>;
    timestamp: string;
  };
  isSnapshotUpdate: boolean;
}

export interface UserLogEntry extends BaseLogEntry {
  type: 'user';
  parentUuid: string | null;
  isSidechain: boolean;
  userType: string;
  cwd: string;
  sessionId: string;
  version: string;
  gitBranch?: string;
  message: UserMessageContent;
  isMeta?: boolean;
  slug?: string;
  thinkingMetadata?: {
    level: string;
    disabled: boolean;
    triggers: unknown[];
  };
  todos?: unknown[];
  toolUseResult?: ToolUseResult;
  agentId?: string;
}

export interface AssistantLogEntry extends BaseLogEntry {
  type: 'assistant';
  parentUuid: string;
  isSidechain: boolean;
  userType: string;
  cwd: string;
  sessionId: string;
  version: string;
  gitBranch?: string;
  message: AssistantMessageContent;
  requestId: string;
  slug?: string;
  agentId?: string;
}

export interface SystemLogEntry extends BaseLogEntry {
  type: 'system';
  subtype?: string;
  content?: string;
  level?: string;
  compactMetadata?: {
    trigger: string;
    preTokens: number;
  };
  parentUuid?: string;
  slug?: string;
}

export interface SummaryLogEntry extends BaseLogEntry {
  type: 'summary';
  summary: string;
  leafUuid?: string;
}

export type LogEntry = FileHistorySnapshot | UserLogEntry | AssistantLogEntry | SystemLogEntry | SummaryLogEntry;

// Parsed and grouped structures for display

export interface ToolExecution {
  id: string;
  name: string;
  input: Record<string, unknown>;
  result?: {
    content: string;
    isError: boolean;
    stdout?: string;
    stderr?: string;
  };
  // For Task (agent) tools
  agentStats?: {
    totalToolUseCount: number;
    totalTokens: number;
    totalDurationMs: number;
    agentId?: string;
  };
}

export interface ConversationTurn {
  id: string;
  timestamp: string;
  type: 'user' | 'assistant' | 'system';

  // For user turns
  userContent?: string;
  isMeta?: boolean;

  // For assistant turns
  thinking?: string[];
  toolExecutions?: ToolExecution[];
  textContent?: string[];
  model?: string;
  usage?: TokenUsage;

  // For system turns (compact boundaries)
  systemSubtype?: string;
  systemContent?: string;
  compactTrigger?: string;
  preTokens?: number;
  summaryText?: string;

  // Agent context
  isSidechain?: boolean;
  agentId?: string;
}

export interface AgentInfo {
  agentId: string;
  agentNumber: number;
  description: string;
  subagentType?: string;
  color: string;
  isCompact: boolean;
  stats?: {
    totalToolUseCount: number;
    totalTokens: number;
    totalDurationMs: number;
  };
  firstTurnIndex: number;
}

export interface ParsedSession {
  sessionId: string;
  version: string;
  cwd: string;
  gitBranch?: string;
  turns: ConversationTurn[];
  totalTokens: {
    input: number;
    output: number;
  };
  agentRegistry: Map<string, AgentInfo>;
}
