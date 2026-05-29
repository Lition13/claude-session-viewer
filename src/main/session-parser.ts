import * as fs from 'fs'
import * as path from 'path'
import * as readline from 'readline'

export interface ToolResult {
  content: string
  is_error?: boolean
  stdout?: string
  stderr?: string
  /** Rich structured result object (toolUseResult) for tools like Agent / SendMessage / Task* */
  structured?: unknown
}

export interface ContentBlock {
  type: 'text' | 'thinking' | 'tool_use' | 'image'
  text?: string
  thinking?: string
  id?: string
  name?: string
  input?: Record<string, unknown>
  result?: ToolResult
  source?: { type: string; media_type?: string; data?: string; url?: string }
}

export interface ParsedMessage {
  id: string
  role: 'user' | 'assistant'
  timestamp: string
  content: ContentBlock[]
  model?: string
  tokenUsage?: {
    inputTokens?: number
    outputTokens?: number
    cacheRead?: number
    cacheCreation?: number
  }
}

interface RawEntry {
  type: string
  subtype?: string
  uuid: string
  parentUuid: string | null
  timestamp: string
  isSidechain?: boolean
  content?: unknown
  message?: {
    id?: string
    role?: string
    content?: unknown
    model?: string
    usage?: Record<string, unknown>
  }
  toolUseResult?: unknown
  sourceToolAssistantUUID?: string
}

// Skip these entry types entirely
const SKIP_TYPES = new Set([
  'file-history-snapshot',
  'progress',
  'queue-operation',
  'last-prompt',
  'attachment',
  'permission-mode'
])

export async function parseSessionFile(filePath: string, opts?: { includeSidechain?: boolean }): Promise<ParsedMessage[]> {
  const entries = await readJsonlEntries(filePath)
  const { userMessages, assistantEntries, toolResults, localCommandOutputs } = classifyEntries(entries, opts?.includeSidechain)
  const mergedAssistant = mergeAssistantMessages(assistantEntries)
  pairToolResults(mergedAssistant, toolResults)
  attachLocalCommandOutputs(userMessages, localCommandOutputs)
  return buildConversation(userMessages, mergedAssistant)
}

async function readJsonlEntries(filePath: string): Promise<RawEntry[]> {
  const entries: RawEntry[] = []
  const stream = fs.createReadStream(filePath, { encoding: 'utf-8' })
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity })

  for await (const line of rl) {
    if (!line.trim()) continue
    try {
      const obj = JSON.parse(line)
      if (obj.uuid && obj.type) {
        entries.push(obj)
      }
    } catch {
      // Skip malformed lines
    }
  }
  return entries
}

interface ClassifiedEntries {
  userMessages: RawEntry[]
  assistantEntries: RawEntry[]
  toolResults: RawEntry[]
  localCommandOutputs: RawEntry[]
}

function classifyEntries(entries: RawEntry[], includeSidechain?: boolean): ClassifiedEntries {
  const userMessages: RawEntry[] = []
  const assistantEntries: RawEntry[] = []
  const toolResults: RawEntry[] = []
  const localCommandOutputs: RawEntry[] = []

  for (const entry of entries) {
    if (SKIP_TYPES.has(entry.type)) continue
    if (entry.type === 'system') {
      if (entry.subtype === 'local_command' && typeof entry.content === 'string') {
        localCommandOutputs.push(entry)
      }
      continue
    }
    if (!includeSidechain && entry.isSidechain) continue

    if (entry.type === 'assistant' && entry.message) {
      assistantEntries.push(entry)
    } else if (entry.type === 'user' && entry.message) {
      const content = entry.message.content
      if (isToolResultContent(content)) {
        toolResults.push(entry)
      } else if (isUserTextContent(content)) {
        userMessages.push(entry)
      }
    }
  }

  return { userMessages, assistantEntries, toolResults, localCommandOutputs }
}

function isToolResultContent(content: unknown): boolean {
  if (!Array.isArray(content)) return false
  return content.some((c: { type?: string }) => c.type === 'tool_result')
}

function isUserTextContent(content: unknown): boolean {
  if (typeof content === 'string') return true
  if (!Array.isArray(content)) return false
  return content.some((c: { type?: string }) => c.type === 'text')
}

interface MergedAssistant {
  messageId: string
  firstUuid: string
  lastUuid: string
  parentUuid: string | null
  timestamp: string
  model?: string
  contentBlocks: ContentBlock[]
  tokenUsage?: ParsedMessage['tokenUsage']
  allUuids: Set<string>
}

function mergeAssistantMessages(entries: RawEntry[]): MergedAssistant[] {
  // Group by message.id
  const groups = new Map<string, RawEntry[]>()
  for (const entry of entries) {
    const msgId = entry.message?.id
    if (!msgId) continue
    let group = groups.get(msgId)
    if (!group) {
      group = []
      groups.set(msgId, group)
    }
    group.push(entry)
  }

  const merged: MergedAssistant[] = []
  const uuidToEntry = new Map<string, RawEntry>()
  for (const entry of entries) {
    uuidToEntry.set(entry.uuid, entry)
  }

  for (const [messageId, group] of groups) {
    // Order entries by parentUuid chain within the group
    const groupUuids = new Set(group.map((e) => e.uuid))

    // Find the first entry: its parentUuid is not in this group
    let firstEntry = group.find((e) => !e.parentUuid || !groupUuids.has(e.parentUuid))
    if (!firstEntry) {
      // Fallback: sort by timestamp
      group.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      firstEntry = group[0]
    }

    // Build ordered chain
    const ordered: RawEntry[] = [firstEntry]
    const uuidMap = new Map<string, RawEntry>()
    for (const e of group) {
      uuidMap.set(e.uuid, e)
    }

    // Follow the chain: find entry whose parentUuid === current.uuid
    const parentToChild = new Map<string, RawEntry>()
    for (const e of group) {
      if (e.parentUuid && groupUuids.has(e.parentUuid)) {
        parentToChild.set(e.parentUuid, e)
      }
    }

    let current = firstEntry
    while (true) {
      const next = parentToChild.get(current.uuid)
      if (!next) break
      ordered.push(next)
      current = next
    }

    // If chain didn't cover all entries, add remaining by timestamp
    if (ordered.length < group.length) {
      const orderedSet = new Set(ordered.map((e) => e.uuid))
      const remaining = group
        .filter((e) => !orderedSet.has(e.uuid))
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      ordered.push(...remaining)
    }

    // Merge content blocks
    const contentBlocks: ContentBlock[] = []
    for (const entry of ordered) {
      const blocks = extractContentBlocks(entry)
      contentBlocks.push(...blocks)
    }

    // Skip empty assistant messages (only signatures, no real content)
    if (contentBlocks.length === 0) continue

    // Usage: take the FIRST entry's usage (later entries may have cumulative/inflated values)
    const firstWithUsage = ordered.find((e) => e.message?.usage)
    const usage = firstWithUsage?.message?.usage as Record<string, unknown> | undefined

    merged.push({
      messageId,
      firstUuid: firstEntry.uuid,
      lastUuid: ordered[ordered.length - 1].uuid,
      parentUuid: firstEntry.parentUuid,
      timestamp: firstEntry.timestamp,
      model: firstEntry.message?.model?.startsWith('<') ? undefined : firstEntry.message?.model,
      contentBlocks,
      tokenUsage: usage
        ? {
            inputTokens: (usage.input_tokens as number) || 0,
            outputTokens: (usage.output_tokens as number) || 0,
            cacheRead: (usage.cache_read_input_tokens as number) || 0,
            cacheCreation: (usage.cache_creation_input_tokens as number) || 0
          }
        : undefined,
      allUuids: new Set(ordered.map((e) => e.uuid))
    })
  }

  return merged
}

function extractContentBlocks(entry: RawEntry): ContentBlock[] {
  const content = entry.message?.content
  if (!Array.isArray(content)) return []

  const blocks: ContentBlock[] = []
  for (const item of content) {
    if (item.type === 'text' && item.text) {
      blocks.push({ type: 'text', text: item.text })
    } else if (item.type === 'thinking' && item.thinking) {
      blocks.push({ type: 'thinking', thinking: item.thinking })
    } else if (item.type === 'tool_use') {
      blocks.push({
        type: 'tool_use',
        id: item.id,
        name: item.name,
        input: item.input || {}
      })
    } else if (item.type === 'image' && item.source) {
      blocks.push({
        type: 'image',
        source: item.source
      })
    }
  }
  return blocks
}

function attachLocalCommandOutputs(userMessages: RawEntry[], outputs: RawEntry[]): void {
  if (outputs.length === 0) return
  // Build parentUuid -> list of outputs (local_command output's parentUuid points at the <command-name> user msg)
  const byParent = new Map<string, RawEntry[]>()
  for (const out of outputs) {
    if (!out.parentUuid) continue
    const list = byParent.get(out.parentUuid) || []
    list.push(out)
    byParent.set(out.parentUuid, list)
  }

  for (const u of userMessages) {
    const outs = byParent.get(u.uuid)
    if (!outs || outs.length === 0) continue
    // Sort by timestamp so order is stable
    outs.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    const existing = u.message?.content
    const appended = outs.map((o) => String(o.content ?? '')).join('\n')
    if (typeof existing === 'string') {
      u.message!.content = existing + '\n' + appended
    } else if (Array.isArray(existing)) {
      existing.push({ type: 'text', text: appended })
    }
  }
}

function pairToolResults(
  mergedAssistant: MergedAssistant[],
  toolResults: RawEntry[]
): void {
  // Build tool_use_id -> tool_use block mapping
  const toolUseMap = new Map<string, ContentBlock>()
  for (const msg of mergedAssistant) {
    for (const block of msg.contentBlocks) {
      if (block.type === 'tool_use' && block.id) {
        toolUseMap.set(block.id, block)
      }
    }
  }

  // Match tool results to tool uses
  for (const entry of toolResults) {
    const content = entry.message?.content
    if (!Array.isArray(content)) continue

    for (const item of content) {
      if (item.type === 'tool_result' && item.tool_use_id) {
        const toolBlock = toolUseMap.get(item.tool_use_id)
        if (toolBlock) {
          const rawResult = entry.toolUseResult as
            | string
            | { stdout?: string; stderr?: string }
            | undefined
          const resultContent =
            typeof item.content === 'string' ? item.content : JSON.stringify(item.content)
          const isStructured =
            typeof rawResult === 'object' &&
            rawResult !== null &&
            rawResult.stdout === undefined &&
            rawResult.stderr === undefined

          toolBlock.result = {
            content: resultContent || '',
            is_error: item.is_error || false,
            stdout:
              typeof rawResult === 'object' && rawResult
                ? (rawResult.stdout as string)
                : undefined,
            stderr:
              typeof rawResult === 'object' && rawResult
                ? (rawResult.stderr as string)
                : undefined,
            // Keep the full structured object so rich renderers (team/task tools)
            // can read routing, tasks, team_name, etc. Plain {stdout,stderr}
            // results are already covered above, so skip those.
            structured: isStructured ? rawResult : undefined
          }
        }
      }
    }
  }
}

function buildConversation(
  userMessages: RawEntry[],
  mergedAssistant: MergedAssistant[]
): ParsedMessage[] {
  // Build a unified list, then order by parentUuid chain with timestamp fallback
  type ConversationItem =
    | { kind: 'user'; entry: RawEntry }
    | { kind: 'assistant'; merged: MergedAssistant }

  const items: ConversationItem[] = []
  for (const u of userMessages) {
    items.push({ kind: 'user', entry: u })
  }
  for (const a of mergedAssistant) {
    items.push({ kind: 'assistant', merged: a })
  }

  // Build uuid lookup: for user messages use their uuid, for merged assistant use firstUuid
  // Also need to know which uuids point to which item
  const uuidToItem = new Map<string, ConversationItem>()
  for (const item of items) {
    if (item.kind === 'user') {
      uuidToItem.set(item.entry.uuid, item)
    } else {
      // Register all uuids from the assistant group
      for (const uid of item.merged.allUuids) {
        uuidToItem.set(uid, item)
      }
    }
  }

  // Try to build chain from parentUuid
  // Find root(s): items whose parentUuid doesn't point to any known item
  const visited = new Set<ConversationItem>()
  const ordered: ConversationItem[] = []

  // Build child map: parentUuid -> items that have that parentUuid
  const childMap = new Map<string, ConversationItem[]>()
  for (const item of items) {
    const parentUuid =
      item.kind === 'user' ? item.entry.parentUuid : item.merged.parentUuid
    if (parentUuid) {
      let children = childMap.get(parentUuid)
      if (!children) {
        children = []
        childMap.set(parentUuid, children)
      }
      children.push(item)
    }
  }

  // Find roots
  const roots = items.filter((item) => {
    const parentUuid =
      item.kind === 'user' ? item.entry.parentUuid : item.merged.parentUuid
    if (!parentUuid) return true
    return !uuidToItem.has(parentUuid)
  })

  // BFS/DFS from roots
  function walkChain(item: ConversationItem): void {
    if (visited.has(item)) return
    visited.add(item)
    ordered.push(item)

    // Find children: items whose parentUuid points to this item's uuid(s)
    const uuids: string[] = []
    if (item.kind === 'user') {
      uuids.push(item.entry.uuid)
    } else {
      uuids.push(...item.merged.allUuids)
    }

    for (const uid of uuids) {
      const children = childMap.get(uid) || []
      // Sort children by timestamp
      children.sort((a, b) => {
        const ta = a.kind === 'user' ? a.entry.timestamp : a.merged.timestamp
        const tb = b.kind === 'user' ? b.entry.timestamp : b.merged.timestamp
        return new Date(ta).getTime() - new Date(tb).getTime()
      })
      for (const child of children) {
        walkChain(child)
      }
    }
  }

  // Sort roots by timestamp
  roots.sort((a, b) => {
    const ta = a.kind === 'user' ? a.entry.timestamp : a.merged.timestamp
    const tb = b.kind === 'user' ? b.entry.timestamp : b.merged.timestamp
    return new Date(ta).getTime() - new Date(tb).getTime()
  })

  for (const root of roots) {
    walkChain(root)
  }

  // Add any unvisited items (fallback)
  const unvisited = items
    .filter((i) => !visited.has(i))
    .sort((a, b) => {
      const ta = a.kind === 'user' ? a.entry.timestamp : a.merged.timestamp
      const tb = b.kind === 'user' ? b.entry.timestamp : b.merged.timestamp
      return new Date(ta).getTime() - new Date(tb).getTime()
    })
  ordered.push(...unvisited)

  // Convert to ParsedMessage[]
  return ordered.map((item) => {
    if (item.kind === 'user') {
      const content = item.entry.message?.content
      let text = ''
      const contentBlocks: ContentBlock[] = []
      if (typeof content === 'string') {
        text = content
        contentBlocks.push({ type: 'text' as const, text })
      } else if (Array.isArray(content)) {
        text = content
          .filter((c: { type: string }) => c.type === 'text')
          .map((c: { text: string }) => c.text)
          .join('\n')
        contentBlocks.push({ type: 'text' as const, text })
        // Extract image blocks
        for (const c of content) {
          if (c.type === 'image' && c.source) {
            contentBlocks.push({ type: 'image' as const, source: c.source })
          }
        }
      }
      return {
        id: item.entry.uuid,
        role: 'user' as const,
        timestamp: item.entry.timestamp,
        content: contentBlocks
      }
    } else {
      return {
        id: item.merged.firstUuid,
        role: 'assistant' as const,
        timestamp: item.merged.timestamp,
        content: item.merged.contentBlocks,
        model: item.merged.model,
        tokenUsage: item.merged.tokenUsage
      }
    }
  })
}

export interface ModelUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreateTokens: number
  messageCount: number
}

export interface SessionUsageResult {
  perModel: Record<string, ModelUsage>
  subagentFiles: string[]
}

// Aggregate token usage per model across the main session JSONL and any
// subagent JSONLs found under {dir}/{sessionId}/subagents/*.jsonl.
// Matches /cost behavior: every model seen during the session contributes.
//
// Critical: a single message.id can appear on multiple JSONL lines when the
// assistant emits both text and tool_use — each line re-writes usage with the
// running totals up to that block. We keep the LAST seen usage per message.id,
// which is the full message total. Taking the FIRST line would massively
// under-count output_tokens (gh-issue "output 11K vs /cost 37.9K").
export async function collectSessionUsage(sessionFilePath: string): Promise<SessionUsageResult> {
  const perMsgLatest = new Map<string, { model: string; usage: Record<string, unknown> }>()

  scanJsonlIntoLatest(sessionFilePath, perMsgLatest)

  const result: SessionUsageResult = { perModel: {}, subagentFiles: [] }
  const dir = path.dirname(sessionFilePath)
  const sessionId = path.basename(sessionFilePath, '.jsonl')
  const subDir = path.join(dir, sessionId, 'subagents')
  if (fs.existsSync(subDir)) {
    const files = fs.readdirSync(subDir).filter((f) => f.endsWith('.jsonl'))
    for (const f of files) {
      const full = path.join(subDir, f)
      result.subagentFiles.push(full)
      scanJsonlIntoLatest(full, perMsgLatest)
    }
  }

  for (const { model, usage } of perMsgLatest.values()) {
    let mu = result.perModel[model]
    if (!mu) {
      mu = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreateTokens: 0, messageCount: 0 }
      result.perModel[model] = mu
    }
    mu.inputTokens += (usage.input_tokens as number) || 0
    mu.outputTokens += (usage.output_tokens as number) || 0
    mu.cacheReadTokens += (usage.cache_read_input_tokens as number) || 0
    mu.cacheCreateTokens += (usage.cache_creation_input_tokens as number) || 0
    mu.messageCount++
  }

  return result
}

function scanJsonlIntoLatest(
  filePath: string,
  perMsgLatest: Map<string, { model: string; usage: Record<string, unknown> }>
): void {
  let content: string
  try {
    content = fs.readFileSync(filePath, 'utf-8')
  } catch {
    return
  }
  const lines = content.split('\n')
  for (const line of lines) {
    if (!line.trim()) continue
    let obj: { type?: string; message?: { id?: string; model?: string; usage?: Record<string, unknown> } }
    try {
      obj = JSON.parse(line)
    } catch {
      continue
    }
    if (obj.type !== 'assistant' || !obj.message) continue
    const msgId = obj.message.id
    const model = obj.message.model
    const usage = obj.message.usage
    if (!msgId || !model || model.startsWith('<') || !usage) continue

    // Last-write-wins per msgId — the final line carries cumulative totals
    perMsgLatest.set(msgId, { model, usage })
  }
}
