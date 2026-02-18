import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import pathMod from 'path'
import fs from 'fs/promises'
import os from 'os'

const PROJECTS_DIR = pathMod.join(os.homedir(), '.claude', 'projects')
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

function decodeProjectDirName(dirName: string): string {
  if (dirName.startsWith('-')) return dirName.replace(/-/g, '/')
  return dirName
}

function shortNameFromPath(displayPath: string): string {
  const parts = displayPath.split('/').filter(Boolean)
  if (parts.length <= 2) return parts.join('/')
  return parts.slice(-2).join('/')
}

async function peekMetadata(filePath: string): Promise<{
  timestamp: string | null
  gitBranch: string | null
  version: string | null
  firstUserMessage: string | null
}> {
  // Read first 64KB
  const fh = await fs.open(filePath, 'r')
  const buf = Buffer.alloc(65536)
  const { bytesRead } = await fh.read(buf, 0, 65536, 0)
  await fh.close()
  const text = buf.subarray(0, bytesRead).toString('utf8')
  const lines = text.split('\n').filter(Boolean)

  let timestamp: string | null = null
  let gitBranch: string | null = null
  let version: string | null = null
  let firstUserMessage: string | null = null

  for (const line of lines) {
    try {
      const entry = JSON.parse(line)
      if (!timestamp && entry.timestamp) timestamp = entry.timestamp

      if (entry.type === 'user' && entry.userType === 'external' && !entry.agentId) {
        if (!timestamp && entry.timestamp) timestamp = entry.timestamp
        if (!gitBranch && entry.gitBranch) gitBranch = entry.gitBranch
        if (!version && entry.version) version = entry.version
        if (!firstUserMessage) {
          const msg = entry.message
          if (typeof msg?.content === 'string') firstUserMessage = msg.content
          else if (Array.isArray(msg?.content)) {
            const tb = msg.content.find((b: { type: string }) => b.type === 'text')
            if (tb?.text) firstUserMessage = tb.text
          }
        }
        if (firstUserMessage) break
      }

      if (entry.type === 'user' && !entry.agentId) {
        if (!gitBranch && entry.gitBranch) gitBranch = entry.gitBranch
        if (!version && entry.version) version = entry.version
      }
    } catch {
      // skip malformed
    }
  }

  return { timestamp, gitBranch, version, firstUserMessage }
}

function json(res: any, data: unknown, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(data))
}

function claudeProjectsApi(): Plugin {
  return {
    name: 'claude-projects-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url!, 'http://localhost')

        // GET /api/projects
        if (url.pathname === '/api/projects') {
          try {
            const entries = await fs.readdir(PROJECTS_DIR, { withFileTypes: true })
            const projects = []

            for (const entry of entries) {
              if (!entry.isDirectory() || !entry.name.startsWith('-')) continue
              const projectPath = pathMod.join(PROJECTS_DIR, entry.name)
              const children = await fs.readdir(projectPath, { withFileTypes: true })

              let sessionCount = 0
              let lastActivity: string | null = null

              for (const child of children) {
                if (child.isFile() && child.name.endsWith('.jsonl') && UUID_RE.test(child.name.replace('.jsonl', ''))) {
                  sessionCount++
                  const stat = await fs.stat(pathMod.join(projectPath, child.name))
                  const mtime = stat.mtime.toISOString()
                  if (!lastActivity || mtime > lastActivity) lastActivity = mtime
                }
              }

              if (sessionCount === 0) continue

              const displayPath = decodeProjectDirName(entry.name)
              projects.push({
                dirName: entry.name,
                displayPath,
                shortName: shortNameFromPath(displayPath),
                sessionCount,
                lastActivity,
              })
            }

            projects.sort((a, b) => {
              if (!a.lastActivity && !b.lastActivity) return 0
              if (!a.lastActivity) return 1
              if (!b.lastActivity) return -1
              return b.lastActivity.localeCompare(a.lastActivity)
            })

            return json(res, projects)
          } catch (err: any) {
            return json(res, { error: err.message }, 500)
          }
        }

        // GET /api/projects/:dirName/sessions
        const sessionsMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/sessions$/)
        if (sessionsMatch) {
          try {
            const dirName = decodeURIComponent(sessionsMatch[1])
            const projectPath = pathMod.join(PROJECTS_DIR, dirName)
            const children = await fs.readdir(projectPath, { withFileTypes: true })

            // Collect UUID dirs for subagent detection
            const uuidDirs = new Set<string>()
            for (const child of children) {
              if (child.isDirectory() && UUID_RE.test(child.name)) {
                uuidDirs.add(child.name)
              }
            }

            const sessions = []
            for (const child of children) {
              if (!child.isFile() || !child.name.endsWith('.jsonl')) continue
              const sessionId = child.name.replace('.jsonl', '')
              if (!UUID_RE.test(sessionId)) continue

              const filePath = pathMod.join(projectPath, child.name)
              const stat = await fs.stat(filePath)
              const metadata = await peekMetadata(filePath)

              // Count subagents
              let subagentCount = 0
              if (uuidDirs.has(sessionId)) {
                try {
                  const subPath = pathMod.join(projectPath, sessionId, 'subagents')
                  const subs = await fs.readdir(subPath)
                  subagentCount = subs.filter(s => s.endsWith('.jsonl') && !s.includes('acompact-')).length
                } catch { /* no subagents dir */ }
              }

              sessions.push({
                sessionId,
                filename: child.name,
                sizeBytes: stat.size,
                hasSubagents: subagentCount > 0,
                subagentCount,
                ...metadata,
              })
            }

            sessions.sort((a, b) => {
              if (!a.timestamp && !b.timestamp) return 0
              if (!a.timestamp) return 1
              if (!b.timestamp) return -1
              return b.timestamp.localeCompare(a.timestamp)
            })

            return json(res, sessions)
          } catch (err: any) {
            return json(res, { error: err.message }, 500)
          }
        }

        // GET /api/sessions/:dirName/:sessionId
        const loadMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/([^/]+)$/)
        if (loadMatch) {
          try {
            const dirName = decodeURIComponent(loadMatch[1])
            const sessionId = loadMatch[2]
            const projectPath = pathMod.join(PROJECTS_DIR, dirName)
            const mainPath = pathMod.join(projectPath, `${sessionId}.jsonl`)

            const files: { content: string; filename: string }[] = []
            files.push({
              content: await fs.readFile(mainPath, 'utf8'),
              filename: `${sessionId}.jsonl`,
            })

            // Load subagents
            try {
              const subPath = pathMod.join(projectPath, sessionId, 'subagents')
              const subs = await fs.readdir(subPath)
              for (const sub of subs) {
                if (!sub.endsWith('.jsonl')) continue
                files.push({
                  content: await fs.readFile(pathMod.join(subPath, sub), 'utf8'),
                  filename: sub,
                })
              }
            } catch { /* no subagents */ }

            return json(res, { files })
          } catch (err: any) {
            return json(res, { error: err.message }, 500)
          }
        }

        next()
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), claudeProjectsApi()],
  resolve: {
    alias: {
      '@': pathMod.resolve(__dirname, './src'),
    },
  },
})
