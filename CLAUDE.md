# Claude Glass

Web-based viewer for Claude CLI session logs (.jsonl). React + TypeScript + Vite app in `app/`.

## Project Structure

- `app/src/` - Main source code
  - `lib/logParser.ts` - Core JSONL parsing and turn grouping logic
  - `lib/utils.ts` - Formatting utilities
  - `components/` - React components (FileUpload, ConversationViewer, TurnViewer, CodeBlock, MarkdownRenderer, Modal, Collapsible)
  - `types.ts` - TypeScript type definitions for log entries
- `app/dist/` - Production build output
- `logs/` - Sample log files for testing
- `sample_log.jsonl` - Original sample log

## JSONL Log Structure

Logs come from `~/.claude/projects/<project-path>/`. Each session is a UUID `.jsonl` file. Subagents are in `<session-uuid>/subagents/agent-*.jsonl`.

### Entry types

| Type | Description |
|------|-------------|
| `user` | User messages and tool results |
| `assistant` | Model responses (text, thinking, tool_use) |
| `file-history-snapshot` | File state snapshots |
| `progress` | Hook/tool progress events (CLI >= 2.1.x) |
| `system` | Meta messages with duration, subtype (CLI >= 2.1.x) |
| `summary` | Conversation compression/summaries (CLI >= 2.1.x) |
| `queue-operation` | Queue operations (CLI >= 2.1.x) |

### Log format is driven by CLI version, not model

The assistant message structure is identical across Sonnet 4.5, Opus 4.5, and Opus 4.6:
- Same message keys: `content`, `id`, `model`, `role`, `stop_reason`, `stop_sequence`, `type`, `usage`
- Same content block types: `text`, `thinking`, `tool_use`
- All models produce thinking blocks

#### CLI version differences

- **v2.0.x**: Only `user`, `assistant`, `file-history-snapshot` entry types. No `slug` field.
- **v2.1.x**: Adds `progress`, `system`, `summary`, `queue-operation` entry types. Adds `slug` field on all entries.

#### Minor model-level differences (usage field only)

- Opus 4.6 adds `inference_geo` and `server_tool_use` to `usage`
- Sonnet 4.5 and Opus 4.5 do not have these fields

### Subagents

Subagents are a tool choice (via `Task` tool), not model-specific. Any model can spawn them. Subagent logs are stored in `<session-uuid>/subagents/agent-<id>.jsonl` alongside the parent session.

### Key entry-level fields

- `type`, `sessionId`, `uuid`, `parentUuid`, `timestamp`, `cwd`, `gitBranch`, `version`
- `slug` (CLI >= 2.1.x)
- `userType` - "external" for real user, other values for tool results
- `toolUseResult`, `sourceToolAssistantUUID` - on tool result user entries
- `isSidechain`, `isMeta`, `isCompactSummary` - various flags
- `requestId` - on assistant entries

### Assistant message.content block types

- `text` - Text response
- `thinking` - Extended thinking output
- `tool_use` - Tool invocation with `name` and `input`
- `tool_result` - Result of tool execution
- `image` - Image content
- `document` - Document content
