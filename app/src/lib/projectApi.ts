// Frontend API client for the Claude projects server endpoints

export interface ProjectInfo {
  dirName: string;
  displayPath: string;
  shortName: string;
  sessionCount: number;
  lastActivity: string | null;
}

export interface SessionInfo {
  sessionId: string;
  filename: string;
  sizeBytes: number;
  hasSubagents: boolean;
  subagentCount: number;
  timestamp: string | null;
  gitBranch: string | null;
  version: string | null;
  firstUserMessage: string | null;
}

export async function fetchProjects(): Promise<ProjectInfo[]> {
  const res = await fetch('/api/projects');
  if (!res.ok) throw new Error('Failed to load projects');
  return res.json();
}

export async function fetchSessions(projectDir: string): Promise<SessionInfo[]> {
  const res = await fetch(`/api/projects/${encodeURIComponent(projectDir)}/sessions`);
  if (!res.ok) throw new Error('Failed to load sessions');
  return res.json();
}

export async function loadSession(
  projectDir: string,
  sessionId: string
): Promise<{ content: string; filename: string }[]> {
  const res = await fetch(`/api/sessions/${encodeURIComponent(projectDir)}/${sessionId}`);
  if (!res.ok) throw new Error('Failed to load session');
  const data = await res.json();
  return data.files;
}
