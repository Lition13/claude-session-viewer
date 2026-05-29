import { memo, useMemo, useState } from 'react'
import Convert from 'ansi-to-html'
import type { ParsedMessage, ImageBlock } from '../../types/message'
import { MarkdownRenderer } from './MarkdownRenderer'
import { TeammateMessage, parseTeammateMessages } from './TeammateMessage'

interface Props {
  message: ParsedMessage
}

interface SlashCommand {
  name: string
  message?: string
  args?: string
  stdout?: string
  stderr?: string
}

function stripAnsi(s: string): string {
  // CSI sequences (colors, styles): ESC [ ... final byte in @-~
  // Plus OSC sequences: ESC ] ... BEL or ESC \
  // eslint-disable-next-line no-control-regex
  return s.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '').replace(/\u001b\][^\u0007\u001b]*(\u0007|\u001b\\)/g, '')
}

const ansiConverter = new Convert({
  fg: '#e6edf3',
  bg: '#0d1117',
  newline: false,
  escapeXML: true,
  colors: {
    0: '#484f58',
    1: '#ff7b72',
    2: '#7ee787',
    3: '#d29922',
    4: '#58a6ff',
    5: '#bc8cff',
    6: '#39c5cf',
    7: '#c9d1d9',
    8: '#6e7681',
    9: '#ffa198',
    10: '#56d364',
    11: '#e3b341',
    12: '#79c0ff',
    13: '#d2a8ff',
    14: '#56d4dd',
    15: '#f0f6fc'
  }
})

function ansiToHtml(raw: string): string {
  try {
    return ansiConverter.toHtml(raw)
  } catch {
    return stripAnsi(raw)
  }
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

export const UserMessage = memo(function UserMessage({ message }: Props) {
  const text = message.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text || '')
    .join('\n')

  const images = message.content.filter((b) => b.type === 'image') as ImageBlock[]
  const time = message.timestamp ? new Date(message.timestamp).toLocaleTimeString() : ''

  // Teammate (swarm) messages are delivered as user-role text containing
  // <teammate-message> tags. Render them with a dedicated component.
  const teammateMessages = useMemo(() => (text.includes('<teammate-message') ? parseTeammateMessages(text) : []), [text])

  // Hide caveat-only messages (system notes telling the model not to respond)
  if (images.length === 0 && isCaveatOnly(text)) {
    return null
  }

  if (teammateMessages.length > 0 && images.length === 0) {
    return <TeammateMessage messages={teammateMessages} timestamp={message.timestamp} />
  }

  const command = parseSlashCommand(text)

  const stdoutHtml = useMemo(() => (command?.stdout != null ? ansiToHtml(command.stdout) : ''), [command?.stdout])
  const stderrHtml = useMemo(() => (command?.stderr ? ansiToHtml(command.stderr) : ''), [command?.stderr])

  if (command) {
    return (
      <div className="flex justify-end mb-4 csv-msg-in">
        <div className="csv-msg-user max-w-[85%] w-full rounded-2xl rounded-tr-sm pl-4 pr-4 py-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] font-semibold tracking-wider uppercase text-[var(--accent)]">User</span>
            <span className="text-xs text-[var(--text3)] ml-auto tabular-nums">{time}</span>
          </div>
          <div className="font-mono text-sm">
            {command.name && (
              <div className="flex items-center gap-2 text-[var(--text)]">
                <span className="text-[var(--text3)]">&gt;</span>
                <span className="font-semibold">{command.name}</span>
                {command.args && <span className="text-[var(--text2)]">{command.args}</span>}
              </div>
            )}
            {command.stdout != null && (
              <pre
                className="mt-2 ml-4 text-xs text-[var(--text)] bg-[var(--bg)] border border-[var(--border)] rounded-md px-3 py-2 overflow-x-auto whitespace-pre-wrap"
                dangerouslySetInnerHTML={{ __html: stdoutHtml }}
              />
            )}
            {command.stderr && (
              <pre
                className="mt-2 ml-4 text-xs text-[var(--error)] bg-[var(--bg)] border border-[var(--border)] rounded-md px-3 py-2 overflow-x-auto whitespace-pre-wrap"
                dangerouslySetInnerHTML={{ __html: stderrHtml }}
              />
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex justify-end mb-4 csv-msg-in">
      <div className="csv-msg-user max-w-[85%] rounded-2xl rounded-tr-sm pl-4 pr-4 py-3">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] font-semibold tracking-wider uppercase text-[var(--accent)]">User</span>
          <span className="text-xs text-[var(--text3)] ml-auto tabular-nums">{time}</span>
        </div>

        {/* Images */}
        {images.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {images.map((img, i) => (
              <ImageDisplay key={i} block={img} />
            ))}
          </div>
        )}

        {text && (
          <div className="text-sm text-[var(--text)]">
            <MarkdownRenderer content={text} />
          </div>
        )}
      </div>
    </div>
  )
})

function ImageDisplay({ block }: { block: ImageBlock }) {
  const [error, setError] = useState(false)
  const [expanded, setExpanded] = useState(false)

  let src = ''
  if (block.source.type === 'base64' && block.source.data) {
    src = `data:${block.source.media_type || 'image/png'};base64,${block.source.data}`
  } else if (block.source.url) {
    src = block.source.url
  }

  if (!src || error) {
    return (
      <div className="w-32 h-24 rounded-lg bg-[#0d1117] border border-[#30363d] flex items-center justify-center">
        <div className="text-center">
          <svg className="w-6 h-6 text-gray-600 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span className="text-[10px] text-gray-600 mt-1 block">
            {error ? 'Load failed' : 'No image'}
          </span>
        </div>
      </div>
    )
  }

  return (
    <>
      <img
        src={src}
        alt="User uploaded image"
        className="max-w-xs max-h-48 rounded-lg border border-[#30363d] cursor-pointer hover:opacity-80 transition-opacity object-contain"
        onError={() => setError(true)}
        onClick={() => setExpanded(true)}
      />
      {/* Expanded view */}
      {expanded && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80" onClick={() => setExpanded(false)}>
          <img src={src} alt="Expanded" className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg" />
        </div>
      )}
    </>
  )
}
