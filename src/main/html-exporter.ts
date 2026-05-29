import { dialog } from 'electron'
import * as fs from 'fs'
import { Marked } from 'marked'
import Convert from 'ansi-to-html'
import type { ParsedMessage, ContentBlock, ToolResult } from './session-parser'

const marked = new Marked({ gfm: true, breaks: false })

const ansiConverter = new Convert({
  fg: '#e6edf3',
  bg: '#0d1117',
  newline: false,
  escapeXML: true,
  colors: {
    0: '#484f58', 1: '#ff7b72', 2: '#7ee787', 3: '#d29922',
    4: '#58a6ff', 5: '#bc8cff', 6: '#39c5cf', 7: '#c9d1d9',
    8: '#6e7681', 9: '#ffa198', 10: '#56d364', 11: '#e3b341',
    12: '#79c0ff', 13: '#d2a8ff', 14: '#56d4dd', 15: '#f0f6fc'
  }
})

function ansiToHtml(raw: string): string {
  try {
    return ansiConverter.toHtml(raw)
  } catch {
    return escapeHtml(stripAnsi(raw))
  }
}

function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\[[0-?]*[ -/]*[@-~]/g, '').replace(/\][^]*(|\\)/g, '')
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function renderMarkdown(text: string): string {
  try {
    return marked.parse(text) as string
  } catch {
    return `<p>${escapeHtml(text)}</p>`
  }
}

const EXT_TO_LANG: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
  py: 'python', rb: 'ruby', rs: 'rust', go: 'go', java: 'java',
  cs: 'csharp', cpp: 'cpp', c: 'c', h: 'c', hpp: 'cpp',
  css: 'css', scss: 'scss', less: 'less', html: 'html', vue: 'vue',
  json: 'json', yaml: 'yaml', yml: 'yaml', toml: 'toml', xml: 'xml',
  md: 'markdown', sql: 'sql', sh: 'bash', bash: 'bash', zsh: 'bash',
  lua: 'lua', dart: 'dart', swift: 'swift', kt: 'kotlin'
}

function getLangFromPath(filePath: string): string {
  const name = filePath.split(/[/\\]/).pop() || ''
  const lower = name.toLowerCase()
  if (lower === 'dockerfile') return 'dockerfile'
  if (lower === 'makefile') return 'makefile'
  if (lower.endsWith('.d.ts')) return 'typescript'
  const ext = name.split('.').pop()?.toLowerCase() || ''
  return EXT_TO_LANG[ext] || ext || 'text'
}

function getFileName(filePath: string): string {
  return filePath.split(/[/\\]/).pop() || filePath
}

const TOOL_COLORS: Record<string, string> = {
  Bash: '#238636', Read: '#1f6feb', Write: '#8957e5', Edit: '#bd561d',
  Glob: '#0e7490', Grep: '#0d9488', WebFetch: '#4f46e5', WebSearch: '#4f46e5',
  Agent: '#be185d', AskUserQuestion: '#ca8a04', TodoWrite: '#059669',
  TaskCreate: '#059669', TaskUpdate: '#059669', TaskList: '#059669', TaskGet: '#059669',
  TaskOutput: '#059669', TaskStop: '#059669',
  TeamCreate: '#d2603a', TeamDelete: '#d2603a', SendMessage: '#0ea5e9',
  LSP: '#0284c7', Skill: '#d97706', NotebookEdit: '#7c3aed'
}

const STATUS_STYLES: Record<string, { icon: string; color: string }> = {
  completed: { icon: '✅', color: '#3fb950' },
  in_progress: { icon: '⏳', color: '#58a6ff' },
  pending: { icon: '⭕', color: '#8b949e' },
  deleted: { icon: '❌', color: '#f85149' }
}

// =============================================================
// CSS — mirrors the UI palette and key components
// =============================================================
const CSS = `
:root {
  --bg: #0d1117; --surface: #161b22; --surface2: #1c2333;
  --border: #30363d; --text: #e6edf3; --text2: #8b949e; --text3: #6e7681;
  --accent: #58a6ff; --accent2: #79c0ff; --user-bg: #1a3a5c;
  --error: #f85149; --green: #3fb950; --yellow: #d29922; --pink: #f778ba;
  --red-bg: rgba(248,81,73,0.08); --green-bg: rgba(63,185,80,0.08);
}
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { background: var(--bg); color: var(--text); }
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
  line-height: 1.6; font-size: 14px;
}
.container { max-width: 960px; margin: 0 auto; padding: 24px; }

/* ---------- Header ---------- */
.session-header {
  border-bottom: 1px solid var(--border);
  padding-bottom: 16px;
  margin-bottom: 24px;
}
.session-header h1 { font-size: 18px; margin-bottom: 8px; font-weight: 600; }
.session-meta {
  color: var(--text2); font-size: 12px;
  display: flex; gap: 16px; flex-wrap: wrap; align-items: center;
}
.session-meta span { display: inline-flex; align-items: center; gap: 4px; }
.session-meta .id { font-family: ui-monospace, 'Cascadia Code', Consolas, monospace; color: var(--text3); }
.session-meta .branch { color: var(--accent); }

/* ---------- Messages ---------- */
.msg-wrap { display: flex; margin-bottom: 16px; }
.msg-wrap.user { justify-content: flex-end; }
.msg-wrap.assistant { justify-content: flex-start; }
.msg {
  border-radius: 16px; padding: 12px 16px; max-width: 90%;
}
.msg.user { background: var(--user-bg); border-top-right-radius: 4px; max-width: 85%; }
.msg.assistant { background: var(--surface); border: 1px solid var(--border); border-top-left-radius: 4px; }
.msg-head {
  display: flex; align-items: center; gap: 8px;
  margin-bottom: 6px; font-size: 11px;
}
.msg-head .role { text-transform: uppercase; font-weight: 600; letter-spacing: 0.04em; }
.msg-head .role.user { color: #93c5fd; }
.msg-head .role.assistant { color: #d8b4fe; }
.msg-head .model { color: var(--accent); }
.msg-head .time { margin-left: auto; color: var(--text3); }

/* Message text */
.msg-content { font-size: 14px; user-select: text; }
.msg-content > * + * { margin-top: 4px; }
.msg-content p { margin: 4px 0; }
.msg-content ul, .msg-content ol { padding-left: 24px; margin: 4px 0; }
.msg-content li { margin: 2px 0; }
.msg-content h1 { font-size: 22px; margin: 12px 0 6px; }
.msg-content h2 { font-size: 18px; margin: 10px 0 6px; }
.msg-content h3 { font-size: 16px; margin: 8px 0 4px; }
.msg-content h4 { font-size: 15px; margin: 6px 0 4px; }
.msg-content blockquote {
  border-left: 3px solid var(--border); padding-left: 12px;
  color: var(--text2); margin: 6px 0;
}
.msg-content table {
  border-collapse: collapse; margin: 6px 0; width: 100%;
  border: 1px solid var(--border); font-size: 13px;
}
.msg-content th, .msg-content td { border: 1px solid var(--border); padding: 6px 10px; text-align: left; }
.msg-content th { background: var(--surface); font-weight: 600; }
.msg-content a { color: var(--accent); }
.msg-content a:hover { color: var(--accent2); text-decoration: underline; }
.msg-content img { max-width: 100%; border-radius: 6px; }
.msg-content pre {
  background: #010409; border: 1px solid var(--border); border-radius: 6px;
  padding: 12px; overflow-x: auto; font-size: 12.5px; line-height: 1.5;
  margin: 6px 0;
}
.msg-content code {
  font-family: ui-monospace, 'Cascadia Code', 'Fira Code', Consolas, monospace;
  font-size: 12.5px;
}
.msg-content :not(pre) > code {
  background: var(--surface2); padding: 2px 6px; border-radius: 4px;
  font-size: 13px; color: var(--text);
}

/* ---------- Slash command (user side) ---------- */
.slash-cmd { font-family: ui-monospace, 'Cascadia Code', Consolas, monospace; font-size: 13px; }
.slash-cmd-line { display: flex; gap: 8px; align-items: center; color: var(--text); }
.slash-cmd-line .prompt { color: var(--text3); }
.slash-cmd-line .name { font-weight: 600; }
.slash-cmd-line .args { color: #d1d5db; }
.slash-cmd-msg { color: var(--text2); margin-top: 4px; }
.slash-cmd-output {
  margin-top: 8px; margin-left: 16px;
  background: #0d1117; border: 1px solid var(--border); border-radius: 6px;
  padding: 8px 12px; font-size: 12px; overflow-x: auto;
  white-space: pre-wrap; word-break: break-word;
}
.slash-cmd-output.stderr { color: #fca5a5; }

/* ---------- Images ---------- */
.img-list { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 8px; }
.img-list img {
  max-width: 240px; max-height: 200px; border-radius: 8px;
  border: 1px solid var(--border); object-fit: contain; cursor: zoom-in;
}
.img-broken {
  width: 128px; height: 96px; border-radius: 8px;
  background: #0d1117; border: 1px solid var(--border);
  display: flex; align-items: center; justify-content: center;
  color: var(--text3); font-size: 11px;
}

/* ---------- Thinking ---------- */
details.thinking {
  background: var(--surface2); border-left: 3px solid var(--yellow);
  border-radius: 0 6px 6px 0; margin: 8px 0; overflow: hidden;
}
details.thinking summary {
  cursor: pointer; padding: 8px 12px;
  display: flex; align-items: center; gap: 8px;
  font-size: 13px; list-style: none;
}
details.thinking summary::-webkit-details-marker { display: none; }
details.thinking summary::before {
  content: '▶'; font-size: 10px; color: var(--text3);
  display: inline-block; transition: transform 0.15s;
}
details.thinking[open] summary::before { transform: rotate(90deg); }
details.thinking .label { color: var(--yellow); font-weight: 500; }
details.thinking .meta { color: var(--text3); font-size: 12px; }
details.thinking .preview {
  color: var(--text3); font-size: 12px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  max-width: 380px;
}
details.thinking .body {
  padding: 0 12px 12px; font-size: 13px; color: var(--text2);
  white-space: pre-wrap; line-height: 1.6;
  font-family: ui-monospace, 'Cascadia Code', Consolas, monospace;
}

/* ---------- Tool call ---------- */
details.tool {
  margin: 8px 0; border: 1px solid var(--border); border-radius: 8px;
  background: var(--surface); overflow: hidden;
}
details.tool > summary {
  cursor: pointer; padding: 8px 12px;
  display: flex; align-items: flex-start; gap: 8px;
  font-size: 13px; list-style: none;
}
details.tool > summary::-webkit-details-marker { display: none; }
details.tool > summary::before {
  content: '▶'; font-size: 10px; color: var(--text3);
  display: inline-block; transition: transform 0.15s;
  margin-top: 4px; flex-shrink: 0;
}
details.tool[open] > summary::before { transform: rotate(90deg); }
.tool-badge {
  background: #6b7280; color: #fff; padding: 2px 8px;
  border-radius: 4px; font-weight: 600; font-size: 11px;
  flex-shrink: 0; margin-top: 1px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}
.tool-summary {
  color: var(--text2); font-size: 12px; flex: 1; min-width: 0;
  word-break: break-all; line-height: 1.5;
}
.tool-error-tag { color: var(--error); font-size: 11px; flex-shrink: 0; margin-left: auto; }
.tool-body { border-top: 1px solid var(--border); padding: 8px 12px; }
.tool-body > * + * { margin-top: 8px; }

/* Sub-blocks inside tool body */
.kv { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; font-size: 12px; }
.kv .label { color: var(--text3); }
.kv .path { color: var(--accent); font-family: ui-monospace, Consolas, monospace; word-break: break-all; }
.kv .pat { color: var(--yellow); background: rgba(210,153,34,0.1); padding: 1px 6px; border-radius: 4px; font-family: ui-monospace, Consolas, monospace; }
.kv .pat-cyan { color: #56d4dd; background: rgba(86,212,221,0.1); padding: 1px 6px; border-radius: 4px; font-family: ui-monospace, Consolas, monospace; }
.kv .muted { color: var(--text3); }

.code-card {
  border: 1px solid var(--border); border-radius: 6px; overflow: hidden;
  background: #010409;
}
.code-card-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 4px 12px; background: var(--surface);
  border-bottom: 1px solid var(--border); font-size: 11px;
}
.code-card-head .label { color: var(--text2); }
.code-card-head .lang { color: var(--text3); font-size: 10px; }
.code-card-head .label.added { color: var(--green); }
.code-card-head .label.removed { color: var(--error); }
.code-card-head .label.error { color: var(--error); }
.code-card pre {
  margin: 0; padding: 10px 12px; font-size: 12.5px;
  overflow-x: auto; max-height: 480px; overflow-y: auto;
  white-space: pre; line-height: 1.5;
  background: transparent;
}
.code-card pre.wrap { white-space: pre-wrap; word-break: break-word; }
.code-card pre code { font-family: ui-monospace, Consolas, monospace; font-size: 12.5px; }
.code-card.removed pre { background: var(--red-bg); }
.code-card.added pre { background: var(--green-bg); }
.code-card.bash pre { color: #86efac; }
.code-card.error pre { color: #fca5a5; }
.code-card .truncated {
  text-align: center; padding: 6px;
  border-top: 1px solid var(--border);
  font-size: 11px; color: var(--text3);
  background: var(--surface);
}

.diff-stack > * + * { border-top: 1px solid var(--border); }

/* Glob list */
.glob-list { padding: 6px 12px; max-height: 240px; overflow-y: auto; font-size: 12px; }
.glob-list .item { color: var(--accent); font-family: ui-monospace, Consolas, monospace; padding: 2px 0; }

/* TodoWrite */
.todo-list { display: flex; flex-direction: column; gap: 4px; padding: 4px 0; }
.todo-item { display: flex; align-items: flex-start; gap: 8px; padding: 4px 0; font-size: 12.5px; }
.todo-item .icon { flex-shrink: 0; line-height: 1.5; }
.todo-item .label { flex: 1; min-width: 0; }
.todo-item .status { font-size: 10px; flex-shrink: 0; opacity: 0.8; }
.todo-active { color: var(--text3); font-size: 10px; margin-top: 2px; }

/* AskUserQuestion */
.ask-q { background: #010409; border: 1px solid var(--border); border-radius: 6px; padding: 10px; margin-bottom: 8px; }
.ask-q .question { color: var(--yellow); font-weight: 500; font-size: 12px; margin-bottom: 6px; }
.ask-opt {
  display: flex; gap: 8px; padding: 4px 8px; border-radius: 4px;
  font-size: 12px; align-items: flex-start; border: 1px solid transparent;
  margin-bottom: 2px;
}
.ask-opt.selected {
  background: rgba(63,185,80,0.10); border-color: rgba(63,185,80,0.40);
}
.ask-opt .icon { flex-shrink: 0; }
.ask-opt.selected .icon { color: var(--green); }
.ask-opt:not(.selected) .icon { color: var(--text3); }
.ask-opt .label { color: var(--text2); }
.ask-opt.selected .label { color: #86efac; font-weight: 500; }
.ask-opt .desc { color: var(--text3); margin-left: 4px; }
.ask-free {
  margin-top: 6px; padding: 4px 8px; border-radius: 4px;
  background: rgba(63,185,80,0.10); border: 1px solid rgba(63,185,80,0.40);
  color: #86efac; font-size: 12px;
}

/* Token usage */
.token-row {
  display: flex; gap: 12px; margin-top: 8px;
  padding-top: 8px; border-top: 1px solid rgba(48,54,61,0.6);
  font-size: 11px; color: var(--text3);
}

/* Footer */
.footer {
  text-align: center; color: var(--text3); font-size: 11px;
  margin-top: 40px; padding-top: 16px; border-top: 1px solid var(--border);
}

/* Image lightbox */
.lightbox {
  position: fixed; inset: 0; z-index: 100;
  background: rgba(0,0,0,0.85); display: none;
  align-items: center; justify-content: center;
  cursor: zoom-out;
}
.lightbox.active { display: flex; }
.lightbox img { max-width: 90vw; max-height: 90vh; object-fit: contain; border-radius: 8px; }

/* Scrollbars */
::-webkit-scrollbar { width: 10px; height: 10px; }
::-webkit-scrollbar-track { background: var(--bg); }
::-webkit-scrollbar-thumb { background: #30363d; border-radius: 5px; }
::-webkit-scrollbar-thumb:hover { background: #484f58; }
`

// =============================================================
// Inline JS — only needs to handle image lightbox
// =============================================================
const JS = `
document.querySelectorAll('img.lb-trigger').forEach(img => {
  img.addEventListener('click', () => {
    const lb = document.getElementById('lightbox');
    document.getElementById('lightbox-img').src = img.src;
    lb.classList.add('active');
  });
});
const lb = document.getElementById('lightbox');
if (lb) lb.addEventListener('click', () => lb.classList.remove('active'));
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') lb && lb.classList.remove('active');
});
`

// =============================================================
// Slash command parsing (mirrors UserMessage.tsx)
// =============================================================
interface SlashCommand {
  name: string
  message?: string
  args?: string
  stdout?: string
  stderr?: string
}

function parseSlashCommand(text: string): SlashCommand | null {
  const nameMatch = text.match(/<command-name>([\s\S]*?)<\/command-name>/)
  const stdoutMatch = text.match(/<local-command-stdout>([\s\S]*?)<\/local-command-stdout>/)
  const stderrMatch = text.match(/<local-command-stderr>([\s\S]*?)<\/local-command-stderr>/)
  if (!nameMatch && !stdoutMatch && !stderrMatch) return null
  const msgMatch = text.match(/<command-message>([\s\S]*?)<\/command-message>/)
  const argsMatch = text.match(/<command-args>([\s\S]*?)<\/command-args>/)
  return {
    name: nameMatch?.[1].trim() || '',
    message: msgMatch?.[1].trim() || undefined,
    args: argsMatch?.[1].trim() || undefined,
    stdout: stdoutMatch?.[1] ?? undefined,
    stderr: stderrMatch?.[1] ?? undefined
  }
}

function isCaveatOnly(text: string): boolean {
  return /^\s*<local-command-caveat>[\s\S]*?<\/local-command-caveat>\s*$/.test(text)
}

// =============================================================
// Teammate (swarm) messages — <teammate-message teammate_id=... color=... summary=...>
// =============================================================
interface TeammateMsg {
  teammateId: string
  color?: string
  summary?: string
  content: string
}

const AGENT_COLORS: Record<string, string> = {
  red: '#ff7b72', green: '#7ee787', yellow: '#e3b341', blue: '#58a6ff',
  magenta: '#d2a8ff', cyan: '#56d4dd', white: '#c9d1d9', gray: '#8b949e',
  grey: '#8b949e', orange: '#ff8c5a', purple: '#bc8cff', pink: '#f778ba'
}

function teammateColor(name?: string): string {
  if (!name) return '#56d4dd'
  return AGENT_COLORS[name.toLowerCase()] || '#56d4dd'
}

// Lifecycle noise that claude-code processes silently (hidden from the transcript).
const HIDDEN_TEAMMATE_TYPES = new Set(['idle_notification', 'teammate_terminated', 'shutdown_approved'])

function isTeammateNoise(content: string): boolean {
  if (!content.startsWith('{')) return false
  try {
    const t = (JSON.parse(content) as { type?: string }).type
    return typeof t === 'string' && HIDDEN_TEAMMATE_TYPES.has(t)
  } catch {
    return false
  }
}

function parseTeammateMessages(text: string): TeammateMsg[] {
  const re = /<teammate-message\s+teammate_id="([^"]+)"(?:\s+color="([^"]+)")?(?:\s+summary="([^"]+)")?>\n?([\s\S]*?)\n?<\/teammate-message>/g
  const out: TeammateMsg[] = []
  for (const m of text.matchAll(re)) {
    if (m[1] && m[4]) {
      const content = m[4].trim()
      if (isTeammateNoise(content)) continue
      out.push({ teammateId: m[1], color: m[2], summary: m[3], content })
    }
  }
  return out
}

function renderTeammateRow(msg: TeammateMsg): string {
  const color = teammateColor(msg.color)
  const name = escapeHtml(msg.teammateId)
  let json: Record<string, unknown> | null = null
  if (msg.content.startsWith('{')) {
    try { json = JSON.parse(msg.content) } catch { /* not JSON */ }
  }
  const type = json?.type as string | undefined

  const header = `<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
    <span style="font-size:12px;font-weight:600;color:${color}">@${name}</span>
    ${msg.summary ? `<span style="font-size:11px;color:var(--text3);font-style:italic">${escapeHtml(msg.summary)}</span>` : ''}
  </div>`

  const card = (borderColor: string, inner: string) =>
    `<div style="border:1px solid var(--border);border-left:3px solid ${borderColor};border-radius:6px;padding:8px 12px;background:var(--surface)">${header}${inner}</div>`

  if (type === 'task_assignment') {
    return card('#56d4dd', `<div style="font-size:12px;color:var(--text)"><span style="color:#56d4dd;font-weight:500">Task #${escapeHtml(String(json?.taskId ?? ''))}</span>${json?.assignedBy ? ` <span style="color:var(--text3)">assigned by ${escapeHtml(String(json.assignedBy))}</span>` : ''}</div>
      ${json?.subject ? `<div style="font-size:12px;color:var(--text);font-weight:500;margin-top:4px">${escapeHtml(String(json.subject))}</div>` : ''}
      ${json?.description ? `<div style="font-size:11px;color:var(--text3);margin-top:2px">${escapeHtml(String(json.description))}</div>` : ''}`)
  }
  if (type === 'plan_approval_response') {
    const approved = json?.approved === true || json?.approve === true
    return card(approved ? '#3fb950' : '#f85149', `<div style="font-size:12px;font-weight:500;color:${approved ? '#3fb950' : '#f85149'}">${approved ? '✓ Plan approved' : '✗ Plan rejected'}</div>${json?.feedback ? `<div style="font-size:11px;color:var(--text3);margin-top:4px">Feedback: ${escapeHtml(String(json.feedback))}</div>` : ''}`)
  }
  if (type === 'shutdown_request' || type === 'shutdown_rejected' || type === 'shutdown_approved') {
    const palette: Record<string, { c: string; label: string }> = {
      shutdown_request: { c: '#d29922', label: 'Shutdown requested' },
      shutdown_rejected: { c: '#8b949e', label: 'Shutdown rejected' },
      shutdown_approved: { c: '#3fb950', label: 'Shutdown approved' }
    }
    const p = palette[type]
    return card(p.c, `<div style="font-size:12px;font-weight:500;color:${p.c}">${p.label}${json?.from ? ` <span style="color:var(--text3);font-weight:400">— ${escapeHtml(String(json.from))}</span>` : ''}</div>${json?.reason ? `<div style="font-size:11px;color:var(--text3);margin-top:4px">Reason: ${escapeHtml(String(json.reason))}</div>` : ''}`)
  }
  if (type === 'task_completed') {
    return card('#3fb950', `<div style="font-size:12px;color:#3fb950">✓ Completed task #${escapeHtml(String(json?.taskId ?? ''))}${json?.taskSubject ? ` <span style="color:var(--text3)">(${escapeHtml(String(json.taskSubject))})</span>` : ''}</div>`)
  }
  if (json && type) {
    return card(color, `<div style="font-size:12px;color:var(--accent);font-weight:500">${escapeHtml(type.replace(/_/g, ' '))}</div><pre style="font-size:10px;color:var(--text3);margin-top:4px;overflow-x:auto"><code>${escapeHtml(JSON.stringify(json, null, 2))}</code></pre>`)
  }
  return card(color, `<div style="font-size:13px;color:var(--text)">${renderMarkdown(msg.content)}</div>`)
}

// =============================================================
// Truncation helper (mirrors UI 15K threshold)
// =============================================================
const TRUNCATE = 15000
function truncated(content: string): { display: string; bar: string } {
  if (content.length <= TRUNCATE) return { display: content, bar: '' }
  return {
    display: content.slice(0, TRUNCATE),
    bar: `<div class="truncated">Truncated at ${(TRUNCATE / 1000).toFixed(0)}K of ${(content.length / 1000).toFixed(0)}K chars</div>`
  }
}

// Strip cat -n prefixes
function stripLineNumbers(content: string): string {
  return content
    .split('\n')
    .map((line) => {
      const m = line.match(/^(\d+)\t(.*)$/)
      return m ? m[2] : line
    })
    .join('\n')
}

// =============================================================
// Tool input -> short summary text (mirrors getToolSummary)
// =============================================================
function getToolSummary(block: ContentBlock): string {
  if (block.type !== 'tool_use' || !block.input) return ''
  const input = block.input as Record<string, unknown>
  const name = block.name

  if (name === 'Bash' && input.command) return String(input.command)
  if (name === 'Read' && input.file_path) return String(input.file_path)
  if ((name === 'Write' || name === 'Edit') && input.file_path) return String(input.file_path)
  if (name === 'Glob' && input.pattern) return String(input.pattern)
  if (name === 'Grep' && input.pattern) {
    const path = input.path ? ` in ${input.path}` : ''
    return `/${input.pattern}/${path}`
  }
  if (name === 'WebFetch' && input.url) return String(input.url)
  if (name === 'WebSearch' && input.query) return String(input.query)
  if (name === 'Agent' && input.description) return String(input.description)
  if (name === 'LSP' && input.operation) return `${input.operation} @ ${input.filePath || ''}`
  if (name === 'TodoWrite' && input.todos) {
    const todos = input.todos as Array<{ status?: string }>
    const counts = { completed: 0, in_progress: 0, pending: 0 }
    for (const t of todos) {
      if (t.status && t.status in counts) (counts as Record<string, number>)[t.status]++
    }
    return `${todos.length} items (${counts.completed} done, ${counts.in_progress} active, ${counts.pending} pending)`
  }
  if (name === 'TaskCreate' && input.subject) return String(input.subject)
  if (name === 'TaskUpdate') return `#${input.taskId || ''} → ${input.status || ''}`
  if (name === 'TaskGet' && input.taskId) return `#${input.taskId}`
  if ((name === 'TaskOutput' || name === 'TaskStop') && input.task_id) return String(input.task_id)
  if (name === 'TeamCreate' && input.team_name) return `create team: ${input.team_name}`
  if (name === 'TeamDelete') return 'cleanup team'
  if (name === 'SendMessage') {
    const to = input.to ? `→ ${input.to}` : ''
    const msg = input.message
    if (typeof msg === 'object' && msg !== null) {
      const type = (msg as { type?: string }).type
      if (type) return `${to} (${type.replace(/_/g, ' ')})`
    }
    return input.summary ? `${to}: ${input.summary}` : to
  }
  return ''
}

// =============================================================
// Tool body renderers
// =============================================================
function renderToolResult(result: ToolResult | undefined, opts?: { wrap?: boolean }): string {
  if (!result) return ''
  const raw = result.stdout || result.content || ''
  if (!raw && !result.stderr) return ''
  const hasError = !!result.is_error
  const { display, bar } = truncated(raw)
  const wrapClass = opts?.wrap ? ' wrap' : ''
  const errClass = hasError ? ' error' : ''

  let html = ''
  if (raw) {
    html += `<div class="code-card${errClass}">
      <div class="code-card-head"><span class="label${hasError ? ' error' : ''}">${hasError ? 'Error' : 'Result'}</span></div>
      <pre class="${wrapClass.trim()}"><code>${escapeHtml(display)}</code></pre>
      ${bar}
    </div>`
  }
  if (result.stderr) {
    html += `<div class="code-card error">
      <div class="code-card-head"><span class="label error">stderr</span></div>
      <pre><code>${escapeHtml(result.stderr)}</code></pre>
    </div>`
  }
  return html
}

function renderEditTool(block: ContentBlock): string {
  const input = (block.input || {}) as Record<string, unknown>
  const filePath = String(input.file_path || '')
  const oldStr = String(input.old_string || '')
  const newStr = String(input.new_string || '')
  const lang = getLangFromPath(filePath)
  const replaceAll = input.replace_all ? '<span style="color:var(--yellow);font-size:11px"> (replace all)</span>' : ''

  return `
    <div class="kv"><span class="label">File:</span><span class="path">${escapeHtml(filePath)}</span>${replaceAll}</div>
    <div class="code-card diff-stack">
      <div class="code-card removed" style="border:none;border-radius:0">
        <div class="code-card-head"><span class="label removed">- old_string</span><span class="lang">${lang}</span></div>
        <pre><code>${escapeHtml(oldStr)}</code></pre>
      </div>
      <div class="code-card added" style="border:none;border-radius:0">
        <div class="code-card-head"><span class="label added">+ new_string</span><span class="lang">${lang}</span></div>
        <pre><code>${escapeHtml(newStr)}</code></pre>
      </div>
    </div>
    ${renderToolResult(block.result)}
  `
}

function renderReadTool(block: ContentBlock): string {
  const input = (block.input || {}) as Record<string, unknown>
  const filePath = String(input.file_path || '')
  const lang = getLangFromPath(filePath)
  const fileName = getFileName(filePath)
  const raw = block.result?.stdout || block.result?.content || ''
  const hasError = !!block.result?.is_error
  const { display, bar } = truncated(raw)
  const code = hasError ? display : stripLineNumbers(display)
  const offset = input.offset ? `from line ${input.offset}` : ''
  const limit = input.limit ? `${input.limit} lines` : ''
  const rangeInfo = [offset, limit].filter(Boolean).join(', ')

  let body = `<div class="kv">
    <span class="label">File:</span><span class="path">${escapeHtml(filePath)}</span>
    ${rangeInfo ? `<span class="muted">(${escapeHtml(rangeInfo)})</span>` : ''}
  </div>`

  if (block.result) {
    const errClass = hasError ? ' error' : ''
    body += `<div class="code-card${errClass}">
      <div class="code-card-head">
        <span class="label">${escapeHtml(fileName)}</span>
        <span class="lang">${lang}</span>
      </div>
      <pre><code>${escapeHtml(code)}</code></pre>
      ${bar}
    </div>`
  }
  return body
}

function renderWriteTool(block: ContentBlock): string {
  const input = (block.input || {}) as Record<string, unknown>
  const filePath = String(input.file_path || '')
  const content = String(input.content || '')
  const lang = getLangFromPath(filePath)
  const fileName = getFileName(filePath)
  const { display, bar } = truncated(content)

  return `
    <div class="kv"><span class="label">File:</span><span class="path">${escapeHtml(filePath)}</span></div>
    <div class="code-card">
      <div class="code-card-head">
        <span class="label" style="color:var(--green)">CREATE</span>
        <span class="label" style="color:var(--text2)">${escapeHtml(fileName)}</span>
        <span class="lang">${lang}</span>
      </div>
      <pre><code>${escapeHtml(display)}</code></pre>
      ${bar}
    </div>
    ${renderToolResult(block.result)}
  `
}

function renderBashTool(block: ContentBlock): string {
  const input = (block.input || {}) as Record<string, unknown>
  const command = String(input.command || '')
  const description = input.description ? String(input.description) : ''
  const raw = block.result?.stdout || block.result?.content || ''
  const hasError = !!block.result?.is_error
  const { display, bar } = truncated(raw)

  let body = ''
  if (description) body += `<div style="color:var(--text2);font-size:12px;font-style:italic">${escapeHtml(description)}</div>`

  body += `<div class="code-card bash">
    <div class="code-card-head"><span class="label" style="color:var(--green)">$</span></div>
    <pre class="wrap"><code>${escapeHtml(command)}</code></pre>
  </div>`

  if (block.result) {
    const errClass = hasError ? ' error' : ''
    body += `<div class="code-card${errClass}">
      <div class="code-card-head"><span class="label${hasError ? ' error' : ''}">${hasError ? 'Error Output' : 'Output'}</span></div>
      <pre class="wrap"><code>${escapeHtml(display) || '<span style="color:var(--text3)">(no output)</span>'}</code></pre>
      ${bar}
    </div>`
    if (block.result.stderr) {
      body += `<div class="code-card error">
        <div class="code-card-head"><span class="label error">stderr</span></div>
        <pre class="wrap"><code>${escapeHtml(block.result.stderr)}</code></pre>
      </div>`
    }
  }
  return body
}

function renderGrepTool(block: ContentBlock): string {
  const input = (block.input || {}) as Record<string, unknown>
  const pattern = String(input.pattern || '')
  const path = input.path ? String(input.path) : ''
  const glob = input.glob ? String(input.glob) : ''
  const outputMode = input.output_mode ? String(input.output_mode) : 'files_with_matches'
  const raw = block.result?.stdout || block.result?.content || ''
  const { display, bar } = truncated(raw)

  let body = `<div class="kv">
    <span class="label">Pattern:</span><span class="pat">${escapeHtml(pattern)}</span>
    ${path ? `<span class="label">in</span><span class="path">${escapeHtml(path)}</span>` : ''}
    ${glob ? `<span class="label">glob:</span><span class="muted" style="font-family:ui-monospace,Consolas,monospace">${escapeHtml(glob)}</span>` : ''}
    <span class="muted">mode: ${escapeHtml(outputMode)}</span>
  </div>`

  if (block.result) {
    body += `<div class="code-card">
      <div class="code-card-head"><span class="label">Results</span></div>
      <pre class="wrap"><code>${escapeHtml(display) || '<span style="color:var(--text3)">(no matches)</span>'}</code></pre>
      ${bar}
    </div>`
  }
  return body
}

function renderGlobTool(block: ContentBlock): string {
  const input = (block.input || {}) as Record<string, unknown>
  const pattern = String(input.pattern || '')
  const path = input.path ? String(input.path) : ''
  const raw = block.result?.stdout || block.result?.content || ''
  const files = raw.split('\n').filter(Boolean)

  let body = `<div class="kv">
    <span class="label">Pattern:</span><span class="pat-cyan">${escapeHtml(pattern)}</span>
    ${path ? `<span class="label">in</span><span class="path">${escapeHtml(path)}</span>` : ''}
  </div>`

  if (block.result) {
    body += `<div class="code-card">
      <div class="code-card-head"><span class="label">${files.length} files matched</span></div>
      <div class="glob-list">
        ${files.map((f) => `<div class="item">${escapeHtml(f)}</div>`).join('')}
      </div>
    </div>`
  }
  return body
}

function renderWebTool(block: ContentBlock): string {
  const input = (block.input || {}) as Record<string, unknown>
  const url = input.url ? String(input.url) : ''
  const query = input.query ? String(input.query) : ''
  const prompt = input.prompt ? String(input.prompt) : ''
  const raw = block.result?.stdout || block.result?.content || ''
  const { display, bar } = truncated(raw)

  let body = `<div class="kv">
    ${url ? `<span class="label">URL:</span><span class="path">${escapeHtml(url)}</span>` : ''}
    ${query ? `<span class="label">Query:</span><span class="pat">${escapeHtml(query)}</span>` : ''}
  </div>`

  if (prompt) body += `<div style="color:var(--text2);font-size:12px;font-style:italic">Prompt: ${escapeHtml(prompt)}</div>`

  if (block.result) {
    body += `<div class="code-card">
      <div class="code-card-head"><span class="label">Response</span></div>
      <pre class="wrap"><code>${escapeHtml(display)}</code></pre>
      ${bar}
    </div>`
  }
  return body
}

function renderAskUserTool(block: ContentBlock): string {
  const input = (block.input || {}) as Record<string, unknown>
  const questions = (input.questions as Array<{ question: string; options?: Array<{ label: string; description?: string }> }>) || []
  const resultContent = block.result?.content || ''

  const answers = new Map<string, string>()
  const re = /"([^"]+)"="([^"]+)"/g
  let m: RegExpExecArray | null
  while ((m = re.exec(resultContent)) !== null) {
    answers.set(m[1], m[2])
  }

  let body = ''
  for (const q of questions) {
    const answer = answers.get(q.question)
    let optionsHtml = ''
    if (q.options) {
      for (const opt of q.options) {
        const selected = answer === opt.label
        optionsHtml += `<div class="ask-opt${selected ? ' selected' : ''}">
          <span class="icon">${selected ? '✅' : '○'}</span>
          <span class="label">${escapeHtml(opt.label)}</span>
          ${opt.description ? `<span class="desc">${escapeHtml(opt.description)}</span>` : ''}
        </div>`
      }
    }
    let freeAnswer = ''
    if (answer && !q.options?.some((o) => o.label === answer)) {
      freeAnswer = `<div class="ask-free">✅ ${escapeHtml(answer)}</div>`
    }
    body += `<div class="ask-q">
      <div class="question">${escapeHtml(q.question)}</div>
      ${optionsHtml}
      ${freeAnswer}
    </div>`
  }

  if (resultContent && answers.size === 0 && questions.length === 0) {
    body += `<div class="ask-free">${escapeHtml(resultContent)}</div>`
  }
  return body
}

function renderTodoWriteTool(block: ContentBlock): string {
  const input = (block.input || {}) as Record<string, unknown>
  const todos = (input.todos as Array<{ content?: string; status?: string; activeForm?: string }>) || []

  if (todos.length === 0) {
    return `<div class="muted" style="font-size:12px">No items</div>`
  }

  let html = `<div class="todo-list">`
  for (const t of todos) {
    const st = STATUS_STYLES[t.status || 'pending'] || STATUS_STYLES.pending
    const showActive = t.activeForm && t.content && t.activeForm !== t.content
    html += `<div class="todo-item">
      <span class="icon">${st.icon}</span>
      <div class="label">
        <div style="color:${st.color}">${escapeHtml(t.content || t.activeForm || 'Untitled')}</div>
        ${showActive ? `<div class="todo-active">${escapeHtml(t.activeForm || '')}</div>` : ''}
      </div>
      <span class="status" style="color:${st.color}">${escapeHtml(t.status || '')}</span>
    </div>`
  }
  html += `</div>`
  html += renderToolResult(block.result)
  return html
}

function renderTaskTool(block: ContentBlock): string {
  const input = (block.input || {}) as Record<string, unknown>
  const name = block.name

  if (name === 'TaskCreate') {
    const st = STATUS_STYLES.pending
    return `<div style="display:flex;gap:8px;background:#010409;border:1px solid var(--border);border-radius:6px;padding:10px">
      <span style="font-size:14px">${st.icon}</span>
      <div style="flex:1;min-width:0">
        <div style="font-size:12px;color:var(--text);font-weight:500">${escapeHtml(String(input.subject || ''))}</div>
        ${input.description ? `<div style="font-size:11px;color:var(--text3);margin-top:2px">${escapeHtml(String(input.description))}</div>` : ''}
        ${input.activeForm ? `<div style="font-size:11px;color:var(--text3);margin-top:2px;font-style:italic">${escapeHtml(String(input.activeForm))}</div>` : ''}
      </div>
    </div>${renderToolResult(block.result)}`
  }

  if (name === 'TaskUpdate') {
    const newStatus = String(input.status || '')
    const st = STATUS_STYLES[newStatus] || STATUS_STYLES.pending
    return `<div class="kv">
      <span class="label">Task</span>
      <span style="color:var(--accent);font-family:ui-monospace,Consolas,monospace;font-size:12px">#${escapeHtml(String(input.taskId || ''))}</span>
      <span class="muted">→</span>
      <span style="color:${st.color};font-size:12px;font-weight:500">${st.icon} ${escapeHtml(newStatus)}</span>
    </div>
    ${input.subject ? `<div style="color:var(--text);font-size:12px;margin-top:4px">${escapeHtml(String(input.subject))}</div>` : ''}
    ${input.description ? `<div style="color:var(--text3);font-size:11px;margin-top:2px">${escapeHtml(String(input.description))}</div>` : ''}
    ${renderToolResult(block.result)}`
  }

  if (name === 'TaskGet') {
    const task = getExpStructured<{ task?: ExpTaskItem }>(block)?.task
    return task ? renderTaskRow(task) : renderToolResult(block.result)
  }

  // TaskList
  const tasks = getExpStructured<{ tasks?: ExpTaskItem[] }>(block)?.tasks
  if (tasks && tasks.length > 0) return tasks.map(renderTaskRow).join('')
  if (tasks && tasks.length === 0) return `<div class="muted" style="font-size:12px">No tasks</div>`

  return renderToolResult(block.result)
}

function renderGenericTool(block: ContentBlock): string {
  const inputStr = JSON.stringify(block.input, null, 2)
  return `
    <div class="code-card">
      <div class="code-card-head"><span class="label">Input</span></div>
      <pre><code>${escapeHtml(inputStr)}</code></pre>
    </div>
    ${renderToolResult(block.result)}
  `
}

function renderToolBody(block: ContentBlock): string {
  switch (block.name) {
    case 'Edit': return renderEditTool(block)
    case 'Read': return renderReadTool(block)
    case 'Write': return renderWriteTool(block)
    case 'Bash': return renderBashTool(block)
    case 'Grep': return renderGrepTool(block)
    case 'Glob': return renderGlobTool(block)
    case 'WebFetch':
    case 'WebSearch': return renderWebTool(block)
    case 'AskUserQuestion': return renderAskUserTool(block)
    case 'TodoWrite': return renderTodoWriteTool(block)
    case 'TaskCreate':
    case 'TaskUpdate':
    case 'TaskList':
    case 'TaskGet': return renderTaskTool(block)
    case 'TeamCreate': return renderTeamCreateTool(block)
    case 'TeamDelete': return renderTeamDeleteTool(block)
    case 'SendMessage': return renderSendMessageTool(block)
    case 'Agent': return renderAgentTool(block)
    default: return renderGenericTool(block)
  }
}

interface ExpTaskItem {
  id: string
  subject?: string
  description?: string
  status?: string
  owner?: string
  blockedBy?: string[]
}

/** Read the structured tool result, with a JSON-string fallback */
function getExpStructured<T>(block: ContentBlock): T | undefined {
  const s = block.result?.structured
  if (s && typeof s === 'object') return s as T
  const content = block.result?.content
  if (typeof content === 'string' && content.trim().startsWith('{')) {
    try {
      return JSON.parse(content) as T
    } catch {
      /* not JSON */
    }
  }
  return undefined
}

function renderTaskRow(task: ExpTaskItem): string {
  const st = STATUS_STYLES[task.status || 'pending'] || STATUS_STYLES.pending
  const blocked = (task.blockedBy || []).length > 0
  return `<div style="display:flex;gap:8px;align-items:flex-start;background:#010409;border:1px solid var(--border);border-radius:6px;padding:8px 10px;margin-bottom:4px">
    <span style="font-size:14px">${st.icon}</span>
    <div style="flex:1;min-width:0">
      <div><span style="color:var(--accent);font-family:ui-monospace,Consolas,monospace;font-size:10px">#${escapeHtml(task.id)}</span> <span style="font-size:12px;color:var(--text)">${escapeHtml(task.subject || 'Untitled')}</span></div>
      ${task.description ? `<div style="font-size:11px;color:var(--text3);margin-top:2px">${escapeHtml(task.description)}</div>` : ''}
    </div>
    ${task.owner ? `<span style="font-size:10px;padding:1px 6px;border-radius:4px;background:rgba(110,168,255,0.14);color:var(--accent)">@${escapeHtml(task.owner)}</span>` : ''}
    ${blocked ? `<span style="font-size:10px;padding:1px 6px;border-radius:4px;background:rgba(232,183,90,0.14);color:#caa84a">⛔ ${escapeHtml(task.blockedBy!.join(','))}</span>` : ''}
    <span style="font-size:10px;color:${st.color}">${escapeHtml(task.status || '')}</span>
  </div>`
}

function renderTeamCreateTool(block: ContentBlock): string {
  const input = (block.input || {}) as Record<string, unknown>
  const result = getExpStructured<{ team_name?: string; team_file_path?: string; lead_agent_id?: string }>(block)
  const teamName = result?.team_name || String(input.team_name || '')
  return `<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
    <span style="font-size:14px">👥</span>
    <span style="font-size:12px;color:var(--text);font-weight:500">${escapeHtml(teamName)}</span>
    ${result?.lead_agent_id ? `<span style="font-size:10px;padding:1px 6px;border-radius:4px;background:rgba(210,96,58,0.15);color:#d2603a">lead: ${escapeHtml(result.lead_agent_id)}</span>` : ''}
  </div>
  ${input.description ? `<div style="font-size:11px;color:var(--text3);margin-top:4px">${escapeHtml(String(input.description))}</div>` : ''}
  ${result?.team_file_path ? `<div style="font-size:10px;color:var(--text3);font-family:ui-monospace,Consolas,monospace;margin-top:2px;word-break:break-all">${escapeHtml(result.team_file_path)}</div>` : ''}`
}

function renderTeamDeleteTool(block: ContentBlock): string {
  const result = getExpStructured<{ success?: boolean; message?: string; team_name?: string }>(block)
  if (!result) return renderToolResult(block.result)
  const ok = result.success
  const bg = ok ? 'rgba(63,185,80,0.15)' : 'rgba(232,183,90,0.15)'
  const color = ok ? '#3fb950' : '#caa84a'
  return `<div style="display:flex;gap:8px;align-items:flex-start;background:${bg};border-radius:6px;padding:8px 10px;font-size:12px;color:${color}">
    <span>${ok ? '✅' : '⚠️'}</span>
    <div>${result.team_name ? `<strong>${escapeHtml(result.team_name)}:</strong> ` : ''}${escapeHtml(result.message || '')}</div>
  </div>`
}

function renderSendMessageTool(block: ContentBlock): string {
  const input = (block.input || {}) as Record<string, unknown>
  const to = input.to ? String(input.to) : ''
  const rawMsg = input.message
  const structuredMsg = typeof rawMsg === 'object' && rawMsg !== null
    ? (rawMsg as { type?: string; reason?: string; approve?: boolean; feedback?: string })
    : null
  const textMsg = typeof rawMsg === 'string' ? rawMsg : String(input.content || '')
  const summary = input.summary ? String(input.summary) : ''
  const result = getExpStructured<{ success?: boolean; message?: string; routing?: { sender?: string; target?: string; summary?: string; content?: string } }>(block)
  const routing = result?.routing
  const target = routing?.target || (to ? `@${to}` : '')
  const body = routing?.content || textMsg

  let html = `<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:12px">
    ${routing?.sender ? `<span style="font-size:10px;padding:1px 6px;border-radius:4px;background:#161b22;color:var(--text2)">${escapeHtml(routing.sender)}</span>` : ''}
    <span class="muted">→</span>
    <span style="font-size:10px;padding:1px 6px;border-radius:4px;background:rgba(14,165,233,0.15);color:#0ea5e9">${escapeHtml(target)}</span>
    ${(summary || routing?.summary) ? `<span class="muted" style="font-style:italic">${escapeHtml(summary || routing?.summary || '')}</span>` : ''}
  </div>`
  if (structuredMsg) {
    html += `<div style="background:#010409;border:1px solid var(--border);border-radius:6px;padding:10px;margin-top:6px;font-size:12px">
      <div style="color:var(--accent);font-weight:500">${escapeHtml(structuredMsg.type?.replace(/_/g, ' ') || '')}</div>
      ${typeof structuredMsg.approve === 'boolean' ? `<div style="color:${structuredMsg.approve ? '#3fb950' : '#f85149'}">${structuredMsg.approve ? '✅ approved' : '❌ rejected'}</div>` : ''}
      ${structuredMsg.reason ? `<div style="color:var(--text3)">${escapeHtml(structuredMsg.reason)}</div>` : ''}
      ${structuredMsg.feedback ? `<div style="color:var(--text3)">${escapeHtml(structuredMsg.feedback)}</div>` : ''}
    </div>`
  }
  if (body) {
    html += `<div style="background:#010409;border:1px solid var(--border);border-radius:6px;padding:10px;margin-top:6px;font-size:12px;color:var(--text2);white-space:pre-wrap;word-break:break-word">${escapeHtml(body)}</div>`
  }
  if (result?.message) {
    html += `<div style="font-size:10px;color:var(--text3);margin-top:4px">${result.success === false ? '⚠️ ' : ''}${escapeHtml(result.message)}</div>`
  }
  return html
}

function renderAgentTool(block: ContentBlock): string {
  const input = (block.input || {}) as Record<string, unknown>
  const description = input.description ? String(input.description) : ''
  const subagentType = input.subagent_type ? String(input.subagent_type) : ''
  const prompt = input.prompt ? String(input.prompt) : ''
  const result = getExpStructured<{ status?: string; agentId?: string; agentType?: string; content?: Array<{ text?: string }> | string; totalTokens?: number; totalToolUseCount?: number; totalDurationMs?: number }>(block)
  const resultText = result
    ? Array.isArray(result.content)
      ? result.content.map((c) => c.text || '').join('\n')
      : typeof result.content === 'string' ? result.content : ''
    : block.result?.stdout || block.result?.content || ''

  let html = `<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:12px">
    ${(subagentType || result?.agentType) ? `<span style="font-size:10px;padding:1px 6px;border-radius:4px;background:rgba(190,24,93,0.15);color:#e86eaa;font-weight:500">${escapeHtml(subagentType || result?.agentType || '')}</span>` : ''}
    ${description ? `<span style="color:var(--text)">${escapeHtml(description)}</span>` : ''}
    ${result?.status ? `<span style="color:${result.status === 'completed' ? '#3fb950' : '#1f6feb'}">· ${escapeHtml(result.status)}</span>` : ''}
  </div>`
  if (result && (result.totalTokens || result.totalToolUseCount || result.totalDurationMs)) {
    const parts: string[] = []
    if (result.totalToolUseCount != null) parts.push(`${result.totalToolUseCount} tool calls`)
    if (result.totalTokens != null) parts.push(`${result.totalTokens.toLocaleString()} tokens`)
    if (result.totalDurationMs != null) parts.push(`${(result.totalDurationMs / 1000).toFixed(1)}s`)
    html += `<div style="font-size:10px;color:var(--text3);margin-top:4px">${parts.join(' · ')}</div>`
  }
  if (prompt) {
    html += `<div class="code-card" style="margin-top:6px"><div class="code-card-head"><span class="label">Prompt</span></div><pre><code>${escapeHtml(prompt)}</code></pre></div>`
  }
  if (resultText) {
    html += `<div class="code-card" style="margin-top:6px"><div class="code-card-head"><span class="label">Result${result?.agentId ? ` · ${escapeHtml(result.agentId)}` : ''}</span></div><pre><code>${escapeHtml(resultText)}</code></pre></div>`
  }
  return html
}

// =============================================================
// Block + message renderers
// =============================================================
function renderContentBlock(block: ContentBlock): string {
  if (block.type === 'text' && block.text) {
    return `<div>${renderMarkdown(block.text)}</div>`
  }

  if (block.type === 'thinking' && block.thinking) {
    const preview = block.thinking.length > 100
      ? escapeHtml(block.thinking.slice(0, 100)) + '...'
      : escapeHtml(block.thinking)
    return `
      <details class="thinking">
        <summary>
          <span class="label">Thinking</span>
          <span class="meta">(${block.thinking.length} chars)</span>
          <span class="preview">${preview}</span>
        </summary>
        <div class="body">${escapeHtml(block.thinking)}</div>
      </details>`
  }

  if (block.type === 'image' && block.source) {
    let src = ''
    if (block.source.type === 'base64' && block.source.data) {
      src = `data:${block.source.media_type || 'image/png'};base64,${block.source.data}`
    } else if (block.source.url) {
      src = block.source.url
    }
    if (!src) {
      return `<div class="img-broken">No image</div>`
    }
    return `<img class="lb-trigger" src="${escapeHtml(src)}" alt="image">`
  }

  if (block.type === 'tool_use') {
    const colorBg = TOOL_COLORS[block.name || ''] || '#6b7280'
    const summary = getToolSummary(block)
    const hasError = block.result?.is_error
    return `
      <details class="tool">
        <summary>
          <span class="tool-badge" style="background:${colorBg}">${escapeHtml(block.name || 'Tool')}</span>
          <span class="tool-summary">${escapeHtml(summary)}</span>
          ${hasError ? '<span class="tool-error-tag">Error</span>' : ''}
        </summary>
        <div class="tool-body">
          ${renderToolBody(block)}
        </div>
      </details>`
  }

  return ''
}

function renderUserMessage(msg: ParsedMessage): string {
  const text = msg.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text || '')
    .join('\n')

  const images = msg.content.filter((b) => b.type === 'image')
  const time = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString() : ''

  // Hide caveat-only messages
  if (images.length === 0 && isCaveatOnly(text)) return ''

  // Teammate (swarm) messages. parseTeammateMessages already drops lifecycle
  // noise (idle / terminated / shutdown-approved); if only noise remains, hide
  // the whole message rather than falling through to raw-text rendering.
  if (images.length === 0 && text.includes('<teammate-message')) {
    const teammates = parseTeammateMessages(text)
    if (teammates.length > 0) {
      return `
        <div class="msg-wrap assistant">
          <div class="msg assistant" style="width:100%;max-width:85%">
            <div class="msg-head">
              <span class="role assistant" style="color:#56d4dd">Teammate</span>
              <span class="time">${escapeHtml(time)}</span>
            </div>
            <div style="display:flex;flex-direction:column;gap:8px">${teammates.map(renderTeammateRow).join('')}</div>
          </div>
        </div>`
    }
    return ''
  }

  // Slash command rendering
  const cmd = parseSlashCommand(text)
  if (cmd) {
    let inner = ''
    if (cmd.name) {
      inner += `<div class="slash-cmd-line">
        <span class="prompt">&gt;</span>
        <span class="name">${escapeHtml(cmd.name)}</span>
        ${cmd.args ? `<span class="args">${escapeHtml(cmd.args)}</span>` : ''}
      </div>`
    }
    if (cmd.message) {
      inner += `<div class="slash-cmd-msg">${escapeHtml(cmd.message)}</div>`
    }
    if (cmd.stdout != null) {
      inner += `<div class="slash-cmd-output">${ansiToHtml(cmd.stdout)}</div>`
    }
    if (cmd.stderr) {
      inner += `<div class="slash-cmd-output stderr">${ansiToHtml(cmd.stderr)}</div>`
    }
    return `
      <div class="msg-wrap user">
        <div class="msg user" style="width:100%;max-width:85%">
          <div class="msg-head">
            <span class="role user">User</span>
            <span class="time">${escapeHtml(time)}</span>
          </div>
          <div class="slash-cmd">${inner}</div>
        </div>
      </div>`
  }

  let bodyHtml = ''
  if (images.length > 0) {
    bodyHtml += `<div class="img-list">${images.map((b) => renderContentBlock(b)).join('')}</div>`
  }
  if (text) {
    bodyHtml += `<div class="msg-content">${renderMarkdown(text)}</div>`
  }

  return `
    <div class="msg-wrap user">
      <div class="msg user">
        <div class="msg-head">
          <span class="role user">User</span>
          <span class="time">${escapeHtml(time)}</span>
        </div>
        ${bodyHtml}
      </div>
    </div>`
}

function renderAssistantMessage(msg: ParsedMessage): string {
  const time = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString() : ''
  const blocksHtml = msg.content.map(renderContentBlock).join('')

  let tokensHtml = ''
  if (msg.tokenUsage) {
    const u = msg.tokenUsage
    const parts: string[] = []
    if (u.inputTokens) parts.push(`<span>in: ${u.inputTokens.toLocaleString()}</span>`)
    if (u.outputTokens) parts.push(`<span>out: ${u.outputTokens.toLocaleString()}</span>`)
    if (u.cacheRead) parts.push(`<span>cache: ${u.cacheRead.toLocaleString()}</span>`)
    if (parts.length > 0) {
      tokensHtml = `<div class="token-row">${parts.join('')}</div>`
    }
  }

  return `
    <div class="msg-wrap assistant">
      <div class="msg assistant">
        <div class="msg-head">
          <span class="role assistant">Assistant</span>
          ${msg.model ? `<span class="model">${escapeHtml(msg.model)}</span>` : ''}
          <span class="time">${escapeHtml(time)}</span>
        </div>
        <div class="msg-content">${blocksHtml}</div>
        ${tokensHtml}
      </div>
    </div>`
}

function renderMessage(msg: ParsedMessage): string {
  return msg.role === 'user' ? renderUserMessage(msg) : renderAssistantMessage(msg)
}

// =============================================================
// Main entry
// =============================================================
export async function exportSessionToHtml(
  messages: ParsedMessage[],
  sessionInfo: { title: string; projectPath: string; sessionId: string }
): Promise<string | null> {
  const { filePath } = await dialog.showSaveDialog({
    defaultPath: `claude-session-${sessionInfo.sessionId.slice(0, 8)}.html`,
    filters: [{ name: 'HTML', extensions: ['html'] }]
  })
  if (!filePath) return null

  const firstTime = messages[0]?.timestamp
    ? new Date(messages[0].timestamp).toLocaleString()
    : ''
  const lastTime = messages[messages.length - 1]?.timestamp
    ? new Date(messages[messages.length - 1].timestamp).toLocaleString()
    : ''
  const models = [...new Set(messages.filter((m) => m.model).map((m) => m.model))]
  const messagesHtml = messages.map(renderMessage).filter(Boolean).join('\n')

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(sessionInfo.title)}</title>
  <style>${CSS}</style>
</head>
<body>
  <div class="container">
    <header class="session-header">
      <h1>${escapeHtml(sessionInfo.title)}</h1>
      <div class="session-meta">
        <span title="${escapeHtml(sessionInfo.projectPath)}">&#128193; ${escapeHtml(sessionInfo.projectPath)}</span>
        <span>&#128172; ${messages.length} messages</span>
        ${firstTime ? `<span>&#128337; ${escapeHtml(firstTime)}${lastTime && lastTime !== firstTime ? ` ~ ${escapeHtml(lastTime)}` : ''}</span>` : ''}
        ${models.length ? `<span>&#129302; ${models.map((m) => escapeHtml(m || '')).join(', ')}</span>` : ''}
        <span class="id">ID: ${escapeHtml(sessionInfo.sessionId)}</span>
      </div>
    </header>
    ${messagesHtml}
    <div class="footer">Exported from Claude Session Viewer</div>
  </div>
  <div id="lightbox" class="lightbox"><img id="lightbox-img" alt="zoom"></div>
  <script>${JS}</script>
</body>
</html>`

  fs.writeFileSync(filePath, html, 'utf-8')
  return filePath
}
