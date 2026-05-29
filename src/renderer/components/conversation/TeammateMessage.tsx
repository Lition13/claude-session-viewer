import { MarkdownRenderer } from './MarkdownRenderer'

/**
 * Teammate (swarm inter-agent) messages are delivered to the team lead as
 * user-role text containing one or more
 *   <teammate-message teammate_id="alice" color="red" summary="...">body</teammate-message>
 * tags. The body is either free text or a structured JSON control message
 * (task_assignment, idle_notification, shutdown_*, plan_approval_*, …).
 *
 * Mirrors claude-code's UserTeammateMessage rendering.
 */

const TEAMMATE_MSG_REGEX =
  /<teammate-message\s+teammate_id="([^"]+)"(?:\s+color="([^"]+)")?(?:\s+summary="([^"]+)")?>\n?([\s\S]*?)\n?<\/teammate-message>/g

interface ParsedTeammateMessage {
  teammateId: string
  color?: string
  summary?: string
  content: string
}

// Agent color names → hex. Falls back to a neutral accent for unknown names.
const AGENT_COLORS: Record<string, string> = {
  red: '#ff7b72',
  green: '#7ee787',
  yellow: '#e3b341',
  blue: '#58a6ff',
  magenta: '#d2a8ff',
  cyan: '#56d4dd',
  white: '#c9d1d9',
  gray: '#8b949e',
  grey: '#8b949e',
  orange: '#ff8c5a',
  purple: '#bc8cff',
  pink: '#f778ba'
}

function colorFor(name?: string): string {
  if (!name) return 'var(--accent)'
  return AGENT_COLORS[name.toLowerCase()] || 'var(--accent)'
}

export function parseTeammateMessages(text: string): ParsedTeammateMessage[] {
  const messages: ParsedTeammateMessage[] = []
  for (const match of text.matchAll(TEAMMATE_MSG_REGEX)) {
    if (match[1] && match[4]) {
      messages.push({
        teammateId: match[1],
        color: match[2],
        summary: match[3],
        content: match[4].trim()
      })
    }
  }
  return messages
}

function tryParseJson(content: string): Record<string, unknown> | null {
  if (!content.startsWith('{')) return null
  try {
    return JSON.parse(content) as Record<string, unknown>
  } catch {
    return null
  }
}

// Lifecycle noise that claude-code processes silently (hidden from the transcript).
const HIDDEN_TYPES = new Set(['idle_notification', 'teammate_terminated', 'shutdown_approved'])

function isNoise(content: string): boolean {
  const json = tryParseJson(content)
  return typeof json?.type === 'string' && HIDDEN_TYPES.has(json.type)
}

interface RowProps {
  msg: ParsedTeammateMessage
}

/** A single teammate message, dispatched by its (optional) structured type. */
function TeammateRow({ msg }: RowProps) {
  const color = colorFor(msg.color)
  const name = msg.teammateId
  const json = tryParseJson(msg.content)
  const type = json?.type as string | undefined

  const header = (
    <div className="flex items-center gap-2 mb-1">
      <span className="text-xs font-semibold" style={{ color }}>
        @{name}
      </span>
      {msg.summary && <span className="text-[11px] text-[var(--text3)] italic">{msg.summary}</span>}
    </div>
  )

  // Structured control messages
  if (type === 'task_assignment') {
    return (
      <div className="rounded-lg border-l-2 pl-3 pr-3 py-2 bg-[var(--surface)] border border-[var(--border)]" style={{ borderLeftColor: '#56d4dd' }}>
        {header}
        <div className="text-xs text-[var(--text)]">
          <span className="text-[#56d4dd] font-medium">Task #{String(json?.taskId ?? '')}</span>
          {json?.assignedBy ? <span className="text-[var(--text3)]"> assigned by {String(json.assignedBy)}</span> : null}
        </div>
        {json?.subject ? <div className="text-xs text-[var(--text)] font-medium mt-1">{String(json.subject)}</div> : null}
        {json?.description ? <div className="text-[11px] text-[var(--text3)] mt-0.5">{String(json.description)}</div> : null}
      </div>
    )
  }

  if (type === 'plan_approval_response') {
    const approved = json?.approved === true || json?.approve === true
    return (
      <div className="rounded-lg border-l-2 pl-3 pr-3 py-2 bg-[var(--surface)] border border-[var(--border)]" style={{ borderLeftColor: approved ? '#3fb950' : '#f85149' }}>
        {header}
        <div className={`text-xs font-medium ${approved ? 'text-green-400' : 'text-red-400'}`}>
          {approved ? '✓ Plan approved' : '✗ Plan rejected'}
        </div>
        {json?.feedback ? <div className="text-[11px] text-[var(--text3)] mt-1">Feedback: {String(json.feedback)}</div> : null}
      </div>
    )
  }

  if (type === 'plan_approval_request') {
    return (
      <div className="rounded-lg border-l-2 pl-3 pr-3 py-2 bg-[var(--surface)] border border-[var(--border)]" style={{ borderLeftColor: '#d29922' }}>
        {header}
        <div className="text-xs text-[var(--accent)] font-medium">Plan approval requested</div>
        {json?.planContent ? (
          <div className="text-[11px] text-[var(--text2)] mt-1 max-h-60 overflow-y-auto">
            <MarkdownRenderer content={String(json.planContent)} />
          </div>
        ) : null}
      </div>
    )
  }

  if (type === 'shutdown_request' || type === 'shutdown_rejected' || type === 'shutdown_approved') {
    const palette: Record<string, { c: string; label: string }> = {
      shutdown_request: { c: '#d29922', label: 'Shutdown requested' },
      shutdown_rejected: { c: '#8b949e', label: 'Shutdown rejected' },
      shutdown_approved: { c: '#3fb950', label: 'Shutdown approved' }
    }
    const p = palette[type]
    return (
      <div className="rounded-lg border-l-2 pl-3 pr-3 py-2 bg-[var(--surface)] border border-[var(--border)]" style={{ borderLeftColor: p.c }}>
        {header}
        <div className="text-xs font-medium" style={{ color: p.c }}>
          {p.label}
          {json?.from ? <span className="text-[var(--text3)] font-normal"> — {String(json.from)}</span> : null}
        </div>
        {json?.reason ? <div className="text-[11px] text-[var(--text3)] mt-1">Reason: {String(json.reason)}</div> : null}
      </div>
    )
  }

  if (type === 'task_completed') {
    return (
      <div className="rounded-lg border-l-2 pl-3 pr-3 py-2 bg-[var(--surface)] border border-[var(--border)]" style={{ borderLeftColor: '#3fb950' }}>
        {header}
        <div className="text-xs text-green-400">
          ✓ Completed task #{String(json?.taskId ?? '')}
          {json?.taskSubject ? <span className="text-[var(--text3)]"> ({String(json.taskSubject)})</span> : null}
        </div>
      </div>
    )
  }

  // Unknown JSON control message — show the type + pretty JSON, not raw text
  if (json && type) {
    return (
      <div className="rounded-lg border-l-2 pl-3 pr-3 py-2 bg-[var(--surface)] border border-[var(--border)]" style={{ borderLeftColor: color }}>
        {header}
        <div className="text-xs text-[var(--accent)] font-medium">{type.replace(/_/g, ' ')}</div>
        <pre className="text-[10px] text-[var(--text3)] mt-1 overflow-x-auto"><code>{JSON.stringify(json, null, 2)}</code></pre>
      </div>
    )
  }

  // Default: free-text teammate message rendered as markdown
  return (
    <div className="rounded-lg border-l-2 pl-3 pr-3 py-2 bg-[var(--surface)] border border-[var(--border)]" style={{ borderLeftColor: color }}>
      {header}
      <div className="text-sm text-[var(--text)]">
        <MarkdownRenderer content={msg.content} />
      </div>
    </div>
  )
}

interface Props {
  messages: ParsedTeammateMessage[]
  timestamp?: string
}

export function TeammateMessage({ messages, timestamp }: Props) {
  // Drop lifecycle noise (idle / terminated / shutdown-approved); if nothing
  // meaningful remains, render nothing — matches claude-code's silent handling.
  const visible = messages.filter((m) => !isNoise(m.content))
  if (visible.length === 0) return null
  const time = timestamp ? new Date(timestamp).toLocaleTimeString() : ''

  return (
    <div className="flex justify-start mb-4 csv-msg-in">
      <div className="max-w-[85%] w-full">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-[10px] font-semibold tracking-wider uppercase text-[#56d4dd]">Teammate</span>
          {time && <span className="text-xs text-[var(--text3)] ml-auto tabular-nums">{time}</span>}
        </div>
        <div className="space-y-2">
          {visible.map((msg, i) => (
            <TeammateRow key={i} msg={msg} />
          ))}
        </div>
      </div>
    </div>
  )
}
